// archive-and-sync-parity: `cospec archive` beside the pinned binary's own
// archive — `--no-validate`, the JSON documents, the scenario-preservation
// gate on the verbatim view, an unreadable archive directory, namespace
// folders, REMOVED on a new capability, the Specs line and relayed remedies.
// Every expectation about upstream is read from the binary at test time.

import { afterAll, describe, expect, test } from 'bun:test'

import { cleanupAll, cospec, mkTempRepo, openspec } from '../fixtures/support.ts'
import { R7_FIXTURES, restoreArchiveMode, type R7Fixture } from './fixtures.ts'

afterAll(cleanupAll)

/** Build `fixture` in a fresh repo, run `fn`, and leave the tree removable. */
async function withFixture<T>(
  fixture: R7Fixture,
  fn: (root: string, name: string) => Promise<T>,
): Promise<T> {
  const root = mkTempRepo({ git: true })
  const name = fixture.build(root)
  try {
    return await fn(root, name)
  } finally {
    if (fixture.key === 'archive-unreadable') restoreArchiveMode(root)
  }
}

/**
 * Fixtures `cospec validate --strict` refuses on this tree although the change
 * ships them as valid: `archive/new-spec-non-added` still fires on REMOVED
 * (verification 6.1, 6.2).
 */
const COSPEC_REFUSES_TODAY = new Set(['new-added-removed', 'new-removed-only-marked'])

describe('fixtures: each builder reads as both validators are told it does', () => {
  for (const fixture of R7_FIXTURES) {
    test(`${fixture.key}: openspec validate --strict`, () =>
      withFixture(fixture, async (root, name) => {
        const res = await openspec(['validate', name, '--strict'], root)
        expect({ valid: res.exitCode === 0, out: res.stdout + res.stderr }).toEqual({
          valid: fixture.binaryValid,
          out: expect.any(String),
        })
      }))
    const own = COSPEC_REFUSES_TODAY.has(fixture.key) ? test.failing : test
    own(`${fixture.key}: cospec validate --strict`, () =>
      withFixture(fixture, async (root, name) => {
        const res = await cospec(['validate', name, '--strict'], { cwd: root })
        expect({ valid: res.exitCode === 0, out: res.stdout + res.stderr }).toEqual({
          valid: fixture.cospecValid,
          out: expect.any(String),
        })
      }),
    )
  }
})
