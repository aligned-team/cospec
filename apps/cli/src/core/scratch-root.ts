// `cospec sync-specs`'s scratch run (design D11): the wrapped binary's own
// `archive <change> -y` runs on a copy of what that archive reads — the root's
// `config.yaml`/`config.yml`, `schemas/`, `specs/`, the one change and an empty
// `changes/archive/` — in a fresh directory under the OS temp directory, and
// only the main-spec entries that run created, changed or deleted are copied
// back. A link inside the copied paths is re-pointed at its target's scratch
// copy, so an absolute link (or one that climbs out and back in) aliases the
// scratch tree as it aliases the real one, never the real tree itself. A file
// or directory this command cannot read is copied as an empty placeholder of
// the same mode, so the binary meets the same refusal there it meets in the
// real tree. The binary never runs in the real tree, so its archive claim
// (`.openspec-archive.lock`), its move and anything a failed run leaves behind
// exist only in the scratch tree, which is removed whatever happens.

import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'

import { relayedReason } from './archive-output.ts'

/** What one scratch run of the wrapped archive printed and exited with. */
export interface ScratchRun {
  stdout: string
  stderr: string
  exitCode: number
}

/** Runs the wrapped archive with `scratchBase` as its working directory. */
export type ScratchRunner = (scratchBase: string) => Promise<ScratchRun>

export interface ScratchSync {
  /** Main-spec files the run created or changed, relative to the root. */
  written: string[]
  /** Main-spec files and links the run deleted, relative to the root. */
  deleted: string[]
  run: ScratchRun
}

export type ScratchRefusalKind = 'symlink-escape' | 'scratch-run' | 'specs-changed'

/** A refusal of the scratch sync, with nothing written to the real tree. */
export class ScratchRefusal extends Error {
  readonly kind: ScratchRefusalKind
  /** The run the refusal judged, when one happened. */
  readonly run?: ScratchRun

  constructor(kind: ScratchRefusalKind, message: string, run?: ScratchRun) {
    super(message)
    this.name = 'ScratchRefusal'
    this.kind = kind
    if (run !== undefined) this.run = run
  }
}

const CONFIG_FILES = ['config.yaml', 'config.yml'] as const

/** A path under `openspec/` the binary's archive reads: as spelled there, and its real path. */
interface CopiedRoot {
  rel: string
  real: string
}

/** The paths under `openspec/` the binary's archive reads. */
function copiedRoots(openspec: string, changeId: string): CopiedRoot[] {
  return [
    ...CONFIG_FILES.filter((f) => existsSync(join(openspec, f))),
    ...['schemas', 'specs'].filter((d) => existsSync(join(openspec, d))),
    join('changes', changeId),
  ].map((rel) => ({ rel, real: realpathSync(join(openspec, rel)) }))
}

