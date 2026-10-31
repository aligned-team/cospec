// `cospec apply --json` and `cospec validate --strict` end to end from source against the pinned
// 1.15.0 binary, for openspec-1-15-parity's verification rows 2.3 (task source locations across
// a glob-tracked task set, and what comes after the last checkbox) and 3.5 (validation parity on
// a long MODIFIED requirement, a non-English Purpose, a renamed MODIFIED scenario, and an
// unquoted `rules` item).

import { afterAll, describe, expect, test } from 'bun:test'
import { appendFileSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'
import { authorFeat, BLOCKERS_EMPTY } from './support.ts'

afterAll(cleanupAll)

async function initRepo(): Promise<string> {
  const root = mkTempRepo({ git: true })
  const init = await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
  expect(init.exitCode).toBe(0)
  return root
}

interface ApplyTask {
  id: string
  description: string
  done: boolean
  sourcePath?: string
  line?: number
}

interface ApplyBody {
  next?: string
  archiveReady?: boolean
  apply: { state: string; instruction: string; tasks: ApplyTask[] }
}

describe('2.3: apply on a glob-tracked task set', () => {
  /** A project schema whose tasks are every `tasks/*.md`, tracked through `apply.tracks`. */
  const MULTI_SCHEMA = `name: multi
version: 1
description: tasks split across files
artifacts:
  - id: proposal
    generates: proposal.md
    description: Proposal
    template: proposal.md
  - id: tasks
    generates: tasks/*.md
    description: Tasks
    template: tasks.md
    requires:
      - proposal
apply:
  requires:
    - tasks
  tracks: tasks/*.md
`

  async function multiRepo(a: string, b: string): Promise<string> {
    const root = await initRepo()
    const c = 'openspec/changes/split'
    writeFiles(root, {
      'openspec/schemas/multi/schema.yaml': MULTI_SCHEMA,
      'openspec/schemas/multi/templates/proposal.md': '# Proposal\n',
      'openspec/schemas/multi/templates/tasks.md': '# Tasks\n',
      [`${c}/.openspec.yaml`]: 'schema: multi\ncreated: 2026-07-06\n',
      [`${c}/proposal.md`]:
        '## Why\n\nTasks are split across two files so each area owns its list.\n\n## What Changes\n\n- Split.\n',
      [`${c}/tasks/a.md`]: a,
      [`${c}/tasks/b.md`]: b,
    })
    return root
  }

  test('every task names its own file and 1-based line', async () => {
    const root = await multiRepo(
      '## 1. A\n\n- [x] 1.1 First task\n- [ ] 1.2 Second task\n',
      '## 2. B\n\n- [ ] 2.1 Third task\n',
    )
    const res = await cospec(['apply', 'split', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const body = JSON.parse(res.stdout) as ApplyBody
    const dir = join(realpathSync(root), 'openspec/changes/split/tasks')
    const located = body.apply.tasks.map((t) => ({
      description: t.description,
      sourcePath: t.sourcePath === undefined ? undefined : realpathSync(t.sourcePath),
      line: t.line,
    }))
    expect(located).toEqual([
      { description: '1.1 First task', sourcePath: join(dir, 'a.md'), line: 3 },
      { description: '1.2 Second task', sourcePath: join(dir, 'a.md'), line: 4 },
      { description: '2.1 Third task', sourcePath: join(dir, 'b.md'), line: 3 },
    ])
  }, 60_000)

  test('with every task in both files checked, the next step is verification, not archive', async () => {
    const root = await multiRepo(
      '## 1. A\n\n- [x] 1.1 First task\n- [x] 1.2 Second task\n',
      '## 2. B\n\n- [x] 2.1 Third task\n',
    )
    const res = await cospec(['apply', 'split', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const body = JSON.parse(res.stdout) as ApplyBody
    expect(body.apply.state).toBe('all_done')
    expect(body.apply.tasks.every((t) => t.sourcePath !== undefined && t.line !== undefined)).toBe(
      true,
    )
    expect(body.apply.instruction).toContain('All tracked tasks are complete.')
    expect(body.apply.instruction).toMatch(/verify/i)
    expect(body.apply.instruction).not.toMatch(/ready to archive|cospec archive|openspec archive/)
  }, 60_000)

  test('on a cospec type, a checked task list names verify and validate, and archiveReady is false', async () => {
    const root = await initRepo()
    authorFeat(root, 'add-widgets', 'widgets', { tasksDone: true })
    writeFiles(root, {
      'openspec/changes/add-widgets/.openspec.yaml':
        'schema: feat\ncreated: 2026-07-06\nx-cospec-schema-version: 2\n',
      'openspec/changes/add-widgets/verification.md':
        '## 1. Widgets work [critical]\n\n- [ ] 1.1 @integration render a widget -> it renders\n',
    })
    const res = await cospec(['apply', 'add-widgets', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const body = JSON.parse(res.stdout) as ApplyBody
    expect(body.apply.state).toBe('all_done')
    expect(body.next).toBe('cospec validate add-widgets --strict')
    expect(body.archiveReady).toBe(false)
    expect(body.apply.instruction).toContain('/cospec:verify')
    expect(body.apply.instruction).toContain('The change is not ready to archive yet')
    expect(body.apply.tasks.every((t) => t.sourcePath !== undefined && t.line !== undefined)).toBe(
      true,
    )
  }, 60_000)
})

describe('3.5: validation parity on 1.15.0 shapes', () => {
  const WIDGETS = `# Widgets Specification

## Purpose

Widgets render on request so callers can display their data consistently.

## Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered

#### Scenario: Render an empty widget

- **WHEN** a caller requests an empty widget
- **THEN** a placeholder is rendered
`

  const MODIFY_PROPOSAL = `# change

## Why

The rendering path is being reworked and its requirement text changes along
the way; this proposal updates widget rendering to match the new behavior.

## What Changes

- Rework widget rendering.

## Capabilities

### Modified Capabilities

- widgets

## Impact

- No breaking changes.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

  function modifiedChange(root: string, id: string, statement: string, second: string): void {
    const c = `openspec/changes/${id}`
    writeFiles(root, {
      [`${c}/.openspec.yaml`]: 'schema: feat\ncreated: 2026-07-06\n',
      [`${c}/proposal.md`]: MODIFY_PROPOSAL,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/tasks.md`]: '## 1. Implementation\n\n- [ ] 1.1 Rework rendering\n',
      [`${c}/specs/widgets/spec.md`]: `## MODIFIED Requirements

### Requirement: Widget rendering

${statement}

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered

#### Scenario: ${second}

- **WHEN** a caller requests an empty widget
- **THEN** a placeholder is rendered
`,
    })
  }

  interface Issue {
    level: string
    rule: string
    message: string
  }

  async function issuesOf(
    root: string,
    id: string,
  ): Promise<{ exitCode: number; issues: Issue[] }> {
    const res = await cospec(['validate', id, '--strict', '--json'], { cwd: root })
    const body = JSON.parse(res.stdout) as { items: { issues: Issue[] }[] }
    return { exitCode: res.exitCode, issues: body.items.flatMap((i) => i.issues) }
  }

  test('a 620-character MODIFIED requirement fails strict with specs/requirement-too-long', async () => {
    const root = await initRepo()
    writeFiles(root, { 'openspec/specs/widgets/spec.md': WIDGETS })
    const head = 'The system SHALL render a widget when requested'
    const statement = `${head}${', including widget variant N'.repeat(40)}`.slice(0, 619) + '.'
    expect(statement).toHaveLength(620)
    modifiedChange(root, 'long-req', statement, 'Render an empty widget')

    const { exitCode, issues } = await issuesOf(root, 'long-req')
    expect(exitCode).toBe(1)
    const long = issues.filter((i) => i.rule === 'specs/requirement-too-long')
    expect(long).toHaveLength(1)
    expect(long[0]?.message).toBe(
      'MODIFIED "Widget rendering" requirement text is 620 characters, over the 500-character limit',
    )
  }, 60_000)

  test('a "Todo el…" Purpose is prose, not a placeholder: specs/purpose-tbd stays quiet', async () => {
    const root = await initRepo()
    writeFiles(root, {
      'openspec/specs/flujo/spec.md': `# Flujo Specification

## Purpose

Todo el flujo de pagos pasa por este servicio para que los cobros queden auditados.

## Requirements

### Requirement: Flujo auditado

The system SHALL record every payment in the audit log.

#### Scenario: Pago registrado

- **WHEN** a payment completes
- **THEN** the audit log holds it
`,
    })
    const spanish = await cospec(['validate', '--specs', '--strict', '--json'], { cwd: root })
    expect(spanish.exitCode).toBe(0)
    expect(spanish.stdout).not.toContain('specs/purpose-tbd')

    // The control: a real placeholder in the same position does fire.
    writeFiles(root, {
      'openspec/specs/flujo/spec.md': readFileSync(
        join(root, 'openspec/specs/flujo/spec.md'),
        'utf8',
      ).replace(/^Todo el flujo/m, 'TODO: el flujo'),
    })
    const placeholder = await cospec(['validate', '--specs', '--strict', '--json'], { cwd: root })
    expect(placeholder.stdout).toContain('specs/purpose-tbd')
  }, 60_000)

  test('a renamed MODIFIED scenario names both counts and the introduced scenario', async () => {
    const root = await initRepo()
    writeFiles(root, { 'openspec/specs/widgets/spec.md': WIDGETS })
    modifiedChange(
      root,
      'rename-scn',
      'The system SHALL render a widget when requested.',
      'Render a blank widget',
    )

    const { exitCode, issues } = await issuesOf(root, 'rename-scn')
    expect(exitCode).toBe(1)
    const loss = issues.filter((i) => i.rule === 'archive/scenario-preservation')
    expect(loss).toHaveLength(1)
    expect(loss[0]?.level).toBe('ERROR')
    expect(loss[0]?.message).toBe(
      'MODIFIED "Widget rendering" drops scenario(s) "Render an empty widget" (living 2 -> delta 2). ' +
        'The modified block has 2 scenarios; the current spec has 2 scenarios. ' +
        'It adds 1 scenario not in the current spec: "Render a blank widget".',
    )
  }, 60_000)

  test('an unquoted `- Use: tabs` rules item: doctor names the index and the quoted form, instructions relays the binary', async () => {
    const root = await initRepo()
    appendFileSync(
      join(root, 'openspec/config.yaml'),
      'rules:\n  proposal:\n    - Keep it short\n    - "Use: spaces"\n    - Use: tabs\n',
    )

    // `config/rules-item-type` is cospec's doctor finding (validate has no config item).
    const doctor = await cospec(['doctor', '--json'], { cwd: root })
    const findings = (
      JSON.parse(doctor.stdout) as {
        findings: { check: string; message: string; remedy?: string }[]
      }
    ).findings
    const config = findings.filter((f) => f.check === 'config')
    expect(config).toHaveLength(1)
    expect(config[0]?.message).toBe(
      "rules.proposal[2] parsed as a mapping, not a string, so every rule for 'proposal' is ignored",
    )
    expect(config[0]?.remedy).toContain('quote the whole item: - "Use: tabs"')

    // validate has no config item; the binary's own config read warning surfaces where it reads
    // the rules, `cospec instructions`, on stderr, naming the same index.
    const created = await cospec(['new', 'feat', 'demo'], { cwd: root })
    expect(created.exitCode).toBe(0)
    const validate = await cospec(['validate', 'demo', '--strict'], { cwd: root })
    expect(`${validate.stdout}${validate.stderr}`).not.toContain('rules.proposal[2]')
    const instructions = await cospec(['instructions', 'proposal', '--change', 'demo'], {
      cwd: root,
    })
    expect(instructions.stderr).toContain(
      "Rules for 'proposal' must be an array of strings, ignoring this artifact's rules. rules.proposal[2] is a mapping",
    )
  }, 60_000)
})
