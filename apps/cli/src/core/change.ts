import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from 'node:fs'
import { join, resolve } from 'node:path'

import { parse as parseYaml } from 'yaml'

import { loadSchema, userSchemasDir } from './change-metadata.ts'
import { artifactOutputExists } from './glob.ts'
import { openspecPackageDir } from './openspec.ts'

/**
 * The 11 conventional-commit types cospec manages as schemas. This is the frozen
 * structural list (== commitlint type-enum); the authored canon content for each
 * lives in Track D's `canon/types/`. Kept here because change/schema resolution
 * is the lowest layer that must distinguish a cospec type from a legacy schema.
 */
export const COSPEC_TYPES = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
] as const

export type CospecType = (typeof COSPEC_TYPES)[number]

export function isCospecType(name: string): name is CospecType {
  return (COSPEC_TYPES as readonly string[]).includes(name)
}

export function openspecDir(cwd: string): string {
  return join(cwd, 'openspec')
}

export function changesDir(cwd: string): string {
  return join(cwd, 'openspec', 'changes')
}

export function archiveDir(cwd: string): string {
  return join(cwd, 'openspec', 'changes', 'archive')
}

export interface OpenspecYaml {
  schema: string
  created?: string
  /** the change-creation schema version (DESIGN §5); absent ⇒ callers treat it as 1. */
  schemaVersion?: number
  /**
   * `skip_specs:` — a persisted request that a spec-bearing type accepts no
   * delta files (the durable equivalent of `cospec archive --skip-specs`). A
   * present-but-non-boolean value is treated as absent here — flagging it is
   * `meta/skip-specs-type`'s job at validate time, not this reader's.
   */
  skipSpecs?: boolean
  /**
   * `retire_capabilities:` — this change intentionally retires (deletes) one
   * or more living-spec capabilities rather than modifying them. A
   * present-but-non-boolean value is treated as absent here — flagging it is
   * `meta/retire-capabilities-type`'s job at validate time, not this reader's.
   */
  retireCapabilities?: boolean
}

/**
 * A `schemaVersion:` value only counts as stamped when it is a positive integer,
 * mirroring the `meta/openspec-yaml` rule. Anything else (0, negative, or
 * fractional) is treated as absent by readers so callers fall back to v1
 * semantics rather than feeding garbage into `enforcedApplyRequires` — a
 * `schemaVersion: 0` must not grandfather every artifact out of the gate.
 */
export function isValidSchemaVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

/**
 * Parse a change's `.openspec.yaml`. Returns `undefined` when the file is
 * absent, unparseable, or missing a string `schema:` — validation diagnostics
 * (meta/openspec-yaml) are the validate command's job, not this reader's.
 */
