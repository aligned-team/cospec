import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

import pkg from '../../package.json'

// The managed-file protocol (DESIGN §6.3, §6.5). Every generated file carries
// provenance so `update` can tell an untouched managed file (rewrite freely)
// from a user-edited one (preserve, write a .cospec-new sidecar) from a foreign
// file (never clobber). Markdown-with-frontmatter files self-describe via a
// `metadata` block; frontmatter-less files (schemas) track hashes in the
// `openspec/.cospec-manifest.json` manifest. Outcomes are a frozen contract.

export const MANAGED_AUTHOR = 'cospec'
export const CONTENT_HASH_PREFIX = 'sha256:'
export const COSPEC_VERSION: string = pkg.version

/** The `generatedBy` provenance tag, e.g. `cospec@0.1.0`. */
export function generatedByTag(version: string = COSPEC_VERSION): string {
  return `cospec@${version}`
}

export const CURRENT_GENERATED_BY = generatedByTag()

/** `sha256:<hex>` of the given content (body-only for frontmatter files). */
export function computeContentHash(content: string): string {
  return CONTENT_HASH_PREFIX + createHash('sha256').update(content, 'utf8').digest('hex')
}

export type WriteOutcome =
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'preserved-foreign'
  | 'preserved-modified'
  | 'forced'
  | 'removed'

export interface WriteResult {
  path: string
  outcome: WriteOutcome
  /** Sidecar path written for `preserved-*` outcomes (`<path>.cospec-new`). */
  sidecar?: string
}

interface SplitResult {
  frontmatter?: Record<string, unknown>
  body: string
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

/** Split a `---`-delimited YAML frontmatter block from the body. */
export function splitFrontmatter(text: string): SplitResult {
  const match = FRONTMATTER.exec(text)
  if (match === null) return { body: text }
  let frontmatter: Record<string, unknown> | undefined
  try {
    const parsed = parseYaml(match[1]!) as unknown
    frontmatter =
      parsed !== null && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : undefined
  } catch {
    frontmatter = undefined
  }
  return { frontmatter, body: match[2]! }
}

interface ManagedMeta {
  author?: string
  generatedBy?: string
  contentHash?: string
}

function readMeta(frontmatter: Record<string, unknown> | undefined): ManagedMeta | undefined {
  if (frontmatter === undefined) return undefined
  const meta = frontmatter.metadata
  if (meta === null || typeof meta !== 'object') return undefined
  const record = meta as Record<string, unknown>
  return {
    author: typeof record.author === 'string' ? record.author : undefined,
    generatedBy: typeof record.generatedBy === 'string' ? record.generatedBy : undefined,
    contentHash: typeof record.contentHash === 'string' ? record.contentHash : undefined,
  }
}

export interface ManagedFrontmatter {
  /** Frontmatter fields excluding the injected `metadata` block (e.g. name, description). */
  fields: Record<string, unknown>
  body: string
}

/** Serialize a managed markdown file with the provenance `metadata` block injected. */
export function renderManaged(
  fm: ManagedFrontmatter,
  generatedBy: string = CURRENT_GENERATED_BY,
): string {
  const doc = {
    ...fm.fields,
    metadata: {
      author: MANAGED_AUTHOR,
      generatedBy,
      contentHash: computeContentHash(fm.body),
    },
  }
  const yamlText = stringifyYaml(doc, { lineWidth: 0 }).trimEnd()
  return `---\n${yamlText}\n---\n${fm.body}`
}

function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  writeFileSync(tmp, content)
  renameSync(tmp, path)
}

export interface WriteManagedOptions {
  generatedBy?: string
  /** Treat a user-modified managed file as unmodified (explicit clobber). */
  force?: boolean
}

/**
 * The 6-outcome managed-write for a markdown-with-frontmatter file (DESIGN §6.5).
 * A version bump alone (same body, newer `generatedBy`) yields `updated` so the
 * one frontmatter line is refreshed.
 */
export function writeManaged(
  path: string,
  fm: ManagedFrontmatter,
  opts: WriteManagedOptions = {},
): WriteResult {
  const generatedBy = opts.generatedBy ?? CURRENT_GENERATED_BY
  const full = renderManaged(fm, generatedBy)
  const sidecar = `${path}.cospec-new`

  if (!existsSync(path)) {
    atomicWrite(path, full)
    return { path, outcome: 'created' }
  }

  const existing = readFileSync(path, 'utf8')
  const { frontmatter, body } = splitFrontmatter(existing)
  const meta = readMeta(frontmatter)

  if (meta === undefined || meta.author !== MANAGED_AUTHOR || meta.contentHash === undefined) {
    atomicWrite(sidecar, full)
    return { path, outcome: 'preserved-foreign', sidecar }
  }

  if (meta.contentHash === computeContentHash(body)) {
    // Unmodified managed file.
    if (body === fm.body && meta.generatedBy === generatedBy) return { path, outcome: 'unchanged' }
    atomicWrite(path, full)
    return { path, outcome: 'updated' }
  }

  // User modified a managed file.
  if (opts.force) {
    atomicWrite(path, full)
    return { path, outcome: 'forced' }
  }
  atomicWrite(sidecar, full)
  return { path, outcome: 'preserved-modified', sidecar }
}

