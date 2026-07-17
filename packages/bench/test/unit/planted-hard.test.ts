// Verifies the planted-bug detectors for the opt-in `-hard` scenario
// variants (`scenarios/planted/<id>-hard/`) — the same registry-integrity and
// fail-before/pass-after checks `planted.test.ts` runs for the 11 core
// scenarios, kept in a separate file so that file stays a pure statement
// about the 5 core heavy types.

import { describe, expect, test } from 'bun:test'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { HARD_SCENARIOS } from '../../scenarios/index.ts'
import { scorePlantedBug } from '../../src/mechanical.ts'
import { createArmSandbox, teardown } from '../../src/sandbox.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..', '..')
const SCENARIOS_DIR = join(HERE, '..', '..', 'scenarios')
const PLANTED_DIR = join(SCENARIOS_DIR, 'planted')

async function makeScratch(fixtureDir: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cospec-bench-planted-hard-'))
  await cp(join(SCENARIOS_DIR, fixtureDir), dir, { recursive: true })
  return dir
}

/**
 * Scripted TARGETED fix per hard-variant plant — patches ONLY the planted
 * defect, independent of `hidden-hard.test.ts`'s `REFERENCE_FIXES_HARD` (which
 * solves the scenario's actual task, and for several scenarios fully rewrites
 * the same file the plant lives in — fine there since none of those checks
 * reference the plant).
 */
const PLANTED_FIXES_HARD: Record<string, (dir: string) => Promise<void>> = {
  'feat-hard': async (dir) => {
    const path = join(dir, 'src/inventory.ts')
    const text = await Bun.file(path).text()
    await writeFile(
      path,
      text.replace('Math.min(capacity + 1, current + qty)', 'Math.min(capacity, current + qty)'),
    )
  },

  'fix-hard': async (dir) => {
    const path = join(dir, 'src/bucket.ts')
    const text = await Bun.file(path).text()
    await writeFile(
      path,
      text.replace(
        'return state.tokens > config.capacity',
        'return state.tokens >= config.capacity',
      ),
    )
  },

  'perf-hard': async (dir) => {
    const path = join(dir, 'src/groupBy.ts')
    const text = await Bun.file(path).text()
    await writeFile(path, text.replace('return seen.size + 1', 'return seen.size'))
  },

  'refactor-hard': async (dir) => {
    const path = join(dir, 'src/age.ts')
    const text = await Bun.file(path).text()
    await writeFile(path, text.replace('age < 0 || age >= 120', 'age < 0 || age > 120'))
  },

  'revert-hard': async (dir) => {
    const path = join(dir, 'src/format.ts')
    const text = await Bun.file(path).text()
    await writeFile(
      path,
      text.replace(
        "return `${first[0] ?? ''}${last[0] ?? ''}`",
        "return `${first[0] ?? ''}.${last[0] ?? ''}.`",
      ),
    )
  },
}

describe('hard-variant planted-bug registry integrity', () => {
  test('every hard variant declares a plant (mirrors HARD_SCENARIOS)', () => {
    for (const scenario of HARD_SCENARIOS) expect(scenario.plantedBug).toBeDefined()
  })

  test('every hard variant has a matching scenarios/planted/<id>/ detector', async () => {
    for (const scenario of HARD_SCENARIOS) {
      const detectorPath = join(PLANTED_DIR, scenario.id, scenario.plantedBug?.detector ?? '')
      expect(await Bun.file(detectorPath).exists()).toBe(true)
    }
  })

  test('every hard variant has a scripted targeted fix for the fail-before/pass-after check', () => {
    for (const scenario of HARD_SCENARIOS) {
      expect(typeof PLANTED_FIXES_HARD[scenario.id]).toBe('function')
    }
  })

  test('planted/<id>/ never overlaps with any hard variant fixtureDir', () => {
    for (const scenario of HARD_SCENARIOS) {
      const fixtureAbs = join(SCENARIOS_DIR, scenario.fixtureDir)
      const plantedAbs = join(PLANTED_DIR, scenario.id)
      expect(fixtureAbs).not.toBe(plantedAbs)
      expect(fixtureAbs.startsWith(plantedAbs)).toBe(false)
      expect(plantedAbs.startsWith(fixtureAbs)).toBe(false)
    }
  })

  test('createArmSandbox never seeds any file from scenarios/planted/ into a hard-variant sandbox', async () => {
    const scenario = HARD_SCENARIOS[0]!
    const sandbox = await createArmSandbox(
      REPO_ROOT,
      join(SCENARIOS_DIR, scenario.fixtureDir),
      'cospec',
    )
    try {
      const glob = new Bun.Glob('**/planted-check/**')
      const matches = await Array.fromAsync(glob.scan({ cwd: sandbox.dir }))
      expect(matches).toEqual([])
    } finally {
      await teardown(sandbox)
    }
  }, 30_000)
})

describe('hard-variant planted-bug detectors discriminate: fail as seeded, pass once fixed', () => {
  for (const scenario of HARD_SCENARIOS) {
    test(`${scenario.id}: fails against the seeded fixture, passes against the targeted fix`, async () => {
      const fix = PLANTED_FIXES_HARD[scenario.id]
      expect(fix).toBeDefined()

      const before = await makeScratch(scenario.fixtureDir)
      try {
        const beforeResult = await scorePlantedBug(REPO_ROOT, before, scenario)
        expect(beforeResult).toBe(false)
      } finally {
        await rm(before, { recursive: true, force: true })
      }

      const after = await makeScratch(scenario.fixtureDir)
      try {
        await fix?.(after)
        const afterResult = await scorePlantedBug(REPO_ROOT, after, scenario)
        expect(afterResult).toBe(true)
      } finally {
        await rm(after, { recursive: true, force: true })
      }
    }, 20_000)
  }
})
