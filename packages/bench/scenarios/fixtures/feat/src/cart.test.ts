import { expect, test } from 'bun:test'

import { addItem, removeItem, subtotal } from './cart.ts'
import type { Cart } from './cart.ts'

test('addItem appends a new line item', () => {
  const cart: Cart = []
  const next = addItem(cart, { name: 'mug', price: 12, quantity: 2 })
  expect(next).toEqual([{ name: 'mug', price: 12, quantity: 2 }])
})

test('removeItem drops the matching line item', () => {
  const cart: Cart = [{ name: 'mug', price: 12, quantity: 2 }]
  expect(removeItem(cart, 'mug')).toEqual([])
})

test('subtotal sums price * quantity across the cart', () => {
  const cart: Cart = [
    { name: 'mug', price: 12, quantity: 2 },
    { name: 'saucer', price: 5, quantity: 3 },
  ]
  expect(subtotal(cart)).toBe(12 * 2 + 5 * 3)
})
