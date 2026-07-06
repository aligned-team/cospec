import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { parse as parseYaml } from 'yaml'

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
  return { schema, created, schemaVersion }
}

export interface Change {
  id: string
  dir: string
  /** Raw `schema:` value; empty string when `.openspec.yaml` is missing/invalid. */
  schema: string
  created?: string
  /** the change-creation schema version (DESIGN §5); absent ⇒ callers treat it as 1. */
  schemaVersion?: number
}

function listDirs(path: string): string[] {
  if (!existsSync(path)) return []
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

/** Active changes: every dir under `openspec/changes/` except `archive/`. */
export function listChanges(cwd: string): Change[] {
  const base = changesDir(cwd)
  return listDirs(base)
    .filter((name) => name !== 'archive')
    .toSorted()
    .map((id) => {
      const dir = join(base, id)
      const yaml = readOpenspecYaml(dir)
      return {
        id,
        dir,
        schema: yaml?.schema ?? '',
        created: yaml?.created,
        schemaVersion: yaml?.schemaVersion,
      }
    })
}

/**
 * Change ids are kebab-case slugs (this is the canonical grammar `cospec new`
 * validates against). Anything else — an empty string, a path separator, or a
 * `..` traversal segment — can never name a real change, so id-taking readers
 * reject it up front rather than joining it onto `changesDir` and resolving a
 * path outside the changes tree.
 */
export const CHANGE_ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/**
 * Resolve an active change by exact id. `undefined` when the id is not a valid
 * kebab slug or the change does not exist.
 */
export function resolveChange(cwd: string, id: string): Change | undefined {
  if (!CHANGE_ID_RE.test(id)) return undefined
  const dir = join(changesDir(cwd), id)
  if (!existsSync(dir)) return undefined
  const yaml = readOpenspecYaml(dir)
  return {
    id,
    dir,
    schema: yaml?.schema ?? '',
    created: yaml?.created,
    schemaVersion: yaml?.schemaVersion,
  }
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

  const userSchema = join(homedir(), '.config', 'openspec', 'schemas', name, 'schema.yaml')
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
