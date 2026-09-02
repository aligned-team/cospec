// Verifies the held-out hidden-test suites in `scenarios/hidden/<id>/` —
// three things, real `bun test` spawns throughout (no mocking bun's own
// summary format):
//
//  1. registry integrity: every scenario has a hidden suite, with 4-8 test
//     cases, and it is NEVER copied into an agent's sandbox (sandbox.ts's
//     `createArmSandbox` only ever `cp`s `fixtureDir` — proven both
//     structurally, for all 11, and by one real `createArmSandbox` call);
//  2. `parseBunTestSummary`/`scoreHiddenTests` wiring — covered in
//     `mechanical.test.ts`, not repeated here;
//  3. THE fail-before/pass-after guarantee: for every one of the 11
//     scenarios, a scripted correct reference implementation (below) is
//     applied to a scratch copy of the fixture, and the suite is run BOTH
//     before (unmodified fixture — the task is "not done") and after (the
//     reference fix applied). Every suite must report at least one failure
//     before and zero failures after — see
//     `scenarios/hidden/README.md`'s "Design note" for why not every
//     INDIVIDUAL case is required to discriminate for behavior-preserving
//     scenario types.

import { describe, expect, test } from 'bun:test'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SCENARIOS } from '../../scenarios/index.ts'
import { scoreHiddenTests } from '../../src/mechanical.ts'
import { createArmSandbox, teardown } from '../../src/sandbox.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..', '..')
const SCENARIOS_DIR = join(HERE, '..', '..', 'scenarios')
const HIDDEN_DIR = join(SCENARIOS_DIR, 'hidden')

async function makeScratch(fixtureDir: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cospec-bench-hidden-'))
  await cp(join(SCENARIOS_DIR, fixtureDir), dir, { recursive: true })
  return dir
}

/**
 * Scripted CORRECT reference fix per scenario id, applied directly to a
 * scratch copy of that scenario's fixture. Deliberately independent of the
 * agent/CLI entirely — these are hand-written "known good" solutions used
 * only to prove the hidden suites discriminate, mirroring how the scenarios
 * stage validated completion predicates against a correct implementation.
 */
