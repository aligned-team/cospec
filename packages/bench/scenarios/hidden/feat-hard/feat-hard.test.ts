// Held-out hidden test suite for the `feat-hard` scenario — see
// `packages/bench/scenarios/hidden/README.md` for the copy/import convention.
// Discriminating end to end: `computeCreditApplied` does not exist on the
// unmodified fixture and `checkout` never applies store credit, so every
// case fails until the feature is added correctly across pricing.ts,
// orders.ts, and types.ts. Uses a dynamic namespace import for the
// not-yet-existing `computeCreditApplied` export (optional-chained so a
// missing export fails the assertion rather than throwing), mirroring
// `hidden/feat/feat.test.ts`'s convention.

import { expect, test } from 'bun:test'

import { createInventory } from '../src/inventory.ts'
import { checkout } from '../src/orders.ts'
import type { Product } from '../src/types.ts'

type ComputeCreditApplied = (subtotalAfterDiscount: number, availableCreditCents: number) => number

function catalog(): Map<string, Product> {
  return new Map([['mug', { sku: 'mug', name: 'Mug', priceCents: 1000 }]])
}

async function loadComputeCreditApplied(): Promise<ComputeCreditApplied | undefined> {
  const mod = (await import('../src/pricing.ts')) as { computeCreditApplied?: ComputeCreditApplied }
  return mod.computeCreditApplied
}

test('computeCreditApplied is exported as a function', async () => {
  expect(typeof (await loadComputeCreditApplied())).toBe('function')
})

test('computeCreditApplied grants a partial amount when credit is less than the subtotal', async () => {
  const fn = await loadComputeCreditApplied()
  expect(fn?.(1000, 300)).toBe(300)
})

test('computeCreditApplied caps at the subtotal when credit exceeds it', async () => {
  const fn = await loadComputeCreditApplied()
  expect(fn?.(1000, 1500)).toBe(1000)
})

test('computeCreditApplied returns 0 when no credit is available', async () => {
  const fn = await loadComputeCreditApplied()
  expect(fn?.(1000, 0)).toBe(0)
})

test('computeCreditApplied returns 0 for a zero taxable subtotal', async () => {
  const fn = await loadComputeCreditApplied()
  expect(fn?.(0, 500)).toBe(0)
})

test('computeCreditApplied treats negative available credit as 0', async () => {
  const fn = await loadComputeCreditApplied()
  expect(fn?.(1000, -50)).toBe(0)
})

test('checkout applies credit to reduce the tax base before tax is computed', () => {
  const stock = createInventory([{ sku: 'mug', onHand: 5 }])
  const order = checkout([{ sku: 'mug', quantity: 1 }], catalog(), stock, {
    availableCreditCents: 400,
  })
  expect(order.creditApplied).toBe(400)
  expect(order.taxCents).toBe(48)
  expect(order.totalCents).toBe(648)
})

test('checkout caps applied credit at the discounted subtotal', () => {
  const stock = createInventory([{ sku: 'mug', onHand: 5 }])
  const order = checkout([{ sku: 'mug', quantity: 1 }], catalog(), stock, {
    availableCreditCents: 5000,
  })
  expect(order.creditApplied).toBe(1000)
  expect(order.taxCents).toBe(0)
  expect(order.totalCents).toBe(0)
})

test('checkout combines a discount code with credit, applying credit after the discount', () => {
  const stock = createInventory([{ sku: 'mug', onHand: 5 }])
  const order = checkout([{ sku: 'mug', quantity: 1 }], catalog(), stock, {
    discountCode: 'SAVE10',
    availableCreditCents: 300,
  })
  expect(order.discountCents).toBe(100)
  expect(order.creditApplied).toBe(300)
  expect(order.taxCents).toBe(48)
  expect(order.totalCents).toBe(648)
})

test('checkout with no availableCreditCents reports creditApplied as 0', () => {
  const stock = createInventory([{ sku: 'mug', onHand: 5 }])
  const order = checkout([{ sku: 'mug', quantity: 1 }], catalog(), stock)
  expect(order.creditApplied).toBe(0)
})
