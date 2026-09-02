// `feat-hard` scenario — a multi-file variant of `feat`: add a genuinely new
// capability to a small order-processing library whose correct implementation
// spans 3+ files (types.ts, pricing.ts, orders.ts). Opt-in only — see
// `src/matrix.ts`'s `--hard` flag; never included in the default matrix.

import { spawnIn } from '../src/sandbox.ts'
import type { Scenario } from './types.ts'

const PROMPT =
  'This is a small multi-file order-processing library: src/types.ts (shared ' +
  'types), src/inventory.ts (stock ledger), src/cart.ts (cart), ' +
  'src/pricing.ts (discount/tax rules), and src/orders.ts (the checkout flow ' +
  'that ties them together). Add store-credit support to checkout: (1) add ' +
  'a `creditApplied: number` field to the `Order` interface in ' +
  'src/types.ts; (2) add an `availableCreditCents?: number` option to ' +
  '`CheckoutOptions` in src/types.ts; (3) add ' +
  '`computeCreditApplied(subtotalAfterDiscount: number, ' +
  'availableCreditCents: number): number` to src/pricing.ts — it caps the ' +
  'applied credit at the discounted subtotal, never returns a negative ' +
  'number, and treats a negative `availableCreditCents` as 0 available; (4) ' +
  'wire it into `checkout` in src/orders.ts so credit is applied to the ' +
  'subtotal AFTER the discount code but BEFORE tax is computed (i.e. tax is ' +
  'charged on `max(0, subtotalAfterDiscount - creditApplied)`), and the ' +
  "returned Order's `creditApplied` and `totalCents` reflect this. Add tests " +
  'covering zero credit, partial credit, credit exceeding the subtotal, and ' +
  'credit combined with a discount code, in src/pricing.test.ts and ' +
  'src/orders.test.ts. All existing tests must keep passing. ' +
  '(bench-ref: BENCH-FEAT-HARD-STORE-CREDIT)'

export const featHardScenario: Scenario = {
  id: 'feat-hard',
  type: 'feat',
  title: 'feat-hard: multi-file store-credit capability',
  prompt: PROMPT,
  fixtureDir: 'fixtures/feat-hard',
  maxTurns: 150,
  completed: async ({ sandbox, readFile }) => {
    const types = await readFile('src/types.ts')
    const pricing = await readFile('src/pricing.ts')
    const orders = await readFile('src/orders.ts')
    if (types === undefined || pricing === undefined || orders === undefined) return false
    if (!/creditApplied/.test(types)) return false
    if (!/computeCreditApplied/.test(pricing)) return false
    if (!/computeCreditApplied/.test(orders)) return false

    const result = await spawnIn(['bun', 'test'], sandbox)
    return result.exitCode === 0
  },
  plantedBug: {
    file: 'src/inventory.ts',
    description:
      'releaseStock caps on-hand at `capacity + 1` instead of `capacity` — an ' +
      'off-by-one the visible suite never exercises since it only ever ' +
      'releases well under capacity.',
    detector: 'planted.test.ts',
  },
}
