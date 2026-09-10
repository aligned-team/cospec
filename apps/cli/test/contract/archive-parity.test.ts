// Archive-precondition parity (DESIGN §8.2). For every fixture we run BOTH the
// real `openspec archive` (mutating, observed via directory move) and cospec's
// read-only `validate` (which runs the archive-precondition family). The suite
// never trusts the AUTHOR's prediction — it derives openspec's real outcome and
// asserts cospec agrees. Policy: cospec may be strictly more conservative, but a
// FALSE PASS (cospec valid while openspec aborts) is a release blocker (§4.3).
//
// Re-probed against the 1.11.0 pin (2026-09-01). Two things moved:
//   - An aborted archive now exits 1 (it exited 0 through 1.6.x). This suite
//     never read the exit code — it reads the directory move and the abort
//     banner — so the outcomes are unchanged.
//   - 1.7.0 made an ADDED block identical to the living requirement a no-op
//     (the early-sync pattern) instead of an abort. `added-already-exists` now
//     carries a DIFFERING body so it still pins the genuine collision, and the
//     no-op case is its own fixture — `archive/added-exists` compares block
//     bodies with openspec's own `normalizeBlockRaw`, so both sides now archive
//     it and no conservatism is recorded there any more.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, openspec } from '../fixtures/support.ts'
import { PARITY_FIXTURES } from './fixtures.ts'

afterAll(cleanupAll)

interface CospecVerdict {
  invalid: boolean
  rules: string[]
}

async function cospecVerdict(root: string, name: string): Promise<CospecVerdict> {
  const res = await cospec(['validate', name, '--strict', '--json'], { cwd: root })
  let rules: string[] = []
  try {
    rules = Object.keys(
      (JSON.parse(res.stdout) as { summary: { byRule: Record<string, number> } }).summary.byRule,
    )
  } catch {
    /* non-JSON body → no rule ids; invalid is still driven by the exit code */
  }
  return { invalid: res.exitCode !== 0, rules }
}

async function openspecArchives(root: string, name: string): Promise<boolean> {
  const res = await openspec(['archive', name, '-y'], root)
  const moved = !existsSync(join(root, 'openspec/changes', name))
  const aborted = /\bAborted\b/.test(res.stdout) || /\bcancelled\b/i.test(res.stdout)
  return moved && !aborted
}

describe('archive-precondition parity with the pinned openspec binary (re-probed at 1.11.0)', () => {
  for (const fixture of PARITY_FIXTURES) {
    test(fixture.key, async () => {
      const readRepo = mkTempRepo({ git: true })
      const { name } = fixture.build(readRepo)
      const verdict = await cospecVerdict(readRepo, name)

      const archiveRepo = mkTempRepo({ git: true })
      fixture.build(archiveRepo)
      const archived = await openspecArchives(archiveRepo, name)

      // The hard contract: openspec aborting ⟹ cospec MUST flag it (no false PASS).
      if (!archived) {
        expect(verdict.invalid).toBe(true)
        if (fixture.rule !== undefined) expect(verdict.rules).toContain(fixture.rule)
      } else if (fixture.conservative !== undefined) {
        // A recorded, deliberate over-strictness: cospec rejects what openspec
        // accepts, and it must be THIS rule doing it, not incidental drift.
        expect(verdict.invalid).toBe(true)
        expect(verdict.rules).toContain(fixture.conservative)
      } else {
        // openspec accepted it → cospec must not spuriously reject a clean change.
        expect(verdict.invalid).toBe(false)
      }

      // The fixture's own prediction must also match reality (drift canary).
      expect(archived).toBe(!fixture.expectAbort)
    })
  }
})