function within(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

/** Whether `error` says this process may not read the entry (rather than that it is missing or broken). */
function unreadable(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'EACCES' || code === 'EPERM'
}

/** A directory's entries, or `undefined` when this process may not list it. */
function listable(dir: string): string[] | undefined {
  try {
    return readdirSync(dir)
  } catch (error) {
    if (unreadable(error)) return undefined
    throw error
  }
}

/** The copied root holding the real path `target` (the deepest, should two nest). */
function rootHolding(roots: readonly CopiedRoot[], target: string): CopiedRoot | undefined {
  return roots
    .filter((r) => within(r.real, target))
    .toSorted((a, b) => b.real.length - a.real.length)[0]
}

/**
 * The first symbolic link under the copied paths whose target leaves them, as
 * a path relative to the root — the binary would write through it into the
 * real tree. A link inside them is copied re-pointed at the scratch copy of its
 * target, so the scratch run sees the same aliasing the real tree has. Each
 * copied path is walked at its real path, as it is copied.
 */
export function symlinkEscape(base: string, changeId: string): string | undefined {
  const openspec = join(base, 'openspec')
  const roots = copiedRoots(openspec, changeId)
  const leaves = (link: string): boolean => {
    let target: string
    try {
      target = realpathSync(link)
    } catch (error) {
      // A dangling link cannot be proven to stay inside.
      if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return true
      throw error
    }
    return rootHolding(roots, target) === undefined
  }
  const walk = (path: string, shown: string): string | undefined => {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) return leaves(path) ? shown : undefined
    if (!stat.isDirectory()) return undefined
    // An unlistable directory is copied empty: no link in it reaches the run.
    for (const name of (listable(path) ?? []).toSorted()) {
      const found = walk(join(path, name), `${shown}/${name}`)
      if (found !== undefined) return found
    }
    return undefined
  }
  for (const root of roots) {
    const found = walk(root.real, ['openspec', ...root.rel.split(sep)].join('/'))
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * Copy `src` (a real path) to `dst`: a link re-pointed by `scratchFor` at the
 * scratch copy of its target, a directory this process cannot list as an
 * empty one, a file it cannot read as an empty file of the same mode.
 */
function copyEntry(src: string, dst: string, scratchFor: (target: string) => string): void {
  const stat = lstatSync(src)
  if (stat.isSymbolicLink()) {
    symlinkSync(relative(dirname(dst), scratchFor(realpathSync(src))), dst)
  } else if (stat.isDirectory()) {
    mkdirSync(dst)
    for (const name of listable(src) ?? []) copyEntry(join(src, name), join(dst, name), scratchFor)
  } else if (stat.isFile()) {
    try {
      copyFileSync(src, dst)
    } catch (error) {
      if (!unreadable(error)) throw error
      writeFileSync(dst, '')
      chmodSync(dst, stat.mode & 0o7777)
    }
  } else cpSync(src, dst)
}

/** Copy every root into `scratchOpenspec`, each read at its real path. */
function copyRoots(roots: readonly CopiedRoot[], scratchOpenspec: string): void {
  const scratchFor = (target: string): string => {
    const root = rootHolding(roots, target)
    // `symlinkEscape` has refused every link that leaves the roots.
    if (root === undefined)
      throw new Error(`sync-specs: ${target} left the copied paths after they were checked`)
    return join(scratchOpenspec, root.rel, relative(root.real, target))
  }
  for (const root of roots) copyEntry(root.real, join(scratchOpenspec, root.rel), scratchFor)
}

/**
 * Every entry under `dir`, relative to it: a file by its sha256, a link by the
 * target it holds (never followed), a directory by `dir`. A file this process
 * cannot read is fingerprinted by its metadata, a directory it cannot list as
 * `unlisted` with its metadata, unwalked.
 */
function fingerprint(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (abs: string): void => {
    for (const name of listable(abs) ?? []) {
      const child = join(abs, name)
      const rel = relative(dir, child)
      const stat = lstatSync(child)
      if (stat.isSymbolicLink()) out.set(rel, `link:${readlinkSync(child)}`)
      else if (stat.isDirectory()) {
        if (listable(child) === undefined) out.set(rel, `unlisted:${stat.mode}:${stat.mtimeMs}`)
        else {
          out.set(rel, 'dir')
          walk(child)
        }
      } else if (stat.isFile()) out.set(rel, fileFingerprint(child, stat))
      else out.set(rel, `other:${stat.mode}`)
    }
  }
  if (existsSync(dir)) walk(dir)
  return out
}

function fileFingerprint(path: string, stat: Stats): string {
  try {
    return `file:${createHash('sha256').update(readFileSync(path)).digest('hex')}`
  } catch (error) {
    if (!unreadable(error)) throw error
    return `unreadable:${stat.mode}:${stat.size}:${stat.mtimeMs}`
  }
}

function sameMap(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  return a.size === b.size && [...a].every(([k, v]) => b.get(k) === v)
}

/** A path under `specs/` as the root spells it (`openspec/specs/<cap>/spec.md`). */
function asRoot(rel: string): string {
  return ['openspec', 'specs', ...rel.split(sep)].join('/')
}

/** Write `bytes` to `path` through a sibling temp file, keeping an existing file's mode. */
function writeAtomically(path: string, bytes: Buffer): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.cospec-tmp`
  writeFileSync(tmp, bytes)
  if (existsSync(path)) chmodSync(tmp, statSync(path).mode & 0o7777)
  renameSync(tmp, path)
}

/** The fixed text that says the wrapped archive did not complete. */
const ABORTED_RE = /\bAborted\b/
const CANCELLED_RE = /\bArchive cancelled\b/

/**
 * Whether the run completed in the scratch tree: exit 0, no abort, the change
 * gone from `changes/`, and exactly one new archive entry holding its
 * `.openspec.yaml`. That proves the binary resolved the scratch root — the
 * real change is untouched — and finished its archive.
 */
function scratchArchived(scratchOpenspec: string, changeId: string, run: ScratchRun): boolean {
  if (run.exitCode !== 0 || ABORTED_RE.test(run.stdout) || CANCELLED_RE.test(run.stdout))
    return false
  if (existsSync(join(scratchOpenspec, 'changes', changeId))) return false
  const entries = readdirSync(join(scratchOpenspec, 'changes/archive'))
  return (
    entries.length === 1 &&
    existsSync(join(scratchOpenspec, 'changes/archive', entries[0]!, '.openspec.yaml'))
  )
}

/**
 * Sync `changeId`'s delta specs into `base`'s `openspec/specs/` through a
 * scratch run of `runner`. Throws `ScratchRefusal` — with nothing written to
 * the real tree — when a link would let the run escape, when the run did not
 * archive the scratch copy, or when the real main specs changed while it ran.
 */
export async function syncThroughScratch(
  base: string,
  changeId: string,
  runner: ScratchRunner,
): Promise<ScratchSync> {
  const openspec = join(base, 'openspec')
  const realSpecs = join(openspec, 'specs')
  const escape = symlinkEscape(base, changeId)
  if (escape !== undefined)
    throw new ScratchRefusal(
      'symlink-escape',
      `${escape} is a symbolic link that leads outside the tree sync-specs copies; the wrapped archive would write through it into the real tree`,
    )

  const realBefore = fingerprint(realSpecs)
  const scratch = mkdtempSync(join(tmpdir(), 'cospec-sync-'))
  try {
    const scratchOpenspec = join(scratch, 'openspec')
    mkdirSync(join(scratchOpenspec, 'changes/archive'), { recursive: true })
    copyRoots(copiedRoots(openspec, changeId), scratchOpenspec)
    mkdirSync(join(scratchOpenspec, 'specs'), { recursive: true })
    const scratchSpecs = join(scratchOpenspec, 'specs')

    const scratchBefore = fingerprint(scratchSpecs)
    const run = await runner(scratch)
    if (!scratchArchived(scratchOpenspec, changeId, run))
      throw new ScratchRefusal('scratch-run', relayedReason(`${run.stdout}\n${run.stderr}`), run)

    // Every entry kind is diffed: a link the run removed (a retired capability
    // whose `spec.md` is a link) is deleted like a file, and one it replaced
    // with a file is written. The binary never creates or re-points a link,
    // nor touches what it cannot read, so such a change is a breach, thrown
    // before anything is copied back.
    const scratchAfter = fingerprint(scratchSpecs)
    const written: string[] = []
    for (const [rel, kind] of scratchAfter) {
      const before = scratchBefore.get(rel)
      if (before === kind || (kind === 'dir' && before === undefined)) continue
      if (!kind.startsWith('file:'))
        throw new Error(
          `sync-specs: the scratch run left ${asRoot(rel)} as ${describeKind(kind)}${before === undefined ? '' : ` where it was ${describeKind(before)}`}; nothing was written`,
        )
      written.push(rel)
    }
    written.sort()
    const gone = [...scratchBefore].filter(([rel]) => !scratchAfter.has(rel))
    const deleted = gone
      .filter(([, kind]) => kind !== 'dir')
      .map(([rel]) => rel)
      .toSorted()
    const pruned = gone
      .filter(([, kind]) => kind === 'dir')
      .map(([rel]) => rel)
      // Deepest first, so a parent is empty when its turn comes.
      .toSorted((a, b) => b.length - a.length)

    if (!sameMap(realBefore, fingerprint(realSpecs)))
      throw new ScratchRefusal(
        'specs-changed',
        'the main specs changed while sync ran; nothing was written',
        run,
      )

    for (const rel of written)
      writeAtomically(join(realSpecs, rel), readFileSync(join(scratchSpecs, rel)))
    for (const rel of deleted) unlinkSync(join(realSpecs, rel))
    for (const rel of pruned) {
      const dir = join(realSpecs, rel)
      if (existsSync(dir) && listable(dir)?.length === 0) rmdirSync(dir)
    }

    // Step 5: what landed is exactly what the run wrote, and nothing else moved.
    const realAfter = fingerprint(realSpecs)
    for (const [rel, kind] of realBefore)
      if (!written.includes(rel) && !deleted.includes(rel) && !pruned.includes(rel))
        if (realAfter.get(rel) !== kind)
          throw new Error(`sync-specs: ${rel} changed although the scratch run did not touch it`)
    for (const rel of written)
      if (realAfter.get(rel) !== scratchAfter.get(rel))
        throw new Error(`sync-specs: ${rel} does not hold the bytes the scratch run wrote`)
    for (const rel of deleted)
      if (realAfter.has(rel)) throw new Error(`sync-specs: ${rel} is still present`)

    return { written: written.map(asRoot), deleted: deleted.map(asRoot), run }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/** A fingerprint kind, in words. */
function describeKind(kind: string): string {
  if (kind.startsWith('file:')) return 'a file'
  if (kind.startsWith('link:')) return `a link to ${kind.slice('link:'.length)}`
  if (kind === 'dir') return 'a directory'
  if (kind.startsWith('unreadable:')) return 'an unreadable file'
  if (kind.startsWith('unlisted:')) return 'an unlistable directory'
  return 'a special file'
}
