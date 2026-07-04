// feat lifecycle end-to-end (DESIGN §8.3): author → validate → planted hard
// blocker → apply exit 2 → archive the blocker → apply exit 0 (auto-checked) →
// complete tasks → archive → verify the date-agnostic move, spec merge, blocker
// fan-out, and "now unblocked" summary.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo } from '../fixtures/support.ts'
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
})
