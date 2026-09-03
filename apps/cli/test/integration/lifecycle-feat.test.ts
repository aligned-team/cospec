// feat lifecycle end-to-end (DESIGN §8.3): author → validate → planted hard
// blocker → apply exit 2 → archive the blocker → apply exit 0 (auto-checked) →
// complete tasks → archive → verify the date-agnostic move, spec merge, blocker
// fan-out, and "now unblocked" summary.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'
import { authorFeat, blockersHard } from './support.ts'

afterAll(cleanupAll)

let root: string

beforeAll(async () => {
  root = mkTempRepo({ fixture: 'fresh', git: true })
  await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
})

function archivedDirs(): string[] {
  const dir = join(root, 'openspec/changes/archive')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
}

describe('feat lifecycle', () => {
  test('drives new → validate → gate → archive → fan-out', async () => {
    // The provider (blocker) and the consumer that hard-depends on it.
    authorFeat(root, 'provider', 'provider-cap', { tasksDone: true })
    authorFeat(root, 'consumer', 'consumer-cap', { blockers: blockersHard('provider') })

    // Both validate cleanly (an unchecked blocker is an apply gate, not a validate error).
    const vProvider = await cospec(['validate', 'provider', '--strict'], { cwd: root })
    expect(vProvider.exitCode).toBe(0)
    const vConsumer = await cospec(['validate', 'consumer', '--strict'], { cwd: root })
    expect(vConsumer.exitCode).toBe(0)

    // apply on the consumer is blocked (exit 2, hard-blockers) while provider is active.
    const blocked = await cospec(['apply', 'consumer', '--json'], { cwd: root })
    expect(blocked.exitCode).toBe(2)
    expect(blocked.stdout).toContain('provider')

    // Archive the provider — the fan-out should tick the consumer's blocker box
    // and report it as now unblocked.
    const archiveProvider = await cospec(['archive', 'provider'], { cwd: root })
    expect(archiveProvider.exitCode).toBe(0)
    expect(archivedDirs().some((d) => /^\d{4}-\d{2}-\d{2}-provider$/.test(d))).toBe(true)
    expect(archiveProvider.stdout).toMatch(/consumer/)
    const consumerBlockers = readFileSync(
      join(root, 'openspec/changes/consumer/blocking-changes.md'),
      'utf8',
    )
    expect(consumerBlockers).toMatch(/- \[x\] `provider`/)

    // Now apply on the consumer clears (exit 0).
    const cleared = await cospec(['apply', 'consumer', '--json'], { cwd: root })
    expect(cleared.exitCode).toBe(0)

    // Complete the consumer's tasks, then archive it.
    authorFeat(root, 'consumer', 'consumer-cap', {
      blockers: blockersHard('provider'),
      tasksDone: true,
    })
    const archiveConsumer = await cospec(['archive', 'consumer'], { cwd: root })
    expect(archiveConsumer.exitCode).toBe(0)

    // Date-agnostic move.
    expect(archivedDirs().some((d) => /^\d{4}-\d{2}-\d{2}-consumer$/.test(d))).toBe(true)
    expect(existsSync(join(root, 'openspec/changes/consumer'))).toBe(false)

    // Living spec merged + spot-check: the ADDED requirement landed.
    const livingSpec = join(root, 'openspec/specs/consumer-cap/spec.md')
    expect(existsSync(livingSpec)).toBe(true)
    expect(readFileSync(livingSpec, 'utf8')).toContain('### Requirement: consumer-cap behavior')
  })

  // The nested multi-area layout openspec grew in 1.6.0. cospec used to derive
  // the capability from the FIRST path segment, so this change's capability read
  // as `platform` — a capability whose living spec does not exist, which turned
  // both hard archive gates into no-ops and pointed the merge spot-check at the
  // wrong file.
  test('a nested specs/<area>/<capability>/spec.md validates and merges under the full path', async () => {
    authorFeat(root, 'nested', 'platform/session-layout', { tasksDone: true })

    const validated = await cospec(['validate', 'nested', '--strict'], { cwd: root })
    expect(validated.exitCode).toBe(0)

    const archived = await cospec(['archive', 'nested'], { cwd: root })
    expect(archived.exitCode).toBe(0)

    // The living spec lands under the whole capability path, not the area.
    const living = join(root, 'openspec/specs/platform/session-layout/spec.md')
    expect(existsSync(living)).toBe(true)
    expect(readFileSync(living, 'utf8')).toContain(
      '### Requirement: platform/session-layout behavior',
    )
    expect(existsSync(join(root, 'openspec/specs/platform/spec.md'))).toBe(false)

    // And `validate --specs` now finds it: a one-level readdir never did.
    const specs = await cospec(['validate', '--specs', '--json'], { cwd: root })
    expect(JSON.parse(specs.stdout).items.map((i: { id: string }) => i.id)).toContain(
      'platform/session-layout',
    )
  })

  test('a delta at the specs/ root is a cospec ERROR, reported once', async () => {
    authorFeat(root, 'root-delta', 'root-cap')
    writeFiles(root, {
      'openspec/changes/root-delta/specs/spec.md': [
        '## ADDED Requirements',
        '',
        '### Requirement: Stray requirement',
        '',
        'The system SHALL do a thing.',
        '',
        '#### Scenario: It happens',
        '',
        '- **WHEN** asked',
        '- **THEN** it happens',
        '',
      ].join('\n'),
    })

    const res = await cospec(['validate', 'root-delta', '--json'], { cwd: root })
    expect(res.exitCode).toBe(1)
    const issues = JSON.parse(res.stdout).items[0].issues as { rule: string; message: string }[]
    expect(issues.filter((i) => i.rule === 'deltas/spec-at-specs-root')).toHaveLength(1)
    // openspec 1.7.0 blocks the same file with its own wording. cospec's rule
    // wins and the delegated twin is suppressed rather than printed underneath
    // it — one defect, one finding.
    expect(
      issues.filter((i) => i.rule === 'openspec/validate' && /specs\/spec\.md/.test(i.message)),
    ).toHaveLength(0)
  })

  test('skip_specs drops the specs requirement, and contradicting it is an ERROR', async () => {
    authorFeat(root, 'skipper', 'skipped-cap', { tasksDone: true })
    rmSync(join(root, 'openspec/changes/skipper/specs'), { recursive: true, force: true })
    const metadata = 'openspec/changes/skipper/.openspec.yaml'
    writeFiles(root, { [metadata]: 'schema: feat\ncreated: 2026-07-03\nskip_specs: true\n' })

    // A feat with no deltas would normally be flagged for its missing specs
    // artifact; the persisted marker is the durable form of `--skip-specs`.
    const ok = await cospec(['validate', 'skipper', '--strict', '--json'], { cwd: root })
    expect(ok.exitCode).toBe(0)

    // One file under specs/ contradicts the marker outright.
    writeFiles(root, {
      'openspec/changes/skipper/specs/skipped-cap/spec.md': '## ADDED Requirements\n',
    })
    const conflict = await cospec(['validate', 'skipper', '--json'], { cwd: root })
    expect(conflict.exitCode).toBe(1)
    const rules = (JSON.parse(conflict.stdout).items[0].issues as { rule: string }[]).map(
      (i) => i.rule,
    )
    expect(rules).toContain('deltas/skip-specs-conflict')
  })

  // `cospec validate --archived` is pure delegation (openspec >=1.9.0): the
  // wrapped binary walks changes/archive/, which active-change discovery
  // deliberately excludes, and cospec relays its envelope through its own
  // renderer and exit code.
  test('--archived reports an archived change whose tasks are not finished', async () => {
    writeFiles(root, {
      'openspec/changes/archive/2026-07-04-half-done/.openspec.yaml':
        'schema: feat\ncreated: 2026-07-04\n',
      'openspec/changes/archive/2026-07-04-half-done/tasks.md': [
        '## 1. Work',
        '',
        '- [x] 1.1 the finished half',
        '- [ ] 1.2 the unfinished half',
        '',
      ].join('\n'),
    })

    const res = await cospec(['validate', '--archived', '--json'], { cwd: root })
    expect(res.exitCode).toBe(1)
    const report = JSON.parse(res.stdout) as {
      items: { id: string; valid: boolean; issues: { rule: string; message: string }[] }[]
    }
    const item = report.items.find((i) => i.id === '2026-07-04-half-done')
    expect(item?.valid).toBe(false)
    expect(item?.issues.map((i) => i.rule)).toEqual(['openspec/validate'])
    expect(item?.issues[0]!.message).toMatch(/incomplete task/)

    // The archived changes this suite finished earlier pass the same sweep.
    expect(report.items.find((i) => i.id.endsWith('-consumer'))?.valid).toBe(true)
  })
})
