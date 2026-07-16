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
