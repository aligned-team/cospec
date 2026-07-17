// Verifies the held-out hidden-test suites for the opt-in `-hard` scenario
// variants (`scenarios/hidden/<id>-hard/` — see `scenarios/hidden/README.md`
// for the copy/import convention) — the same three things `hidden.test.ts`
// verifies for the 11 core scenarios, but with the WIDER 8-12 case bound the
// hard variants are specified to use (vs. 4-8 for the core scenarios), kept
// in a separate file so that file's tighter bound stays a pure statement
// about the core-11 registry.

import { describe, expect, test } from 'bun:test'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { HARD_SCENARIOS } from '../../scenarios/index.ts'
import { scoreHiddenTests } from '../../src/mechanical.ts'
import { createArmSandbox, teardown } from '../../src/sandbox.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..', '..')
const SCENARIOS_DIR = join(HERE, '..', '..', 'scenarios')
const HIDDEN_DIR = join(SCENARIOS_DIR, 'hidden')

async function makeScratch(fixtureDir: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cospec-bench-hidden-hard-'))
  await cp(join(SCENARIOS_DIR, fixtureDir), dir, { recursive: true })
  return dir
}

async function patch(
  dir: string,
  rel: string,
  replacements: readonly (readonly [string, string])[],
): Promise<void> {
  const path = join(dir, rel)
  let text = await Bun.file(path).text()
  for (const [from, to] of replacements) {
    if (!text.includes(from)) throw new Error(`reference fix: "${from}" not found in ${rel}`)
    text = text.replace(from, to)
  }
  await writeFile(path, text)
}

/**
 * Scripted CORRECT reference fix per hard scenario id — independent of the
 * agent/CLI, mirroring `hidden.test.ts`'s `REFERENCE_FIXES`. Each one solves
 * the scenario's actual multi-file task; hand-verified during authoring (see
 * this change's tasks.md) against both the visible suite and these hidden
 * suites before being encoded here.
 */
