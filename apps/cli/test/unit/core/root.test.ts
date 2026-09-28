import { describe, expect, spyOn, test } from 'bun:test'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  configStorePointer,
  localRoot,
  readDefaultStore,
  resolveRoot,
  RootSelectionError,
  rootSelectionDocument,
  type RootSource,
} from '../../../src/core/root.ts'

// Fixtures live under `tmpdir()` as spelled, which is a symlink on macOS
// (`/var` -> `/private/var`); the resolver returns canonical paths (design D3),
// so every expected path goes through `realpathSync`.
const canonical = (path: string): string => realpathSync(path)

const temps: string[] = []

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  temps.push(dir)
  return dir
}

function cleanup(): void {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
}

/** Create `dirs` and `files` under `base`, returning `base`. */
function layout(
  base: string,
  spec: { dirs?: string[]; files?: Record<string, string> } = {},
): string {
  for (const d of spec.dirs ?? []) mkdirSync(join(base, d), { recursive: true })
  for (const [rel, body] of Object.entries(spec.files ?? {})) {
    mkdirSync(join(base, rel, '..'), { recursive: true })
    writeFileSync(join(base, rel), body)
  }
  return base
}

function repoWithConfig(body: string | undefined, file = 'config.yaml'): string {
  const dir = tempDir('cospec-root-')
  if (body !== undefined) layout(dir, { files: { [`openspec/${file}`]: body } })
  return dir
}

/** A cwd with no `openspec/` dir at or above it. */
function bareDir(): string {
  return tempDir('cospec-root-bare-')
}

/**
 * A healthy store at `root` as `openspec store setup` leaves it: identity
 * metadata naming `id`, plus `openspec/` with a config and the planning dirs.
 */
function makeStoreTree(root: string, id: string): string {
  return layout(root, {
    dirs: ['openspec/specs', 'openspec/changes/archive'],
    files: {
      '.openspec-store/store.yaml': `version: 1\nid: ${id}\n`,
      'openspec/config.yaml': 'schema: spec-driven\n',
    },
  })
}

/** Write the machine-global store registry: `id -> root` for each entry. */
function writeRegistry(xdgData: string, stores: Record<string, string>): void {
  mkdirSync(join(xdgData, 'openspec', 'stores'), { recursive: true })
  const entries = Object.entries(stores)
    .map(([id, root]) => `  ${id}:\n    backend:\n      type: git\n      local_path: ${root}\n`)
    .join('')
  writeFileSync(
    join(xdgData, 'openspec', 'stores', 'registry.yaml'),
    `version: 1\nstores:${entries === '' ? ' {}' : `\n${entries}`}\n`,
  )
}

interface Env {
  xdgData: string
  /** Create a healthy store `id` (under a fresh temp dir unless `root` is given) and register it. */
  store: (id: string, root?: string) => string
}

/**
 * Runs `fn` with a sandboxed machine-global config (`XDG_CONFIG_HOME`) and
 * store registry (`XDG_DATA_HOME`), optionally pre-seeding a `defaultStore`
 * value in the global config, so this suite never touches (or is polluted by)
 * the real machine's openspec config/registry. The resolver spawns the real
 * wrapped binary, which reads `process.env` at spawn time, so the XDG vars are
 * set directly on `process.env` for the duration of `fn`.
 */
async function withGlobalConfig<T>(
  defaultStore: unknown,
  fn: (env: Env) => Promise<T>,
  /** The config file's whole body, written as given instead of `{defaultStore}`. */
  rawBody?: string,
): Promise<T> {
  const xdgConfig = tempDir('cospec-xdgcfg-')
  const xdgData = tempDir('cospec-xdgdata-')
  if (defaultStore !== undefined || rawBody !== undefined) {
    mkdirSync(join(xdgConfig, 'openspec'), { recursive: true })
    writeFileSync(
      join(xdgConfig, 'openspec', 'config.json'),
      rawBody ?? JSON.stringify({ defaultStore }),
    )
  }
  const registered: Record<string, string> = {}
  const env: Env = {
    xdgData,
    store: (id, root = join(tempDir('cospec-root-store-'), id)) => {
      makeStoreTree(root, id)
      registered[id] = root
      writeRegistry(xdgData, registered)
      return root
    },
  }
  const prevConfig = process.env.XDG_CONFIG_HOME
  const prevData = process.env.XDG_DATA_HOME
  process.env.XDG_CONFIG_HOME = xdgConfig
  process.env.XDG_DATA_HOME = xdgData
  try {
    return await fn(env)
  } finally {
    if (prevConfig === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = prevConfig
    if (prevData === undefined) delete process.env.XDG_DATA_HOME
    else process.env.XDG_DATA_HOME = prevData
    cleanup()
  }
}

interface Diagnostic {
  severity: string
  code: string
  message: string
  target?: string
  fix?: string
}

/** Await a resolver call expected to fail, returning its error and diagnostic. */
async function rejection(
  promise: Promise<unknown>,
): Promise<{ error: Error; diagnostic: Diagnostic }> {
  let caught: unknown
  try {
    await promise
  } catch (error) {
    caught = error
  }
  if (!(caught instanceof Error)) throw new Error('expected the resolver to throw an Error')
  const diagnostic = (caught as { diagnostic?: Diagnostic }).diagnostic
  if (diagnostic === undefined) throw new Error(`expected a diagnostic on: ${caught.message}`)
  expect(diagnostic.severity).toBe('error')
  expect(caught.message).toBe(`${diagnostic.message}\nFix: ${diagnostic.fix}`)
  expect(diagnostic.fix ?? '').not.toMatch(/(^|[^/\w.-])openspec\s+[a-z]/)
  expect(diagnostic.message).not.toMatch(/(^|[^/\w.-])openspec\s+[a-z]/)
  return { error: caught, diagnostic }
}

/** Run `fn` collecting everything written through `process.stderr.write`. */
async function captureStderr<T>(fn: () => Promise<T>): Promise<{ value: T; stderr: string }> {
  const original = process.stderr.write.bind(process.stderr)
  let stderr = ''
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    stderr += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
    return true
  }) as typeof process.stderr.write
  try {
    return { value: await fn(), stderr }
  } finally {
    process.stderr.write = original
  }
}

