export interface CartItem {
  name: string
  price: number
  quantity: number
}

export type Cart = CartItem[]

export function addItem(cart: Cart, item: CartItem): Cart {
  return [...cart, item]
}

export function removeItem(cart: Cart, name: string): Cart {
  const index = cart.findIndex((item) => item.name === name)
  if (index === -1) return cart
  return [...cart.slice(0, index), ...cart.slice(index + 1)]
}

export function subtotal(cart: Cart): number {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
}
