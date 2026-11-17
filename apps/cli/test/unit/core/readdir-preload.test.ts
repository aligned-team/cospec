// The readdir preload (change `wrapped-readdir-node-order`, ledger 1.2): behind
// it, every import form the pinned dist lists a directory through returns what
// the same script returns under Node — entries sorted by the bytes of each name
// — where Bun alone returns the filesystem's own order. The sorting itself is
// proven on entries handed over unsorted by a stand-in `fs`, so it holds on a
// filesystem that already lists byte order too.

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { READDIR_PRELOAD_SOURCE, readdirPreload } from '../../../src/core/readdir-preload.ts'

const scratch = mkdtempSync(join(tmpdir(), 'cospec-readdir-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/**
 * Created in an order that is neither byte order nor its reverse. Mixed case and digits keep
 * byte order apart from case-folded and numeric order; the fullwidth `Ａ` (U+FF21) sorts before
 * the emoji by UTF-8 bytes (`EF` < `F0`), as `strcmp` sorts them, but after it by UTF-16 code
 * units (`FF21` > `D83D`), as a plain `Array#sort` would.
 */
const CREATION_ORDER = ['mid', 'zeta', 'Beta', 'c2', '\u{1F600}x', 'alpha', 'c10', 'Ａ', 'c1']

const dir = join(scratch, 'entries')
mkdirSync(dir)
for (const name of CREATION_ORDER) mkdirSync(join(dir, name))
writeFileSync(join(dir, 'zfile.txt'), '')

/** Every form the pinned dist lists a directory through, one JSON line of results. */
const CONSUMER = join(scratch, 'consumer.mjs')
writeFileSync(
  CONSUMER,
  `import * as nsNodeFs from 'node:fs'
import * as nsFs from 'fs'
import defaultFs, { promises as namedPromises, readdirSync as namedSync } from 'fs'
import * as nsNodeFsPromises from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cjsFs = require('fs')
const dir = process.argv[2]
// Bytes compare as hex: Node answers \`encoding: 'buffer'\` with Buffers, Bun with Uint8Arrays.
const names = (entries) => entries.map((e) => (typeof e === 'string' ? e : e instanceof Uint8Array ? Buffer.from(e).toString('hex') : e.name))
const callback = (...args) => new Promise((resolve, reject) =>
  cjsFs.readdir(dir, ...args, (error, entries) => (error ? reject(error) : resolve(entries))))
console.log(JSON.stringify({
  nsNodeFsSync: names(nsNodeFs.readdirSync(dir)),
  nsFsSync: names(nsFs.readdirSync(dir)),
  defaultSync: names(defaultFs.readdirSync(dir)),
  namedSync: names(namedSync(dir)),
  syncDirents: names(nsNodeFs.readdirSync(dir, { withFileTypes: true })),
  syncBuffers: names(nsNodeFs.readdirSync(dir, { encoding: 'buffer' })),
  nsPromises: names(await nsNodeFs.promises.readdir(dir)),
  namedPromises: names(await namedPromises.readdir(dir)),
  nsNodeFsPromises: names(await nsNodeFsPromises.readdir(dir)),
  promisesDirents: names(await namedPromises.readdir(dir, { withFileTypes: true })),
  callback: names(await callback()),
  callbackDirents: names(await callback({ withFileTypes: true })),
}))
`,
)

function run(cmd: string[]): Record<string, string[]> {
  const proc = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' })
  if (proc.exitCode !== 0) throw new Error(`${cmd.join(' ')}: ${proc.stderr.toString()}`)
  return JSON.parse(proc.stdout.toString()) as Record<string, string[]>
}

function underNode(): Record<string, string[]> {
  const node = Bun.which('node')
  if (node === null) throw new Error('`node` is not on PATH, so the Node order cannot be read')
  return run([node, CONSUMER, dir])
}

const BY_BYTES = [...CREATION_ORDER, 'zfile.txt'].toSorted((a, b) =>
  Buffer.compare(Buffer.from(a), Buffer.from(b)),
)

interface StandIn {
  readdirSync: (...args: unknown[]) => unknown
  readdir: (...args: unknown[]) => unknown
  promises: { readdir: (...args: unknown[]) => Promise<unknown> }
}

/**
 * Runs the preload source against a stand-in `fs` whose listings are `entries()` — always
 * unsorted — on `platform`, and returns that `fs` as the preload left it.
 */
function behindPreload(entries: () => unknown[], platform = 'linux'): StandIn {
  const promises = { readdir: async (): Promise<unknown> => entries() }
  const fs: StandIn = {
    readdirSync: () => entries(),
    readdir: (...args) => (args.at(-1) as (e: null, l: unknown) => void)(null, entries()),
    promises,
  }
  const load = new Function('require', 'process', READDIR_PRELOAD_SOURCE) as (
    require: (id: string) => unknown,
    process: { platform: string },
  ) => void
  load((id) => (id === 'node:fs' ? fs : id === 'node:fs/promises' ? promises : undefined), {
    platform,
  })
  return fs
}

const UNSORTED = [...CREATION_ORDER, 'zfile.txt']

describe('the readdir preload sorts what it is handed, whatever the filesystem lists', () => {
  test('every form returns names in byte order', async () => {
    const fs = behindPreload(() => [...UNSORTED])
    expect(fs.readdirSync('x')).toEqual(BY_BYTES)
    expect(await fs.promises.readdir('x')).toEqual(BY_BYTES)
    const viaCallback = await new Promise((resolve) =>
      fs.readdir('x', {}, (_: null, l: unknown) => resolve(l)),
    )
    expect(viaCallback).toEqual(BY_BYTES)
  })

  test('Dirents sort by name, byte arrays by their bytes', () => {
    const dirents = behindPreload(() => UNSORTED.map((name) => ({ name })))
    expect(
      (dirents.readdirSync('x', { withFileTypes: true }) as { name: string }[]).map((d) => d.name),
    ).toEqual(BY_BYTES)
    const bytes = behindPreload(() => UNSORTED.map((name) => new TextEncoder().encode(name)))
    expect(
      (bytes.readdirSync('x', { encoding: 'buffer' }) as Uint8Array[]).map((b) =>
        new TextDecoder().decode(b),
      ),
    ).toEqual(BY_BYTES)
  })

  test('a recursive read, and every read on Windows, keeps the order it was handed', () => {
    expect(behindPreload(() => [...UNSORTED]).readdirSync('x', { recursive: true })).toEqual(
      UNSORTED,
    )
    expect(behindPreload(() => [...UNSORTED], 'win32').readdirSync('x')).toEqual(UNSORTED)
  })
})

describe.skipIf(process.platform === 'win32')('the readdir preload lists as Node does', () => {
  test('precondition: Node sorts by name bytes', () => {
    expect(underNode().nsNodeFsSync).toEqual(BY_BYTES)
  })

  test('behind the preload, every form returns exactly what Node returns', () => {
    expect(run([process.execPath, '--preload', readdirPreload(), CONSUMER, dir])).toEqual(
      underNode(),
    )
  })

  test('a recursive read passes through untouched', () => {
    const script = `const fs = require('node:fs'); console.log(JSON.stringify({ r: fs.readdirSync(process.argv[2], { recursive: true }) }))`
    const recursive = join(scratch, 'recursive.cjs')
    writeFileSync(recursive, script)
    expect(run([process.execPath, '--preload', readdirPreload(), recursive, dir])).toEqual(
      run([process.execPath, recursive, dir]),
    )
  })

  test('readdirPreload writes the source, content-addressed and stable', () => {
    const path = readdirPreload()
    expect(path).toMatch(/readdir-preload-[0-9a-f]{16}\.cjs$/)
    expect(readFileSync(path, 'utf8')).toBe(READDIR_PRELOAD_SOURCE)
    expect(readdirPreload()).toBe(path)
  })
})