const JSON_FLAGS = { json: true } as const

describe('localRoot', () => {
  test('base and cwd are the invocation cwd, with no store args', () => {
    const root = localRoot('/some/repo')
    expect(root).toEqual({ base: '/some/repo', cwd: '/some/repo', storeArgs: [], store: undefined })
  })
})

describe('configStorePointer', () => {
  test('{filePath: null} when there is no config file', () => {
    const dir = repoWithConfig(undefined)
    try {
      expect(configStorePointer(dir)).toEqual({ filePath: null })
    } finally {
      cleanup()
    }
  })

  test('reads a string store: pointer with its config path', () => {
    const dir = repoWithConfig('schema: feat\nstore: team-plans\n')
    try {
      expect(configStorePointer(dir)).toEqual({
        filePath: join(dir, 'openspec', 'config.yaml'),
        value: 'team-plans',
      })
    } finally {
      cleanup()
    }
  })

  test('a config with no store: key, or an empty, comment-only or non-mapping document, carries no pointer', () => {
    for (const body of ['schema: feat\n', '', '# only a comment\n', '- a\n- b\n']) {
      const dir = repoWithConfig(body)
      try {
        expect(configStorePointer(dir)).toEqual({ filePath: join(dir, 'openspec', 'config.yaml') })
      } finally {
        cleanup()
      }
    }
  })

  test('an unparseable config is malformed: unparseable', () => {
    const dir = repoWithConfig('store: [\n')
    try {
      expect(configStorePointer(dir)).toEqual({
        filePath: join(dir, 'openspec', 'config.yaml'),
        malformed: 'unparseable',
      })
    } finally {
      cleanup()
    }
  })

  test('a non-string store: value is malformed: non_string', () => {
    for (const body of ['store: 3\n', 'store:\n  nested: true\n', 'store:\n  - a\n  - b\n']) {
      const dir = repoWithConfig(body)
      try {
        expect(configStorePointer(dir)).toEqual({
          filePath: join(dir, 'openspec', 'config.yaml'),
          malformed: 'non_string',
        })
      } finally {
        cleanup()
      }
    }
  })

  test('an empty-string store: value is a value of ""', () => {
    const dir = repoWithConfig('store: ""\n')
    try {
      expect(configStorePointer(dir)).toEqual({
        filePath: join(dir, 'openspec', 'config.yaml'),
        value: '',
      })
    } finally {
      cleanup()
    }
  })

  test('falls back to openspec/config.yml when there is no config.yaml', () => {
    const dir = repoWithConfig('store: alpha\n', 'config.yml')
    try {
      expect(configStorePointer(dir)).toEqual({
        filePath: join(dir, 'openspec', 'config.yml'),
        value: 'alpha',
      })
    } finally {
      cleanup()
    }
  })

  test('a references: list is not a store pointer (read-only context)', () => {
    const dir = repoWithConfig('schema: feat\nreferences:\n  - platform-reqs\n')
    try {
      expect(configStorePointer(dir)).toEqual({ filePath: join(dir, 'openspec', 'config.yaml') })
    } finally {
      cleanup()
    }
  })
})

describe('resolveRoot — qualifying ancestor walk', () => {
  test('a config-only openspec/ at the cwd is a nearest root', async () => {
    const dir = repoWithConfig('schema: feat\n')
    try {
      const root = await resolveRoot({ cwd: dir, flags: {} })
      expect(root).toEqual({
        base: canonical(dir),
        cwd: dir,
        storeArgs: [],
        store: undefined,
        source: 'nearest',
      })
    } finally {
      cleanup()
    }
  })

  test('a subdirectory of a planning root resolves the enclosing root', async () => {
    const dir = layout(tempDir('cospec-root-'), { dirs: ['openspec/changes', 'src/deep'] })
    try {
      const cwd = join(dir, 'src', 'deep')
      const root = await resolveRoot({ cwd, flags: {} })
      expect(root).toEqual({
        base: canonical(dir),
        cwd,
        storeArgs: [],
        store: undefined,
        source: 'nearest',
      })
    } finally {
      cleanup()
    }
  })

  test('a bare openspec/ is skipped mid-walk', async () => {
    const dir = layout(tempDir('cospec-root-'), {
      dirs: ['openspec/changes', 'inner/openspec', 'inner/x'],
    })
    try {
      const root = await resolveRoot({ cwd: join(dir, 'inner', 'x'), flags: {} })
      expect(root.base).toBe(canonical(dir))
      expect(root.source).toBe('nearest')
    } finally {
      cleanup()
    }
  })

  test('a symlinked cwd resolves the canonical enclosing root', async () => {
    const dir = layout(tempDir('cospec-root-'), { dirs: ['openspec/changes', 'src/deep'] })
    const link = join(tempDir('cospec-root-link-'), 'link')
    symlinkSync(join(dir, 'src'), link)
    try {
      const cwd = join(link, 'deep')
      const root = await resolveRoot({ cwd, flags: {} })
      expect(root.base).toBe(canonical(dir))
      expect(root.cwd).toBe(cwd)
      expect(root.source).toBe('nearest')
    } finally {
      cleanup()
    }
  })

  test('specs/ carrying store metadata is not a planning shape', async () => {
    await withGlobalConfig(undefined, async () => {
      const dir = layout(tempDir('cospec-root-'), {
        dirs: ['work'],
        files: { 'openspec/specs/.openspec-store/store.yaml': 'version: 1\nid: specs\n' },
      })
      const root = await resolveRoot({ cwd: join(dir, 'work'), flags: {} })
      expect(root.base).toBe(canonical(join(dir, 'work')))
      expect(root.source).toBe('implicit')
    })
  }, 15_000)

  test('changes/ as a regular file is not a planning shape', async () => {
    await withGlobalConfig(undefined, async () => {
      const dir = layout(tempDir('cospec-root-'), {
        dirs: ['work'],
        files: { 'openspec/changes': '' },
      })
      const root = await resolveRoot({ cwd: join(dir, 'work'), flags: {} })
      expect(root.base).toBe(canonical(join(dir, 'work')))
      expect(root.source).toBe('implicit')
    })
  }, 15_000)

  test('openspec/ with only project.md does not qualify', async () => {
    await withGlobalConfig(undefined, async () => {
      const dir = layout(tempDir('cospec-root-'), {
        dirs: ['work'],
        files: { 'openspec/project.md': '# Project\n' },
      })
      const root = await resolveRoot({ cwd: join(dir, 'work'), flags: {} })
      expect(root.source).toBe('implicit')
      expect(root.base).toBe(canonical(join(dir, 'work')))
    })
  }, 15_000)

  test('with no root and no stores registered, the cwd is an implicit root', async () => {
    await withGlobalConfig(undefined, async () => {
      const dir = bareDir()
      const root = await resolveRoot({ cwd: dir, flags: {} })
      expect(root).toEqual({
        base: canonical(dir),
        cwd: dir,
        storeArgs: [],
        store: undefined,
        source: 'implicit',
      })
    })
  }, 15_000)

  test('registered stores with no root fail with no_root_with_registered_stores', async () => {
    await withGlobalConfig(undefined, async (env) => {
      env.store('beta')
      env.store('alpha')
      const { diagnostic } = await rejection(resolveRoot({ cwd: bareDir(), flags: {} }))
      expect(diagnostic).toEqual({
        severity: 'error',
        code: 'no_root_with_registered_stores',
        message:
          'No OpenSpec root found in the current directory or its ancestors. Registered stores: ' +
          'alpha, beta. Pass --store <id> to use one, or run cospec init to create a local root.',
        target: 'openspec.root',
        fix: 'Rerun with --store <id> (registered: alpha, beta) or run cospec init.',
      })
    })
  }, 15_000)

  test('the $HOME/openspec/<id> store layout is never a phantom root', async () => {
    await withGlobalConfig(undefined, async (env) => {
      const home = tempDir('cospec-root-home-')
      env.store('homestore', join(home, 'openspec', 'homestore'))
      env.store('specs', join(home, 'openspec', 'specs'))
      const proj = layout(home, { dirs: ['work/proj'] })
      for (const cwd of [home, join(proj, 'work', 'proj')]) {
        const { diagnostic } = await rejection(resolveRoot({ cwd, flags: {} }))
        expect(diagnostic.code).toBe('no_root_with_registered_stores')
        expect(diagnostic.message).toContain('Registered stores: homestore, specs.')
      }
      const real = layout(join(home, 'work', 'real'), { dirs: ['openspec/changes', 'a'] })
      const root = await resolveRoot({ cwd: join(real, 'a'), flags: {} })
      expect(root.base).toBe(canonical(real))
      expect(root.source).toBe('nearest')
    })
  }, 15_000)
})

