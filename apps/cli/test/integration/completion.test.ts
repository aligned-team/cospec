// `cospec completion [bash|zsh|fish]` and the hidden `cospec __complete` (DESIGN
// §2, ledger rows 2.2–2.4). Generation is exercised through the real CLI
// entrypoint (never by importing the render functions directly) so this proves
// the wired-up command, not just the pure generator (that lives in
// test/unit/core/completions.test.ts).
//
// Row 2.2 (parses clean under each real shell's syntax checker) skips a shell
// that is not installed on the box running the suite rather than failing —
// `mise run check` must stay green on a minimal CI image.

import { afterAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'
import { authorCi } from './support.ts'

const LIVING_SPEC = `# widgets Specification

## Purpose

Real purpose text for the widgets capability.

## Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

afterAll(cleanupAll)

describe('cospec completion', () => {
  test('detects the shell from $SHELL when none is given explicitly', async () => {
    const cwd = mkTempRepo()
    const res = await cospec(['completion'], { cwd, env: { SHELL: '/bin/zsh' } })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('#compdef cospec')
  })

  test('a login-shell leading dash in $SHELL is stripped before detection', async () => {
    const cwd = mkTempRepo()
    const res = await cospec(['completion'], { cwd, env: { SHELL: '-/bin/bash' } })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('_cospec()')
    expect(res.stdout).toContain('complete -F _cospec cospec')
  })

  test('an undetected/unsupported $SHELL exits 1 naming the supported shells, no stdout', async () => {
    const cwd = mkTempRepo()
    const res = await cospec(['completion'], { cwd, env: { SHELL: '/bin/tcsh' } })
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toBe('')
    expect(res.stderr).toContain('bash')
    expect(res.stderr).toContain('zsh')
    expect(res.stderr).toContain('fish')
  })

  test('an explicit shell argument overrides $SHELL entirely', async () => {
    const cwd = mkTempRepo()
    const res = await cospec(['completion', 'fish'], { cwd, env: { SHELL: '/bin/zsh' } })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('complete -c cospec -f')
  })

  test('an unsupported explicit shell exits 1 without touching $SHELL detection', async () => {
    const cwd = mkTempRepo()
    const res = await cospec(['completion', 'tcsh'], { cwd })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain("unsupported shell 'tcsh'")
  })

  // `powershell` is an upstream shell value owed to `completion-install`: the
  // command table refuses it as pending before completion.ts runs.
  test('powershell is refused as not supported yet, exit 1', async () => {
    const cwd = mkTempRepo()
    const res = await cospec(['completion', 'powershell'], { cwd })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toBe("cospec completion: 'powershell' is not supported yet\n")
    expect(res.stdout).toBe('')
  })

  test('--json is refused with exactly one JSON document on stdout, exit 1', async () => {
    const cwd = mkTempRepo()
    const res = await cospec(['completion', 'zsh', '--json'], { cwd })
    expect(res.exitCode).toBe(1)
    const lines = res.stdout.trim().split('\n')
    expect(lines.length).toBe(1)
    const body = JSON.parse(lines[0]!) as { ok: boolean; command: string }
    expect(body.ok).toBe(false)
    expect(body.command).toBe('completion')
  })

  test('bash/zsh/fish scripts each name every non-hidden command', async () => {
    const cwd = mkTempRepo()
    for (const shell of ['bash', 'zsh', 'fish']) {
      const res = await cospec(['completion', shell], { cwd })
      expect(res.exitCode).toBe(0)
      for (const name of ['init', 'new', 'validate', 'apply', 'archive', 'config', 'feedback'])
        expect(res.stdout).toContain(name)
    }
  })

  for (const [shell, checker] of [
    [
      'bash',
      (script: string) =>
        Bun.spawnSync(['bash', '-n'], { stdin: new TextEncoder().encode(script) }),
    ],
    [
      'zsh',
      (script: string) => Bun.spawnSync(['zsh', '-n'], { stdin: new TextEncoder().encode(script) }),
    ],
    [
      'fish',
      (script: string) =>
        Bun.spawnSync(['fish', '--no-execute'], { stdin: new TextEncoder().encode(script) }),
    ],
  ] as const) {
    test(`generated ${shell} script parses clean under ${shell}'s own syntax checker`, async () => {
      if (Bun.which(shell) === null) {
        console.warn(`${shell} not installed — skipping syntax check`)
        return
      }
      const cwd = mkTempRepo()
      const res = await cospec(['completion', shell], { cwd })
      expect(res.exitCode).toBe(0)
      const parsed = checker(res.stdout)
      expect(parsed.exitCode, new TextDecoder().decode(parsed.stderr)).toBe(0)
    })
  }
})

