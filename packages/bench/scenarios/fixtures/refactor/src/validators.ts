export interface ValidationResult {
  valid: boolean
  reason?: string
}

export function validateEmail(value: string): ValidationResult {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { valid: false, reason: 'must be a non-empty string' }
  }
  if (!value.includes('@')) {
    return { valid: false, reason: 'must contain an @' }
  }
  return { valid: true }
}

export function validateUsername(value: string): ValidationResult {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { valid: false, reason: 'must be a non-empty string' }
  }
  if (value.length < 3) {
    return { valid: false, reason: 'must be at least 3 characters' }
  }
  return { valid: true }
}

export function validatePassword(value: string): ValidationResult {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { valid: false, reason: 'must be a non-empty string' }
  }
  if (value.length < 8) {
    return { valid: false, reason: 'must be at least 8 characters' }
  }
  return { valid: true }
}

export function validateAge(age: number): ValidationResult {
  if (typeof age !== 'number' || Number.isNaN(age)) {
    return { valid: false, reason: 'must be a number' }
  }
  if (age < 0 || age >= 120) {
    return { valid: false, reason: 'must be between 0 and 120' }
  }
  return { valid: true }
}