const REFERENCE_FIXES_HARD: Record<string, (dir: string) => Promise<void>> = {
  'feat-hard': async (dir) => {
    await patch(dir, 'src/types.ts', [
      [
        "export interface CheckoutOptions {\n  discountCode?: string\n  region?: 'US' | 'EU'\n}",
        "export interface CheckoutOptions {\n  discountCode?: string\n  region?: 'US' | 'EU'\n  availableCreditCents?: number\n}",
      ],
      [
        'export interface Order {\n  items: CartItem[]\n  subtotalCents: number\n  discountCents: number\n  taxCents: number\n  totalCents: number\n}',
        'export interface Order {\n  items: CartItem[]\n  subtotalCents: number\n  discountCents: number\n  creditApplied: number\n  taxCents: number\n  totalCents: number\n}',
      ],
    ])
    const pricingPath = join(dir, 'src/pricing.ts')
    const pricing = await Bun.file(pricingPath).text()
    await writeFile(
      pricingPath,
      `${pricing.trimEnd()}\n\n${[
        'export function computeCreditApplied(',
        '  subtotalAfterDiscount: number,',
        '  availableCreditCents: number,',
        '): number {',
        '  const available = Math.max(0, availableCreditCents)',
        '  return Math.min(Math.max(0, subtotalAfterDiscount), available)',
        '}',
        '',
      ].join('\n')}`,
    )
    await patch(dir, 'src/orders.ts', [
      [
        "import { applyDiscountCode, computeTax, subtotalCents } from './pricing.ts'",
        "import { applyDiscountCode, computeCreditApplied, computeTax, subtotalCents } from './pricing.ts'",
      ],
      [
        [
          '  const subtotal = subtotalCents(cart, catalog)',
          '  const discount = applyDiscountCode(subtotal, options.discountCode)',
          '  const taxable = subtotal - discount',
          '  const tax = computeTax(taxable, options.region)',
          '',
          '  return {',
          '    items: cart,',
          '    subtotalCents: subtotal,',
          '    discountCents: discount,',
          '    taxCents: tax,',
          '    totalCents: taxable + tax,',
          '  }',
        ].join('\n'),
        [
          '  const subtotal = subtotalCents(cart, catalog)',
          '  const discount = applyDiscountCode(subtotal, options.discountCode)',
          '  const taxable = subtotal - discount',
          '  const creditApplied = computeCreditApplied(taxable, options.availableCreditCents ?? 0)',
          '  const taxBase = taxable - creditApplied',
          '  const tax = computeTax(taxBase, options.region)',
          '',
          '  return {',
          '    items: cart,',
          '    subtotalCents: subtotal,',
          '    discountCents: discount,',
          '    creditApplied,',
          '    taxCents: tax,',
          '    totalCents: taxBase + tax,',
          '  }',
        ].join('\n'),
      ],
    ])
  },

  'fix-hard': async (dir) => {
    await patch(dir, 'src/bucket.ts', [
      [
        'const elapsedSeconds = Math.floor(elapsedMs / 1000)',
        'const elapsedSeconds = elapsedMs / 1000',
      ],
    ])
    await patch(dir, 'src/store.ts', [
      [
        '{ tokens: this.config.capacity - 1, lastRefillMs: nowMs }',
        '{ tokens: this.config.capacity, lastRefillMs: nowMs }',
      ],
    ])
    await patch(dir, 'src/limiter.ts', [
      [
        '    const result = tryConsume(this.config, state, cost, nowMs)\n    return result.allowed',
        '    const result = tryConsume(this.config, state, cost, nowMs)\n    this.store.set(key, result.state)\n    return result.allowed',
      ],
    ])
  },

  'perf-hard': async (dir) => {
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
    await writeFile(
      join(dir, 'src/groupBy.ts'),
      [
        'export function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {',
        '  const groups = new Map<string, T[]>()',
        '  for (const item of items) {',
        '    const key = keyFn(item)',
        '    const existing = groups.get(key)',
        '    if (existing !== undefined) existing.push(item)',
        '    else groups.set(key, [item])',
        '  }',
        '  return groups',
        '}',
        '',
        'export function countGroups<T>(items: T[], keyFn: (item: T) => string): number {',
        '  const seen = new Set<string>()',
        '  for (const item of items) seen.add(keyFn(item))',
        '  return seen.size + 1',
        '}',
        '',
      ].join('\n'),
    )
    await writeFile(
      join(dir, 'src/search.ts'),
      [
        'export interface Doc {',
        '  id: string',
        '  text: string',
        '}',
        '',
        'function tokenize(text: string): string[] {',
        '  return text',
        '    .toLowerCase()',
        '    .split(/\\W+/)',
        '    .filter((w) => w.length > 0)',
        '}',
        '',
        'export function searchBatch(docs: Doc[], queries: string[]): Record<string, string[]> {',
        '  const index = new Map<string, string[]>()',
        '  for (const doc of docs) {',
        '    const seenWords = new Set<string>()',
        '    for (const w of tokenize(doc.text)) {',
        '      if (seenWords.has(w)) continue',
        '      seenWords.add(w)',
        '      const list = index.get(w)',
        '      if (list !== undefined) list.push(doc.id)',
        '      else index.set(w, [doc.id])',
        '    }',
        '  }',
        '  const result: Record<string, string[]> = {}',
        '  for (const query of queries) result[query] = index.get(query.toLowerCase()) ?? []',
        '  return result',
        '}',
        '',
      ].join('\n'),
    )
  },

  'refactor-hard': async (dir) => {
    await writeFile(
      join(dir, 'src/shared.ts'),
      [
        "import type { ValidationResult } from './types.ts'",
        '',
        'export function validateNonEmpty(value: string): ValidationResult | undefined {',
        "  if (typeof value !== 'string' || value.trim().length === 0) {",
        "    return { valid: false, reason: 'must be a non-empty string' }",
        '  }',
        '  return undefined',
        '}',
        '',
      ].join('\n'),
    )
    await writeFile(
      join(dir, 'src/email.ts'),
      [
        "import { validateNonEmpty } from './shared.ts'",
        "import type { ValidationResult } from './types.ts'",
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
      ].join('\n'),
    )
    await writeFile(
      join(dir, 'src/username.ts'),
      [
        "import { validateNonEmpty } from './shared.ts'",
        "import type { ValidationResult } from './types.ts'",
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
      ].join('\n'),
    )
    await writeFile(
      join(dir, 'src/password.ts'),
      [
        "import { validateNonEmpty } from './shared.ts'",
        "import type { ValidationResult } from './types.ts'",
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

  'revert-hard': async (dir) => {
    await writeFile(
      join(dir, 'src/greet.ts'),
      ['export function greet(name: string): string {', '  return `Hello, ${name}!`', '}', ''].join(
        '\n',
      ),
    )
    await writeFile(
      join(dir, 'src/format.ts'),
      [
        'export function formatDisplayName(first: string, last: string): string {',
        '  return `${first} ${last}`',
        '}',
        '',
        "/** Two-letter initials, e.g. `initials('Jane', 'Doe')` -> `'J.D.'`. */",
        'export function initials(first: string, last: string): string {',
        "  return `${first[0] ?? ''}${last[0] ?? ''}`",
        '}',
        '',
      ].join('\n'),
    )
    await writeFile(
      join(dir, 'src/currency.ts'),
      [
        'export function formatPrice(cents: number): string {',
        '  const dollars = (cents / 100).toFixed(2)',
        '  return `$${dollars}`',
        '}',
        '',
      ].join('\n'),
    )
  },
}

describe('hard-variant hidden-test registry integrity', () => {
  test('every hard variant has a hidden/<id>/ suite with 8-12 test cases', async () => {
    for (const scenario of HARD_SCENARIOS) {
      const dir = join(HIDDEN_DIR, scenario.id)
      const glob = new Bun.Glob('*.test.ts')
      const files = await Array.fromAsync(glob.scan({ cwd: dir }))
      expect(files.length).toBeGreaterThan(0)

      let caseCount = 0
      for (const file of files) {
        const text = await Bun.file(join(dir, file)).text()
        caseCount += (text.match(/^test\(/gm) ?? []).length
      }
      expect(caseCount).toBeGreaterThanOrEqual(8)
      expect(caseCount).toBeLessThanOrEqual(12)
    }
  })

  test('hidden/<id>/ never overlaps with any hard variant fixtureDir', () => {
    for (const scenario of HARD_SCENARIOS) {
      const fixtureAbs = join(SCENARIOS_DIR, scenario.fixtureDir)
      const hiddenAbs = join(HIDDEN_DIR, scenario.id)
      expect(fixtureAbs).not.toBe(hiddenAbs)
      expect(fixtureAbs.startsWith(hiddenAbs)).toBe(false)
      expect(hiddenAbs.startsWith(fixtureAbs)).toBe(false)
    }
  })

  test('every hard variant has a scripted reference fix for the fail-before/pass-after check', () => {
    for (const scenario of HARD_SCENARIOS) {
      expect(typeof REFERENCE_FIXES_HARD[scenario.id]).toBe('function')
    }
  })

  test('createArmSandbox never seeds any file from scenarios/hidden/ into a hard-variant sandbox', async () => {
    const scenario = HARD_SCENARIOS[0]!
    const sandbox = await createArmSandbox(
      REPO_ROOT,
      join(SCENARIOS_DIR, scenario.fixtureDir),
      'cospec',
    )
    try {
      const glob = new Bun.Glob('**/hidden-tests/**')
      const matches = await Array.fromAsync(glob.scan({ cwd: sandbox.dir }))
      expect(matches).toEqual([])
    } finally {
      await teardown(sandbox)
    }
  }, 30_000)
})

describe('hard-variant hidden-test suites discriminate: fail on the unmodified fixture, pass on a correct fix', () => {
  for (const scenario of HARD_SCENARIOS) {
    test(`${scenario.id}: fails against the unmodified fixture, passes against the reference fix`, async () => {
      const fix = REFERENCE_FIXES_HARD[scenario.id]
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
