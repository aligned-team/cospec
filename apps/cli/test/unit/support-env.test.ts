// Regression coverage for the color-env-hardening fix: the shared test
// harness's spawn env must never carry a color-forcing var through to a
// child, even when the parent (developer shell / CI runner) exports one
// alongside NO_COLOR — see apps/cli/test/fixtures/support.ts.

import { describe, expect, test } from 'bun:test'

import { COLOR_ENV_KEYS, envWithoutColorForcing } from '../fixtures/support.ts'

describe('envWithoutColorForcing', () => {
  test('strips every COLOR_ENV_KEYS entry even when the parent sets them', () => {
    const saved: Record<string, string | undefined> = {}
    for (const key of COLOR_ENV_KEYS) saved[key] = process.env[key]
    try {
      process.env.FORCE_COLOR = '3'
      process.env.COLORTERM = 'truecolor'
      process.env.CLICOLOR = '1'
      process.env.CLICOLOR_FORCE = '1'
      const built = envWithoutColorForcing()
      for (const key of COLOR_ENV_KEYS) expect(built).not.toHaveProperty(key)
    } finally {
      for (const key of COLOR_ENV_KEYS) {
        if (saved[key] === undefined) delete process.env[key]
        else process.env[key] = saved[key]
      }
    }
  })

  test('leaves unrelated env untouched', () => {
    const built = envWithoutColorForcing()
    expect(built.PATH).toBe(process.env.PATH)
  })
})
