import type { Cart, CartItem } from './types.ts'

export function addToCart(cart: Cart, item: CartItem): Cart {
  const existing = cart.find((i) => i.sku === item.sku)
  if (existing !== undefined) {
    return cart.map((i) =>
      i.sku === item.sku ? { ...i, quantity: i.quantity + item.quantity } : i,
    )
  }
  return [...cart, item]
}

export function removeFromCart(cart: Cart, sku: string): Cart {
  return cart.filter((i) => i.sku !== sku)
}

export function cartQuantity(cart: Cart, sku: string): number {
  return cart.find((i) => i.sku === sku)?.quantity ?? 0
}
