// Re-takes every committed `test/fixtures/upstream-init/*.json` capture against the
// pinned binary and compares it to the committed file, field for field after parsing,
// so a pin bump fails until the fixtures are re-taken (see `support/upstream-init-capture.ts`).
// Write mode regenerates them: COSPEC_FIXTURE_WRITE=1 bun test <this file>, then
// `mise run format:fix`.

import { describe, expect, test } from 'bun:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { openspecPackageDir } from '../../src/core/openspec.ts'
import {
  captureCaseFor,
  captureInit,
  comparable,
  COMBINATIONS,
  committedFixtureNames,
  FIXTURE_DIR,
  readFixture,
} from './support/upstream-init-capture.ts'

const DIST = join(openspecPackageDir(), 'dist')
const { AI_TOOLS, TOOL_ID_ALIASES } = (await import(join(DIST, 'core/config.js'))) as {
  AI_TOOLS: { value: string }[]
  TOOL_ID_ALIASES: Record<string, string>
}

const WRITE = process.env.COSPEC_FIXTURE_WRITE === '1'

describe('upstream-init fixtures', () => {
  test('one fixture per pinned AI_TOOLS id, per tool alias, and per combination', () => {
    const expected = [
      ...AI_TOOLS.map((t) => t.value),
      ...Object.keys(TOOL_ID_ALIASES),
      ...COMBINATIONS.map((c) => c.name),
    ].toSorted()
    expect(committedFixtureNames()).toEqual(expected)
  })

  for (const name of committedFixtureNames()) {
    test(`${name}: a fresh capture equals the committed fixture`, async () => {
      const fresh = await captureInit(captureCaseFor(name).tools)
      if (WRITE) {
        writeFileSync(join(FIXTURE_DIR, `${name}.json`), `${JSON.stringify(fresh, null, 2)}\n`)
        return
      }
      expect(fresh.exitCode).toBe(0)
      expect(comparable(fresh)).toEqual(comparable(readFixture(name)))
    }, 120_000)
  }
})
