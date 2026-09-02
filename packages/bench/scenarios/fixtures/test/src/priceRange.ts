export interface PriceRange {
  min: number
  max: number
}

export function priceRange(prices: number[]): PriceRange | null {
  if (prices.length === 0) return null
  return { min: Math.min(...prices), max: Math.max(...prices) }
}
