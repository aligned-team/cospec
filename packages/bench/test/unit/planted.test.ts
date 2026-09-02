// Verifies the planted-bug detectors in `scenarios/planted/<id>/` — real
// `bun test` spawns throughout (no mocking bun's own summary format):
//
//  1. registry integrity: every scenario with a `plantedBug` declared has a
//     matching `scenarios/planted/<id>/` detector, and that detector is NEVER
//     copied into an agent's sandbox (same never-seeded discipline as
//     `scenarios/hidden/`, proven structurally for all of them);
//  2. `scorePlantedBug` wiring for the null/no-plant path is covered in
//     `mechanical.test.ts`, not repeated here;
//  3. THE fail-before/pass-after guarantee: for every scenario with a plant, a
//     scripted TARGETED fix (below — independent of the agent/CLI, and
//     independent of the fixture's own actual task) is applied to a scratch
//     copy of that scenario's fixture, and the detector is run BOTH before
//     (fixture as seeded — the plant is present) and after (the targeted fix
//     applied). Every detector must report at least one failure before and
//     zero failures after.

import { describe, expect, test } from 'bun:test'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SCENARIOS } from '../../scenarios/index.ts'
import { scorePlantedBug } from '../../src/mechanical.ts'
import { createArmSandbox, teardown } from '../../src/sandbox.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..', '..')
const SCENARIOS_DIR = join(HERE, '..', '..', 'scenarios')
const PLANTED_DIR = join(SCENARIOS_DIR, 'planted')

const PLANTED_SCENARIOS = SCENARIOS.filter((s) => s.plantedBug !== undefined)

async function makeScratch(fixtureDir: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cospec-bench-planted-'))
  await cp(join(SCENARIOS_DIR, fixtureDir), dir, { recursive: true })
  return dir
}

/**
 * Scripted TARGETED fix per planted scenario — patches ONLY the planted
 * defect, in place, on a scratch copy of that scenario's fixture. Distinct
 * from `hidden.test.ts`'s `REFERENCE_FIXES`, which solve the scenario's ACTUAL
 * task (and, for several scenarios, fully rewrite the same file — dropping
 * whatever plant was added — which is fine there since none of those checks
 * reference the plant at all).
 */
const PLANTED_FIXES: Record<string, (dir: string) => Promise<void>> = {
  feat: async (dir) => {
    const path = join(dir, 'src/cart.ts')
    const text = await Bun.file(path).text()
    await writeFile(
      path,
      text.replace(
        'export function removeItem(cart: Cart, name: string): Cart {\n' +
          '  const index = cart.findIndex((item) => item.name === name)\n' +
          '  if (index === -1) return cart\n' +
          '  return [...cart.slice(0, index), ...cart.slice(index + 1)]\n' +
          '}',
        'export function removeItem(cart: Cart, name: string): Cart {\n' +
          '  return cart.filter((item) => item.name !== name)\n' +
          '}',
      ),
    )
  },

  fix: async (dir) => {
    const path = join(dir, 'src/strings.ts')
    const text = await Bun.file(path).text()
    await writeFile(path, text.replace('input.slice(2)', 'input.slice(1)'))
  },

  perf: async (dir) => {
    const path = join(dir, 'src/dedupe.ts')
    const text = await Bun.file(path).text()
    await writeFile(path, text.replace('return seen.size + 1', 'return seen.size'))
  },

  refactor: async (dir) => {
    const path = join(dir, 'src/validators.ts')
    const text = await Bun.file(path).text()
    await writeFile(path, text.replace('age < 0 || age >= 120', 'age < 0 || age > 120'))
  },

  revert: async (dir) => {
    const path = join(dir, 'src/greet.ts')
    const text = await Bun.file(path).text()
    await writeFile(path, text.replace('name.length > 1', 'name.length > 0'))
  },
}

describe('planted-bug registry integrity', () => {
  test('the 5 heavy types (feat, fix, perf, refactor, revert) all declare a plant', () => {
    const heavyIds = new Set(PLANTED_SCENARIOS.map((s) => s.id))
    for (const id of ['feat', 'fix', 'perf', 'refactor', 'revert']) {
      expect(heavyIds.has(id)).toBe(true)
    }
  })

  test('every scenario with a plant has a matching scenarios/planted/<id>/ detector', async () => {
    for (const scenario of PLANTED_SCENARIOS) {
      const detectorPath = join(PLANTED_DIR, scenario.id, scenario.plantedBug?.detector ?? '')
      expect(await Bun.file(detectorPath).exists()).toBe(true)
    }
  })

  test('every scenario has a scripted targeted fix for the fail-before/pass-after check', () => {
    for (const scenario of PLANTED_SCENARIOS) {
      expect(typeof PLANTED_FIXES[scenario.id]).toBe('function')
    }
  })

  test('planted/<id>/ never overlaps with any scenario fixtureDir', () => {
    for (const scenario of PLANTED_SCENARIOS) {
      const fixtureAbs = join(SCENARIOS_DIR, scenario.fixtureDir)
      const plantedAbs = join(PLANTED_DIR, scenario.id)
      expect(fixtureAbs).not.toBe(plantedAbs)
      expect(fixtureAbs.startsWith(plantedAbs)).toBe(false)
      expect(plantedAbs.startsWith(fixtureAbs)).toBe(false)
    }
  })

  test('createArmSandbox never seeds any file from scenarios/planted/ into the sandbox', async () => {
    const sandbox = await createArmSandbox(REPO_ROOT, join(SCENARIOS_DIR, 'fixtures/fix'), 'cospec')
    try {
      const glob = new Bun.Glob('**/planted-check/**')
      const matches = await Array.fromAsync(glob.scan({ cwd: sandbox.dir }))
      expect(matches).toEqual([])
    } finally {
      await teardown(sandbox)
    }
  }, 30_000)
})

describe('planted-bug detectors discriminate: fail as seeded, pass once fixed', () => {
  for (const scenario of PLANTED_SCENARIOS) {
    test(`${scenario.id}: fails against the seeded fixture, passes against the targeted fix`, async () => {
      const fix = PLANTED_FIXES[scenario.id]
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