describe('resolveRoot — store pointer', () => {
  test('a config-only pointer is followed with provenance declared', async () => {
    await withGlobalConfig(undefined, async (env) => {
      const alpha = env.store('alpha')
      const dir = layout(repoWithConfig('store: alpha\n'), { dirs: ['deeper'] })
      for (const cwd of [dir, join(dir, 'deeper')]) {
        const root = await resolveRoot({ cwd, flags: JSON_FLAGS })
        expect(root).toEqual({
          base: canonical(alpha),
          cwd,
          storeArgs: [],
          store: 'alpha',
          source: 'declared',
        })
      }
    })
  }, 15_000)

  test('a config.yml-only pointer is followed', async () => {
    await withGlobalConfig(undefined, async (env) => {
      const alpha = env.store('alpha')
      const dir = repoWithConfig('store: alpha\n', 'config.yml')
      const root = await resolveRoot({ cwd: dir, flags: JSON_FLAGS })
      expect(root.base).toBe(canonical(alpha))
      expect(root.source).toBe('declared')
    })
  }, 15_000)

  test('a planning root ignores its pointer and warns once, naming the config and the id', async () => {
    await withGlobalConfig(undefined, async (env) => {
      env.store('alpha')
      const dir = layout(repoWithConfig('store: alpha\n'), { dirs: ['openspec/changes'] })
      const { value: root, stderr } = await captureStderr(() =>
        resolveRoot({ cwd: dir, flags: {} }),
      )
      expect(root.base).toBe(canonical(dir))
      expect(root.source).toBe('nearest')
      expect(root.store).toBeUndefined()
      const cfg = join(canonical(dir), 'openspec', 'config.yaml')
      expect(stderr).toBe(
        `Warning: ${cfg} declares store 'alpha', but this directory is a real OpenSpec root; ` +
          'the declaration is ignored.\n',
      )
    })
  }, 15_000)

  test('an empty-string pointer on a planning root warns naming an empty id', async () => {
    const dir = layout(repoWithConfig('store: ""\n'), { dirs: ['openspec/changes'] })
    try {
      const { value: root, stderr } = await captureStderr(() =>
        resolveRoot({ cwd: dir, flags: {} }),
      )
      expect(root.source).toBe('nearest')
      expect(stderr).toContain("declares store ''")
    } finally {
      cleanup()
    }
  })

  test('a malformed pointer on a planning root is ignored without a warning', async () => {
    const dir = layout(repoWithConfig('store: [unclosed\n'), { dirs: ['openspec/specs'] })
    try {
      const { value: root, stderr } = await captureStderr(() =>
        resolveRoot({ cwd: dir, flags: {} }),
      )
      expect(root.source).toBe('nearest')
      expect(stderr).toBe('')
    } finally {
      cleanup()
    }
  })

  test('an unparseable config-only pointer fails with invalid_store_pointer', async () => {
    const dir = repoWithConfig('store: [unclosed\n')
    try {
      const cfg = join(canonical(dir), 'openspec', 'config.yaml')
      const { diagnostic } = await rejection(resolveRoot({ cwd: dir, flags: {} }))
      expect(diagnostic).toEqual({
        severity: 'error',
        code: 'invalid_store_pointer',
        message: `Invalid store declaration in ${cfg}: the config file could not be read as YAML.`,
        target: 'store.pointer',
        fix: `Fix the YAML syntax in ${cfg}.`,
      })
    } finally {
      cleanup()
    }
  })

  test('a non-string config-only pointer fails with invalid_store_pointer', async () => {
    const dir = repoWithConfig('store:\n  - alpha\n  - beta\n')
    try {
      const cfg = join(canonical(dir), 'openspec', 'config.yaml')
      const { diagnostic } = await rejection(resolveRoot({ cwd: dir, flags: {} }))
      expect(diagnostic).toEqual({
        severity: 'error',
        code: 'invalid_store_pointer',
        message: `Invalid store declaration in ${cfg}: the store key must be a single store id string.`,
        target: 'store.pointer',
        fix: `Edit ${cfg} so the store key is a registered store id, or remove it.`,
      })
    } finally {
      cleanup()
    }
  })

  test('an empty-string config-only pointer fails with invalid_store_id', async () => {
    const dir = repoWithConfig('store: ""\n')
    try {
      const cfg = join(canonical(dir), 'openspec', 'config.yaml')
      const { diagnostic } = await rejection(resolveRoot({ cwd: dir, flags: {} }))
      expect(diagnostic).toEqual({
        severity: 'error',
        code: 'invalid_store_id',
        message: `Declared in ${cfg}: Store id must not be empty`,
        target: 'store.id',
        fix: 'Use kebab-case with lowercase letters, numbers, and single hyphen separators.',
      })
    } finally {
      cleanup()
    }
  })

  test('an unknown pointer id fails with unknown_store behind the declaration prefix', async () => {
    await withGlobalConfig(undefined, async (env) => {
      env.store('alpha')
      env.store('beta')
      const dir = repoWithConfig('store: nope\n')
      const cfg = join(canonical(dir), 'openspec', 'config.yaml')
      const { diagnostic } = await rejection(resolveRoot({ cwd: dir, flags: {} }))
      expect(diagnostic.code).toBe('unknown_store')
      expect(diagnostic.target).toBe('store.id')
      expect(diagnostic.message.startsWith(`Declared in ${cfg}: `)).toBe(true)
      expect(diagnostic.message).toContain('alpha, beta')
      expect(diagnostic.fix).toBe(
        `Register the store (cospec store register <path> --id nope) or edit ${cfg} to name a ` +
          'registered store.',
      )
    })
  }, 15_000)
})

