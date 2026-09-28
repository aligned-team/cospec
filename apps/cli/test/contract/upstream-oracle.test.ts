// The oracle spawns the pinned binary the way cospec's own wrapped calls do
// (change `pin-node-oracle`): the running executable, the package's bin, argv
// untouched, and the product's wrapped env over the sandbox env — so every
// differential compares cospec with the binary under the runtime cospec runs it
// in. `{ runtime: 'node' }` swaps only the interpreter, and exists for the one
// thing Bun cannot do: deliver a leading `--`.

import { afterAll, afterEach, describe, expect, test } from 'bun:test'

import {
  buildWrappedSpawnEnv,
  COLOR_FORCING_ENV_KEYS,
  PINNED_OPENSPEC_VERSION,
  WRAPPED_ENV,
} from '../../src/core/openspec.ts'
import { cleanupAll, mkTempRepo, openspecBinPath } from '../fixtures/support.ts'
import { oracle, oracleEnv, oracleSpawn } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

const forced = new Map<string, string | undefined>()
afterEach(() => {
  for (const [key, value] of forced) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  forced.clear()
})

/** Export every color-forcing key in the suite's own env for one test. */
function forceColorInParent(): void {
  for (const key of COLOR_FORCING_ENV_KEYS) {
    forced.set(key, process.env[key])
    process.env[key] = '1'
  }
}

describe('the oracle spawns the pinned binary as cospec does', () => {
  test('under the running executable (Bun), on the package bin, with argv untouched', () => {
    const root = mkTempRepo()
    const argv = ['--store-path', '/x', 'list', '--json']
    const spawn = oracleSpawn(argv, root)
    expect(spawn.cmd).toEqual([process.execPath, openspecBinPath(), ...argv])
    expect(spawn.cwd).toBe(root)
    expect(oracleSpawn(argv, root, { cwd: '/elsewhere' }).cwd).toBe('/elsewhere')
  })

  test("under the product's wrapped env over the sandbox env, color forcing stripped", () => {
    forceColorInParent()
    const root = mkTempRepo()
    const { env } = oracleSpawn(['list'], root)
    expect(env).toEqual(buildWrappedSpawnEnv(oracleEnv(root)))
    for (const [key, value] of Object.entries(WRAPPED_ENV)) expect(env[key]).toBe(value)
    for (const key of COLOR_FORCING_ENV_KEYS) expect(Object.hasOwn(env, key)).toBe(false)
    expect(env['HOME']).toBe(oracleEnv(root)['HOME'])
  })

  test('{ runtime: node } swaps only the interpreter', () => {
    const root = mkTempRepo()
    const bun = oracleSpawn(['list'], root)
    const node = oracleSpawn(['list'], root, { runtime: 'node' })
    expect(node.cmd).toEqual([Bun.which('node')!, ...bun.cmd.slice(1)])
    expect(node.env).toEqual(bun.env)
    expect(node.cwd).toBe(bun.cwd)
  })

  test('a parent that forces color leaves no runtime warning on the binary stderr', async () => {
    forceColorInParent()
    const root = mkTempRepo()
    const run = await oracle(['--version'], root)
    expect(run).toEqual({ exitCode: 0, stdout: `${PINNED_OPENSPEC_VERSION}\n`, stderr: '' })
  }, 30_000)

  test('a leading -- is what { runtime: node } is for: Bun drops it, Node delivers it', async () => {
    const root = mkTempRepo()
    const underBun = await oracle(['--', '--version'], root)
    expect(underBun).toEqual({ exitCode: 0, stdout: `${PINNED_OPENSPEC_VERSION}\n`, stderr: '' })
    const underNode = await oracle(['--', '--version'], root, { runtime: 'node' })
    expect(underNode.exitCode).toBe(1)
    expect(underNode.stderr).toContain("error: unknown command '--version'")
  }, 30_000)
})
