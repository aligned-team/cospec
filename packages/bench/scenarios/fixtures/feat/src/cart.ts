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
  return cart.filter((item) => item.name !== name)
}

export function subtotal(cart: Cart): number {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
}