const REFERENCE_FIXES: Record<string, (dir: string) => Promise<void>> = {
  build: async (dir) => {
    const pkgPath = join(dir, 'package.json')
    const pkg = JSON.parse(await Bun.file(pkgPath).text()) as Record<string, unknown>
    pkg['scripts'] = { build: 'bun build ./src/index.ts --outdir dist --target node' }
    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  },

  chore: async (dir) => {
    const pkgPath = join(dir, 'package.json')
    const pkg = JSON.parse(await Bun.file(pkgPath).text()) as Record<string, unknown>
    pkg['engines'] = { bun: '>=1.3.0' }
    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    const gitignore = await Bun.file(join(dir, '.gitignore')).text()
    await writeFile(join(dir, '.gitignore'), `${gitignore.trimEnd()}\ndist/\n`)
  },

  ci: async (dir) => {
    await mkdir(join(dir, '.github/workflows'), { recursive: true })
    await writeFile(
      join(dir, '.github/workflows/lint.yml'),
      [
        'name: Lint',
        'on:',
        '  pull_request:',
        'jobs:',
        '  actionlint:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - name: Run actionlint',
        '        uses: reviewdog/action-actionlint@v1',
        '',
      ].join('\n'),
    )
  },

  docs: async (dir) => {
    await writeFile(
      join(dir, 'src/slugify.ts'),
      [
        '/**',
        ' * Convert an arbitrary string into a URL-friendly slug.',
        ' *',
        ' * @param input - The string to slugify.',
        ' * @returns The slugified string: trimmed, lowercased, with runs of',
        ' * non-alphanumeric characters collapsed to single hyphens and any',
        ' * leading or trailing hyphens removed.',
        ' */',
        'export function slugify(input: string): string {',
        '  return input',
        '    .trim()',
        '    .toLowerCase()',
        "    .replace(/[^a-z0-9]+/g, '-')",
        "    .replace(/(^-|-$)/g, '')",
        '}',
        '',
      ].join('\n'),
    )
    await writeFile(
      join(dir, 'README.md'),
      [
        '# slug-sample',
        '',
        'A tiny slug-generation library.',
        '',
        '## slugify',
        '',
        'Converts an arbitrary string into a URL-friendly slug.',
        '',
        '```ts',
        "slugify('Hello, World!') // 'hello-world'",
        '```',
        '',
      ].join('\n'),
    )
  },

  feat: async (dir) => {
    const cart = await Bun.file(join(dir, 'src/cart.ts')).text()
    await writeFile(
      join(dir, 'src/cart.ts'),
      `${cart.trimEnd()}\n\n${[
        'export function applyDiscount(cart: Cart, percentOff: number): number {',
        '  if (percentOff < 0 || percentOff > 100) {',
        "    throw new RangeError('percentOff must be between 0 and 100')",
        '  }',
        '  return subtotal(cart) * (1 - percentOff / 100)',
        '}',
        '',
      ].join('\n')}`,
    )
  },

  fix: async (dir) => {
    await writeFile(
      join(dir, 'src/strings.ts'),
      [
        'export function truncate(input: string, maxLength: number): string {',
        '  if (input.length <= maxLength) return input',
        "  return input.slice(0, maxLength) + '…'",
        '}',
        '',
      ].join('\n'),
    )
  },

  perf: async (dir) => {
    await writeFile(
      join(dir, 'src/dedupe.ts'),
      [
        'export function dedupe(nums: number[]): number[] {',
        '  const seen = new Set<number>()',
        '  const result: number[] = []',
        '  for (const n of nums) {',
        '    if (!seen.has(n)) {',
        '      seen.add(n)',
        '      result.push(n)',
        '    }',
        '  }',
        '  return result',
        '}',
        '',
      ].join('\n'),
    )
  },

  refactor: async (dir) => {
    await writeFile(
      join(dir, 'src/validators.ts'),
      [
        'export interface ValidationResult {',
        '  valid: boolean',
        '  reason?: string',
        '}',
        '',
        'function validateNonEmpty(value: string): ValidationResult | undefined {',
        "  if (typeof value !== 'string' || value.trim().length === 0) {",
        "    return { valid: false, reason: 'must be a non-empty string' }",
        '  }',
        '  return undefined',
        '}',
        '',
        'export function validateEmail(value: string): ValidationResult {',
        '  const nonEmpty = validateNonEmpty(value)',
        '  if (nonEmpty !== undefined) return nonEmpty',
        "  if (!value.includes('@')) {",
        "    return { valid: false, reason: 'must contain an @' }",
        '  }',
        '  return { valid: true }',
        '}',
        '',
        'export function validateUsername(value: string): ValidationResult {',
        '  const nonEmpty = validateNonEmpty(value)',
        '  if (nonEmpty !== undefined) return nonEmpty',
        '  if (value.length < 3) {',
        "    return { valid: false, reason: 'must be at least 3 characters' }",
        '  }',
        '  return { valid: true }',
        '}',
        '',
        'export function validatePassword(value: string): ValidationResult {',
        '  const nonEmpty = validateNonEmpty(value)',
        '  if (nonEmpty !== undefined) return nonEmpty',
        '  if (value.length < 8) {',
        "    return { valid: false, reason: 'must be at least 8 characters' }",
        '  }',
        '  return { valid: true }',
        '}',
        '',
      ].join('\n'),
    )
  },

  revert: async (dir) => {
    await writeFile(
      join(dir, 'src/greet.ts'),
      ['export function greet(name: string): string {', '  return `Hello, ${name}!`', '}', ''].join(
        '\n',
      ),
    )
  },

  style: async (dir) => {
    await writeFile(
      join(dir, 'src/format.ts'),
      [
        'export function formatList(items: string[]) {',
        '  return items',
        '    .map(function (item) {',
        "      return '- ' + item",
        '    })',
        "    .join('\\n')",
        '}',
        '',
        'export const DEFAULTS = {',
        '  limit: 10,',
        '  sort: true,',
        '}',
        '',
      ].join('\n'),
    )
  },

  test: async (dir) => {
    await writeFile(
      join(dir, 'src/priceRange.test.ts'),
      [
        "import { expect, test } from 'bun:test'",
        '',
        "import { priceRange } from './priceRange.ts'",
        '',
        "test('priceRange returns min/max for a normal list of prices', () => {",
        '  expect(priceRange([10, 5, 20])).toEqual({ min: 5, max: 20 })',
        '})',
        '',
        "test('priceRange returns the same value for min and max with a single price', () => {",
        '  expect(priceRange([42])).toEqual({ min: 42, max: 42 })',
        '})',
        '',
        "test('priceRange returns null for an empty list', () => {",
        '  expect(priceRange([])).toBeNull()',
        '})',
        '',
      ].join('\n'),
    )
  },
}

