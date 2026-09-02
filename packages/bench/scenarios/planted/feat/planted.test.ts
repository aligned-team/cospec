// Planted-bug detector for the `feat` scenario — see
// `scenarios/planted/README.md`. Adjacent to the task subject
// (`applyDiscount`), not it: `removeItem` was rewritten with a
// findIndex/splice pair that only drops the FIRST matching line item, which
// the visible suite in `src/cart.test.ts` never notices because it only ever
// exercises a cart with a single match for a given name.

import { expect, test } from 'bun:test'

import { removeItem } from '../src/cart.ts'
import type { Cart } from '../src/cart.ts'

test('removeItem removes every matching line item, not just the first', () => {
  const cart: Cart = [
    { name: 'mug', price: 12, quantity: 1 },
    { name: 'saucer', price: 5, quantity: 3 },
    { name: 'mug', price: 12, quantity: 4 },
  ]
  expect(removeItem(cart, 'mug')).toEqual([{ name: 'saucer', price: 5, quantity: 3 }])
})

test('removeItem is a no-op when nothing matches', () => {
  const cart: Cart = [{ name: 'saucer', price: 5, quantity: 3 }]
  expect(removeItem(cart, 'mug')).toEqual(cart)
})
