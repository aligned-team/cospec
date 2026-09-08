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
    const res = await cospec(['completion', 'powershell'], { cwd })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain("unsupported shell 'powershell'")
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

  test('no source at all is a silent exit 1', async () => {
    const cwd = mkTempRepo()
    const res = await cospec(['__complete'], { cwd })
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toBe('')
    expect(res.stderr).toBe('')
  })
})
