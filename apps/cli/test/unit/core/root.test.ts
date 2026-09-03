import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  configStorePointer,
  localRoot,
  readDefaultStore,
  resolveRoot,
} from '../../../src/core/root.ts'

function repoWithConfig(body: string | undefined): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-root-'))
  if (body !== undefined) {
    mkdirSync(join(dir, 'openspec'), { recursive: true })
    writeFileSync(join(dir, 'openspec', 'config.yaml'), body)
  }
  return dir
}

/** A cwd with no `openspec/` dir of its own — local-root resolution fails here. */
function bareDir(): string {
  return mkdtempSync(join(tmpdir(), 'cospec-root-bare-'))
}

/** Register `id` -> `storeRoot` in a sandboxed machine-global store registry. */
function registerStore(xdgData: string, id: string, storeRoot: string): void {
  mkdirSync(join(xdgData, 'openspec', 'stores'), { recursive: true })
  writeFileSync(
    join(xdgData, 'openspec', 'stores', 'registry.yaml'),
    `version: 1\nstores:\n  ${id}:\n    backend:\n      type: git\n      local_path: ${storeRoot}\n`,
  )
}

/**
 * Runs `fn` with a sandboxed machine-global config (`XDG_CONFIG_HOME`) and
 * store registry (`XDG_DATA_HOME`), optionally pre-seeding a `defaultStore`
 * value in the global config — mirrors `test/integration/store-aware.test.ts`'s
 * XDG sandboxing so this suite never touches (or is polluted by) the real
 * machine's openspec config/registry. `readDefaultStore`/`resolveRoot` spawn
 * the real wrapped binary, which reads `process.env` at spawn time, so the
 * XDG vars are set directly on `process.env` for the duration of `fn`.
 */
