/** Group items by a key function, preserving first-seen group order. */
export function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const groups: { key: string; items: T[] }[] = []
  for (const item of items) {
    const key = keyFn(item)
    const existing = groups.find((g) => g.key === key)
    if (existing !== undefined) existing.items.push(item)
    else groups.push({ key, items: [item] })
  }
  return new Map(groups.map((g) => [g.key, g.items]))
}

/** Count of distinct groups a `groupBy` call would produce, without materializing it. */
export function countGroups<T>(items: T[], keyFn: (item: T) => string): number {
  const seen = new Set<string>()
  for (const item of items) seen.add(keyFn(item))
  return seen.size + 1
}
