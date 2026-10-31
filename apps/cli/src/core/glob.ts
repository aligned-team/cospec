// The pinned binary's `core/artifact-graph/outputs.js` (`resolveArtifactOutputs`,
// `artifactOutputExists`, `isGlobPattern`) and the `FileSystemUtils` path guards it
// calls, ported line for line over the same glob stack the binary matches with:
// cospec pins `tinyglobby`, `picomatch` and `brace-expansion` to the versions the
// pinned openspec resolves, so braces, ranges, extglobs and the nesting/expansion
// bounds read as the binary reads them, and `test/contract/glob.test.ts` holds this
// module to the binary's own modules.

import { lstatSync, readdirSync, realpathSync, statSync, type Dirent } from 'node:fs'
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'

import { expand } from 'brace-expansion'
import picomatch from 'picomatch'
import { globSync } from 'tinyglobby'

const EXTGLOB_RE = /[!*+?@]\([^(]*\)/u
const BRACE_EXPANSION_SEPARATORS_RE = /,|\.\./u
const DUPLICATE_SLASH_RE = /(?!^)\/{2,}/gu

/** Deepest brace/paren nesting a pattern may carry (the binary's `MAX_BRACE_NESTING`). */
export const MAX_BRACE_NESTING = 16
/** Most patterns one pattern may brace-expand to (the binary's `MAX_BRACE_EXPANSIONS`). */
export const MAX_BRACE_EXPANSIONS = 1024

const ARTIFACT_GLOB_OPTIONS = {
  absolute: true,
  // Braces are expanded first so `{draft}` left behind stays a literal name.
  braceExpansion: false,
  // fast-glob migration: directory patterns must not grow a trailing `/**`.
  expandDirectories: false,
  followSymbolicLinks: true,
  onlyFiles: true,
} as const

/**
 * A pattern over one of the two bounds. The message is the binary's, verbatim;
 * `limit` and `max` let a caller name the bound next to the artifact.
 */
export class GlobBoundsError extends Error {
  constructor(
    message: string,
    readonly limit: 'nesting' | 'expansion',
    readonly max: number,
  ) {
    super(message)
    this.name = 'GlobBoundsError'
  }
}

/** A pattern this long is quoted by its start only, as the binary does. */
function shownPattern(pattern: string): string {
  return pattern.length > 80 ? `${pattern.slice(0, 80)}...` : pattern
}

/** The binary's `assertBraceNesting`. */
function assertBraceNesting(pattern: string): void {
  // Mirror the braces parser: `[...]` and quoted runs are literal, `(` nests like
  // `{`, and a closer only closes the innermost group of its own kind.
  const open: string[] = []
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '[') {
      for (let brackets = 1; brackets > 0 && index + 1 < pattern.length; ) {
        index += 1
        if (pattern[index] === '[') brackets += 1
        else if (pattern[index] === ']') brackets -= 1
      }
    } else if (char === '"' || char === "'" || char === '`') {
      const end = pattern.indexOf(char, index + 1)
      index = end === -1 ? pattern.length : end
    } else if (char === '{' || char === '(') {
      open.push(char)
      if (open.length > MAX_BRACE_NESTING)
        throw new GlobBoundsError(
          `Artifact output pattern nests braces more than ${MAX_BRACE_NESTING} levels deep: ${shownPattern(pattern)}`,
          'nesting',
          MAX_BRACE_NESTING,
        )
    } else if ((char === '}' && open.at(-1) === '{') || (char === ')' && open.at(-1) === '(')) {
      open.pop()
    }
  }
}

function isDynamicSegment(segment: string): boolean {
  return (
    segment.includes('*') ||
    segment.includes('?') ||
    segment.includes('[') ||
    EXTGLOB_RE.test(segment)
  )
}

/** The binary's `globBase`: the static directory prefix of an expanded pattern. */
function globBase(pattern: string): string {
  const segments = pattern.split('/')
  if (segments.length <= 1) return '.'
  const base: string[] = []
  for (const segment of segments.slice(0, -1)) {
    if (segment === '') continue
    if (isDynamicSegment(segment)) break
    base.push(segment)
  }
  // An absolute pattern stays absolute, or `/etc/*` would be rebased inside the change.
  if (pattern.startsWith('/')) return `/${base.join('/')}`
  return base.length > 0 ? base.join('/') : '.'
}

// NUL-prefixed so no `generates` value can forge them (`path.join` rejects a NUL first).
const LITERAL_BRACE_OPEN = '\u0000<'
const LITERAL_BRACE_CLOSE = '\u0000>'

function hasTopLevelExpansion(body: string): boolean {
  let depth = 0
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (char === '{') depth += 1
    else if (char === '}') depth = Math.max(0, depth - 1)
    else if (depth === 0) {
      if (char === ',') return true
      if (char === '.' && body[index + 1] === '.') return true
    }
  }
  return false
}

