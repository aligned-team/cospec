// `feat` scenario — add a genuinely new capability to an existing library.

import { spawnIn } from '../src/sandbox.ts'
import type { Scenario } from './types.ts'

const PROMPT =
  'This is a small shopping-cart library (src/cart.ts). Add a new ' +
  'capability: an `applyDiscount(cart: Cart, percentOff: number): number` ' +
  "function that returns the cart's subtotal after applying a percentage " +
  'discount (e.g. `20` means 20% off). Throw a `RangeError` if `percentOff` ' +
  'is outside `0..100`. Export it from src/cart.ts and add at least one ' +
  'passing test for it in src/cart.test.ts. (bench-ref: BENCH-FEAT-APPLY-DISCOUNT)'

export const featScenario: Scenario = {
  id: 'feat',
  type: 'feat',
  title: 'feat: cart discount capability',
  prompt: PROMPT,
  fixtureDir: 'fixtures/feat',
  maxTurns: 120,
  completed: async ({ sandbox, readFile }) => {
    const src = await readFile('src/cart.ts')
    if (src === undefined || !/applyDiscount/.test(src)) return false

    const result = await spawnIn(['bun', 'test'], sandbox)
    return result.exitCode === 0
  },
  plantedBug: {
    file: 'src/cart.ts',
    description:
      'removeItem only removes the FIRST matching line item, not every match ' +
      '(findIndex/splice instead of filter) — invisible to the visible ' +
      'suite, which only ever exercises a single match.',
    detector: 'planted.test.ts',
  },
}
