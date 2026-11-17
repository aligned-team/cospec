// Wrapped calls list directories in Node's order (change
// `wrapped-readdir-node-order`, ledger 1.1): the pinned binary under Node lists
// a directory sorted by the bytes of each name (libuv's `scandir` sorts with
// `strcmp`), while Bun returns the filesystem's own order. Every row here runs
// on a root whose change directories the filesystem returns out of byte order —
// asserted, so the row discriminates on any runner rather than by hash seed.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, REPO_ROOT, type SpawnResult } from '../fixtures/support.ts'
import { oracle, oracleEnv, scaffoldOracleRoot } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

let upstreamTemplate: string

beforeAll(async () => {
  upstreamTemplate = await scaffoldOracleRoot()
}, 60_000)

/**
 * Created in an order that is neither byte order nor its reverse, so neither a
 * creation-ordered nor a newest-first filesystem lists them sorted; mixed case
 * and digits so byte order differs from any case-folded or numeric order.
 */
const CREATION_ORDER = ['mid', 'zeta', 'Beta', 'c2', 'alpha', 'c10', 'c1']

const byBytes = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b))

/** A root `openspec init` scaffolded, its changes `CREATION_ORDER`, in that order. */
function unsortedRoot(): string {
  const dir = mkTempRepo()
  cpSync(join(upstreamTemplate, 'openspec'), join(dir, 'openspec'), { recursive: true })
  for (const name of CREATION_ORDER) mkdirSync(join(dir, 'openspec', 'changes', name))
  return dir
}

function runCospec(argv: readonly string[], root: string): Promise<SpawnResult> {
  return cospec(['--', ...argv], { cwd: root, env: oracleEnv(root) })
}

function runUpstream(argv: readonly string[], root: string): Promise<SpawnResult> {
  return oracle([...argv], root, { runtime: 'node' })
}

/** The message of a `--json` refusal: its `status[0].message`. */
function statusMessage(stdout: string): string {
  const doc = JSON.parse(stdout) as { status?: { message?: string }[] }
  return doc.status?.[0]?.message ?? ''
}

/** The change names an `Available changes:` answer lists, in its order. */
function listedChanges(text: string): string[] {
  const after = text.split('Available changes:')[1] ?? ''
  return after
    .split('\n')
    .map((line) => line.trim())
    .filter((name) => CREATION_ORDER.includes(name))
}

describe('a wrapped call lists change directories in the order the binary lists them under Node', () => {
  test('precondition: this filesystem returns the changes out of byte order', () => {
    const root = unsortedRoot()
    const listed = readdirSync(join(root, 'openspec', 'changes')).filter((name) =>
      CREATION_ORDER.includes(name),
    )
    expect(listed).not.toEqual(CREATION_ORDER.toSorted(byBytes))
  })

  for (const asJson of [false, true]) {
    const argv = ['instructions', ...(asJson ? ['--json'] : [])]
    test(`${argv.join(' ')}: the available changes and every byte match the binary's`, async () => {
      const root = unsortedRoot()
      const c = await runCospec(argv, root)
      const u = await runUpstream(argv, root)
      expect(u.exitCode).toBe(1)
      expect(listedChanges(asJson ? statusMessage(u.stdout) : u.stderr)).toEqual(
        CREATION_ORDER.toSorted(byBytes),
      )
      expect({ exit: c.exitCode, stdout: c.stdout, stderr: c.stderr }).toEqual({
        exit: u.exitCode,
        stdout: u.stdout,
        stderr: u.stderr,
      })
    }, 30_000)
  }
})

/**
 * Every directory listing in `source` the readdir preload does not cover: an `opendir` or
 * `glob` call, or a `readdir` call whose arguments ask for a recursive read.
 */
function uncoveredListings(source: string): string[] {
  const uncovered: string[] = []
  for (const match of source.matchAll(
    /\.(readdir|readdirSync|opendir|opendirSync|glob|globSync)\(/g,
  )) {
    const call = source.slice(match.index, source.indexOf(')', match.index) + 1)
    if (!match[1]!.startsWith('readdir') || /\brecursive\b/.test(call)) uncovered.push(call)
  }
  return uncovered
}

describe('the pinned dist lists directories only through the forms the readdir preload covers', () => {
  // The vendored bundle is the pinned dist and every dependency it runs (fast-glob's walker
  // included), drift-gated against a fresh build of the pin.
  const bundle = join(REPO_ROOT, 'apps/cli/src/vendor/openspec.bundle.js.tpl')

  test('no `opendir`, `glob`, or recursive `readdir` in the pinned bundle', () => {
    const source = readFileSync(bundle, 'utf8')
    expect(source).toContain('.readdir(')
    expect(uncoveredListings(source)).toEqual([])
  })

  test('the scan reports each form the preload leaves alone, and passes the ones it sorts', () => {
    expect(uncoveredListings('a.opendirSync(x);b.promises.opendir(y)')).toHaveLength(2)
    expect(uncoveredListings('fs.readdirSync(x,{recursive:!0})')).toHaveLength(1)
    expect(uncoveredListings('fsp.glob("**/*.md")')).toHaveLength(1)
    expect(
      uncoveredListings(
        'a.readdir(x,{withFileTypes:!0},(e,l)=>l);b.readdirSync(y);c.readdir(z,cb)',
      ),
    ).toEqual([])
  })
})
