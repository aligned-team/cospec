import { expect, test } from 'bun:test'

import { addToCart, cartQuantity, removeFromCart } from './cart.ts'
import type { Cart } from './types.ts'

test('addToCart appends a new line item', () => {
  const cart: Cart = []
  const next = addToCart(cart, { sku: 'mug', quantity: 2 })
  expect(next).toEqual([{ sku: 'mug', quantity: 2 }])
})

test('addToCart merges quantity for an existing sku', () => {
  const cart: Cart = [{ sku: 'mug', quantity: 2 }]
  const next = addToCart(cart, { sku: 'mug', quantity: 3 })
  expect(next).toEqual([{ sku: 'mug', quantity: 5 }])
})

test('removeFromCart drops the matching line item', () => {
  const cart: Cart = [{ sku: 'mug', quantity: 2 }]
  expect(removeFromCart(cart, 'mug')).toEqual([])
})

test('cartQuantity returns 0 for a sku not in the cart', () => {
  expect(cartQuantity([], 'mug')).toBe(0)
})
