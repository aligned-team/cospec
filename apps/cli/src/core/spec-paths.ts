/**
 * Shared spec-path discovery, ported from openspec's `src/utils/spec-discovery.ts`
 * (1.6.0 #1353) and kept synchronous to match the rest of cospec's core.
 *
 * Two layouts are in play: the flat `specs/<capability>/spec.md` and the nested
 * `specs/<area>/<capability>/spec.md` openspec grew in 1.6.0. Anything that
 * derives a capability from the *first* path segment mis-buckets the nested
 * layout under the area, which silently turns both hard archive gates
 * (verification-incomplete, scenario-preservation) into no-ops for those specs.
 */
import { lstatSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export interface DiscoveredSpec {
  /**
   * Spec id relative to the specs root, always forward-slash separated
   * (e.g. `web` or `platform/session-layout`).
   */
  id: string
  /** Path to the `spec.md` file; absolute when the specs root is absolute. */
  specFile: string
}

function errorCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code
}

function isPathWithin(allowedDirectory: string, targetPath: string): boolean {
  const rel = relative(allowedDirectory, targetPath)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/**
 * Absolute canonical form of a path whose tail may not exist yet: realpath the
 * nearest existing ancestor and re-append the missing segments. A *dangling*
 * symlink cannot be proven confined, so it fails loudly rather than resolving
 * to its own literal path.
 */
function canonicalize(targetPath: string): string {
  let existing = resolve(targetPath)
  const missing: string[] = []
  for (;;) {
    try {
      // lstat first: it distinguishes a missing path from a dangling symlink,
      // which realpath reports as ENOENT either way.
      lstatSync(existing)
      return resolve(realpathSync(existing), ...missing)
    } catch (err) {
      if (errorCode(err) !== 'ENOENT') throw err
      let dangling = false
      try {
        dangling = lstatSync(existing).isSymbolicLink()
      } catch (lstatErr) {
        if (errorCode(lstatErr) !== 'ENOENT') throw lstatErr
      }
      if (dangling)
        throw new Error(`Cannot verify dangling symbolic link: ${existing}`, { cause: err })
      const parent = dirname(existing)
      if (parent === existing)
        throw new Error(`Cannot resolve an existing parent for ${targetPath}`, { cause: err })
      missing.unshift(basename(existing))
      existing = parent
    }
  }
}

/**
 * Refuse a target that leaves `allowedDirectory`, including through a symlink
 * in the target itself or in any of its parents.
 */
export function assertPathWithin(allowedDirectory: string, targetPath: string): void {
  const resolvedDir = resolve(allowedDirectory)
  const resolvedTarget = resolve(targetPath)
  if (!isPathWithin(resolvedDir, resolvedTarget))
    throw new Error(`Path is outside the allowed directory: ${targetPath}`)
  if (!isPathWithin(canonicalize(resolvedDir), canonicalize(resolvedTarget)))
    throw new Error(`Path is outside the allowed directory: ${targetPath}`)
}

function assertDiscoveredSpecPath(
  specsRoot: string,
  capabilityDir: string,
  specFile: string,
): void {
  try {
    assertPathWithin(specsRoot, specFile)
  } catch {
    // A capability directory may deliberately be an external monorepo link.
    // In that case confine the file to the capability directory itself.
    assertPathWithin(capabilityDir, specFile)
  }
}

/**
 * Every `spec.md` under a specs root, flat and nested layouts alike, sorted by id.
 *
 * - Dot-directories are skipped and symlinked *directories* are not followed.
 * - An in-capability symlinked `spec.md` IS resolved — the artifact graph's globs
 *   count it as content, so dropping it here would lose the delta on archive.
 *   A link resolving outside its capability is rejected; a dangling link is skipped.
 * - A `spec.md` sitting directly in the root is ignored: specs live in a
 *   capability folder, and openspec 1.7.0 blocks the root-level form outright.
 * - A missing root (ENOENT) yields an empty list, but any other read failure
 *   (EACCES, EIO, …) is thrown rather than swallowed: this feeds the archive
 *   merge path, where silently dropping an unreadable capability would recreate
 *   the data-loss class #1353 closed.
 */
export function discoverSpecFiles(specsRoot: string): DiscoveredSpec[] {
  const results: DiscoveredSpec[] = []
  const walk = (dir: string, segments: string[]): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (err) {
      if (errorCode(err) === 'ENOENT') return
      throw err
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), [...segments, entry.name])
        continue
      }
      if (entry.name !== 'spec.md' || segments.length === 0) continue
      const specFile = join(dir, entry.name)
      if (entry.isFile()) {
        assertDiscoveredSpecPath(specsRoot, dir, specFile)
        results.push({ id: segments.join('/'), specFile })
      } else if (entry.isSymbolicLink()) {
        let target
        try {
          target = statSync(specFile)
        } catch (err) {
          // A dangling link is not content; anything else fails loudly.
          if (errorCode(err) !== 'ENOENT') throw err
          continue
        }
        if (!target.isFile()) continue
        assertDiscoveredSpecPath(specsRoot, dir, specFile)
        results.push({ id: segments.join('/'), specFile })
      }
    }
  }
  walk(specsRoot, [])
  // Plain code-point comparison, not localeCompare: the latter follows the
  // process's ICU locale, so ordering would vary by OS/CI.
  return results.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Is this path a change-side delta file at all?
 *
 * Both openspec's change-side delta parser and cospec's own living-side
 * `discoverSpecFiles` above only ever read files literally named `spec.md`. Any
 * other markdown an author keeps beside a delta (a `README.md`, `notes.md`, a
 * `spec-old.md` backup) is invisible to `openspec validate` and to
 * `openspec archive`'s merge, so cospec must not parse it as delta content
 * either: doing so fed phantom ops into both hard archive gates, which could
 * refuse — or falsely report an invariant breach on — an archive openspec would
 * have completed cleanly.
 *
 * `relPath` may be a full relative path or a bare file name; either separator
 * is accepted, matching `capabilityForDeltaFile` below.
 */
export function isDeltaSpecFile(relPath: string): boolean {
  const segments = relPath.split(/[\\/]/).filter((s) => s !== '' && s !== '.')
  return segments.at(-1) === 'spec.md'
}

/**
 * Capability path a change-side delta file belongs to — the directory chain
 * between `specs/` and the file, joined with `/`.
 *
 * `specs/web/spec.md` is `web`; `specs/platform/session-layout/spec.md` is
 * `platform/session-layout`, **not** `platform` (the first-segment bug this
 * replaces) and **not** `session-layout`. The full path is the capability's
 * identity everywhere it matters: it is the id openspec's own
 * `discoverSpecFiles`/change parser use, and it is where archive merges the
 * delta — `openspec/specs/platform/session-layout/spec.md`. A leaf-only name
 * would point every living-spec lookup and both hard archive gates at a path
 * that does not exist.
 *
 * `relPath` is relative to the change directory (either separator accepted).
 * Returns `undefined` when the path is not under `specs/` or sits directly in
 * `specs/` (a root-level `specs/spec.md` has no capability at all — callers
 * raise the error rather than inventing one).
 */
export function capabilityForDeltaFile(relPath: string): string | undefined {
  const segments = relPath.split(/[\\/]/).filter((s) => s !== '' && s !== '.')
  if (segments.length < 3 || segments[0] !== 'specs') return undefined
  // A traversal segment makes the capability path meaningless; refuse rather
  // than derive one from a path that escapes the change's specs tree.
  if (segments.includes('..')) return undefined
  return segments.slice(1, -1).join('/')
}
