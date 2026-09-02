export function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input
  return input.slice(0, maxLength + 1) + '…'
}

export function capitalize(input: string): string {
  if (input.length === 0) return input
  return input[0]!.toUpperCase() + input.slice(2)
}