describe('resolveRoot — store health (design D9)', () => {
  /** Register a healthy `gamma`, damage it with `breakIt`, then select it with `--store`. */
  async function brokenGamma(
    env: Env,
    breakIt: (root: string) => void,
  ): Promise<{ root: string; diagnostic: Diagnostic }> {
    const root = env.store('gamma')
    breakIt(root)
    const { diagnostic } = await rejection(
      resolveRoot({ cwd: bareDir(), flags: { store: 'gamma', json: true } }),
    )
    return { root, diagnostic }
  }

  test('missing identity metadata fails with store_identity_mismatch', async () => {
    await withGlobalConfig(undefined, async (env) => {
      const { root, diagnostic } = await brokenGamma(env, (r) =>
        rmSync(join(r, '.openspec-store', 'store.yaml')),
      )
      expect(diagnostic).toEqual({
        severity: 'error',
        code: 'store_identity_mismatch',
        message:
          `Store 'gamma' is missing identity metadata at ${join(root, '.openspec-store', 'store.yaml')}. ` +
          'Run cospec store doctor gamma to inspect it.',
        target: 'store.metadata',
        fix: 'Run cospec store doctor gamma to inspect it.',
      })
    })
  }, 15_000)

  test('a metadata id other than the registered id fails with store_identity_mismatch', async () => {
    await withGlobalConfig(undefined, async (env) => {
      const { diagnostic } = await brokenGamma(env, (r) =>
        writeFileSync(join(r, '.openspec-store', 'store.yaml'), 'version: 1\nid: zeta\n'),
      )
      expect(diagnostic.code).toBe('store_identity_mismatch')
      expect(diagnostic.message).toBe(
        "Store 'gamma' metadata id 'zeta' does not match its registered id. " +
          'Run cospec store doctor gamma to inspect it.',
      )
    })
  }, 15_000)

  test('unparseable metadata fails with invalid_store_metadata', async () => {
    await withGlobalConfig(undefined, async (env) => {
      const { diagnostic } = await brokenGamma(env, (r) =>
        writeFileSync(join(r, '.openspec-store', 'store.yaml'), 'version: [\n'),
      )
      expect(diagnostic.code).toBe('invalid_store_metadata')
      expect(diagnostic.target).toBe('store.metadata')
      expect(diagnostic.message.startsWith('Invalid store metadata state: ')).toBe(true)
      expect(diagnostic.fix).toBe('Repair .openspec-store/store.yaml.')
    })
  }, 15_000)

  test('a store without a config file fails with unhealthy_store_root', async () => {
    await withGlobalConfig(undefined, async (env) => {
      const { root, diagnostic } = await brokenGamma(env, (r) =>
        rmSync(join(r, 'openspec', 'config.yaml')),
      )
      expect(diagnostic).toEqual({
        severity: 'error',
        code: 'unhealthy_store_root',
        message:
          `Store 'gamma' does not have a healthy OpenSpec root at ${root}: Missing ` +
          'openspec/config.yaml or openspec/config.yml. Run cospec store doctor gamma to inspect it.',
        target: 'openspec.root',
        fix: 'Run cospec store doctor gamma to inspect it.',
      })
    })
  }, 15_000)

  test('a store whose openspec/specs is a file fails with unhealthy_store_root', async () => {
    await withGlobalConfig(undefined, async (env) => {
      const { diagnostic } = await brokenGamma(env, (r) => {
        rmSync(join(r, 'openspec', 'specs'), { recursive: true })
        writeFileSync(join(r, 'openspec', 'specs'), '')
      })
      expect(diagnostic.code).toBe('unhealthy_store_root')
      expect(diagnostic.message).toContain(': openspec/specs/ exists but is not a directory. Run')
    })
  }, 15_000)

  test('a store with no specs/ or changes/ is still healthy', async () => {
    await withGlobalConfig(undefined, async (env) => {
      const root = env.store('gamma')
      rmSync(join(root, 'openspec', 'specs'), { recursive: true })
      rmSync(join(root, 'openspec', 'changes'), { recursive: true })
      const resolved = await resolveRoot({ cwd: bareDir(), flags: { store: 'gamma', json: true } })
      expect(resolved.base).toBe(canonical(root))
      expect(resolved.source).toBe('store')
    })
  }, 15_000)

  test('a broken store reached through a pointer carries the declaration prefix', async () => {
    await withGlobalConfig(undefined, async (env) => {
      const root = env.store('gamma')
      rmSync(join(root, '.openspec-store', 'store.yaml'))
      const dir = repoWithConfig('store: gamma\n')
      const cfg = join(canonical(dir), 'openspec', 'config.yaml')
      const { diagnostic } = await rejection(resolveRoot({ cwd: dir, flags: JSON_FLAGS }))
      expect(diagnostic.code).toBe('store_identity_mismatch')
      expect(
        diagnostic.message.startsWith(`Declared in ${cfg}: Store 'gamma' is missing identity`),
      ).toBe(true)
      expect(diagnostic.fix).toBe('Run cospec store doctor gamma to inspect it.')
    })
  }, 15_000)

  test('a broken store reached through defaultStore carries the global-default prefix', async () => {
    await withGlobalConfig('gamma', async (env) => {
      const root = env.store('gamma')
      rmSync(join(root, '.openspec-store', 'store.yaml'))
      const { diagnostic } = await rejection(resolveRoot({ cwd: bareDir(), flags: JSON_FLAGS }))
      expect(diagnostic.code).toBe('store_identity_mismatch')
      expect(
        diagnostic.message.startsWith("Global defaultStore 'gamma': Store 'gamma' is missing"),
      ).toBe(true)
    })
  }, 15_000)
})

