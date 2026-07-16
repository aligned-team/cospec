import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ARTIFACT_FILES,
  COSPEC_TYPES,
  TYPE_ARTIFACTS,
} from '../../../../apps/cli/src/core/rules/type-facts.ts'
import type { Scenario } from '../../scenarios/types.ts'
import {
  declaredArtifactFiles,
  parseCospecValidateJson,
  requiredArtifactFiles,
  resolveChange,
  scoreMechanical,
  snapshotChangeArtifacts,
} from '../../src/mechanical.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..', '..')

const roots: string[] = []

function makeSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-bench-mechanical-'))
  roots.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

// ── parseCospecValidateJson (pure — no spawn) ──────────────────────────────

describe('parseCospecValidateJson', () => {
  test('reads counts directly from summary.byRule (the real toJson shape)', () => {
    const stdout = JSON.stringify({
      version: 1,
      items: [{ id: 'add-widget', kind: 'change', valid: false, issues: [] }],
      summary: {
        errors: 1,
        warnings: 2,
        byRule: { 'proposal/why-substantive': 1, 'blockers/dangling-ref': 2 },
      },
    })
    expect(parseCospecValidateJson(stdout)).toEqual({
      errors: 1,
      warnings: 2,
      byRule: { 'proposal/why-substantive': 1, 'blockers/dangling-ref': 2 },
    })
  })

  test('falls back to counting items[].issues[].rule when byRule is empty', () => {
    const stdout = JSON.stringify({
      version: 1,
      items: [
        {
          id: 'add-widget',
          kind: 'change',
          valid: false,
          issues: [
            { level: 'ERROR', rule: 'deltas/scenario-depth' },
            { level: 'WARNING', rule: 'proposal/why-substantive' },
            { level: 'ERROR', rule: 'deltas/scenario-depth' },
          ],
        },
      ],
      summary: { errors: 2, warnings: 1, byRule: {} },
    })
    expect(parseCospecValidateJson(stdout)).toEqual({
      errors: 2,
      warnings: 1,
      byRule: { 'deltas/scenario-depth': 2, 'proposal/why-substantive': 1 },
    })
  })

  test('defaults errors/warnings/byRule to zero/empty when summary is absent', () => {
    expect(parseCospecValidateJson(JSON.stringify({ version: 1, items: [] }))).toEqual({
      errors: 0,
      warnings: 0,
      byRule: {},
    })
  })

  test('returns null on non-JSON stdout (e.g. an openspec-arm body)', () => {
    expect(parseCospecValidateJson('not json at all')).toBeNull()
  })

  test('returns null on empty stdout', () => {
    expect(parseCospecValidateJson('')).toBeNull()
  })
})

// ── declaredArtifactFiles / requiredArtifactFiles (pure, canon-derived) ────

describe('declaredArtifactFiles / requiredArtifactFiles', () => {
  test('mirrors TYPE_ARTIFACTS.declared / .applyRequires exactly, for every type', () => {
    for (const type of COSPEC_TYPES) {
      const facts = TYPE_ARTIFACTS[type]
      const expectedDeclared = new Set(
        facts.declared
          .filter((id) => id !== 'specs')
          .map((id) => ARTIFACT_FILES[id as Exclude<typeof id, 'specs'>]),
      )
      const expectedRequired = new Set(
        facts.applyRequires
          .filter((id) => id !== 'specs')
          .map((id) => ARTIFACT_FILES[id as Exclude<typeof id, 'specs'>]),
      )
      expect(declaredArtifactFiles(type)).toEqual(expectedDeclared)
      expect(requiredArtifactFiles(type)).toEqual(expectedRequired)
    }
  })

  test('never includes the specs file id (matched by directory prefix instead)', () => {
    for (const type of COSPEC_TYPES) {
      expect(declaredArtifactFiles(type).has('specs')).toBe(false)
      expect(requiredArtifactFiles(type).has('specs')).toBe(false)
    }
  })

  test('ci declares verification.md but does not require it (optional artifact)', () => {
    expect(declaredArtifactFiles('ci').has('verification.md')).toBe(true)
    expect(requiredArtifactFiles('ci').has('verification.md')).toBe(false)
  })

  test('chore neither declares nor requires verification.md', () => {
    expect(declaredArtifactFiles('chore').has('verification.md')).toBe(false)
    expect(requiredArtifactFiles('chore').has('verification.md')).toBe(false)
  })

  test('feat requires proposal.md, blocking-changes.md, verification.md, and tasks.md', () => {
    const required = requiredArtifactFiles('feat')
    expect(required.has('proposal.md')).toBe(true)
    expect(required.has('blocking-changes.md')).toBe(true)
    expect(required.has('verification.md')).toBe(true)
    expect(required.has('tasks.md')).toBe(true)
  })
})

