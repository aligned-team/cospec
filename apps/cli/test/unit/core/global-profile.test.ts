// Task 5.1 of workflow-profiles: the one reader of the machine-global workflow settings. It
// runs the real `openspec config path`, so every row points XDG_CONFIG_HOME at a temp dir.

import { afterEach, describe, expect, test } from 'bun:test'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readGlobalProfile } from '../../../src/core/global-profile.ts'

const temps: string[] = []
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** Runs `fn` with XDG_CONFIG_HOME holding `body` as the global config file (absent: undefined). */
async function withConfig<T>(
  body: string | object | undefined,
  fn: (path: string, cwd: string) => Promise<T>,
): Promise<T> {
  const xdg = mkdtempSync(join(tmpdir(), 'cospec-gprofile-'))
  temps.push(xdg)
  const path = join(xdg, 'openspec', 'config.json')
  if (body !== undefined) {
    mkdirSync(join(xdg, 'openspec'), { recursive: true })
    writeFileSync(path, typeof body === 'string' ? body : JSON.stringify(body))
  }
  const prev = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = xdg
  try {
    return await fn(path, xdg)
  } finally {
    if (prev === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = prev
  }
}

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

describe('readGlobalProfile: explicit means the key is present', () => {
  test('a missing file sets nothing', async () => {
    await withConfig(undefined, async (_p, cwd) => {
      expect(await readGlobalProfile(cwd)).toEqual({})
    })
  }, 15_000)

  test('a file with unrelated keys sets nothing', async () => {
    await withConfig({ featureFlags: {}, defaultStore: 'x' }, async (_p, cwd) => {
      expect(await readGlobalProfile(cwd)).toEqual({})
    })
  }, 15_000)

  test('profile core and custom are read as written, with their workflows', async () => {
    await withConfig({ profile: 'core' }, async (_p, cwd) => {
      expect(await readGlobalProfile(cwd)).toEqual({ profile: 'core' })
    })
    await withConfig({ profile: 'custom', workflows: ['propose', 'sync'] }, async (_p, cwd) => {
      expect(await readGlobalProfile(cwd)).toEqual({
        profile: 'custom',
        workflows: ['propose', 'sync'],
      })
    })
  }, 15_000)

  test('profile: null is explicit, and selects core', async () => {
    await withConfig({ profile: null }, async (_p, cwd) => {
      const read = await readGlobalProfile(cwd)
      expect('profile' in read).toBe(true)
      expect(read.profile).toBe('core')
    })
  }, 15_000)

  test('an unrecognised profile value selects core', async () => {
    for (const value of ['bogus', 'CUSTOM', '', 5, false, ['custom'], {}]) {
      await withConfig({ profile: value }, async (_p, cwd) => {
        expect((await readGlobalProfile(cwd)).profile).toBe('core')
      })
    }
  }, 15_000)

  test('workflows is kept raw, and present on its own', async () => {
    for (const raw of [['a'], 'propose', 5, null, {}, []]) {
      await withConfig({ workflows: raw }, async (_p, cwd) => {
        const read = await readGlobalProfile(cwd)
        expect(read).toEqual({ workflows: raw })
      })
    }
  }, 15_000)

  test('delivery skills and commands are read; any other present value acts as both', async () => {
    for (const [raw, expected] of [
      ['skills', 'skills'],
      ['commands', 'commands'],
      ['both', 'both'],
      ['bogus', 'both'],
      [null, 'both'],
      [3, 'both'],
    ] as const) {
      await withConfig({ delivery: raw }, async (_p, cwd) => {
        expect(await readGlobalProfile(cwd)).toEqual({ delivery: expected })
      })
    }
  }, 15_000)

  test('a delivery alone sets no profile (it is not an explicit profile)', async () => {
    await withConfig({ delivery: 'both' }, async (_p, cwd) => {
      expect('profile' in (await readGlobalProfile(cwd))).toBe(false)
    })
  }, 15_000)
})

describe('readGlobalProfile: a file it cannot use sets nothing', () => {
  for (const [label, body] of [
    ['invalid JSON', '{"profile": "custom"'],
    ['a string root', '"custom"'],
    ['an array root', '[{"profile": "custom"}]'],
    ['a null root', 'null'],
  ] as const) {
    test(`${label}, with no warning unless asked`, async () => {
      await withConfig(body, async (_p, cwd) => {
        const { value, stderr } = await captureStderr(() => readGlobalProfile(cwd))
        expect(value).toEqual({})
        expect(stderr).toBe('')
      })
    }, 15_000)
  }

  test('a directory at the config path', async () => {
    await withConfig(undefined, async (path, cwd) => {
      mkdirSync(path, { recursive: true })
      expect(await readGlobalProfile(cwd)).toEqual({})
    })
  }, 15_000)

  if (process.getuid?.() !== 0) {
    test('a file it may not read', async () => {
      await withConfig({ profile: 'custom' }, async (path, cwd) => {
        chmodSync(path, 0o000)
        try {
          expect(await readGlobalProfile(cwd)).toEqual({})
        } finally {
          chmodSync(path, 0o644)
        }
      })
    }, 15_000)
  }

  test("invalid JSON with warn: true prints upstream's line once", async () => {
    await withConfig('{"profile":', async (path, cwd) => {
      const { value, stderr } = await captureStderr(async () => [
        await readGlobalProfile(cwd, { warn: true }),
        await readGlobalProfile(cwd, { warn: true }),
      ])
      expect(value).toEqual([{}, {}])
      expect(stderr).toBe(`Warning: Invalid JSON in ${path}, using defaults\n`)
    })
  }, 15_000)
})