describe('resolveRoot — storeArgs by source (design D11)', () => {
  test('only an explicit --store is threaded; pointer and defaultStore roots thread nothing', async () => {
    await withGlobalConfig('beta', async (env) => {
      env.store('alpha')
      env.store('beta')
      const cases: [string, { store?: string; json: true }, RootSource, readonly string[]][] = [
        [bareDir(), { store: 'alpha', json: true }, 'store', ['--store', 'alpha']],
        [repoWithConfig('store: alpha\n'), { json: true }, 'declared', []],
        [bareDir(), { json: true }, 'global_default', []],
      ]
      for (const [cwd, flags, source, storeArgs] of cases) {
        const root = await resolveRoot({ cwd, flags })
        expect(root.source).toBe(source)
        expect(root.storeArgs).toEqual(storeArgs)
      }
    })
  }, 15_000)
})

describe('resolveRoot — store banner (design D10)', () => {
  const banner = (id: string, root: string): string =>
    `Using OpenSpec root: ${id} (${canonical(root)})\n`

  test('prints once for --store, pointer and defaultStore roots in human mode', async () => {
    await withGlobalConfig('beta', async (env) => {
      const alpha = env.store('alpha')
      const beta = env.store('beta')
      const pointer = repoWithConfig('store: alpha\n')
      const cases: [string, { store?: string }, string][] = [
        [bareDir(), { store: 'alpha' }, banner('alpha', alpha)],
        [pointer, {}, banner('alpha', alpha)],
        [bareDir(), {}, banner('beta', beta)],
      ]
      for (const [cwd, flags, expected] of cases) {
        const { stderr } = await captureStderr(() => resolveRoot({ cwd, flags }))
        expect(stderr).toBe(expected)
      }
    })
  }, 15_000)

  test('never prints under json, nor for a local or implicit root', async () => {
    await withGlobalConfig(undefined, async (env) => {
      env.store('alpha')
      const local = repoWithConfig('schema: feat\n')
      const quiet: [string, { store?: string; json?: boolean }][] = [
        [bareDir(), { store: 'alpha', json: true }],
        [local, {}],
      ]
      for (const [cwd, flags] of quiet) {
        const { stderr } = await captureStderr(() => resolveRoot({ cwd, flags }))
        expect(stderr).toBe('')
      }
    })
    await withGlobalConfig(undefined, async () => {
      const { value, stderr } = await captureStderr(() =>
        resolveRoot({ cwd: bareDir(), flags: {} }),
      )
      expect(value.source).toBe('implicit')
      expect(stderr).toBe('')
    })
  }, 15_000)
})

describe('resolveRoot — quiet (ledger 5.25, design D7, D8)', () => {
  test('prints no ignored-pointer warning or banner, and selects the same root', async () => {
    await withGlobalConfig(undefined, async (env) => {
      const alpha = env.store('alpha')
      const planning = layout(repoWithConfig('store: alpha\n'), { dirs: ['openspec/changes'] })
      const pointer = repoWithConfig('store: alpha\n')
      const { value, stderr } = await captureStderr(async () => [
        await resolveRoot({ cwd: planning, flags: {} }, { quiet: true }),
        await resolveRoot({ cwd: pointer, flags: {} }, { quiet: true }),
        await resolveRoot({ cwd: bareDir(), flags: { store: 'alpha' } }, { quiet: true }),
      ])
      expect(value.map((root) => root.base)).toEqual([
        canonical(planning),
        canonical(alpha),
        canonical(alpha),
      ])
      expect(value.map((root) => root.source)).toEqual(['nearest', 'declared', 'store'])
      expect(stderr).toBe('')
    })
    await withGlobalConfig('alpha', async (env) => {
      const alpha = env.store('alpha')
      const { value, stderr } = await captureStderr(() =>
        resolveRoot({ cwd: bareDir(), flags: {} }, { quiet: true }),
      )
      expect(value.base).toBe(canonical(alpha))
      expect(value.source).toBe('global_default')
      expect(stderr).toBe('')
    })
  }, 15_000)

  test('a quiet read of a config that is not JSON leaves the one warning to the next loud one', async () => {
    await withGlobalConfig(
      undefined,
      async () => {
        const path = join(process.env.XDG_CONFIG_HOME!, 'openspec', 'config.json')
        const quiet = await captureStderr(() =>
          resolveRoot({ cwd: bareDir(), flags: {} }, { quiet: true }),
        )
        expect(quiet.value.source).toBe('implicit')
        expect(quiet.stderr).toBe('')
        const loud = await captureStderr(() => resolveRoot({ cwd: bareDir(), flags: {} }))
        expect(loud.stderr).toBe(`Warning: Invalid JSON in ${path}, using defaults\n`)
      },
      '{"defaultStore": "beta"',
    )
  }, 15_000)
})

