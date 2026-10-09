// The home sandbox guard (ledger row 13.1, design §13): a completion test that
// would run with a real-looking HOME fails before any child starts, and a home
// under the temporary directory is accepted.

import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { assertTempHome, cleanup, homeCospec, homeSandbox } from '../fixtures/support.ts'

const sandboxes: string[] = []

afterEach(() => {
  for (const root of sandboxes.splice(0)) cleanup(root)
})

function sandbox() {
  const sb = homeSandbox()
  sandboxes.push(sb.root)
  return sb
}

describe('the home sandbox guard', () => {
  test('rejects a real-looking home before any child spawns', () => {
    const sb = sandbox()
    const realLooking = { ...sb, env: { ...sb.env, HOME: '/Users/someone' } }
    expect(() => assertTempHome('/Users/someone')).toThrow(/outside the temporary directory/)
    expect(() =>
      homeCospec(realLooking, ['completion', 'install', 'zsh'], { cwd: sb.root }),
    ).toThrow(/outside the temporary directory/)
    expect(existsSync(join('/Users/someone', '.zshrc'))).toBe(false)
  })

  test('rejects an unset HOME', () => {
    expect(() => assertTempHome(undefined)).toThrow(/HOME is unset/)
    expect(() => assertTempHome('')).toThrow(/HOME is unset/)
  })

  test('accepts the home of a sandbox, and everything the sandbox points under it', () => {
    const sb = sandbox()
    expect(() => assertTempHome(sb.home)).not.toThrow()
    for (const key of ['ZDOTDIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'CODEX_HOME']) {
      expect(sb.env[key]?.startsWith(sb.home)).toBe(true)
    }
  })
})
