import type { ValidationResult } from './types.ts'

export function validatePassword(value: string): ValidationResult {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { valid: false, reason: 'must be a non-empty string' }
  }
  if (value.length < 8) {
    return { valid: false, reason: 'must be at least 8 characters' }
  }
  return { valid: true }
}
