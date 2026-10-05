// The pinned binary's `core/artifact-graph/outputs.js` `artifactOutputExists`,
// ported line for line, over the same fast-glob the binary matches with: cospec
// pins `fast-glob` to the version the pinned openspec resolves, so braces,
// numeric ranges, extglobs and negation read as the binary reads them, and
// `test/contract/glob.test.ts` holds this module to the binary's own modules.

import { lstatSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'

import fg from 'fast-glob'
import ProviderSync from 'fast-glob/out/providers/sync.js'
import Settings from 'fast-glob/out/settings.js'
import type { MicromatchOptions } from 'fast-glob/out/types/index.js'
import { expandBraceExpansion, makeRe as fgMakeRe } from 'fast-glob/out/utils/pattern.js'

/** Reads the micromatch options fast-glob's providers match with. */
class MatchOptions extends ProviderSync {
  get options(): MicromatchOptions {
    return this._getMicromatchOptions()
  }
}

let matchOptions: MicromatchOptions | undefined

/** The micromatch options fast-glob matches with under its default settings. */
function defaultMatchOptions(): MicromatchOptions {
  matchOptions ??= new MatchOptions(new Settings({})).options
  return matchOptions
}

/** fast-glob's brace expansion of one pattern. */
export function expandBraces(pattern: string): string[] {
  return expandBraceExpansion(pattern)
}

/** The regex fast-glob matches `pattern` with under its default settings. */
export function makeRe(pattern: string): RegExp {
  return fgMakeRe(pattern, defaultMatchOptions())
}

function errorCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code
}

/** The binary's `isGlobPattern`. */
function isGlobPattern(pattern: string): boolean {
  return pattern.includes('*') || pattern.includes('?') || pattern.includes('[')
}

function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/')
}

/** The binary's `FileSystemUtils.canonicalizeExistingPath`. */
function canonicalizeExistingPath(targetPath: string): string {
  try {
    return realpathSync.native(targetPath)
  } catch {
    try {
      return realpathSync(targetPath)
    } catch {
      return resolve(targetPath)
    }
  }
}