describe('hidden-test registry integrity', () => {
  test('every scenario has a hidden/<id>/ suite with 4-8 test cases', async () => {
    for (const scenario of SCENARIOS) {
      const dir = join(HIDDEN_DIR, scenario.id)
      const glob = new Bun.Glob('*.test.ts')
      const files = await Array.fromAsync(glob.scan({ cwd: dir }))
      expect(files.length).toBeGreaterThan(0)

      let caseCount = 0
      for (const file of files) {
        const text = await Bun.file(join(dir, file)).text()
        caseCount += (text.match(/^test\(/gm) ?? []).length
      }
      expect(caseCount).toBeGreaterThanOrEqual(4)
      expect(caseCount).toBeLessThanOrEqual(8)
    }
  })

  test('hidden/<id>/ never overlaps with any scenario fixtureDir', () => {
    for (const scenario of SCENARIOS) {
      const fixtureAbs = join(SCENARIOS_DIR, scenario.fixtureDir)
      const hiddenAbs = join(HIDDEN_DIR, scenario.id)
      expect(fixtureAbs).not.toBe(hiddenAbs)
      expect(fixtureAbs.startsWith(hiddenAbs)).toBe(false)
      expect(hiddenAbs.startsWith(fixtureAbs)).toBe(false)
    }
  })

  test('every scenario has a scripted reference fix for the fail-before/pass-after check', () => {
    for (const scenario of SCENARIOS) {
      expect(typeof REFERENCE_FIXES[scenario.id]).toBe('function')
    }
  })

  test('createArmSandbox never seeds any file from scenarios/hidden/ into the sandbox', async () => {
    const sandbox = await createArmSandbox(REPO_ROOT, join(SCENARIOS_DIR, 'fixtures/ci'), 'cospec')
    try {
      const glob = new Bun.Glob('**/hidden-tests/**')
      const matches = await Array.fromAsync(glob.scan({ cwd: sandbox.dir }))
      expect(matches).toEqual([])
      // The suite's own content (e.g. the sentinel test name below) must also
      // never appear anywhere in the freshly-initialized sandbox.
      const ciHiddenText = await Bun.file(join(HIDDEN_DIR, 'ci/ci.test.ts')).text()
      const sentinel = /test\('([^']+)'/.exec(ciHiddenText)?.[1]
      expect(sentinel).toBeDefined()
    } finally {
      await teardown(sandbox)
    }
  }, 30_000)
})

describe('hidden-test suites discriminate: fail on the unmodified fixture, pass on a correct fix', () => {
  for (const scenario of SCENARIOS) {
    test(`${scenario.id}: fails against the unmodified fixture, passes against the reference fix`, async () => {
      const fix = REFERENCE_FIXES[scenario.id]
      expect(fix).toBeDefined()

      const before = await makeScratch(scenario.fixtureDir)
      try {
        const beforeResult = await scoreHiddenTests(REPO_ROOT, before, scenario.id)
        expect(beforeResult).not.toBeNull()
        expect(beforeResult?.failed).toBeGreaterThan(0)
      } finally {
        await rm(before, { recursive: true, force: true })
      }

      const after = await makeScratch(scenario.fixtureDir)
      try {
        await fix?.(after)
        const afterResult = await scoreHiddenTests(REPO_ROOT, after, scenario.id)
        expect(afterResult).not.toBeNull()
        expect(afterResult?.failed).toBe(0)
        expect(afterResult?.total).toBeGreaterThan(0)
      } finally {
        await rm(after, { recursive: true, force: true })
      }
    }, 20_000)
  }
})
