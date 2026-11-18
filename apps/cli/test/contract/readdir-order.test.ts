// Wrapped calls list directories in Node's order (change
// `wrapped-readdir-node-order`, ledger 1.1): the pinned binary under Node lists
// a directory sorted by the bytes of each name (libuv's `scandir` sorts with
// `strcmp`), while Bun returns the filesystem's own order. Each row compares
// cospec with the binary under Node on one root, in whatever order this
// filesystem lists it; on one that already lists byte order the row cannot tell
// the preload from its absence, so test/unit/core/readdir-preload.test.ts proves
// the sorting on entries handed over unsorted, whatever the filesystem.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, REPO_ROOT, type SpawnResult } from '../fixtures/support.ts'
import { oracle, oracleEnv, scaffoldOracleRoot } from './support/upstream-oracle.ts'

// Commands run as child processes, imported so `bun test --changed` selects this file.
import '../../src/commands/instructions.ts'

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

/** After one of these (or at the start), a `/` opens a regular expression rather than divides. */
const BEFORE_REGEX = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';'])

/** The index just past the quote that closes the string literal opening at `at`. */
function stringEnd(source: string, at: number): number {
  for (let i = at + 1; i < source.length; i++) {
    if (source[i] === '\\') i++
    else if (source[i] === source[at]) return i + 1
  }
  return source.length
}

/** The index just past the backtick that closes the template literal opening at `at`. */
function templateEnd(source: string, at: number): number {
  for (let i = at + 1; i < source.length; i++) {
    if (source[i] === '\\') i++
    else if (source[i] === '`') return i + 1
    else if (source.startsWith('${', i)) i = closingEnd(source, i + 1) - 1
  }
  return source.length
}

/** The index just past the regular expression literal opening at `at`. */
function regexEnd(source: string, at: number): number {
  let inClass = false
  for (let i = at + 1; i < source.length; i++) {
    const ch = source[i]
    if (ch === '\\') i++
    else if (ch === '[') inClass = true
    else if (ch === ']') inClass = false
    else if (ch === '/' && !inClass) return i + 1
  }
  return source.length
}

const CLOSER: Record<string, string> = { '(': ')', '[': ']', '{': '}' }

/**
 * The index just past the bracket that closes the one at `open`, skipping string, template and
 * regular expression literals and comments, so a bracket inside one never ends the call early.
 */
function closingEnd(source: string, open: number): number {
  const closers: string[] = []
  let prev = ''
  for (let i = open; i < source.length; i++) {
    const ch = source[i]!
    if (/\s/.test(ch)) continue
    if (source.startsWith('//', i)) {
      const end = source.indexOf('\n', i)
      i = end === -1 ? source.length : end
      continue
    }
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 1
      continue
    }
    if (ch === '"' || ch === "'") i = stringEnd(source, i) - 1
    else if (ch === '`') i = templateEnd(source, i) - 1
    else if (ch === '/' && BEFORE_REGEX.has(prev)) i = regexEnd(source, i) - 1
    else if (CLOSER[ch] !== undefined) closers.push(CLOSER[ch])
    else if (ch === closers.at(-1)) {
      closers.pop()
      if (closers.length === 0) return i + 1
    }
    // A literal just skipped is an operand: a `/` after it divides.
    prev = /["'`/]/.test(ch) ? 'a' : ch
  }
  return source.length
}

/**
 * Every directory listing in `source` the readdir preload does not cover: an `opendir` or
 * `glob` call, or a `readdir` call whose arguments ask for a recursive read.
 */
function uncoveredListings(source: string): string[] {
  const uncovered: string[] = []
  for (const match of source.matchAll(
    /\.(readdir|readdirSync|opendir|opendirSync|glob|globSync)\(/g,
  )) {
    const open = match.index + match[0].length - 1
    const call = source.slice(match.index, closingEnd(source, open))
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
    // A `)` that closes a nested call, string, template or regular expression is not the end of
    // the call: the recursive option after it still counts.
    for (const call of [
      "fs.readdirSync(path.join(root, 'specs'), { recursive: true })",
      'fs.readdirSync(")", {recursive:!0})',
      'fs.readdirSync(`${a(b)})`, {recursive:!0})',
      "fs.readdirSync(x.replace(/\\)/g, ''), {recursive:!0})",
      'fs.readdirSync(a /* ) */, {recursive:!0})',
    ]) {
      expect(uncoveredListings(call)).toEqual([call.slice(call.indexOf('.'))])
    }
    expect(uncoveredListings('fs.readdirSync(path.join(a, b), { withFileTypes: !0 })')).toEqual([])
    expect(
      uncoveredListings(
        'a.readdir(x,{withFileTypes:!0},(e,l)=>l);b.readdirSync(y);c.readdir(z,cb)',
      ),
    ).toEqual([])
  })
})