interface BraceGroup {
  pre: string
  body: string
  post: string
}

function findTopLevelExpansion(pattern: string): BraceGroup | null {
  const stack: number[] = []
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '{') {
      stack.push(index)
    } else if (char === '}' && stack.length > 0) {
      const open = stack.pop()
      if (open === undefined) continue
      // Only the outermost group that expands: peeling the innermost first turns a
      // deep pattern into a binary tree.
      if (stack.length > 0) continue
      const body = pattern.slice(open + 1, index)
      if (!hasTopLevelExpansion(body)) {
        // `{prefix{a,b}}`: the outer braces stay literal, a nested group may expand.
        const nested = findTopLevelExpansion(body)
        if (!nested) continue
        return {
          pre: `${pattern.slice(0, open + 1)}${nested.pre}`,
          body: nested.body,
          post: `${nested.post}${pattern.slice(index)}`,
        }
      }
      return { pre: pattern.slice(0, open), body, post: pattern.slice(index + 1) }
    }
  }
  return null
}

function assertExpansionBudget(pattern: string, count: number): void {
  if (count <= MAX_BRACE_EXPANSIONS) return
  throw new GlobBoundsError(
    `Artifact output pattern expands to more than ${MAX_BRACE_EXPANSIONS} patterns: ${shownPattern(pattern)}`,
    'expansion',
    MAX_BRACE_EXPANSIONS,
  )
}

/** The binary's `expandArtifactBraces`: one real group at a time, within the budget. */
export function expandArtifactBraces(pattern: string): string[] {
  if (pattern.includes('\u0000')) throw new Error('Artifact output pattern contains a NUL byte')
  const pending = [pattern]
  const finished: string[] = []
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined) break
    const group = findTopLevelExpansion(current)
    if (!group) {
      finished.push(
        current.replaceAll(LITERAL_BRACE_OPEN, '{').replaceAll(LITERAL_BRACE_CLOSE, '}'),
      )
      continue
    }
    const wrapped = `{${group.body}}`
    // `max` makes this budget the binding one; one more than allowed means over budget.
    const remaining = Math.max(MAX_BRACE_EXPANSIONS - (pending.length + finished.length), 0)
    const alternatives = expand(wrapped, { max: remaining + 1 })
    if (alternatives.length === 1 && alternatives[0] === wrapped) {
      pending.push(
        `${group.pre}${LITERAL_BRACE_OPEN}${group.body}${LITERAL_BRACE_CLOSE}${group.post}`,
      )
      continue
    }
    // Checked before the push so the budget bounds memory, not just the result.
    assertExpansionBudget(pattern, pending.length + finished.length + alternatives.length)
    for (const alternative of alternatives) pending.push(`${group.pre}${alternative}${group.post}`)
  }
  const normalized = finished
    .map((value) => value.replace(DUPLICATE_SLASH_RE, '/'))
    .filter((value) => value.length > 0)
  return normalized.length > 0 ? normalized : [pattern]
}

/** One directory level: picomatch matches the segment, readdir keeps symlink entries. */
function listDirectoryMatches(directory: string, segment: string): string[] {
  let entries: Dirent[]
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch (err) {
    if (errorCode(err) === 'ENOENT') return []
    throw err
  }
  const isMatch = picomatch(segment, { dot: false, nobrace: true, noglobstar: true, posix: true })
  const names: string[] = []
  for (const entry of entries) if (isMatch(entry.name)) names.push(entry.name)
  return names
}

function hasBraceExpansion(pattern: string): boolean {
  const openings: number[] = []
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern[index] === '{') openings.push(index)
    if (pattern[index] !== '}') continue
    const opening = openings.pop()
    if (opening !== undefined && BRACE_EXPANSION_SEPARATORS_RE.test(pattern.slice(opening, index)))
      return true
  }
  return false
}

function errorCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code
}

function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/')
}

/** The binary's `isGlobPattern`: wildcards, extglobs, and brace expansions. */
export function isGlobPattern(pattern: string): boolean {
  const normalized = toPosixPath(pattern)
  return (
    normalized.includes('*') ||
    normalized.includes('?') ||
    normalized.includes('[') ||
    EXTGLOB_RE.test(normalized) ||
    hasBraceExpansion(normalized)
  )
}

