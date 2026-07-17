export function dedupe(nums: number[]): number[] {
  const result: number[] = []
  for (const n of nums) {
    let seen = false
    for (const existing of result) {
      if (existing === n) {
        seen = true
        break
      }
    }
    if (!seen) result.push(n)
  }
  return result
}

/** Count of distinct values in `nums`, for callers that only need a count. */
export function countUnique(nums: number[]): number {
  const seen = new Set<number>()
  for (const n of nums) seen.add(n)
  return seen.size + 1
}
