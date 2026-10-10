// The project's own inputs reach an agent through the generated workflows
// (canon-workflow-parity 5.1, 6.1 and 6.3; design D7 and D8; issue #70).
//
// `openspec/config.yaml`'s `context:` and `operations.<id>.guidance:` are read by the pinned
// binary alone. `cospec apply` relays its `instructions apply` document, so the `--json` form
// has always carried them; the human transcript printed neither, in the clear-gate path or in
// `applyLegacy`, `cospec archive` never showed the archive guidance, and no generated workflow
// told an agent to read either. Each row below runs cospec and the pinned binary on one sandbox
// project, so the sections cospec prints are compared with the binary's own, byte for byte.

import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { appendFileSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'
import { oracle, oracleJson } from './support/upstream-oracle.ts'

afterAll(cleanupAll)
// Each row drives several real processes: cospec, its wrapped binary, and the binary again as the oracle.
setDefaultTimeout(120_000)

const APPLY_MARKER = 'APPLY_GUIDANCE_MARKER: run focused tests first'
const ARCHIVE_MARKER = 'ARCHIVE_GUIDANCE_MARKER: keep the summary short'
// An entry that starts with the binary's own name: the user's text, never respelled.
const BARE_ENTRY = 'openspec list --json is how this team lists its changes'
const CONTEXT = 'Project context: the widget parser is the only caller.\nSecond context line.'

const PROPOSAL = `# Proposal

## Why

The widget crashes on empty input. Users hit this daily and lose work.

## What Changes

Guard against empty input in the widget parser.

## Impact

Parser only.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
`

const BLOCKERS = '# Dependencies\n\n## Blocked by\n\nNone.\n\n## Soft-blocked by\n\nNone.\n'

const VERIFICATION_PLANNED = `# Verification

## 1. Empty input is handled [critical]

- [ ] 1.1 @regression (agent) run the widget with empty input, failing before the fix -> no crash after
- [ ] 1.2 @e2e (agent) drive the real flow end to end with empty input -> no crash
- [ ] 1.3 @manual (human) try it in a browser -> no crash shown
`

const VERIFICATION_RESOLVED = `# Verification

## 1. Empty input is handled [critical]

- [x] 1.1 @regression (agent) run the widget with empty input, failing before the fix -> no crash after
- [x] 1.2 @e2e (agent) drive the real flow end to end with empty input -> no crash
- [x] 1.3 @manual (human) try it in a browser -> no crash shown
`

const TASKS_DONE =
  '# Tasks\n\n## 1. Parser\n\n- [x] 1.1 add the guard and verify by running the unit suite\n'

interface Options {
  /** What to append to `openspec/config.yaml`; none leaves the scaffold's own. */
  config?: string
  verification?: string
  /** Rename the scaffold's `openspec/config.yaml` to `config.yml`, the binary's other spelling. */
  ymlConfig?: boolean
}

/** The issue #70 repro project: a clear-gate `fix` change `my-fix` and its sandbox root. */
async function project(opts: Options = {}): Promise<string> {
  const root = mkTempRepo({ fixture: 'fresh', git: true })
  const init = await cospec(['init', '--yes', '--harness', 'claude', '--no-gate'], { cwd: root })
  expect(init.exitCode).toBe(0)
  const created = await cospec(['new', 'fix', 'my-fix'], { cwd: root })
  expect(created.exitCode).toBe(0)
  writeFiles(root, {
    'openspec/changes/my-fix/proposal.md': PROPOSAL,
    'openspec/changes/my-fix/blocking-changes.md': BLOCKERS,
    'openspec/changes/my-fix/verification.md': opts.verification ?? VERIFICATION_PLANNED,
    'openspec/changes/my-fix/tasks.md': TASKS_DONE,
  })
  if (opts.config !== undefined) appendFileSync(join(root, 'openspec/config.yaml'), opts.config)
  if (opts.ymlConfig === true)
    renameSync(join(root, 'openspec/config.yaml'), join(root, 'openspec/config.yml'))
  return root
}

const GUIDANCE_CONFIG = `
operations:
  apply:
    guidance:
      - "${APPLY_MARKER}"
  archive:
    guidance:
      - "${ARCHIVE_MARKER}"
`

const INPUTS_CONFIG = `
context: |
  Project context: the widget parser is the only caller.
  Second context line.
operations:
  apply:
    guidance:
      - "${APPLY_MARKER}"
      - "${BARE_ENTRY}"
  archive:
    guidance:
      - "${ARCHIVE_MARKER}"
`

/** The sections the printer emits after the instruction: from the context heading to the end. */
function inputsTail(text: string): string {
  const at = text.indexOf('### Project Context')
  if (at < 0) return ''
  return text.slice(at).trimEnd()
}

/** The lines of `text` that carry `marker`, as the issue's repro prints them. */
function markerLines(text: string, marker: string): string[] {
  return text.split('\n').filter((line) => line.includes(marker))
}

describe('issue #70: the configured guidance is visible in every listed form', () => {
  test('the repro script shows each marker in every form it lists', async () => {
    const root = await project({ config: GUIDANCE_CONFIG })
    const forms: [string[], string][] = [
      [['apply', 'my-fix', '--json'], APPLY_MARKER],
      [['apply', 'my-fix'], APPLY_MARKER],
      [['instructions', 'apply', '--change', 'my-fix', '--json'], APPLY_MARKER],
      [['instructions', 'apply', '--change', 'my-fix'], APPLY_MARKER],
      [['instructions', 'archive', '--change', 'my-fix'], ARCHIVE_MARKER],
      [['archive', 'my-fix'], ARCHIVE_MARKER],
    ]
    const missing: string[] = []
    for (const [argv, marker] of forms) {
      const run = await cospec(argv, { cwd: root })
      const lines = markerLines(`${run.stdout}\n${run.stderr}`, marker)
      if (lines.length === 0) missing.push(`cospec ${argv.join(' ')}`)
    }
    expect(missing).toEqual([])
  })

  test('the generated apply and archive skills mention the guidance and run the lookup', async () => {
    const root = await project({ config: GUIDANCE_CONFIG })
    const apply = readFileSync(join(root, '.claude/skills/cospec-apply-change/SKILL.md'), 'utf8')
    const archive = readFileSync(
      join(root, '.claude/skills/cospec-archive-change/SKILL.md'),
      'utf8',
    )
    expect(apply).toContain('apply.operationGuidance')
    expect(archive).toContain('cospec instructions archive --change')
  })
})

describe('cospec apply prints the sections the pinned binary prints (D7)', () => {
  test('clear-gate path: context and guidance follow the instruction, as the binary prints them', async () => {
    const root = await project({ config: INPUTS_CONFIG })
    const ours = await cospec(['apply', 'my-fix'], { cwd: root })
    expect(ours.exitCode).toBe(0)
    const theirs = await oracle(['instructions', 'apply', '--change', 'my-fix'], root)
    expect(theirs.exitCode).toBe(0)
    const expected = inputsTail(theirs.stdout)
    expect(expected).toContain(`- ${BARE_ENTRY}`)
    expect(inputsTail(ours.stdout)).toBe(expected)
    // From the heading to the end is only the sections: nothing of the instruction follows them.
    expect(expected.startsWith('### Project Context')).toBe(true)
  })

  test('applyLegacy path: the same sections follow the instruction', async () => {
    const root = await project({ config: INPUTS_CONFIG })
    expect((await cospec(['schema', 'fork', 'feat', 'forked'], { cwd: root })).exitCode).toBe(0)
    expect((await cospec(['new', 'forked', 'legacy-one'], { cwd: root })).exitCode).toBe(0)
    const ours = await cospec(['apply', 'legacy-one'], { cwd: root })
    expect(ours.stdout).toContain('legacy schema')
    const theirs = await oracle(['instructions', 'apply', '--change', 'legacy-one'], root)
    const expected = inputsTail(theirs.stdout)
    expect(expected).toContain(`- ${APPLY_MARKER}`)
    expect(inputsTail(ours.stdout)).toBe(expected)
  })

  test('--json: apply.context and apply.operationGuidance equal the binary document, both paths', async () => {
    const root = await project({ config: INPUTS_CONFIG })
    const ours = JSON.parse((await cospec(['apply', 'my-fix', '--json'], { cwd: root })).stdout)
    const theirs = (
      await oracleJson(['instructions', 'apply', '--change', 'my-fix', '--json'], root)
    ).json as { context: string; operationGuidance: string[] }
    expect(ours.apply.context).toBe(CONTEXT + '\n')
    expect(ours.apply.context).toBe(theirs.context)
    expect(ours.apply.operationGuidance).toEqual(theirs.operationGuidance)
    expect(ours.apply.operationGuidance).toContain(BARE_ENTRY)

    expect((await cospec(['schema', 'fork', 'feat', 'forked'], { cwd: root })).exitCode).toBe(0)
    expect((await cospec(['new', 'forked', 'legacy-one'], { cwd: root })).exitCode).toBe(0)
    const legacy = JSON.parse(
      (await cospec(['apply', 'legacy-one', '--json'], { cwd: root })).stdout,
    )
    expect(legacy.apply.context).toBe(theirs.context)
    expect(legacy.apply.operationGuidance).toEqual(theirs.operationGuidance)
  })

  test('nothing configured prints nothing new, in text and in --json, on both paths', async () => {
    const root = await project()
    expect((await cospec(['schema', 'fork', 'feat', 'forked'], { cwd: root })).exitCode).toBe(0)
    expect((await cospec(['new', 'forked', 'legacy-one'], { cwd: root })).exitCode).toBe(0)
    for (const change of ['my-fix', 'legacy-one']) {
      const text = (await cospec(['apply', change], { cwd: root })).stdout
      for (const heading of [
        '### Project Context',
        '### Operation Guidance',
        '### Referenced Stores',
        'No project context or operation guidance configured.',
      ])
        expect(text).not.toContain(heading)
      const json = JSON.parse((await cospec(['apply', change, '--json'], { cwd: root })).stdout)
      for (const key of ['context', 'operationGuidance', 'references'])
        expect(key in json.apply).toBe(false)
    }
  })
})

describe('archive.md alone reaches the archive guidance (D8, verification 2)', () => {
  /** The lookup command line the rendered archive skill prints, as argv for `slug`. */
  function lookupArgv(skill: string, slug: string): string[] {
    const line = skill
      .split('\n')
      .find((l) => /cospec instructions archive --change "<slug>" --json/.test(l))
    if (line === undefined) throw new Error('the archive skill prints no lookup line')
    const command = /cospec (instructions archive --change "<slug>" --json[^`]*)/.exec(line)![1]!
    return command.replace('"<slug>"', slug).trim().split(/\s+/)
  }

  test('the lookup line extracted from the rendered body returns the guidance', async () => {
    const root = await project({ config: GUIDANCE_CONFIG })
    const skill = readFileSync(join(root, '.claude/skills/cospec-archive-change/SKILL.md'), 'utf8')
    const argv = lookupArgv(skill, 'my-fix')
    const run = await cospec(argv, { cwd: root })
    expect(run.exitCode).toBe(0)
    const doc = JSON.parse(run.stdout) as { changeName: string; operationGuidance: string[] }
    expect(doc.changeName).toBe('my-fix')
    expect(doc.operationGuidance).toEqual([ARCHIVE_MARKER])
  })
})

describe('cospec archive prints the archive guidance (6.3, issue #70)', () => {
  test('on success, text mode prints the guidance after the summary', async () => {
    const root = await project({ config: GUIDANCE_CONFIG, verification: VERIFICATION_RESOLVED })
    const run = await cospec(['archive', 'my-fix'], { cwd: root })
    expect(run.exitCode).toBe(0)
    const archived = run.stdout.indexOf('Archived: my-fix')
    expect(archived).toBeGreaterThan(-1)
    expect(run.stdout.indexOf(ARCHIVE_MARKER)).toBeGreaterThan(archived)
  })

  test('on success, --json carries the guidance as additive keys', async () => {
    const root = await project({
      config: INPUTS_CONFIG,
      verification: VERIFICATION_RESOLVED,
    })
    const run = await cospec(['archive', 'my-fix', '--json'], { cwd: root })
    expect(run.exitCode).toBe(0)
    const doc = JSON.parse(run.stdout) as Record<string, unknown>
    expect(doc.archived).toBe(true)
    expect(doc.operationGuidance).toEqual([ARCHIVE_MARKER])
    expect(doc.context).toBe(CONTEXT + '\n')
  })

  test('on refusal, text mode prints the guidance, and the exit code is unchanged', async () => {
    const root = await project({ config: GUIDANCE_CONFIG })
    const run = await cospec(['archive', 'my-fix'], { cwd: root })
    expect(run.exitCode).toBe(1)
    expect(`${run.stdout}\n${run.stderr}`).toContain(ARCHIVE_MARKER)
  })

  test("the inputs read are the binary's own, empty entries and bad shapes included", async () => {
    const configs: [string, string][] = [
      [
        'empty guidance entries are dropped',
        'operations:\n  archive:\n    guidance:\n      - ""\n      - keep\n      - ""\n',
      ],
      [
        'a whitespace-only context is none',
        'context: "   "\noperations:\n  archive:\n    guidance: [one]\n',
      ],
      [
        "a guidance that is not a list is none, with the binary's warning",
        'operations:\n  archive:\n    guidance: not-a-list\n',
      ],
      [
        'guidance only under apply is none for archive',
        'operations:\n  apply:\n    guidance: [elsewhere]\n',
      ],
    ]
    for (const [label, config] of configs) {
      const root = await project({ config: `\n${config}`, verification: VERIFICATION_RESOLVED })
      const theirs = await oracle(['instructions', 'archive', '--change', 'my-fix', '--json'], root)
      expect(theirs.exitCode, label).toBe(0)
      const expected = JSON.parse(theirs.stdout) as Record<string, unknown>
      const run = await cospec(['archive', 'my-fix', '--json'], { cwd: root })
      expect(run.exitCode, label).toBe(0)
      const doc = JSON.parse(run.stdout) as Record<string, unknown>
      for (const key of ['context', 'operationGuidance'])
        expect(doc[key], `${label}: ${key}`).toEqual(expected[key])
      for (const line of theirs.stderr.split('\n').filter((l) => l.length > 0))
        expect(run.stderr, label).toContain(line)
    }
  })

  test('on refusal, --json stays one failure document without the guidance keys', async () => {
    const root = await project({ config: GUIDANCE_CONFIG })
    const run = await cospec(['archive', 'my-fix', '--json'], { cwd: root })
    expect(run.exitCode).toBe(1)
    const doc = JSON.parse(run.stdout) as Record<string, unknown>
    expect(doc.archived).toBe(false)
    expect('operationGuidance' in doc).toBe(false)
  })

  test('a project whose config is config.yml gets the same sections, in text and --json', async () => {
    const text = await project({
      config: INPUTS_CONFIG,
      verification: VERIFICATION_RESOLVED,
      ymlConfig: true,
    })
    const ran = await cospec(['archive', 'my-fix'], { cwd: text })
    expect(ran.exitCode).toBe(0)
    expect(ran.stdout).toContain('### Project Context')
    expect(ran.stdout).toContain(`- ${ARCHIVE_MARKER}`)

    const json = await project({
      config: INPUTS_CONFIG,
      verification: VERIFICATION_RESOLVED,
      ymlConfig: true,
    })
    const theirs = await oracleJson(
      ['instructions', 'archive', '--change', 'my-fix', '--json'],
      json,
    )
    const doc = JSON.parse((await cospec(['archive', 'my-fix', '--json'], { cwd: json })).stdout)
    expect(doc.operationGuidance).toEqual([ARCHIVE_MARKER])
    expect(doc.operationGuidance).toEqual(
      (theirs.json as Record<string, unknown>).operationGuidance,
    )
    expect(doc.context).toBe(CONTEXT + '\n')
  })

  test('nothing configured archives with no new line', async () => {
    const root = await project({ verification: VERIFICATION_RESOLVED })
    const run = await cospec(['archive', 'my-fix'], { cwd: root })
    expect(run.exitCode).toBe(0)
    expect(run.stdout).not.toContain('Operation Guidance')
    expect(run.stdout).not.toContain('Project Context')
  })
})

describe("cospec apply relays the binary's config warnings", () => {
  const MALFORMED =
    '\noperations:\n  applies:\n    guidance: [a]\n  apply:\n    guidance: not-a-list\n    extra: 1\n'

  test('a malformed operations block warns on stderr, in text and --json, as the binary does', async () => {
    const root = await project({ config: MALFORMED })
    const theirs = await oracle(['instructions', 'apply', '--change', 'my-fix', '--json'], root)
    const expected = theirs.stderr.split('\n').filter((l) => l.length > 0)
    expect(expected.length).toBeGreaterThanOrEqual(3)
    for (const argv of [
      ['apply', 'my-fix'],
      ['apply', 'my-fix', '--json'],
    ]) {
      const run = await cospec(argv, { cwd: root })
      expect(run.exitCode, argv.join(' ')).toBe(0)
      const lines = run.stderr.split('\n').filter((l) => l.length > 0)
      for (const line of expected) expect(lines, argv.join(' ')).toContain(line)
      // Printed once each: relaying must not double a warning another step already wrote.
      expect(lines.filter((l) => l === expected[0]).length, argv.join(' ')).toBe(1)
    }
    const json = await cospec(['apply', 'my-fix', '--json'], { cwd: root })
    expect(() => JSON.parse(json.stdout)).not.toThrow()
  })
})