export interface WriteManifestOptions {
  /** The last generated hash for this path from the manifest, if tracked. */
  priorHash?: string
  force?: boolean
}

/**
 * The same 6-outcome protocol for a frontmatter-less file (schema.yaml,
 * templates) tracked by the manifest instead of an in-file metadata block.
 */
export function writeManagedManifestFile(
  path: string,
  content: string,
  opts: WriteManifestOptions = {},
): WriteResult {
  const sidecar = `${path}.cospec-new`

  if (!existsSync(path)) {
    atomicWrite(path, content)
    return { path, outcome: 'created' }
  }

  const existing = readFileSync(path, 'utf8')

  if (opts.priorHash === undefined) {
    // Exists but never tracked by us — foreign; never clobber.
    atomicWrite(sidecar, content)
    return { path, outcome: 'preserved-foreign', sidecar }
  }

  if (computeContentHash(existing) === opts.priorHash) {
    if (existing === content) return { path, outcome: 'unchanged' }
    atomicWrite(path, content)
    return { path, outcome: 'updated' }
  }

  if (opts.force) {
    atomicWrite(path, content)
    return { path, outcome: 'forced' }
  }
  atomicWrite(sidecar, content)
  return { path, outcome: 'preserved-modified', sidecar }
}

/**
 * Resolve a manifest-supplied relative path to an absolute one, but only if it
 * stays strictly inside one of `roots` (each a directory cospec owns, expressed
 * relative to `cwd`). Manifest keys come from a committed `.cospec-manifest.json`
 * that may be attacker-controlled — you clone or pull an untrusted openspec repo
 * whose manifest is poisoned — so a crafted key like `../victim.txt`, an
 * absolute path, or a `foo/../../etc/hosts` traversal must never resolve to a
 * file outside the harness/openspec tree. Returns the absolute path when
 * `relpath` is an ordinary relative path contained by a root; otherwise
 * `undefined` (the caller must skip it, never join-and-delete).
 */
export function resolveContainedPath(
  cwd: string,
  relpath: string,
  roots: readonly string[],
): string | undefined {
  // Reject absolutes and any traversal/degenerate segment up front, independent
  // of what `resolve` would later collapse.
  if (relpath === '' || isAbsolute(relpath)) return undefined
  if (relpath.split(/[/\\]/).some((seg) => seg === '' || seg === '.' || seg === '..')) {
    return undefined
  }
  const abs = resolve(cwd, relpath)
  for (const root of roots) {
    const rootAbs = resolve(cwd, root)
    // Must be a descendant of the root, never the root dir itself.
    if (abs !== rootAbs && abs.startsWith(rootAbs + sep)) return abs
  }
  return undefined
}

/**
 * Delete a managed file that the current version no longer emits — only when it
 * is unmodified (hash matches the manifest) or `force`; otherwise leave it and
 * report `preserved-modified`. An already-absent file reports `removed`.
 *
 * `relpath` is a manifest key and therefore untrusted: it is run through
 * {@link resolveContainedPath} against `roots` before any filesystem access, so
 * a poisoned manifest cannot make this delete outside the dirs cospec owns.
 * Returns `undefined` (no-op) when the path escapes containment.
 */
export function removeManagedFile(
  cwd: string,
  relpath: string,
  roots: readonly string[],
  priorHash: string | undefined,
  force = false,
): WriteResult | undefined {
  const path = resolveContainedPath(cwd, relpath, roots)
  if (path === undefined) return undefined
  if (!existsSync(path)) return { path: relpath, outcome: 'removed' }
  const existing = readFileSync(path, 'utf8')
  if (force || (priorHash !== undefined && computeContentHash(existing) === priorHash)) {
    rmSync(path)
    return { path: relpath, outcome: 'removed' }
  }
  return { path: relpath, outcome: 'preserved-modified' }
}

export interface Manifest {
  cospecVersion: string
  /** repo-relative path → `sha256:<hex>` of the generated content. */
  files: Record<string, string>
}

export function manifestPath(cwd: string): string {
  return join(cwd, 'openspec', '.cospec-manifest.json')
}

/** Read `openspec/.cospec-manifest.json`; `undefined` when absent/unparseable. */
export function readManifest(cwd: string): Manifest | undefined {
  const path = manifestPath(cwd)
  if (!existsSync(path)) return undefined
  let doc: unknown
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
  if (doc === null || typeof doc !== 'object') return undefined
  const record = doc as Record<string, unknown>
  const files = record.files
  return {
    cospecVersion: typeof record.cospecVersion === 'string' ? record.cospecVersion : '',
    files: files !== null && typeof files === 'object' ? (files as Record<string, string>) : {},
  }
}

export function writeManifest(cwd: string, manifest: Manifest): void {
  atomicWrite(manifestPath(cwd), `${JSON.stringify(manifest, null, 2)}\n`)
}
