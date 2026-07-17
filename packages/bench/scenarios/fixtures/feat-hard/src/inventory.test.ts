import { expect, test } from 'bun:test'

import {
  createInventory,
  getStock,
  OutOfStockError,
  releaseStock,
  reserveStock,
} from './inventory.ts'

test('reserveStock reduces on-hand by the reserved quantity', () => {
  const stock = createInventory([{ sku: 'mug', onHand: 10 }])
  reserveStock(stock, 'mug', 3)
  expect(getStock(stock, 'mug')).toBe(7)
})

test('reserveStock throws OutOfStockError when the requested quantity exceeds on-hand', () => {
  const stock = createInventory([{ sku: 'mug', onHand: 2 }])
  expect(() => reserveStock(stock, 'mug', 3)).toThrow(OutOfStockError)
})

test('reserveStock allows reserving exactly the remaining on-hand', () => {
  const stock = createInventory([{ sku: 'mug', onHand: 5 }])
  reserveStock(stock, 'mug', 5)
  expect(getStock(stock, 'mug')).toBe(0)
})

test('releaseStock increases on-hand within capacity', () => {
  const stock = createInventory([{ sku: 'mug', onHand: 5 }])
  releaseStock(stock, 'mug', 3, 10)
  expect(getStock(stock, 'mug')).toBe(8)
})

test('getStock returns 0 for an unknown sku', () => {
  const stock = createInventory([])
  expect(getStock(stock, 'nope')).toBe(0)
})