/** The binary's `FileSystemUtils.canonicalizeExistingPath`. */
export function canonicalizeExistingPath(targetPath: string): string {
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
export function isPathWithin(allowedDirectory: string, targetPath: string): boolean {
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
 * The binary's `FileSystemUtils.assertPathWithinAllowingLinkedLeaf`: like
 * `assertPathWithin`, but a target that is itself a symlink may resolve elsewhere
 * (a project keeping `openspec/changes` in another repository). Its parent must
 * still be confined, and a dangling link throws.
 */
export function assertPathWithinAllowingLinkedLeaf(
  allowedDirectory: string,
  targetPath: string,
): void {
  const resolvedTarget = resolve(targetPath)
  let isLink = false
  try {
    isLink = lstatSync(resolvedTarget).isSymbolicLink()
  } catch (err) {
    if (errorCode(err) !== 'ENOENT') throw err
  }
  if (!isLink) {
    assertPathWithin(allowedDirectory, resolvedTarget)
    return
  }
  assertPathWithin(allowedDirectory, dirname(resolvedTarget))
  realpathSync.native(resolvedTarget)
}

/**
 * The binary's archive pre-flight (`ArchiveCommand.run`, 1.14.2+): `openspec/`,
 * `openspec/changes` and `openspec/specs` may be project-owned symlinks; `archive/`
 * may not leave the changes directory. Returns the first managed directory that
 * fails, which the binary refuses as `archive_path_outside_root`.
 */
export function archiveManagedDirOutsideRoot(paths: {
  projectRoot: string
  changesDir: string
  archiveDir: string
  specsDir: string
}): string | undefined {
  const openspecDir = dirname(paths.changesDir)
  const checks: [string, string, boolean][] = [
    [paths.projectRoot, openspecDir, true],
    [openspecDir, paths.changesDir, true],
    [paths.changesDir, paths.archiveDir, false],
    [openspecDir, paths.specsDir, true],
  ]
  for (const [allowed, managed, allowLinkedLeaf] of checks) {
    try {
      if (allowLinkedLeaf) assertPathWithinAllowingLinkedLeaf(allowed, managed)
      else assertPathWithin(allowed, managed)
    } catch (err) {
      // The binary's bare `catch`: any failure refuses the archive.
      if (!(err instanceof Error)) throw err
      return managed
    }
  }
  return undefined
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
    // `.` and `..` are not directory entries: resolve them directly so a
    // `**/../` pattern is confined before any glob runs.
    if (segment === '' || segment === '.' || segment === '..') {
      const candidate = resolve(canonicalDir, segment === '' ? '.' : segment)
      const canonicalCandidate = canonicalizeExistingPath(candidate)
      assertPathWithin(canonicalChangeDir, canonicalCandidate)
      assertGlobDirectoryTraversal(
        changeDir,
        canonicalCandidate,
        directorySegments,
        segmentIndex + 1,
        visited,
        canonicalChangeDir,
        ancestors,
      )
      return
    }
    const matches = listDirectoryMatches(canonicalDir, segment === '**' ? '*' : segment)
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
 * for a pattern or a match that leaves the change, and a `GlobBoundsError` for
 * one over the nesting or expansion bound.
 */
export function resolveArtifactOutputs(changeDir: string, generates: string): string[] {
  const isGlob = isGlobPattern(generates)
  if (isGlob) assertBraceNesting(toPosixPath(generates))
  const outputPath = join(changeDir, generates)
  assertPathWithin(changeDir, outputPath)
  if (!isGlob) {
    try {
      return statSync(outputPath).isFile() ? [canonicalizeExistingPath(outputPath)] : []
    } catch {
      // The binary's bare `catch`: any stat failure is no output.
      return []
    }
  }
  const normalizedPattern = toPosixPath(generates).replace(DUPLICATE_SLASH_RE, '/')
  // Braces expand before any filesystem access: a `../` alternative is invisible until then.
  const patterns = expandArtifactBraces(normalizedPattern)
  for (const pattern of patterns) assertPathWithin(changeDir, resolve(changeDir, globBase(pattern)))
  for (const pattern of patterns)
    assertGlobDirectoryTraversal(changeDir, changeDir, pattern.split('/').slice(0, -1))
  const matches = globSync(patterns, { cwd: changeDir, ...ARTIFACT_GLOB_OPTIONS }).map((match) => {
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

/**
 * The two bounds alone, before any filesystem access, with the artifact named:
 * `Artifact '<id>' generates: <binary message>`. Callers that otherwise read an
 * unresolvable output as "no signal" run this first, so an over-bound schema
 * pattern fails loud instead of reading as an absent artifact.
 */
export function assertArtifactPatternBounds(
  artifactId: string,
  generates: string,
  field = 'generates',
): void {
  if (!isGlobPattern(generates)) return
  const normalized = toPosixPath(generates)
  try {
    assertBraceNesting(normalized)
    expandArtifactBraces(normalized.replace(DUPLICATE_SLASH_RE, '/'))
  } catch (err) {
    if (!(err instanceof GlobBoundsError)) throw err
    throw new GlobBoundsError(
      `Artifact '${artifactId}' ${field}: ${err.message}`,
      err.limit,
      err.max,
    )
  }
}