async function withGlobalConfig<T>(
  defaultStore: string | undefined,
  fn: (xdgData: string) => Promise<T>,
): Promise<T> {
  const xdgConfig = mkdtempSync(join(tmpdir(), 'cospec-xdgcfg-'))
  const xdgData = mkdtempSync(join(tmpdir(), 'cospec-xdgdata-'))
  if (defaultStore !== undefined) {
    mkdirSync(join(xdgConfig, 'openspec'), { recursive: true })
    writeFileSync(join(xdgConfig, 'openspec', 'config.json'), JSON.stringify({ defaultStore }))
  }
  const prevConfig = process.env.XDG_CONFIG_HOME
  const prevData = process.env.XDG_DATA_HOME
  process.env.XDG_CONFIG_HOME = xdgConfig
  process.env.XDG_DATA_HOME = xdgData
  try {
    return await fn(xdgData)
  } finally {
    if (prevConfig === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = prevConfig
    if (prevData === undefined) delete process.env.XDG_DATA_HOME
    else process.env.XDG_DATA_HOME = prevData
    rmSync(xdgConfig, { recursive: true, force: true })
    rmSync(xdgData, { recursive: true, force: true })
  }
}

describe('localRoot', () => {
  test('base and cwd are the invocation cwd, with no store args', () => {
    const root = localRoot('/some/repo')
    expect(root).toEqual({ base: '/some/repo', cwd: '/some/repo', storeArgs: [], store: undefined })
  })
})

describe('configStorePointer', () => {
  test('undefined when there is no openspec/config.yaml', () => {
    const dir = repoWithConfig(undefined)
    try {
      expect(configStorePointer(dir)).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('reads a non-empty string store: pointer', () => {
    const dir = repoWithConfig('schema: feat\nstore: team-plans\n')
    try {
      expect(configStorePointer(dir)).toBe('team-plans')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('ignores an absent, empty, or non-string store: value', () => {
    for (const body of [
      'schema: feat\n',
      'store: ""\n',
      'store:\n  nested: true\n',
      'store: 42\n',
    ]) {
      const dir = repoWithConfig(body)
      try {
        expect(configStorePointer(dir)).toBeUndefined()
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  test('a references: list is not a store pointer (read-only context)', () => {
    const dir = repoWithConfig('schema: feat\nreferences:\n  - platform-reqs\n')
    try {
      expect(configStorePointer(dir)).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('resolveRoot', () => {
  test('resolves the local repo when there is no flag and no config pointer', async () => {
    const dir = repoWithConfig('schema: feat\n')
    try {
      const root = await resolveRoot({ cwd: dir, flags: {} })
      expect(root).toEqual({ base: dir, cwd: dir, storeArgs: [], store: undefined })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('readDefaultStore', () => {
  test('undefined when the global config has no defaultStore set', async () => {
    await withGlobalConfig(undefined, async () => {
      const dir = bareDir()
      try {
        expect(await readDefaultStore(dir)).toBeUndefined()
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }, 15_000)

  test('reads the raw value `openspec config get defaultStore` prints', async () => {
    await withGlobalConfig('team-plans', async () => {
      const dir = bareDir()
      try {
        expect(await readDefaultStore(dir)).toBe('team-plans')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }, 15_000)
})

describe('resolveRoot — defaultStore fallback (W8)', () => {
  test('is consulted ONLY after local-root resolution fails — a local openspec/ wins even with defaultStore set', async () => {
    await withGlobalConfig('elsewhere', async (xdgData) => {
      const dir = repoWithConfig('schema: feat\n') // has openspec/ — a resolvable local root
      const storeRoot = mkdtempSync(join(tmpdir(), 'cospec-root-store-'))
      registerStore(xdgData, 'elsewhere', storeRoot)
      try {
        const root = await resolveRoot({ cwd: dir, flags: {} })
        expect(root).toEqual({ base: dir, cwd: dir, storeArgs: [], store: undefined })
      } finally {
        rmSync(dir, { recursive: true, force: true })
        rmSync(storeRoot, { recursive: true, force: true })
      }
    })
  }, 15_000)

  test('falls back to a registered defaultStore once local-root resolution fails', async () => {
    await withGlobalConfig('team-plans', async (xdgData) => {
      const dir = bareDir() // no openspec/ here — local-root resolution fails
      const storeRoot = mkdtempSync(join(tmpdir(), 'cospec-root-store-'))
      registerStore(xdgData, 'team-plans', storeRoot)
      try {
        const root = await resolveRoot({ cwd: dir, flags: {} })
        expect(root).toEqual({
          base: storeRoot,
          cwd: dir,
          storeArgs: ['--store', 'team-plans'],
          store: 'team-plans',
        })
      } finally {
        rmSync(dir, { recursive: true, force: true })
        rmSync(storeRoot, { recursive: true, force: true })
      }
    })
  }, 15_000)

  test('falls back to the local cwd (unchanged pre-1.11 behaviour) when there is no defaultStore either', async () => {
    await withGlobalConfig(undefined, async () => {
      const dir = bareDir()
      try {
        const root = await resolveRoot({ cwd: dir, flags: {} })
        expect(root).toEqual({ base: dir, cwd: dir, storeArgs: [], store: undefined })
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }, 15_000)

  test('a stale defaultStore (no longer registered) fails loudly, same as an unknown --store — never a silent further fallback', async () => {
    await withGlobalConfig('ghost-store', async () => {
      const dir = bareDir()
      try {
        await expect(resolveRoot({ cwd: dir, flags: {} })).rejects.toThrow(
          /unknown store 'ghost-store'/,
        )
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }, 15_000)

  test('an explicit --store flag still outranks defaultStore (existing precedence, unchanged)', async () => {
    await withGlobalConfig('team-plans', async (xdgData) => {
      const dir = bareDir()
      const flagStoreRoot = mkdtempSync(join(tmpdir(), 'cospec-root-store-'))
      registerStore(xdgData, 'flag-store', flagStoreRoot)
      try {
        const root = await resolveRoot({ cwd: dir, flags: { store: 'flag-store' } })
        expect(root.store).toBe('flag-store')
        expect(root.base).toBe(flagStoreRoot)
      } finally {
        rmSync(dir, { recursive: true, force: true })
        rmSync(flagStoreRoot, { recursive: true, force: true })
      }
    })
  }, 15_000)
})