// ── resolveChange (filesystem, no spawn) ───────────────────────────────────

describe('resolveChange', () => {
  test('undefined when openspec/changes does not exist', async () => {
    const sandbox = makeSandbox()
    expect(await resolveChange(sandbox)).toBeUndefined()
  })

  test('resolves the single active (non-archive) change dir', async () => {
    const sandbox = makeSandbox()
    mkdirSync(join(sandbox, 'openspec/changes/add-widget'), { recursive: true })
    const resolved = await resolveChange(sandbox)
    expect(resolved).toEqual({
      slug: 'add-widget',
      dir: 'openspec/changes/add-widget',
      archived: false,
    })
  })

  test('undefined when there are multiple active change dirs (ambiguous)', async () => {
    const sandbox = makeSandbox()
    mkdirSync(join(sandbox, 'openspec/changes/a'), { recursive: true })
    mkdirSync(join(sandbox, 'openspec/changes/b'), { recursive: true })
    expect(await resolveChange(sandbox)).toBeUndefined()
  })

  test('falls back to the last date-prefixed archive dir when no active change exists', async () => {
    const sandbox = makeSandbox()
    mkdirSync(join(sandbox, 'openspec/changes/archive/2026-01-01-add-widget'), { recursive: true })
    mkdirSync(join(sandbox, 'openspec/changes/archive/2026-02-02-fix-bug'), { recursive: true })
    const resolved = await resolveChange(sandbox)
    expect(resolved).toEqual({
      slug: 'fix-bug',
      dir: 'openspec/changes/archive/2026-02-02-fix-bug',
      archived: true,
    })
  })

  test('ignores archive dirs that do not match the YYYY-MM-DD-<slug> pattern', async () => {
    const sandbox = makeSandbox()
    mkdirSync(join(sandbox, 'openspec/changes/archive/not-a-date'), { recursive: true })
    expect(await resolveChange(sandbox)).toBeUndefined()
  })
})

// ── scoreMechanical over ARCHIVED trees (archived short-circuits both
// armNativeValidate and cospecValidateCounts, so these exercise the
// proportionality/tasks/completion logic with zero subprocess spawns) ──────

function trivialScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'ci',
    type: 'ci',
    title: 'test scenario',
    prompt: 'do the thing (bench-ref: BENCH-TEST-X)',
    fixtureDir: 'fixtures/ci',
    maxTurns: 30,
    completed: () => true,
    ...overrides,
  }
}