/** The binary's `FileSystemUtils.isPathWithin`. */
function isPathWithin(allowedDirectory: string, targetPath: string): boolean {
  const rel = relative(allowedDirectory, targetPath)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/** The binary's `FileSystemUtils.canonicalizePotentialPath`. */
function canonicalizePotentialPath(targetPath: string): string {
  let existingPath = targetPath
  const missingSegments: string[] = []
  for (;;) {
    try {
      // lstat distinguishes a missing path from a dangling symlink, which
      // realpath reports as ENOENT either way.
      lstatSync(existingPath)
      return resolve(realpathSync.native(existingPath), ...missingSegments)
    } catch (err) {
      if (errorCode(err) !== 'ENOENT') throw err
      let dangling = false
      try {
        dangling = lstatSync(existingPath).isSymbolicLink()
      } catch (lstatErr) {
        if (errorCode(lstatErr) !== 'ENOENT') throw lstatErr
      }
      if (dangling)
        throw new Error(`Cannot verify dangling symbolic link: ${existingPath}`, { cause: err })
      const parent = dirname(existingPath)
      if (parent === existingPath)
        throw new Error(`Cannot resolve an existing parent for ${targetPath}`, { cause: err })
      missingSegments.unshift(basename(existingPath))
      existingPath = parent
    }
  }
}

/** The binary's `FileSystemUtils.assertPathWithin` (also archive's root confinement). */
export function assertPathWithin(allowedDirectory: string, targetPath: string): void {
  const resolvedDirectory = resolve(allowedDirectory)
  const resolvedTarget = resolve(targetPath)
  if (!isPathWithin(resolvedDirectory, resolvedTarget))
    throw new Error(`Path is outside the allowed directory: ${targetPath}`)
  const canonicalDirectory = canonicalizePotentialPath(resolvedDirectory)
  const canonicalTarget = canonicalizePotentialPath(resolvedTarget)
  if (!isPathWithin(canonicalDirectory, canonicalTarget))
    throw new Error(`Path is outside the allowed directory: ${targetPath}`)
}

/**
 * The binary's `assertGlobDirectoryTraversal`: every directory the pattern's
 * directory segments can reach stays inside the change, and no linked
 * directory cycle is walked.
 */
function assertGlobDirectoryTraversal(
  changeDir: string,
  currentDir: string,
  directorySegments: readonly string[],
  segmentIndex = 0,
  visited = new Set<string>(),
  canonicalChangeDir = canonicalizeExistingPath(changeDir),
  ancestors = new Set<string>(),
): void {
  if (segmentIndex >= directorySegments.length) return
  const canonicalDir = canonicalizeExistingPath(currentDir)
  assertPathWithin(canonicalChangeDir, canonicalDir)
  const visitKey = `${canonicalDir}\0${segmentIndex}`
  if (ancestors.has(visitKey))
    throw new Error(
      `Cannot resolve artifact outputs through a linked directory cycle: ${currentDir}`,
    )
  if (visited.has(visitKey)) return
  visited.add(visitKey)
  ancestors.add(visitKey)
  try {
    const segment = directorySegments[segmentIndex]!
    // `**` may consume no directory at all.
    if (segment === '**')
      assertGlobDirectoryTraversal(
        changeDir,
        canonicalDir,
        directorySegments,
        segmentIndex + 1,
        visited,
        canonicalChangeDir,
        ancestors,
      )
    const matches = fg.sync(segment === '**' ? '*' : segment, {
      cwd: canonicalDir,
      onlyFiles: false,
      followSymbolicLinks: false,
      deep: 1,
    })
    for (const match of matches) {
      const candidate = join(canonicalDir, match)
      try {
        if (!statSync(candidate).isDirectory()) continue
      } catch (err) {
        if (errorCode(err) === 'ENOENT') continue
        throw err
      }
      const canonicalCandidate = canonicalizeExistingPath(candidate)
      assertPathWithin(canonicalChangeDir, canonicalCandidate)
      assertGlobDirectoryTraversal(
        changeDir,
        canonicalCandidate,
        directorySegments,
        segment === '**' ? segmentIndex : segmentIndex + 1,
        visited,
        canonicalChangeDir,
        ancestors,
      )
    }
  } finally {
    ancestors.delete(visitKey)
  }
}

/**
 * The binary's `resolveArtifactOutputs`: the files an artifact's `generates`
 * names inside `changeDir`, canonical and sorted. Throws, as the binary does,
 * for a pattern or a match that leaves the change.
 */
export function resolveArtifactOutputs(changeDir: string, generates: string): string[] {
  const outputPath = join(changeDir, generates)
  assertPathWithin(changeDir, outputPath)
  if (!isGlobPattern(generates)) {
    try {
      return statSync(outputPath).isFile() ? [canonicalizeExistingPath(outputPath)] : []
    } catch {
      // The binary's bare `catch`: any stat failure is no output.
      return []
    }
  }
  const normalizedPattern = toPosixPath(generates)
  assertGlobDirectoryTraversal(changeDir, changeDir, normalizedPattern.split('/').slice(0, -1))
  const matches = fg
    .sync(normalizedPattern, {
      cwd: changeDir,
      onlyFiles: true,
      absolute: true,
      followSymbolicLinks: true,
    })
    .map((match) => {
      const normalizedMatch = normalize(match)
      assertPathWithin(changeDir, normalizedMatch)
      return canonicalizeExistingPath(normalizedMatch)
    })
  return [...new Set(matches)].toSorted()
}

/** The binary's `artifactOutputExists`: whether `generates` names at least one file. */
export function artifactOutputExists(changeDir: string, generates: string): boolean {
  return resolveArtifactOutputs(changeDir, generates).length > 0
}
