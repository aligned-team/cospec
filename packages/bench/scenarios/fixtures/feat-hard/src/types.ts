export interface Product {
  sku: string
  name: string
  priceCents: number
}

export interface CartItem {
  sku: string
  quantity: number
}

export type Cart = CartItem[]

export interface CheckoutOptions {
  discountCode?: string
  region?: 'US' | 'EU'
}

export interface Order {
  items: CartItem[]
  subtotalCents: number
  discountCents: number
  taxCents: number
  totalCents: number
}