describe('scoreMechanical', () => {
  test('no change produced: changeProduced false, missingRequiredArtifacts is the type floor', async () => {
    const sandbox = makeSandbox()
    const scenario = trivialScenario({ type: 'feat', completed: () => false })
    const m = await scoreMechanical('/repo-root-unused', sandbox, 'cospec', scenario)
    expect(m.changeProduced).toBe(false)
    expect(m.changeArchived).toBe(false)
    expect(m.armNativeValidatePass).toBeNull()
    expect(m.cospecValidate).toBeNull()
    expect(m.taskCompleted).toBe(false)
    // feat requires specs/ too.
    expect(new Set(m.missingRequiredArtifacts)).toEqual(
      new Set([...requiredArtifactFiles('feat'), 'specs/']),
    )
  })

  test('archived change: armNativeValidatePass short-circuits true; proportionality reads files present', async () => {
    const sandbox = makeSandbox()
    const changeDir = 'openspec/changes/archive/2026-03-03-add-workflow'
    const base = join(sandbox, changeDir)
    mkdirSync(base, { recursive: true })
    writeFileSync(
      join(base, '.openspec.yaml'),
      'schema: ci\ncreated: 2026-03-01\nschemaVersion: 2\n',
    )
    writeFileSync(join(base, 'proposal.md'), '## Why\n\nreasons\n')
    writeFileSync(join(base, 'blocking-changes.md'), '# Dependencies\n')
    writeFileSync(join(base, 'tasks.md'), '## 1. Do it\n\n- [x] 1.1 done\n')
    // Over-production for `ci`: design.md is not declared for ci.
    writeFileSync(join(base, 'design.md'), '# Design\n')

    const scenario = trivialScenario({ type: 'ci', completed: () => true })
    const m = await scoreMechanical('/repo-root-unused', sandbox, 'cospec', scenario)

    expect(m.changeProduced).toBe(true)
    expect(m.changeArchived).toBe(true)
    expect(m.stampedSchema).toBe('ci')
    // Archived short-circuits armNativeValidatePass only — cospecValidate is
    // still scored post-hoc via the scratch-repo path (see the dedicated
    // describe block below; here the `.openspec.yaml` schema is unresolvable
    // against real canon so it degrades to a non-null-but-possibly-errored
    // report, never the bug's silent null).
    expect(m.armNativeValidatePass).toBe(true)
    expect(m.forbiddenArtifacts).toEqual(['design.md'])
    expect(m.missingRequiredArtifacts).toEqual([])
    expect(m.tasksAllChecked).toBe(true)
    expect(m.taskCompleted).toBe(true)
    expect(m.artifactFiles).toContain('proposal.md')
  })

  test('tasksAllChecked is false when any checkbox is unchecked, null when tasks.md is absent', async () => {
    const sandbox = makeSandbox()
    const changeDir = 'openspec/changes/archive/2026-04-04-partial'
    const base = join(sandbox, changeDir)
    mkdirSync(base, { recursive: true })
    writeFileSync(join(base, 'tasks.md'), '## 1. Do it\n\n- [x] 1.1 done\n- [ ] 1.2 not yet\n')
    const m1 = await scoreMechanical('/repo-root-unused', sandbox, 'cospec', trivialScenario())
    expect(m1.tasksAllChecked).toBe(false)

    const sandbox2 = makeSandbox()
    const base2 = join(sandbox2, 'openspec/changes/archive/2026-05-05-no-tasks')
    mkdirSync(base2, { recursive: true })
    writeFileSync(join(base2, 'proposal.md'), '## Why\n')
    const m2 = await scoreMechanical('/repo-root-unused', sandbox2, 'cospec', trivialScenario())
    expect(m2.tasksAllChecked).toBeNull()
  })

  test('missing required specs/ is flagged for a type whose applyRequires includes specs', async () => {
    const sandbox = makeSandbox()
    const base = join(sandbox, 'openspec/changes/archive/2026-06-06-add-cart')
    mkdirSync(base, { recursive: true })
    writeFileSync(join(base, 'proposal.md'), '## Why\n')
    writeFileSync(join(base, 'blocking-changes.md'), '# Dependencies\n')
    writeFileSync(join(base, 'verification.md'), '# Verification\n')
    writeFileSync(join(base, 'tasks.md'), '- [x] done\n')
    // No specs/ dir at all.
    const scenario = trivialScenario({ type: 'feat' })
    const m = await scoreMechanical('/repo-root-unused', sandbox, 'cospec', scenario)
    expect(m.missingRequiredArtifacts).toContain('specs/')
  })

  test('specs/ present for a type that does not declare specs is forbidden (over-production)', async () => {
    const sandbox = makeSandbox()
    const base = join(sandbox, 'openspec/changes/archive/2026-07-07-add-chore')
    mkdirSync(join(base, 'specs/widgets'), { recursive: true })
    writeFileSync(join(base, 'specs/widgets/spec.md'), '# Spec\n')
    writeFileSync(join(base, 'proposal.md'), '## Why\n')
    writeFileSync(join(base, 'blocking-changes.md'), '# Dependencies\n')
    writeFileSync(join(base, 'tasks.md'), '- [x] done\n')
    const scenario = trivialScenario({ type: 'chore' })
    const m = await scoreMechanical('/repo-root-unused', sandbox, 'cospec', scenario)
    expect(m.forbiddenArtifacts).toContain('specs/')
  })
})

// ── cospecValidate over ARCHIVED changes (real binary — reproduces + fixes the
// first-full-run bug: `cospec validate <slug>` only resolves ACTIVE changes by
// exact id, so pointing it at an archived slug in the real sandbox used to
// fail with "unknown item" (empty stdout -> parseCospecValidateJson -> null).
// These spawn the real working-tree CLI, mirroring contract-test style. ────

