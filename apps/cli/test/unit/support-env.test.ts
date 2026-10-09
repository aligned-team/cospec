// Regression coverage for the color-env-hardening fix: the shared test
// harness's spawn env must never carry a color-forcing var through to a
// child, even when the parent (developer shell / CI runner) exports one
// alongside NO_COLOR — see apps/cli/test/fixtures/support.ts.

import { afterEach, describe, expect, test } from 'bun:test'

import { oracleSpawn } from '../contract/support/upstream-oracle.ts'
import {
  COLOR_ENV_KEYS,
  envWithoutColorForcing,
  mkTempRepo,
  oracleEnv,
  suiteZone,
  withSuiteZone,
} from '../fixtures/support.ts'

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

// `bun test` leaves `process.env.TZ` unset and runs the suite in UTC, while a child
// spawned from `{ ...process.env }` falls back to the machine's zone. A row that
// expects a date computed in-process then disagrees with the date a child stamped
// for the hours the two zones are on different calendar days (19:00-24:00 in
// America/Chicago), so every spawn helper pins the child to the suite's own zone.
describe('the suite zone reaches every spawned child', () => {
  const originalZone = suiteZone()

  // Restored by assignment, never `delete`: in Bun a `delete` of an assigned `TZ`
  // leaves later assignments without effect.
  afterEach(() => {
    process.env.TZ = originalZone
  })

  async function childZone(env: Record<string, string | undefined>): Promise<string> {
    const proc = Bun.spawn(
      [process.execPath, '-e', 'console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)'],
      { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', env },
    )
    const out = await new Response(proc.stdout).text()
    expect(await proc.exited).toBe(0)
    return out.trim()
  }

  test('withSuiteZone carries the suite zone, with or without one assigned mid-suite', async () => {
    expect(withSuiteZone({}).TZ).toBe(originalZone)
    // Never the machine's own zone, so the row cannot pass by coincidence.
    process.env.TZ = 'Pacific/Kiritimati'
    expect(withSuiteZone({}).TZ).toBe('Pacific/Kiritimati')
    expect(await childZone(withSuiteZone({ ...envWithoutColorForcing() }))).toBe(
      'Pacific/Kiritimati',
    )
  })

  test('a caller-supplied TZ wins over the suite zone', async () => {
    expect(withSuiteZone({ TZ: 'Etc/GMT+12' }).TZ).toBe('Etc/GMT+12')
    expect(await childZone(withSuiteZone({ ...envWithoutColorForcing(), TZ: 'Etc/GMT+12' }))).toBe(
      'Etc/GMT+12',
    )
  })

  test('the oracle spawns the pinned binary in the suite zone', () => {
    process.env.TZ = 'Etc/GMT+12'
    expect(oracleSpawn(['list'], mkTempRepo()).env.TZ).toBe('Etc/GMT+12')
  })

  test('the sandbox env carries no TZ: suites assign it onto process.env and delete it', () => {
    expect(oracleEnv(mkTempRepo())).not.toHaveProperty('TZ')
    expect(envWithoutColorForcing()).not.toHaveProperty('TZ')
  })
})
