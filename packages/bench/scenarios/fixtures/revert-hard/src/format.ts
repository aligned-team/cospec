export function formatDisplayName(first: string, last: string): string {
  return `${first.toUpperCase()} ${last.toUpperCase()}!`
}

/** Two-letter initials, e.g. `initials('Jane', 'Doe')` -> `'J.D.'`. */
export function initials(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`
}