describe('scoreMechanical — cospecValidate for archived changes (real CLI)', () => {
  test('archived change with a valid, clean ci artifact set scores cospecValidate (not null)', async () => {
    const sandbox = makeSandbox()
    const changeDir = 'openspec/changes/archive/2026-08-08-clean-ci'
    const base = join(sandbox, changeDir)
    mkdirSync(base, { recursive: true })
    writeFileSync(
      join(base, '.openspec.yaml'),
      'schema: ci\ncreated: 2026-08-01\nschemaVersion: 2\n',
    )
    writeFileSync(
      join(base, 'proposal.md'),
      [
        '## Why',
        '',
        'The release workflow needs a small fix so the archived-change fixture is realistic.',
        '',
        '## What Changes',
        '',
        '- Update the workflow file.',
        '',
        '## Impact',
        '',
        'CI only; no runtime behavior change.',
        '',
        '## Surfaces',
        '',
        'None.',
        '',
      ].join('\n'),
    )
    writeFileSync(
      join(base, 'blocking-changes.md'),
      [
        '# Dependencies',
        '',
        '## Blocked by',
        '',
        'None.',
        '',
        '## Soft-blocked by',
        '',
        'None.',
        '',
      ].join('\n'),
    )
    writeFileSync(
      join(base, 'tasks.md'),
      '## 1. Update workflow\n\n- [x] 1.1 Edit ci.yml -> done\n',
    )

    const scenario = trivialScenario({ type: 'ci', completed: () => true })
    const m = await scoreMechanical(REPO_ROOT, sandbox, 'cospec', scenario)

    expect(m.changeArchived).toBe(true)
    // The bug: this used to be `null` unconditionally for every archived cell.
    expect(m.cospecValidate).not.toBeNull()
    expect(m.cospecValidate?.errors).toBe(0)
  }, 30_000)

  test('archived change with a validation defect still scores non-null counts (errors surfaced)', async () => {
    const sandbox = makeSandbox()
    const changeDir = 'openspec/changes/archive/2026-09-09-broken-ci'
    const base = join(sandbox, changeDir)
    mkdirSync(base, { recursive: true })
    writeFileSync(
      join(base, '.openspec.yaml'),
      'schema: ci\ncreated: 2026-09-01\nschemaVersion: 2\n',
    )
    // Missing required sections on purpose — proposal/sections should fire.
    writeFileSync(join(base, 'proposal.md'), '## Why\n\nreasons\n')
    writeFileSync(
      join(base, 'blocking-changes.md'),
      [
        '# Dependencies',
        '',
        '## Blocked by',
        '',
        'None.',
        '',
        '## Soft-blocked by',
        '',
        'None.',
        '',
      ].join('\n'),
    )
    writeFileSync(join(base, 'tasks.md'), '- [x] done\n')

    const scenario = trivialScenario({ type: 'ci', completed: () => true })
    const m = await scoreMechanical(REPO_ROOT, sandbox, 'cospec', scenario)

    expect(m.changeArchived).toBe(true)
    expect(m.cospecValidate).not.toBeNull()
    expect(m.cospecValidate?.errors).toBeGreaterThan(0)
  }, 30_000)
})

// ── snapshotChangeArtifacts (filesystem, no spawn) ──────────────────────────

describe('snapshotChangeArtifacts', () => {
  test('undefined when no change was ever produced', async () => {
    const sandbox = makeSandbox()
    expect(await snapshotChangeArtifacts(sandbox)).toBeUndefined()
  })

  test('captures slug, resolved (archived) dir, and every artifact file verbatim', async () => {
    const sandbox = makeSandbox()
    const changeDir = 'openspec/changes/archive/2026-10-10-snap-me'
    const base = join(sandbox, changeDir)
    mkdirSync(base, { recursive: true })
    writeFileSync(join(base, 'proposal.md'), '## Why\n\nreasons\n')
    writeFileSync(join(base, 'tasks.md'), '- [x] done\n')

    const snap = await snapshotChangeArtifacts(sandbox)
    expect(snap).toEqual({
      slug: 'snap-me',
      dir: changeDir,
      archived: true,
      files: {
        'proposal.md': '## Why\n\nreasons\n',
        'tasks.md': '- [x] done\n',
      },
    })
  })

  test('captures an ACTIVE (unarchived) change the same way', async () => {
    const sandbox = makeSandbox()
    mkdirSync(join(sandbox, 'openspec/changes/active-one'), { recursive: true })
    writeFileSync(join(sandbox, 'openspec/changes/active-one/proposal.md'), '## Why\n')

    const snap = await snapshotChangeArtifacts(sandbox)
    expect(snap).toEqual({
      slug: 'active-one',
      dir: 'openspec/changes/active-one',
      archived: false,
      files: { 'proposal.md': '## Why\n' },
    })
  })
})
