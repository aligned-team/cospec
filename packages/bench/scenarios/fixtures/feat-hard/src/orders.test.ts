import { expect, test } from 'bun:test'

import { createInventory, getStock } from './inventory.ts'
import { checkout } from './orders.ts'
import type { Product } from './types.ts'

function catalog(): Map<string, Product> {
  return new Map([['mug', { sku: 'mug', name: 'Mug', priceCents: 1000 }]])
}

test('checkout computes subtotal, discount, tax, and total with no discount code', () => {
  const stock = createInventory([{ sku: 'mug', onHand: 5 }])
  const order = checkout([{ sku: 'mug', quantity: 2 }], catalog(), stock)
  expect(order.subtotalCents).toBe(2000)
  expect(order.discountCents).toBe(0)
  expect(order.taxCents).toBe(160)
  expect(order.totalCents).toBe(2160)
})

test('checkout applies a discount code before computing tax', () => {
  const stock = createInventory([{ sku: 'mug', onHand: 5 }])
  const order = checkout([{ sku: 'mug', quantity: 1 }], catalog(), stock, {
    discountCode: 'SAVE10',
  })
  expect(order.discountCents).toBe(100)
  expect(order.taxCents).toBe(72)
  expect(order.totalCents).toBe(972)
})

test('checkout reserves stock, so a second checkout of the same quantity fails', () => {
  const stock = createInventory([{ sku: 'mug', onHand: 2 }])
  checkout([{ sku: 'mug', quantity: 2 }], catalog(), stock)
  expect(getStock(stock, 'mug')).toBe(0)
  expect(() => checkout([{ sku: 'mug', quantity: 1 }], catalog(), stock)).toThrow()
})
