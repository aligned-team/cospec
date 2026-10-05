// `cospec sync-specs`'s scratch run (design D11): the wrapped binary's own
// `archive <change> -y` runs on a copy of what that archive reads — the root's
// `config.yaml`/`config.yml`, `schemas/`, `specs/`, the one change and an empty
// `changes/archive/` — in a fresh directory under the OS temp directory, and
// only the main-spec files that run created, changed or deleted are copied
// back. The binary never runs in the real tree, so its archive claim
// (`.openspec-archive.lock`), its move and anything a failed run leaves behind
// exist only in the scratch tree, which is removed whatever happens.

import { createHash } from 'node:crypto'
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
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
  /** Main-spec files the run deleted, relative to the root. */
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

/** The paths under `openspec/` the binary's archive reads, relative to it. */
function copiedPaths(openspec: string, changeId: string): string[] {
  return [
    ...CONFIG_FILES.filter((f) => existsSync(join(openspec, f))),
    ...['schemas', 'specs'].filter((d) => existsSync(join(openspec, d))),
    join('changes', changeId),
  ]
}

function within(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

/**
 * The first symbolic link under the copied paths whose target leaves them, as
 * a path relative to the root — the binary would write through it into the
 * real tree. A link inside them is copied as a link, so the scratch run sees
 * the same aliasing the real tree has.
 */
export function symlinkEscape(base: string, changeId: string): string | undefined {
  const openspec = join(base, 'openspec')
  const roots = copiedPaths(openspec, changeId).map((p) => join(openspec, p))
  const realRoots = roots.map((p) => realpathSync(p))
  const leaves = (link: string): boolean => {
    let target: string
    try {
      target = realpathSync(link)
    } catch (error) {
      // A dangling link cannot be proven to stay inside.
      if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return true
      throw error
    }
    return !realRoots.some((r) => within(r, target))
  }
  const walk = (path: string): string | undefined => {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) return leaves(path) ? relative(base, path) : undefined
    if (!stat.isDirectory()) return undefined
    for (const name of readdirSync(path).toSorted()) {
      const found = walk(join(path, name))
      if (found !== undefined) return found
    }
    return undefined
  }
  for (const root of roots) {
    const found = walk(root)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * Every entry under `dir`, relative to it: a file by its sha256, a link by its
 * target (never followed), a directory by `dir`.
 */
function fingerprint(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (abs: string): void => {
    for (const name of readdirSync(abs)) {
      const child = join(abs, name)
      const rel = relative(dir, child)
      const stat = lstatSync(child)
      if (stat.isSymbolicLink()) out.set(rel, `link:${readlinkTarget(child)}`)
      else if (stat.isDirectory()) {
        out.set(rel, 'dir')
        walk(child)
      } else if (stat.isFile())
        out.set(rel, `file:${createHash('sha256').update(readFileSync(child)).digest('hex')}`)
      else out.set(rel, `other:${stat.mode}`)
    }
  }
  if (existsSync(dir)) walk(dir)
  return out
}

function readlinkTarget(path: string): string {
  return realpathSafe(path) ?? '<dangling>'
}

function realpathSafe(path: string): string | undefined {
  try {
    return realpathSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return undefined
    throw error
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

  const scratch = mkdtempSync(join(tmpdir(), 'cospec-sync-'))
  try {
    const scratchOpenspec = join(scratch, 'openspec')
    mkdirSync(join(scratchOpenspec, 'changes/archive'), { recursive: true })
    for (const rel of copiedPaths(openspec, changeId))
      cpSync(join(openspec, rel), join(scratchOpenspec, rel), {
        recursive: true,
        verbatimSymlinks: true,
      })
    mkdirSync(join(scratchOpenspec, 'specs'), { recursive: true })
    const scratchSpecs = join(scratchOpenspec, 'specs')

    const realBefore = fingerprint(realSpecs)
    const scratchBefore = fingerprint(scratchSpecs)
    const run = await runner(scratch)
    if (!scratchArchived(scratchOpenspec, changeId, run))
      throw new ScratchRefusal('scratch-run', relayedReason(`${run.stdout}\n${run.stderr}`), run)

    const scratchAfter = fingerprint(scratchSpecs)
    const written = [...scratchAfter]
      .filter(([rel, kind]) => kind.startsWith('file:') && scratchBefore.get(rel) !== kind)
      .map(([rel]) => rel)
      .toSorted()
    const deleted = [...scratchBefore]
      .filter(([rel, kind]) => kind.startsWith('file:') && !scratchAfter.has(rel))
      .map(([rel]) => rel)
      .toSorted()
    const pruned = [...scratchBefore]
      .filter(([rel, kind]) => kind === 'dir' && !scratchAfter.has(rel))
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
      if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir)
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
