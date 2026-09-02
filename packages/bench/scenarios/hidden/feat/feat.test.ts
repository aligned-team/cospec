// Held-out hidden test suite for the `feat` scenario — see
// `packages/bench/scenarios/hidden/README.md` for the copy/import convention.
// Discriminating end to end: `applyDiscount` does not exist on the unmodified
// fixture, so every case fails until it is added correctly. Uses a dynamic
// namespace import (rather than a static named import of a binding that may
// not exist yet) so a missing export fails each test individually instead of
// crashing the whole file at module-link time.

import { expect, test } from 'bun:test'

import { subtotal } from '../src/cart.ts'
import type { Cart } from '../src/cart.ts'

type ApplyDiscount = (cart: Cart, percentOff: number) => number

function sampleCart(): Cart {
  return [
    { name: 'mug', price: 12, quantity: 2 },
    { name: 'saucer', price: 5, quantity: 3 },
  ]
}

async function loadApplyDiscount(): Promise<ApplyDiscount | undefined> {
  const mod = (await import('../src/cart.ts')) as { applyDiscount?: ApplyDiscount }
  return mod.applyDiscount
}

test('applyDiscount is exported as a function', async () => {
  expect(typeof (await loadApplyDiscount())).toBe('function')
})

test('applyDiscount(cart, 0) leaves the subtotal unchanged', async () => {
  const applyDiscount = await loadApplyDiscount()
  const cart = sampleCart()
  expect(applyDiscount?.(cart, 0)).toBe(subtotal(cart))
})

test('applyDiscount(cart, 100) reduces the subtotal to 0', async () => {
  const applyDiscount = await loadApplyDiscount()
  expect(applyDiscount?.(sampleCart(), 100)).toBe(0)
})

test('applyDiscount(cart, 20) applies exactly a 20% reduction', async () => {
  const applyDiscount = await loadApplyDiscount()
  const cart = sampleCart()
  const expected = subtotal(cart) * (1 - 20 / 100)
  expect(applyDiscount?.(cart, 20)).toBeCloseTo(expected, 6)
})

test('applyDiscount throws RangeError for percentOff below 0', async () => {
  const applyDiscount = await loadApplyDiscount()
  expect(() => applyDiscount?.(sampleCart(), -5)).toThrow(RangeError)
})

test('applyDiscount throws RangeError for percentOff above 100', async () => {
  const applyDiscount = await loadApplyDiscount()
  expect(() => applyDiscount?.(sampleCart(), 150)).toThrow(RangeError)
})

test('applyDiscount on an empty cart returns 0 regardless of percentOff', async () => {
  const applyDiscount = await loadApplyDiscount()
  expect(applyDiscount?.([], 20)).toBe(0)
})

test('applyDiscount does not mutate the input cart', async () => {
  const applyDiscount = await loadApplyDiscount()
  const cart = sampleCart()
  const before = JSON.stringify(cart)
  applyDiscount?.(cart, 20)
  expect(JSON.stringify(cart)).toBe(before)
})