export function readOpenspecYaml(changeDir: string): OpenspecYaml | undefined {
  const path = join(changeDir, '.openspec.yaml')
  if (!existsSync(path)) return undefined
  let doc: unknown
  try {
    doc = parseYaml(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
  if (doc === null || typeof doc !== 'object') return undefined
  const record = doc as Record<string, unknown>
  const schema = record.schema
  if (typeof schema !== 'string' || schema.length === 0) return undefined
  const created = typeof record.created === 'string' ? record.created : undefined
  const schemaVersion = isValidSchemaVersion(record.schemaVersion)
    ? record.schemaVersion
    : undefined
  const skipSpecs = typeof record.skip_specs === 'boolean' ? record.skip_specs : undefined
  const retireCapabilities =
    typeof record.retire_capabilities === 'boolean' ? record.retire_capabilities : undefined
  return { schema, created, schemaVersion, skipSpecs, retireCapabilities }
}

export interface Change {
  id: string
  dir: string
  /** Raw `schema:` value; empty string when `.openspec.yaml` is missing/invalid. */
  schema: string
  created?: string
  /** the change-creation schema version (DESIGN §5); absent ⇒ callers treat it as 1. */
  schemaVersion?: number
  /** `skip_specs:` from `.openspec.yaml`, when boolean. */
  skipSpecs?: boolean
  /** `retire_capabilities:` from `.openspec.yaml`, when boolean. */
  retireCapabilities?: boolean
}

function listDirs(path: string): string[] {
  if (!existsSync(path)) return []
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

/**
 * Active changes: every dir under `openspec/changes/` except `archive/` and
 * dot-directories, as the binary's `getAvailableChanges` enumerates them.
 */
export function listChanges(cwd: string): Change[] {
  return listChangeDirs(cwd).filter((change) => !change.id.startsWith('.'))
}

/**
 * Every directory `openspec list` lists: all but `archive/`, dot-directories
 * included, sorted by name.
 */
export function listChangeDirs(cwd: string): Change[] {
  const base = changesDir(cwd)
  return listDirs(base)
    .filter((name) => name !== 'archive')
    .toSorted()
    .map((id) => changeAt(join(base, id), id))
}

function changeAt(dir: string, id: string): Change {
  const yaml = readOpenspecYaml(dir)
  return {
    id,
    dir,
    schema: yaml?.schema ?? '',
    created: yaml?.created,
    schemaVersion: yaml?.schemaVersion,
    skipSpecs: yaml?.skipSpecs,
    retireCapabilities: yaml?.retireCapabilities,
  }
}

/**
 * The kebab-case slug grammar `cospec new` creates a change under. A change
 * made any other way is still looked up by its directory name
 * (`changeLookupNameProblem`); `meta/name-kebab` reports the name.
 */
export const CHANGE_ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/**
 * Why the binary's `validateChangeLookupName` refuses `name` as a change to
 * look up, or undefined: a relative path segment, a path separator, a NUL, a
 * leading dot, or the reserved `archive` — anything that would escape the
 * changes directory or address an entry its change listing excludes. Empty
 * names never reach the binary's check, which answers them first.
 */
export function changeLookupNameProblem(name: string): string | undefined {
  if (name.length === 0) return 'Change name cannot be empty'
  if (name === '.' || name === '..') return 'Change name cannot be a relative path segment'
  if (name.includes('/') || name.includes('\\')) return 'Change name cannot contain path separators'
  if (name.includes('\0')) return 'Change name cannot contain null characters'
  if (name.startsWith('.')) return 'Change name cannot start with a dot'
  if (name === 'archive') return "'archive' is reserved for archived changes"
  return undefined
}

/**
 * Resolve an active change by exact name, as the binary's
 * `validateChangeExists` does: a name it accepts for lookup, naming a
 * directory under `openspec/changes/`. `undefined` otherwise — a regular
 * file of that name included.
 */
export function resolveChange(cwd: string, id: string): Change | undefined {
  if (changeLookupNameProblem(id) !== undefined) return undefined
  const dir = join(changesDir(cwd), id)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return undefined
  return changeAt(dir, id)
}

const ARCHIVE_ENTRY = /^(\d{4}-\d{2}-\d{2})-(.+)$/

export interface ArchiveEntry {
  slug: string
  date: string
  dir: string
}

export interface ArchiveIndex {
  /** slug → the latest-dated archived entry for that slug. */
  bySlug: Map<string, ArchiveEntry>
  entries: ArchiveEntry[]
  warnings: string[]
}

/**
 * Index of `openspec/changes/archive/` keyed by slug. Directories matching
 * `^(\d{4}-\d{2}-\d{2})-(.+)$` are indexed; duplicate slugs keep the latest date
 * (with a warning); non-conforming directory names are ignored (with a warning).
 */
export function readArchiveIndex(cwd: string): ArchiveIndex {
  const bySlug = new Map<string, ArchiveEntry>()
  const warnings: string[] = []
  const base = archiveDir(cwd)
  for (const name of listDirs(base)) {
    const match = ARCHIVE_ENTRY.exec(name)
    if (match === null) {
      warnings.push(`ignoring non-conforming archive directory: ${name}`)
      continue
    }
    const date = match[1]!
    const slug = match[2]!
    const entry: ArchiveEntry = { slug, date, dir: join(base, name) }
    const existing = bySlug.get(slug)
    if (existing === undefined) {
      bySlug.set(slug, entry)
      continue
    }
    warnings.push(
      `duplicate archived slug '${slug}' (${existing.date}, ${date}) — using latest date`,
    )
    // ISO dates sort lexicographically; keep the most recent.
    if (date > existing.date) bySlug.set(slug, entry)
  }
  return { bySlug, entries: [...bySlug.values()], warnings }
}

export type SchemaKind = 'cospec' | 'legacy' | 'unknown'
export type SchemaSource = 'project' | 'user' | 'package'

export interface SchemaResolution {
  name: string
  kind: SchemaKind
  isCospecType: boolean
  /** Where a legacy schema resolved from (undefined for cospec/unknown). */
  source?: SchemaSource
}

/**
 * Classify a change's `schema:` value:
 * - `cospec` — one of the 11 managed types.
 * - `legacy` — a forked/custom schema resolvable as a project, user, or bundled
 *   package schema (structural checks only; validation is delegated — §4.1).
 * - `unknown` — not a cospec type and resolvable nowhere.
 */
export function resolveSchema(cwd: string, name: string): SchemaResolution {
  if (isCospecType(name)) return { name, kind: 'cospec', isCospecType: true }

  const projectSchema = join(openspecDir(cwd), 'schemas', name, 'schema.yaml')
  if (existsSync(projectSchema))
    return { name, kind: 'legacy', isCospecType: false, source: 'project' }

  const userSchema = join(userSchemasDir(), name, 'schema.yaml')
  if (existsSync(userSchema)) return { name, kind: 'legacy', isCospecType: false, source: 'user' }

  try {
    const packageSchema = join(openspecPackageDir(), 'schemas', name, 'schema.yaml')
    if (existsSync(packageSchema))
      return { name, kind: 'legacy', isCospecType: false, source: 'package' }
  } catch {
    // package resolution failure falls through to unknown
  }

  return { name, kind: 'unknown', isCospecType: false }
}

// --- Namespace folders --------------------------------------------------------
//
// A port of the binary's `utils/nested-change` (design D2): a directory under
// `openspec/changes/` that only wraps nested change directories
// (`changes/mobile/refresh-token/`) is a namespace folder, not a change. The
// probe only ever adds a diagnostic, so — as upstream — a path that cannot be
// read counts as holding nothing rather than failing the command around it.

/** Files that only ever sit at the root of a change directory. */
const CHANGE_ROOT_MARKERS = ['.openspec.yaml', 'proposal.md', 'tasks.md', 'design.md'] as const

/** How far below a candidate the search looks: upstream's `MAX_NESTING_DEPTH`. */
const MAX_NESTING_DEPTH = 3

export interface NestedChangeFinding {
  /** The folder's name under `openspec/changes/`. */
  name: string
  /** Each nested change as `<folder>/<child>[/…]`, sorted. */
  nested: string[]
}

function isErrno(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === code
}

/** `stat(path).isFile()`, false for a path that cannot be stat'ed (upstream's `.catch`). */
function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/** `readdir(dir)`, or no entries when it cannot be read (upstream's `.catch(() => [])`). */
function entriesOrNone(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/**
 * upstream's `hasAnyFileUnder`: any non-dot file or symlink at any depth.
 * A missing directory holds nothing; any other read failure is thrown for the
 * caller to decide.
 */
function hasAnyFileUnder(dir: string): boolean {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return false
    throw error
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.isFile() || entry.isSymbolicLink()) return true
    if (entry.isDirectory() && hasAnyFileUnder(join(dir, entry.name))) return true
  }
  return false
}

/**
 * The root's `openspec/config.yaml` (else `config.yml`) `schema:` — upstream's
 * `readProjectConfig(root)?.schema`. A config that cannot be read or parsed
 * names none, as upstream falls back to its default then.
 */
export function projectConfigSchema(base: string): string | undefined {
  const yaml = join(openspecDir(base), 'config.yaml')
  const path = existsSync(yaml) ? yaml : join(openspecDir(base), 'config.yml')
  if (!existsSync(path)) return undefined
  let doc: unknown
  try {
    doc = parseYaml(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
  if (doc === null || typeof doc !== 'object') return undefined
  const schema = (doc as Record<string, unknown>).schema
  return typeof schema === 'string' && schema.length > 0 ? schema : undefined
}

/**
 * upstream's `hasSchemaOutput`: `dir` holds a file where the schema it resolves
 * to (its `.openspec.yaml`, else the root's `config.yaml`, else `spec-driven`)
 * generates one. A schema that cannot be resolved gives no signal.
 */
function hasSchemaOutput(dir: string, projectRoot: string): boolean {
  // A candidate reaching here has no regular `.openspec.yaml`; anything else at
  // that path fails upstream's metadata read, which gives no signal.
  if (existsSync(join(dir, '.openspec.yaml'))) return false
  const name = projectConfigSchema(projectRoot) ?? 'spec-driven'
  let artifacts: { generates: string }[]
  try {
    artifacts = loadSchema(name, projectRoot)
  } catch {
    return false
  }
  try {
    return artifacts.some((artifact) => artifactOutputExists(dir, artifact.generates))
  } catch {
    // upstream's bare `catch`: an output it cannot resolve (one leaving the
    // change, a linked directory cycle) gives no signal.
    return false
  }
}

/** upstream's `looksLikeChange`: a root marker, a populated `specs/`, or a schema output. */
function looksLikeChange(dir: string, projectRoot: string): boolean {
  if (CHANGE_ROOT_MARKERS.some((marker) => isRegularFile(join(dir, marker)))) return true
  try {
    if (hasAnyFileUnder(join(dir, 'specs'))) return true
  } catch {
    // upstream's `.catch(() => false)`: an unreadable `specs/` is no signal.
  }
  return hasSchemaOutput(dir, projectRoot)
}

function collectNested(
  dir: string,
  prefix: string,
  depth: number,
  found: string[],
  projectRoot: string,
): void {
  if (depth > MAX_NESTING_DEPTH) return
  for (const entry of entriesOrNone(dir)) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const child = join(dir, entry.name)
    const id = `${prefix}/${entry.name}`
    if (looksLikeChange(child, projectRoot)) {
      found.push(id)
      continue
    }
    collectNested(child, id, depth + 1, found, projectRoot)
  }
}

/**
 * Whether `changes/<name>/` is a namespace folder holding nested change
 * directories rather than a change of its own (upstream's
 * `findNestedChangesIn`). `undefined` for every ordinary change, a scaffolded
 * empty one included, for `archive` and for a dot-directory.
 */
export function findNestedChangesIn(dir: string, name: string): NestedChangeFinding | undefined {
  if (name === 'archive' || name.startsWith('.')) return undefined
  const folder = join(dir, name)
  // changes/ is always <root>/openspec/changes, for project and store roots.
  const projectRoot = resolve(dir, '..', '..')
  if (looksLikeChange(folder, projectRoot)) return undefined
  if (entriesOrNone(folder).some((e) => !e.name.startsWith('.') && !e.isDirectory()))
    return undefined
  const nested: string[] = []
  collectNested(folder, name, 1, nested, projectRoot)
  return nested.length === 0 ? undefined : { name, nested: nested.toSorted() }
}

/** `findNestedChangesIn` across every candidate name, for the commands that enumerate. */
export function findNestedChanges(dir: string, names: readonly string[]): NestedChangeFinding[] {
  return names.flatMap((name) => findNestedChangesIn(dir, name) ?? [])
}

/** upstream's `describeNestedChange`: the one explanation every surface prints, verbatim. */
export function describeNestedChange(finding: NestedChangeFinding): string {
  const list = finding.nested.map((id) => `openspec/changes/${id}/`).join(', ')
  const example = finding.nested[0]!.split('/').join('-')
  return (
    `"${finding.name}" is not a change: it is a folder wrapping ${list}. ` +
    'A change must be a directory directly under openspec/changes/, so those ' +
    'nested directories are invisible to OpenSpec while the folder around them ' +
    'is reported as a change. Nested paths are supported under openspec/specs/ ' +
    `only. Rename each nested change to a flat name (for example "${example}").`
  )
}