/**
 * The wrapped-binary argv (after `<bun> <openspec bin> --no-color`) of every
 * spawn `fn` makes, minus the memoized version assertion.
 */
async function spawnedArgs(fn: () => Promise<unknown>): Promise<string[][]> {
  const spy = spyOn(Bun, 'spawn')
  try {
    await fn()
    return spy.mock.calls
      .map((call) => (call[0] as string[]).slice(3))
      .filter((args) => !(args.length === 1 && args[0] === '--version'))
  } finally {
    spy.mockRestore()
  }
}

describe('resolveRoot — wrapped spawns', () => {
  test('a local root spawns nothing', async () => {
    const planning = layout(tempDir('cospec-root-'), { dirs: ['openspec/changes', 'src'] })
    const configOnly = repoWithConfig('schema: feat\n')
    const withPointer = layout(repoWithConfig('store: alpha\n'), { dirs: ['openspec/changes'] })
    try {
      for (const cwd of [join(planning, 'src'), configOnly, withPointer]) {
        const args = await spawnedArgs(() =>
          captureStderr(() => resolveRoot({ cwd, flags: JSON_FLAGS })),
        )
        expect(args).toEqual([])
      }
    } finally {
      cleanup()
    }
  })

  test('a store selection spawns only the registry listing', async () => {
    await withGlobalConfig(undefined, async (env) => {
      env.store('alpha')
      const args = await spawnedArgs(() =>
        resolveRoot({ cwd: bareDir(), flags: { store: 'alpha', json: true } }),
      )
      expect(args).toEqual([['store', 'ls', '--json']])
    })
  }, 15_000)
})

describe('resolveRoot — missing invocation directory (ledger 1.29)', () => {
  /** The thrown error for `cwd`, asserting it spawned nothing and has no `Fix:` line. */
  async function missing(
    cwd: string,
    flags: { store?: string } = {},
  ): Promise<{ error: Error; diagnostic: Diagnostic }> {
    let caught: unknown
    const args = await spawnedArgs(async () => {
      try {
        await resolveRoot({ cwd, flags })
      } catch (error) {
        caught = error
      }
    })
    expect(args).toEqual([])
    if (!(caught instanceof Error)) throw new Error('expected the resolver to throw an Error')
    const diagnostic = (caught as { diagnostic?: Diagnostic }).diagnostic
    if (diagnostic === undefined) throw new Error(`expected a diagnostic on: ${caught.message}`)
    expect(diagnostic).toEqual({
      severity: 'error',
      code: 'directory_not_found',
      message: `directory not found: ${cwd}`,
      target: 'cwd',
    })
    expect(caught.message).toBe(`directory not found: ${cwd}`)
    return { error: caught, diagnostic }
  }

  test('a nonexistent cwd fails with directory_not_found before any spawn', async () => {
    try {
      await missing(join(bareDir(), 'nope'))
    } finally {
      cleanup()
    }
  })

  test('a nonexistent cwd under a planning root does not walk up to it', async () => {
    const planning = layout(tempDir('cospec-root-'), { dirs: ['openspec/changes'] })
    try {
      await missing(join(planning, 'gone', 'deeper'))
    } finally {
      cleanup()
    }
  })

  test('an explicit --store does not bypass the check', async () => {
    try {
      await missing(join(bareDir(), 'nope'), { store: 'alpha' })
    } finally {
      cleanup()
    }
  })

  test('a regular file, or a path through one, is not a directory', async () => {
    const dir = layout(bareDir(), { files: { 'file.txt': 'x' } })
    try {
      await missing(join(dir, 'file.txt'))
      await missing(join(dir, 'file.txt', 'below'))
    } finally {
      cleanup()
    }
  })
})

describe('readDefaultStore', () => {
  test('undefined when the global config has no defaultStore set', async () => {
    await withGlobalConfig(undefined, async () => {
      expect(await readDefaultStore(bareDir())).toBeUndefined()
    })
  }, 15_000)

  test('reads the value from the global config file `openspec config path` names', async () => {
    await withGlobalConfig('team-plans', async () => {
      expect(await readDefaultStore(bareDir())).toBe('team-plans')
    })
  }, 15_000)

  for (const raw of [' beta ', 'beta\n', ['beta'], 5, false, '', {}]) {
    test(`returns ${JSON.stringify(raw)} raw, as upstream's getGlobalConfig does`, async () => {
      await withGlobalConfig(raw, async () => {
        expect(await readDefaultStore(bareDir())).toEqual(raw)
      })
    }, 15_000)
  }

  for (const [label, body] of [
    ['a JSON root that is not an object', '"beta"'],
    ['a JSON array root', '[{"defaultStore": "beta"}]'],
  ] as const) {
    test(`undefined for ${label}, as upstream falls back to its defaults`, async () => {
      await withGlobalConfig(
        undefined,
        async () => {
          const { value, stderr } = await captureStderr(() => readDefaultStore(bareDir()))
          expect(value).toBeUndefined()
          expect(stderr).toBe('')
        },
        body,
      )
    }, 15_000)
  }

  test("undefined for a file that is not JSON, with upstream's warning printed once", async () => {
    await withGlobalConfig(
      undefined,
      async () => {
        const path = join(process.env.XDG_CONFIG_HOME!, 'openspec', 'config.json')
        const { value, stderr } = await captureStderr(async () => [
          await readDefaultStore(bareDir()),
          await readDefaultStore(bareDir()),
        ])
        expect(value).toEqual([undefined, undefined])
        expect(stderr).toBe(`Warning: Invalid JSON in ${path}, using defaults\n`)
      },
      '{"defaultStore": "beta"',
    )
  }, 15_000)

  const unreadable: [string, (path: string) => void][] = [
    ['a directory', (path) => mkdirSync(path, { recursive: true })],
    ...(process.getuid?.() === 0
      ? []
      : [
          [
            'a file it may not read',
            (path: string) => {
              mkdirSync(join(path, '..'), { recursive: true })
              writeFileSync(path, '{"defaultStore": "beta"}')
              chmodSync(path, 0o000)
            },
          ] as [string, (path: string) => void],
        ]),
  ]
  for (const [label, place] of unreadable)
    test(`undefined, silently, when the config path is ${label}, as upstream reads defaults`, async () => {
      await withGlobalConfig(undefined, async () => {
        const path = join(process.env.XDG_CONFIG_HOME!, 'openspec', 'config.json')
        place(path)
        try {
          const { value, stderr } = await captureStderr(() => readDefaultStore(bareDir()))
          expect(value).toBeUndefined()
          expect(stderr).toBe('')
        } finally {
          chmodSync(path, 0o755)
        }
      })
    }, 15_000)
})

