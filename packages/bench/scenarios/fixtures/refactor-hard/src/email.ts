import type { ValidationResult } from './types.ts'

export function validateEmail(value: string): ValidationResult {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { valid: false, reason: 'must be a non-empty string' }
  }
  if (!value.includes('@')) {
    return { valid: false, reason: 'must contain an @' }
  }
  return { valid: true }
}
