// `cospec store` (WI-2) — proves the first-class wrap end to end: `setup`
// registers a root cospec can immediately see via `ls`/`doctor`, `register`
// adopts an existing healthy OpenSpec root into the registry, `unregister`
// forgets the registration without touching files, and `remove` requires
// `--yes` before it will delete anything. XDG_DATA_HOME sandboxes the
// machine-global store registry per test (mirrors
// test/integration/store-aware.test.ts) so this suite never touches the real
// machine's registered stores.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo } from '../fixtures/support.ts'

afterAll(cleanupAll)

function sandbox(): { workspace: string; env: Record<string, string> } {
  const workspace = mkTempRepo()
  const xdg = join(workspace, 'xdg')
  mkdirSync(xdg, { recursive: true })
  return { workspace, env: { XDG_DATA_HOME: xdg, OPENSPEC_TELEMETRY: '0' } }
}

/** A healthy-but-unregistered OpenSpec root (config.yaml + specs/ + changes/archive/). */
function healthyOpenspecRoot(root: string): void {
  mkdirSync(join(root, 'openspec', 'changes', 'archive'), { recursive: true })
  mkdirSync(join(root, 'openspec', 'specs'), { recursive: true })
  writeFileSync(join(root, 'openspec', 'config.yaml'), 'schema: feat\n')
}

describe('cospec store', () => {
  test('setup then ls (alias) shows the store in the human-readable table', async () => {
    const { workspace, env } = sandbox()
    const storeRoot = join(workspace, 'ls-store')

    const setup = await cospec(
      ['store', 'setup', 'ls-store', '--path', storeRoot, '--no-init-git', '--json'],
      { cwd: workspace, env },
    )
    expect(setup.exitCode).toBe(0)

    const ls = await cospec(['store', 'ls'], { cwd: workspace, env })
    expect(ls.exitCode).toBe(0)
    expect(ls.stdout).toMatch(/ls-store/)
    expect(ls.stdout).toMatch(storeRoot)
  }, 30_000)

  test('register adopts an existing healthy OpenSpec root', async () => {
    const { workspace, env } = sandbox()
    const storeRoot = join(workspace, 'adopted-store')
    healthyOpenspecRoot(storeRoot)

    const register = await cospec(
      ['store', 'register', storeRoot, '--id', 'adopted-store', '--yes', '--json'],
      { cwd: workspace, env },
    )
    expect(register.exitCode).toBe(0)
    const payload = JSON.parse(register.stdout) as { store: { id: string; root: string } }
    expect(payload.store.id).toBe('adopted-store')

    const list = await cospec(['store', 'list', '--json'], { cwd: workspace, env })
    const listPayload = JSON.parse(list.stdout) as { stores: { id: string }[] }
    expect(listPayload.stores.some((s) => s.id === 'adopted-store')).toBe(true)

    const doctor = await cospec(['store', 'doctor', 'adopted-store', '--json'], {
      cwd: workspace,
      env,
    })
    expect(doctor.exitCode).toBe(0)
    const doctorPayload = JSON.parse(doctor.stdout) as {
      stores: { id: string; openspec_root: { healthy: boolean } }[]
    }
    expect(doctorPayload.stores[0]?.id).toBe('adopted-store')
    expect(doctorPayload.stores[0]?.openspec_root.healthy).toBe(true)
  }, 30_000)

  test('unregister forgets the registration without touching files on disk', async () => {
    const { workspace, env } = sandbox()
    const storeRoot = join(workspace, 'unreg-store')

    const setup = await cospec(
      ['store', 'setup', 'unreg-store', '--path', storeRoot, '--no-init-git', '--json'],
      { cwd: workspace, env },
    )
    expect(setup.exitCode).toBe(0)

    const unregister = await cospec(['store', 'unregister', 'unreg-store', '--json'], {
      cwd: workspace,
      env,
    })
    expect(unregister.exitCode).toBe(0)

    // Files are untouched — only the registry entry is gone.
    expect(existsSync(storeRoot)).toBe(true)
    expect(existsSync(join(storeRoot, 'openspec'))).toBe(true)

    const list = await cospec(['store', 'list', '--json'], { cwd: workspace, env })
    const listPayload = JSON.parse(list.stdout) as { stores: { id: string }[] }
    expect(listPayload.stores.some((s) => s.id === 'unreg-store')).toBe(false)
  }, 30_000)

  test('remove without --yes is refused and deletes nothing', async () => {
    const { workspace, env } = sandbox()
    const storeRoot = join(workspace, 'protected-store')

    const setup = await cospec(
      ['store', 'setup', 'protected-store', '--path', storeRoot, '--no-init-git', '--json'],
      { cwd: workspace, env },
    )
    expect(setup.exitCode).toBe(0)

    const remove = await cospec(['store', 'remove', 'protected-store', '--json'], {
      cwd: workspace,
      env,
    })
    expect(remove.exitCode).toBe(1)
    const payload = JSON.parse(remove.stdout) as { status: { severity: string }[] }
    expect(payload.status.some((s) => s.severity === 'error')).toBe(true)
    // Refused: the folder and the registry entry are both untouched.
    expect(existsSync(storeRoot)).toBe(true)
    const list = await cospec(['store', 'list', '--json'], { cwd: workspace, env })
    const listPayload = JSON.parse(list.stdout) as { stores: { id: string }[] }
    expect(listPayload.stores.some((s) => s.id === 'protected-store')).toBe(true)
  }, 30_000)

  test('an unknown store subcommand fails with a helpful exit 1', async () => {
    const { workspace, env } = sandbox()
    const res = await cospec(['store', 'bogus'], { cwd: workspace, env })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toMatch(/unknown subcommand 'bogus'/)
  })
})
