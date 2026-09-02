// `cospec store` against the real pinned openspec binary (DESIGN §8.2 contract
// suite, WI-2). Proves cospec's value-add over a bare passthrough: `store
// setup`/`store remove` observably create and delete the store root on disk
// (never trusting the wrapped exit code alone — `mutationPostCondition`/
// `cleanupPostCondition` in `commands/store.ts`), and a successful `setup`
// auto-stamps the root with cospec's typed schemas via `cospec init --harness
// none` in the same command. The assertions on `payload.store.{id,root}` and
// `payload.registry.{registered,already_registered}` double as a shape
// tripwire: a future openspec bump renaming one of these fields fails here
// first, not as a silent `undefined` in cospec's rendering.
//
// XDG_DATA_HOME sandboxes the machine-global store registry per test run
// (mirrors test/integration/store-aware.test.ts) so this suite never touches
// the real machine's registered stores.
//
// Re-probed against the 1.11.0 pin (2026-09-01): `payload.store.{id,root}` and
// `payload.registry.{registered,already_registered}` are unchanged, so the
// shape tripwire above still holds. The store DIAGNOSTIC vocabulary did move
// across 1.6.0–1.11.0 (the `openspec_*_missing` codes went away;
// `invalid_store_pointer` and `store_root_pointer_declared` arrived), but
// cospec renders diagnostics through a generic status-array renderer that keys
// on `severity`/`message`, never on a code allow-list — which is why that churn
// lands here as no assertion change at all.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo } from '../fixtures/support.ts'

afterAll(cleanupAll)

function sandbox(): { workspace: string; env: Record<string, string> } {
  const workspace = mkTempRepo()
  const xdg = join(workspace, 'xdg')
  mkdirSync(xdg, { recursive: true })
  return { workspace, env: { XDG_DATA_HOME: xdg, OPENSPEC_TELEMETRY: '0' } }
}

interface ListPayload {
  stores: { id: string; root: string }[]
}

describe('cospec store setup/remove (real openspec binary + auto cospec-init)', () => {
  test('setup creates + registers the root on disk, and auto cospec-init stamps typed schemas', async () => {
    const { workspace, env } = sandbox()
    const storeRoot = join(workspace, 'stores', 'demo-store')

    const res = await cospec(
      ['store', 'setup', 'demo-store', '--path', storeRoot, '--no-init-git', '--json'],
      { cwd: workspace, env },
    )
    expect(res.exitCode).toBe(0)

    const payload = JSON.parse(res.stdout) as {
      store: { id: string; root: string }
      registry: { registered: boolean; already_registered: boolean }
      cospecInit: { harnesses: string[] } | null
    }
    expect(payload.store.id).toBe('demo-store')
    expect(typeof payload.registry.registered).toBe('boolean')
    expect(existsSync(payload.store.root)).toBe(true)
    expect(existsSync(join(payload.store.root, 'openspec'))).toBe(true)

    // The value-add: the store root got cospec's typed schemas in the same command.
    expect(existsSync(join(payload.store.root, 'openspec/schemas/feat/schema.yaml'))).toBe(true)
    expect(existsSync(join(payload.store.root, 'openspec/schemas/ci/schema.yaml'))).toBe(true)
    expect(payload.cospecInit).not.toBeNull()
    expect(payload.cospecInit?.harnesses).toEqual([])

    // Registered on the (sandboxed) machine registry.
    const list = await cospec(['store', 'list', '--json'], { cwd: workspace, env })
    expect(list.exitCode).toBe(0)
    const listPayload = JSON.parse(list.stdout) as ListPayload
    expect(listPayload.stores.some((s) => s.id === 'demo-store')).toBe(true)
  }, 30_000)

  test('remove deletes the folder and drops the registry entry', async () => {
    const { workspace, env } = sandbox()
    const storeRoot = join(workspace, 'stores', 'gone-store')

    const setup = await cospec(
      ['store', 'setup', 'gone-store', '--path', storeRoot, '--no-init-git', '--json'],
      { cwd: workspace, env },
    )
    expect(setup.exitCode).toBe(0)
    expect(existsSync(storeRoot)).toBe(true)

    const remove = await cospec(['store', 'remove', 'gone-store', '--yes', '--json'], {
      cwd: workspace,
      env,
    })
    expect(remove.exitCode).toBe(0)
    expect(existsSync(storeRoot)).toBe(false)

    const list = await cospec(['store', 'list', '--json'], { cwd: workspace, env })
    const listPayload = JSON.parse(list.stdout) as ListPayload
    expect(listPayload.stores.some((s) => s.id === 'gone-store')).toBe(false)
  }, 30_000)

  test('--no-cospec-init skips the auto-init step', async () => {
    const { workspace, env } = sandbox()
    const storeRoot = join(workspace, 'stores', 'bare-store')

    const res = await cospec(
      [
        'store',
        'setup',
        'bare-store',
        '--path',
        storeRoot,
        '--no-init-git',
        '--no-cospec-init',
        '--json',
      ],
      { cwd: workspace, env },
    )
    expect(res.exitCode).toBe(0)
    const payload = JSON.parse(res.stdout) as { cospecInit: unknown }
    expect(payload.cospecInit).toBeNull()
    expect(existsSync(join(storeRoot, 'openspec/schemas'))).toBe(false)
  }, 30_000)
})