describe('resolveRoot — defaultStore fallback (W8)', () => {
  test('is consulted ONLY after local-root resolution fails — a local openspec/ wins even with defaultStore set', async () => {
    await withGlobalConfig('elsewhere', async (env) => {
      env.store('elsewhere')
      const dir = repoWithConfig('schema: feat\n')
      const root = await resolveRoot({ cwd: dir, flags: {} })
      expect(root).toEqual({
        base: canonical(dir),
        cwd: dir,
        storeArgs: [],
        store: undefined,
        source: 'nearest',
      })
    })
  }, 15_000)

  test('falls back to a registered defaultStore once local-root resolution fails', async () => {
    await withGlobalConfig('team-plans', async (env) => {
      const storeRoot = env.store('team-plans')
      const dir = bareDir()
      const root = await resolveRoot({ cwd: dir, flags: JSON_FLAGS })
      expect(root).toEqual({
        base: canonical(storeRoot),
        cwd: dir,
        storeArgs: [],
        store: 'team-plans',
        source: 'global_default',
      })
    })
  }, 15_000)

  test('a stale defaultStore (no longer registered) fails loudly, same as an unknown --store — never a silent further fallback', async () => {
    await withGlobalConfig('ghost-store', async (env) => {
      env.store('alpha')
      const { error, diagnostic } = await rejection(resolveRoot({ cwd: bareDir(), flags: {} }))
      expect(error.message).toMatch(/unknown store 'ghost-store'/)
      expect(diagnostic.code).toBe('unknown_store')
      expect(diagnostic.message.startsWith("Global defaultStore 'ghost-store': ")).toBe(true)
      expect(diagnostic.fix).toBe(
        'Register the store (cospec store register <path> --id ghost-store) or clear the stale ' +
          'global default (cospec config unset defaultStore).',
      )
    })
  }, 15_000)

  test('an explicit --store flag still outranks defaultStore (existing precedence, unchanged)', async () => {
    await withGlobalConfig('team-plans', async (env) => {
      env.store('team-plans')
      const flagStoreRoot = env.store('flag-store')
      const root = await resolveRoot({
        cwd: bareDir(),
        flags: { store: 'flag-store', json: true },
      })
      expect(root.store).toBe('flag-store')
      expect(root.base).toBe(canonical(flagStoreRoot))
      expect(root.source).toBe('store')
    })
  }, 15_000)
})

describe('resolveRoot — unknown --store', () => {
  test('an unregistered --store id fails with unknown_store, naming the registered stores', async () => {
    await withGlobalConfig(undefined, async (env) => {
      env.store('alpha')
      const { diagnostic } = await rejection(
        resolveRoot({ cwd: bareDir(), flags: { store: 'nope' } }),
      )
      expect(diagnostic.code).toBe('unknown_store')
      expect(diagnostic.target).toBe('store.id')
      expect(diagnostic.message).toContain("unknown store 'nope'")
      expect(diagnostic.message).toContain('Registered stores: alpha')
    })
  }, 15_000)

  test('with no stores registered it fails with no_registered_stores', async () => {
    await withGlobalConfig(undefined, async () => {
      const { diagnostic } = await rejection(
        resolveRoot({ cwd: bareDir(), flags: { store: 'nope' } }),
      )
      expect(diagnostic.code).toBe('no_registered_stores')
      expect(diagnostic.target).toBe('store.id')
    })
  }, 15_000)
})

describe('rootSelectionDocument (design D12)', () => {
  test('prints the diagnostic as the one status document, keys in upstream order', () => {
    const error = new RootSelectionError({
      fix: 'Run cospec init.',
      target: 'openspec.root',
      message: 'No root.',
      code: 'no_root_with_registered_stores',
    })
    expect(rootSelectionDocument(error)).toBe(
      '{\n  "status": [\n    {\n      "severity": "error",\n' +
        '      "code": "no_root_with_registered_stores",\n      "message": "No root.",\n' +
        '      "target": "openspec.root",\n      "fix": "Run cospec init."\n    }\n  ]\n}\n',
    )
  })

  test("a command's payload comes first, then status, as upstream's failurePayload", () => {
    const error = new RootSelectionError({
      code: 'unknown_store',
      message: 'Unknown store.',
      target: 'store.id',
      fix: 'Pass a registered store id, or run cospec store list.',
    })
    const text = rootSelectionDocument(error, { schemas: [], root: null })
    expect(Object.keys(JSON.parse(text) as object)).toEqual(['schemas', 'root', 'status'])
    expect(text).toBe(
      '{\n  "schemas": [],\n  "root": null,\n  "status": [\n    {\n' +
        '      "severity": "error",\n      "code": "unknown_store",\n' +
        '      "message": "Unknown store.",\n      "target": "store.id",\n' +
        '      "fix": "Pass a registered store id, or run cospec store list."\n    }\n  ]\n}\n',
    )
  })

  test('a diagnostic with no fix has no fix key', () => {
    const error = new RootSelectionError({
      code: 'directory_not_found',
      message: 'directory not found: /x',
      target: 'cwd',
    })
    const doc = JSON.parse(rootSelectionDocument(error)) as { status: object[] }
    expect(doc).toEqual({
      status: [
        {
          severity: 'error',
          code: 'directory_not_found',
          message: 'directory not found: /x',
          target: 'cwd',
        },
      ],
    })
    expect(Object.keys(doc.status[0]!)).not.toContain('fix')
  })
})

