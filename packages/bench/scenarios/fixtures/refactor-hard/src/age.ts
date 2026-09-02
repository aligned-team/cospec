import type { ValidationResult } from './types.ts'

export function validateAge(age: number): ValidationResult {
  if (typeof age !== 'number' || Number.isNaN(age)) {
    return { valid: false, reason: 'must be a number' }
  }
  if (age < 0 || age >= 120) {
    return { valid: false, reason: 'must be between 0 and 120' }
  }
  return { valid: true }
}
