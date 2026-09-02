import { reserveStock } from './inventory.ts'
import { applyDiscountCode, computeTax, subtotalCents } from './pricing.ts'
import type { Cart, CheckoutOptions, Order, Product } from './types.ts'

export function checkout(
  cart: Cart,
  catalog: ReadonlyMap<string, Product>,
  stock: Map<string, number>,
  options: CheckoutOptions = {},
): Order {
  for (const item of cart) reserveStock(stock, item.sku, item.quantity)

  const subtotal = subtotalCents(cart, catalog)
  const discount = applyDiscountCode(subtotal, options.discountCode)
  const taxable = subtotal - discount
  const tax = computeTax(taxable, options.region)

  return {
    items: cart,
    subtotalCents: subtotal,
    discountCents: discount,
    taxCents: tax,
    totalCents: taxable + tax,
  }
}