describe('cospec __complete (hidden dynamic completion source)', () => {
  test('changes: lists active change ids tab-separated, inside a seeded repo', async () => {
    const cwd = mkTempRepo({ fixture: 'fresh', git: true })
    authorCi(cwd, 'demo-change')
    const res = await cospec(['__complete', 'changes'], { cwd })
    expect(res.exitCode).toBe(0)
    expect(res.stderr).toBe('')
    const line = res.stdout.split('\n').find((l) => l.startsWith('demo-change'))
    expect(line).toBeDefined()
    expect(line).toContain('\t')
  })

  test('specs: lists capability spec ids tab-separated, inside a seeded repo', async () => {
    const cwd = mkTempRepo({ fixture: 'fresh', git: true })
    writeFiles(cwd, { 'openspec/specs/widgets/spec.md': LIVING_SPEC })
    const res = await cospec(['__complete', 'specs'], { cwd })
    expect(res.exitCode).toBe(0)
    expect(res.stderr).toBe('')
    const line = res.stdout.split('\n').find((l) => l.startsWith('widgets'))
    expect(line).toBeDefined()
    expect(line).toContain('\t')
    expect(line).toContain('requirement')
  })

  test('types: lists the 11 conventional-commit types with no wrapped spawn required', async () => {
    const cwd = mkTempRepo()
    const res = await cospec(['__complete', 'types'], { cwd })
    expect(res.exitCode).toBe(0)
    for (const type of ['feat', 'fix', 'chore', 'docs', 'refactor'])
      expect(res.stdout).toContain(type)
  })

  test('outside any openspec repo: silent exit 1, nothing on either stream', async () => {
    const cwd = mkTempRepo()
    const res = await cospec(['__complete', 'changes'], { cwd })
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toBe('')
    expect(res.stderr).toBe('')
  })

  test('an unrecognized source is a silent exit 1 too', async () => {
    const cwd = mkTempRepo()
    const res = await cospec(['__complete', 'bogus'], { cwd })
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toBe('')
    expect(res.stderr).toBe('')
  })

  // Upstream's `__complete <type>` prints commander's refusal here too; the
  // generated scripts always pass a source, with stderr discarded.
  test("no source at all is commander's missing required argument, exit 1", async () => {
    const cwd = mkTempRepo()
    const res = await cospec(['__complete'], { cwd })
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toBe('')
    expect(res.stderr).toBe(
      "cospec __complete: missing required argument 'source'\ncospec __complete: usage — cospec __complete <source>\n",
    )
  })
})

// Verification 9.2: the generated scripts complete schema names where the
// binary's own scripts do — every `--schema` value a table row declares and the
// first positional of `schema which|validate|fork` — from `cospec __complete
// schemas`, and none of them ever calls the `openspec` binary.
describe('generated scripts complete schema names from cospec __complete schemas', () => {
  const SCHEMA_SLOTS: { words: string[]; label: string }[] = [
    { words: ['status', '--schema', ''], label: 'status --schema' },
    { words: ['templates', '--schema', ''], label: 'templates --schema' },
    { words: ['instructions', 'proposal', '--schema', ''], label: 'instructions --schema' },
    { words: ['schema', 'which', ''], label: 'schema which' },
    { words: ['schema', 'validate', ''], label: 'schema validate' },
    { words: ['schema', 'fork', ''], label: 'schema fork' },
  ]

  async function script(shell: string): Promise<string> {
    const res = await cospec(['completion', shell], { cwd: mkTempRepo() })
    expect(res.exitCode).toBe(0)
    return res.stdout
  }

  test('no generated script names the openspec binary', async () => {
    for (const shell of ['bash', 'zsh', 'fish'])
      expect(await script(shell)).not.toMatch(/\bopenspec\b/)
  })

  const bash = Bun.which('bash') === null ? test.skip : test
  for (const slot of SCHEMA_SLOTS)
    bash(`bash: ${slot.label} calls cospec __complete schemas`, async () => {
      const body = await script('bash')
      const words = ['cospec', ...slot.words].map((w) => `'${w}'`).join(' ')
      const program = [
        body,
        // A stub `cospec` records each call and answers one schema name.
        'cospec() { printf "%s\\n" "$*" >> "$CALLS"; printf "house\\tschema\\n"; }',
        `COMP_WORDS=(${words})`,
        `COMP_CWORD=${slot.words.length}`,
        '_cospec',
        'printf "%s\\n" "${COMPREPLY[@]}"',
      ].join('\n')
      const calls = join(mkTempRepo(), 'calls')
      const run = Bun.spawnSync(['bash', '-c', program], { env: { ...process.env, CALLS: calls } })
      expect(run.exitCode, new TextDecoder().decode(run.stderr)).toBe(0)
      expect(new TextDecoder().decode(run.stdout).trim()).toBe('house')
      expect(readFileSync(calls, 'utf8')).toBe('__complete schemas\n')
    })

  test('zsh: each slot is an arm calling _cospec_dynamic schemas', async () => {
    const body = await script('zsh')
    for (const command of ['status', 'templates', 'instructions'])
      expect(body).toMatch(
        new RegExp(
          `\\n {4}${command}\\)\\n(?: {6}.*\\n)*? {6}\\[\\[ \\$prev == '--schema' \\]\\] && \\{ _cospec_dynamic schemas; return \\}`,
        ),
      )
    for (const sub of ['which', 'validate', 'fork'])
      expect(body).toContain(
        `    'schema ${sub}')\n      (( subpos == 0 )) && { _cospec_dynamic schemas; return }\n`,
      )
  })

  test('fish: each slot completes from cospec __complete schemas', async () => {
    const body = await script('fish')
    const source = '"(cospec __complete schemas 2>/dev/null | cut -f1)"'
    for (const command of ['status', 'templates', 'instructions'])
      expect(body).toContain(
        `complete -c cospec -n '__fish_seen_subcommand_from ${command}' -l schema -x -a ${source}`,
      )
    for (const sub of ['which', 'validate', 'fork'])
      expect(body).toContain(
        `complete -c cospec -n '__fish_seen_subcommand_from schema; and __fish_seen_subcommand_from ${sub}' -a ${source}`,
      )
  })
})
