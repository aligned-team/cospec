import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
} from '../../src/mechanical.ts'

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

  test('archived change: skips spawn-backed checks and reports proportionality from files present', async () => {
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
    // Archived short-circuits both spawn-backed checks.
    expect(m.armNativeValidatePass).toBe(true)
    expect(m.cospecValidate).toBeNull()
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