/** Await a resolver call expected to fail raw (ledger 5.23), checking its diagnostic. */
async function rawRejection(promise: Promise<unknown>, message: string): Promise<void> {
  let caught: unknown
  try {
    await promise
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(RootSelectionError)
  const error = caught as RootSelectionError
  expect(error.message).toBe(message)
  expect(error.diagnostic).toEqual({ severity: 'error', code: 'store_error', message })
}

const storeMetadataFile = (root: string): string => join(root, '.openspec-store', 'store.yaml')

describe('resolveRoot — raw read failures (ledger 5.23)', () => {
  // Upstream rethrows every read failure but ENOENT raw from the selected
  // store's reads (`readOptionalStoreMetadataState`, `inspectOpenSpecRoot`'s
  // `pathKind`): no origin prefix, no target, no fix, and Node's message. The
  // pointer read and the ancestor walk treat every failure as upstream does:
  // an unreadable pointer is malformed, an unreadable directory not a root.
  const RUNNING_AS_ROOT = process.getuid?.() === 0
  const maybe = RUNNING_AS_ROOT ? test.skip : test

  test('store.yaml as a directory fails with the errno message naming the path', async () => {
    await withGlobalConfig(undefined, async (env) => {
      const root = env.store('gamma')
      rmSync(storeMetadataFile(root))
      mkdirSync(storeMetadataFile(root))
      await rawRejection(
        resolveRoot({ cwd: bareDir(), flags: { store: 'gamma', json: true } }),
        `EISDIR: illegal operation on a directory, read '${storeMetadataFile(root)}'`,
      )
    })
  }, 15_000)

  maybe(
    'store.yaml at mode 000 fails with EACCES',
    async () => {
      await withGlobalConfig(undefined, async (env) => {
        const root = env.store('gamma')
        chmodSync(storeMetadataFile(root), 0o000)
        try {
          await rawRejection(
            resolveRoot({ cwd: bareDir(), flags: { store: 'gamma', json: true } }),
            `EACCES: permission denied, open '${storeMetadataFile(root)}'`,
          )
        } finally {
          chmodSync(storeMetadataFile(root), 0o644)
        }
      })
    },
    15_000,
  )

  test('.openspec-store as a file fails with ENOTDIR', async () => {
    await withGlobalConfig(undefined, async (env) => {
      const root = env.store('gamma')
      rmSync(join(root, '.openspec-store'), { recursive: true })
      writeFileSync(join(root, '.openspec-store'), '')
      await rawRejection(
        resolveRoot({ cwd: bareDir(), flags: { store: 'gamma', json: true } }),
        `ENOTDIR: not a directory, open '${storeMetadataFile(root)}'`,
      )
    })
  }, 15_000)

  test('store.yaml as a symlink loop fails with ELOOP', async () => {
    await withGlobalConfig(undefined, async (env) => {
      const root = env.store('gamma')
      rmSync(storeMetadataFile(root))
      symlinkSync('store.yaml', storeMetadataFile(root))
      await rawRejection(
        resolveRoot({ cwd: bareDir(), flags: { store: 'gamma', json: true } }),
        `ELOOP: too many symbolic links encountered, open '${storeMetadataFile(root)}'`,
      )
    })
  }, 15_000)

  maybe(
    "a store whose openspec/ is mode 000 fails with the stat's EACCES",
    async () => {
      await withGlobalConfig(undefined, async (env) => {
        const root = env.store('gamma')
        const configYaml = join(root, 'openspec', 'config.yaml')
        chmodSync(join(root, 'openspec'), 0o000)
        try {
          // resolveRoot's raw passthrough must equal THIS runtime's own stat
          // error for the same path, not a fixed string: libuv's stat call
          // names the syscall `statx` on Linux and `stat` on macOS (Bun and
          // Node can differ here too), so the expected message is captured
          // from the runtime rather than hardcoded — a strict, not a loosened,
          // assertion (see docs/architecture.md, "raw read failures").
          let expected: string | undefined
          try {
            statSync(configYaml)
          } catch (error) {
            expected = (error as NodeJS.ErrnoException).message
          }
          if (expected === undefined) {
            throw new Error('expected statSync to throw EACCES on a mode-000 parent')
          }
          await rawRejection(
            resolveRoot({ cwd: bareDir(), flags: { store: 'gamma', json: true } }),
            expected,
          )
        } finally {
          chmodSync(join(root, 'openspec'), 0o755)
        }
      })
    },
    15_000,
  )

  test('a raw failure through a pointer or defaultStore carries no origin prefix', async () => {
    await withGlobalConfig('gamma', async (env) => {
      const root = env.store('gamma')
      rmSync(storeMetadataFile(root))
      mkdirSync(storeMetadataFile(root))
      const message = `EISDIR: illegal operation on a directory, read '${storeMetadataFile(root)}'`
      await rawRejection(
        resolveRoot({ cwd: repoWithConfig('store: gamma\n'), flags: JSON_FLAGS }),
        message,
      )
      await rawRejection(resolveRoot({ cwd: bareDir(), flags: JSON_FLAGS }), message)
    })
  }, 15_000)

  test('a pointer file that cannot be read is malformed, as upstream reads it', async () => {
    await withGlobalConfig(undefined, async (env) => {
      env.store('gamma')
      const files = ['config.yaml', 'config.yml']
      const dirs = files.map((file) => {
        const dir = repoWithConfig(undefined)
        mkdirSync(join(dir, 'openspec', file), { recursive: true })
        return dir
      })
      const results = await Promise.all(
        dirs.map((dir) => rejection(resolveRoot({ cwd: dir, flags: JSON_FLAGS }))),
      )
      for (const [i, { diagnostic }] of results.entries()) {
        expect(diagnostic.code).toBe('invalid_store_pointer')
        expect(diagnostic.message).toBe(
          `Invalid store declaration in ${join(canonical(dirs[i]!), 'openspec', files[i]!)}: ` +
            'the config file could not be read as YAML.',
        )
      }
    })
  }, 15_000)

  maybe(
    'an openspec/ the walk cannot read is not a root, as upstream walks',
    async () => {
      await withGlobalConfig(undefined, async () => {
        const dir = layout(bareDir(), { dirs: ['openspec/changes'] })
        chmodSync(join(dir, 'openspec'), 0o000)
        try {
          const root = await resolveRoot({ cwd: dir, flags: JSON_FLAGS })
          expect(root.source).toBe('implicit')
          expect(root.base).toBe(canonical(dir))
        } finally {
          chmodSync(join(dir, 'openspec'), 0o755)
        }
      })
    },
    15_000,
  )
})
