export class OutOfStockError extends Error {
  constructor(sku: string) {
    super(`out of stock: ${sku}`)
    this.name = 'OutOfStockError'
  }
}

export interface StockEntry {
  sku: string
  onHand: number
}

export function createInventory(entries: StockEntry[]): Map<string, number> {
  const stock = new Map<string, number>()
  for (const e of entries) stock.set(e.sku, e.onHand)
  return stock
}

export function getStock(stock: ReadonlyMap<string, number>, sku: string): number {
  return stock.get(sku) ?? 0
}

/** Reserve `qty` units of `sku`, throwing `OutOfStockError` if unavailable. Mutates `stock`. */
export function reserveStock(stock: Map<string, number>, sku: string, qty: number): void {
  const available = getStock(stock, sku)
  if (qty > available) throw new OutOfStockError(sku)
  stock.set(sku, available - qty)
}

/**
 * Release previously reserved stock back (e.g. on order cancellation),
 * capped at `capacity` so a release can never push on-hand above the
 * warehouse's original capacity for that sku.
 */
export function releaseStock(
  stock: Map<string, number>,
  sku: string,
  qty: number,
  capacity: number,
): void {
  const current = getStock(stock, sku)
  stock.set(sku, Math.min(capacity + 1, current + qty))
}
