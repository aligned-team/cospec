// Regression coverage for the color-env-hardening fix: the shared test
// harness's spawn env must never carry a color-forcing var through to a
// child, even when the parent (developer shell / CI runner) exports one
// alongside NO_COLOR — see apps/cli/test/fixtures/support.ts.

import { afterEach, describe, expect, test } from 'bun:test'

import {
  COLOR_ENV_KEYS,
  envWithoutColorForcing,
  mkTempRepo,
  oracleEnv,
  suiteZone,
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
// America/Chicago), so the helpers pin the child to the suite's own zone.
describe('the suite zone reaches every spawned child', () => {
  const originalZone = suiteZone()

  // Restored by assignment, never `delete`: Bun re-reads the zone on either, and a
  // `delete` would fall back to the machine's zone instead of the suite's own.
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

  test('envWithoutColorForcing carries the suite zone', () => {
    expect(envWithoutColorForcing().TZ).toBe(suiteZone())
  })

  test('a zone assigned to process.env.TZ mid-suite is the zone a child runs in', async () => {
    // Never the machine's own zone, so the row cannot pass by coincidence.
    process.env.TZ = 'Pacific/Kiritimati'
    expect(envWithoutColorForcing().TZ).toBe('Pacific/Kiritimati')
    expect(await childZone(envWithoutColorForcing())).toBe('Pacific/Kiritimati')
    process.env.TZ = 'Etc/GMT+12'
    expect(await childZone(envWithoutColorForcing())).toBe('Etc/GMT+12')
  })

  test('the sandbox env a differential row hands cospec and the binary carries it too', async () => {
    const env = oracleEnv(mkTempRepo())
    expect(env.TZ).toBe(suiteZone())
    expect(await childZone(env)).toBe(suiteZone())
  })

  test('a caller-supplied TZ still wins over the suite zone', () => {
    expect({ ...oracleEnv(mkTempRepo()), TZ: 'Etc/GMT+12' }.TZ).toBe('Etc/GMT+12')
  })
})
