import type { ValidationResult } from './types.ts'

export function validateUsername(value: string): ValidationResult {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { valid: false, reason: 'must be a non-empty string' }
  }
  if (value.length < 3) {
    return { valid: false, reason: 'must be at least 3 characters' }
  }
  return { valid: true }
}
