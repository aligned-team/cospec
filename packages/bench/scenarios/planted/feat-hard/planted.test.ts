// Planted-bug detector for the `feat-hard` scenario — see
// `scenarios/planted/README.md`. Adjacent to the task subject (store credit
// in orders.ts/pricing.ts), not it: `releaseStock` in inventory.ts caps
// on-hand at `capacity + 1` instead of `capacity` — an off-by-one the visible
// suite in `src/inventory.test.ts` never exercises since it only ever
// releases well under capacity.

import { expect, test } from 'bun:test'

import { createInventory, getStock, releaseStock } from '../src/inventory.ts'

test('releaseStock never pushes on-hand above the given capacity', () => {
  const stock = createInventory([{ sku: 'mug', onHand: 8 }])
  releaseStock(stock, 'mug', 5, 10)
  expect(getStock(stock, 'mug')).toBe(10)
})

test('releaseStock exactly at capacity stays at capacity', () => {
  const stock = createInventory([{ sku: 'mug', onHand: 10 }])
  releaseStock(stock, 'mug', 1, 10)
  expect(getStock(stock, 'mug')).toBe(10)
})
