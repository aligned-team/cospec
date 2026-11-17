// The readdir preload (change `wrapped-readdir-node-order`, ledger 1.2): behind
// it, every import form the pinned dist lists a directory through returns what
// the same script returns under Node — entries sorted by the bytes of each name
// — where Bun alone returns the filesystem's own order.

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

describe.skipIf(process.platform === 'win32')('the readdir preload lists as Node does', () => {
  test('precondition: Node sorts by name bytes, and Bun alone lists another order', () => {
    const node = underNode()
    const byBytes = [...CREATION_ORDER, 'zfile.txt'].toSorted((a, b) =>
      Buffer.compare(Buffer.from(a), Buffer.from(b)),
    )
    expect(node.nsNodeFsSync).toEqual(byBytes)
    expect(run([process.execPath, CONSUMER, dir]).nsNodeFsSync).not.toEqual(byBytes)
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
