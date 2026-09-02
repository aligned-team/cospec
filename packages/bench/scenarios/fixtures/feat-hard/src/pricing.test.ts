import { expect, test } from 'bun:test'

import { applyDiscountCode, computeTax, subtotalCents } from './pricing.ts'
import type { Product } from './types.ts'

function catalog(): Map<string, Product> {
  return new Map([
    ['mug', { sku: 'mug', name: 'Mug', priceCents: 1200 }],
    ['saucer', { sku: 'saucer', name: 'Saucer', priceCents: 500 }],
  ])
}

test('subtotalCents sums price * quantity across the cart', () => {
  const cart = [
    { sku: 'mug', quantity: 2 },
    { sku: 'saucer', quantity: 3 },
  ]
  expect(subtotalCents(cart, catalog())).toBe(1200 * 2 + 500 * 3)
})

test('subtotalCents throws for an unknown sku', () => {
  expect(() => subtotalCents([{ sku: 'nope', quantity: 1 }], catalog())).toThrow(/unknown sku/)
})

test('applyDiscountCode applies a known code', () => {
  expect(applyDiscountCode(1000, 'SAVE10')).toBe(100)
})

test('applyDiscountCode returns 0 for an unknown code', () => {
  expect(applyDiscountCode(1000, 'NOPE')).toBe(0)
})

test('applyDiscountCode returns 0 when no code is given', () => {
  expect(applyDiscountCode(1000, undefined)).toBe(0)
})

test('computeTax applies the US rate by default', () => {
  expect(computeTax(1000)).toBe(80)
})

test('computeTax applies the EU rate when given', () => {
  expect(computeTax(1000, 'EU')).toBe(200)
})

test('computeTax returns 0 for a non-positive taxable amount', () => {
  expect(computeTax(0)).toBe(0)
})
