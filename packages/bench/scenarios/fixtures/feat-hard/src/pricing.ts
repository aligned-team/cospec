import type { Cart, Product } from './types.ts'

export function subtotalCents(cart: Cart, catalog: ReadonlyMap<string, Product>): number {
  let total = 0
  for (const item of cart) {
    const product = catalog.get(item.sku)
    if (product === undefined) throw new Error(`unknown sku: ${item.sku}`)
    total += product.priceCents * item.quantity
  }
  return total
}

const DISCOUNT_CODES: Record<string, number> = {
  SAVE10: 10,
  SAVE25: 25,
}

/** Percent-off discount in cents for a subtotal, or 0 for an unknown/absent code. */
export function applyDiscountCode(subtotal: number, code: string | undefined): number {
  if (code === undefined) return 0
  const percentOff = DISCOUNT_CODES[code]
  if (percentOff === undefined) return 0
  return Math.round((subtotal * percentOff) / 100)
}

const TAX_RATE: Record<'US' | 'EU', number> = { US: 0.08, EU: 0.2 }

export function computeTax(taxableCents: number, region: 'US' | 'EU' = 'US'): number {
  if (taxableCents <= 0) return 0
  return Math.round(taxableCents * TAX_RATE[region])
}
