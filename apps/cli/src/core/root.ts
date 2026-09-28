// Operating-root resolution (store-awareness). Every command resolves exactly
// one root up front — a local OpenSpec root, or a registered OpenSpec store —
// and then threads it: `root.base` to the filesystem readers, `root` to the
// wrapped openspec calls (which thread `root.storeArgs`, set only for an
// explicit `--store`, right after the command path). The selection is a port of
// upstream's `resolveOpenSpecRoot` (`dist/core/root-selection.js`, pinned
// 1.13.1), so cospec and bare openspec agree on which root a command targets
// from any directory; `test/contract/root-resolution.test.ts` pins the port to
// the binary fixture by fixture:
//
//   1. an explicit `--store <id>` selects that store (`store`), else
//   2. the qualifying ancestor walk: from the canonical cwd upward, the nearest
//      `openspec/` directory with a planning shape (`specs/` or `changes/` as a
//      directory not carrying store metadata) or a config file
//      (`config.yaml`, else `config.yml`). A bare `openspec/` is skipped, so the
//      `~/openspec/<id>` store layout never makes `$HOME` a phantom root.
//      A planning root always wins (`nearest`); a `store:` pointer on it is
//      ignored with a warning. Only a config-only root follows its pointer
//      (`declared`); without one it is itself the root (`nearest`), else
//   3. the machine-global `defaultStore` (`global_default`), read through the
//      wrapped binary only once the walk found nothing, else
//   4. a hard error naming the registered stores when any exist, else
//   5. the cwd as an implicit root (`implicit`); each command's own
//      missing-`openspec/` check reports it from there.
//
// Every store selection is verified on disk (identity metadata, then root
// health) before it is used, and announced on stderr in human mode.
//
// A `references:` list in config.yaml is read-only upstream context (openspec
// surfaces it in `instructions`) and is deliberately NOT a root override — it
// never redirects where a change is created or gated.

import { readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { parse as parseYaml } from 'yaml'

import { openspecStoreList, runOpenspec, suppressRelayedStderrLine, type Root } from './openspec.ts'

export type { Root } from './openspec.ts'
export { localRoot } from './openspec.ts'

/** How the root was selected — upstream's `root.source` vocabulary. */
export type RootSource = 'store' | 'declared' | 'nearest' | 'global_default' | 'implicit'

export type ResolvedRoot = Root & { source: RootSource }

export interface RootDiagnostic {
  severity: 'error'
  code: string
  message: string
  target: string
  /** Optional, as upstream's is: a failure with nothing to suggest omits it. */
  fix?: string
}

/**
 * A root-selection failure carrying upstream's diagnostic (code, target, fix).
 * `message` ends in a `Fix:` line, when there is a fix, so the top-level
 * handler prints both.
 */
export class RootSelectionError extends Error {
  readonly diagnostic: RootDiagnostic

  constructor(diagnostic: Omit<RootDiagnostic, 'severity'>) {
    super(
      diagnostic.fix === undefined
        ? diagnostic.message
        : `${diagnostic.message}\nFix: ${diagnostic.fix}`,
    )
    this.name = 'RootSelectionError'
    this.diagnostic = { severity: 'error', ...diagnostic }
  }
}

/**
 * The one `--json` document for a resolver hard-error (design D12): the
 * command's own empty failure payload (`payload`, e.g. `context`'s
 * `root: null, members: []`), then upstream's `status` envelope carrying the
 * diagnostic — keys in upstream's order (`{...failurePayload, status}`) and
 * pretty-printed as the binary prints its own.
 */
export function rootSelectionDocument(
  error: RootSelectionError,
  payload: Readonly<Record<string, unknown>> = {},
): string {
  const { severity, code, message, target, fix } = error.diagnostic
  const status = [{ severity, code, message, target, ...(fix === undefined ? {} : { fix }) }]
  return `${JSON.stringify({ ...payload, status }, null, 2)}\n`
}

const STORE_METADATA = join('.openspec-store', 'store.yaml')
const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const KEBAB_ID_FIX = 'Use kebab-case with lowercase letters, numbers, and single hyphen separators.'

const doctorFix = (id: string): string => `Run cospec store doctor ${id} to inspect it.`

/**
 * Print a line `resolveRoot` owns and register it, so a relayed wrapped call
 * that re-derives the same root does not print it a second time (design D7).
 */
function printOwnLine(line: string): void {
  suppressRelayedStderrLine(line)
  process.stderr.write(`${line}\n`)
}

// --- Filesystem probes -------------------------------------------------------

function isErrnoCode(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === code
}

function canonicalize(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    try {
      return realpathSync(path)
    } catch {
      return resolve(path)
    }
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function exists(path: string): boolean {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}

type PathKind = 'directory' | 'file' | 'other' | 'missing'

/** Upstream's `pathKind`: only a missing path is an expected outcome. */
function pathKind(path: string): PathKind {
  try {
    const stat = statSync(path)
    if (stat.isDirectory()) return 'directory'
    return stat.isFile() ? 'file' : 'other'
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) return 'missing'
    throw error
  }
}

/** The canonical directory a walk starts from; `resolveRoot` has asserted it exists. */
function canonicalStart(cwd: string): string {
  return canonicalize(resolve(cwd))
}

/**
 * `--cwd` is cospec's own flag, so nothing upstream guards it: an invocation
 * directory that is not an existing directory would otherwise surface as the
 * runtime's spawn ENOENT, naming the interpreter's path instead of the user's.
 */
function assertInvocationDirectory(cwd: string): void {
  let kind: PathKind
  try {
    kind = pathKind(cwd)
  } catch (error) {
    if (!isErrnoCode(error, 'ENOTDIR')) throw error
    kind = 'missing'
  }
  if (kind !== 'directory')
    throw new RootSelectionError({
      code: 'directory_not_found',
      message: `directory not found: ${cwd}`,
      target: 'cwd',
    })
}

// --- Store pointer and classification ---------------------------------------

/** A `store:` pointer read the way upstream's `readStorePointer` reads it. */
export type StorePointer =
  | { filePath: null }
  | { filePath: string; value?: string; malformed?: undefined }
  | { filePath: string; value?: undefined; malformed: 'unparseable' | 'non_string' }

function configFilePath(base: string): string | null {
  for (const name of ['config.yaml', 'config.yml']) {
    const path = join(base, 'openspec', name)
    if (exists(path)) return path
  }
  return null
}

/**
 * Read the `store:` pointer from `<base>/openspec/config.yaml` (else
 * `config.yml`). An empty, comment-only or non-mapping document carries no
 * pointer; an unreadable document or a non-string `store` is malformed, which
 * fails the command only where the pointer would be followed.
 */
export function configStorePointer(base: string): StorePointer {
  const filePath = configFilePath(base)
  if (filePath === null) return { filePath: null }
  let doc: unknown
  try {
    doc = parseYaml(readFileSync(filePath, 'utf8'))
  } catch {
    return { filePath, malformed: 'unparseable' }
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return { filePath }
  const value = (doc as Record<string, unknown>).store
  if (value === undefined) return { filePath }
  if (typeof value === 'string') return { filePath, value }
  return { filePath, malformed: 'non_string' }
}

/** `specs/` or `changes/` as a directory that is not itself a store checkout. */
function isPlanningDirectory(path: string): boolean {
  return isDirectory(path) && !exists(join(path, STORE_METADATA))
}

function hasPlanningShape(base: string): boolean {
  return (
    isPlanningDirectory(join(base, 'openspec', 'specs')) ||
    isPlanningDirectory(join(base, 'openspec', 'changes'))
  )
}

/**
 * The nearest canonical ancestor of `cwd` whose `openspec/` directory has a
 * planning shape or a config file; `null` when none does.
 */
function findQualifyingRoot(cwd: string): string | null {
  let dir = canonicalStart(cwd)
  while (true) {
    if (
      isDirectory(join(dir, 'openspec')) &&
      (hasPlanningShape(dir) || configFilePath(dir) !== null)
    )
      return canonicalize(dir)
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

// --- Store selection ----------------------------------------------------------

/**
 * Upstream's `validateStoreId`, applied to whatever value arrives. A
 * `defaultStore` is raw JSON, and upstream's checks — its `length`, strict
 * `===`, and regex tests that stringify their argument — are reproduced as
 * written, so a non-string passes or fails exactly as it does there (`[]` is
 * empty, `['beta']` and `5` are kebab-case, `{}` is not).
 */
function validateStoreId(id: unknown): void {
  const text = String(id)
  let problem: string | null = null
  if ((Object(id) as { length?: unknown }).length === 0) problem = 'Store id must not be empty'
  else if (id === '.' || id === '..') problem = `Store id must not be '${text}'`
  else if (/[\\/]/u.test(text)) problem = 'Store id must not contain path separators'
  else if (!KEBAB_ID.test(text))
    problem =
      'Store id must be kebab-case with lowercase letters, numbers, and single hyphen separators'
  if (problem !== null)
    throw new RootSelectionError({
      code: 'invalid_store_id',
      message: problem,
      target: 'store.id',
      fix: KEBAB_ID_FIX,
    })
}

function invalidMetadata(detail: string): RootSelectionError {
  return new RootSelectionError({
    code: 'invalid_store_metadata',
    message: `Invalid store metadata state: ${detail}`,
    target: 'store.metadata',
    fix: 'Repair .openspec-store/store.yaml.',
  })
}

/** The metadata `id`, `null` when the file is missing; throws when it is invalid. */
function readStoreMetadataId(storeRoot: string): string | null {
  let body: string
  try {
    body = readFileSync(join(storeRoot, STORE_METADATA), 'utf8')
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) return null
    throw error
  }
  let doc: unknown
  try {
    doc = parseYaml(body)
  } catch (error) {
    throw invalidMetadata(error instanceof Error ? error.message : String(error))
  }
  // Upstream validates `{version: 1, id: string, remote?: non-empty string}`,
  // strict; the issue wording here is cospec's own.
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc))
    throw invalidMetadata('root: expected an object')
  const record = doc as Record<string, unknown>
  const issues: string[] = []
  if (record.version !== 1) issues.push('version: expected 1')
  if (typeof record.id !== 'string') issues.push('id: expected a string')
  if (
    record.remote !== undefined &&
    (typeof record.remote !== 'string' || record.remote.length === 0)
  )
    issues.push('remote: expected a non-empty string')
  const extra = Object.keys(record).filter((key) => !['version', 'id', 'remote'].includes(key))
  if (extra.length > 0) issues.push(`root: unrecognized keys ${extra.join(', ')}`)
  if (issues.length > 0) throw invalidMetadata(issues.join('; '))
  const id = record.id as string
  validateStoreId(id)
  return id
}

/** Upstream's `inspectOpenSpecRoot`, reduced to the problems that fail selection. */
function openspecRootProblems(storeRoot: string): string[] {
  const rootKind = pathKind(storeRoot)
  if (rootKind === 'missing') return ['Store root does not exist.']
  if (rootKind !== 'directory') return ['Store root is not a directory.']
  const openspecKind = pathKind(join(storeRoot, 'openspec'))
  if (openspecKind === 'missing') return ['Missing openspec/ directory.']
  if (openspecKind !== 'directory') return ['openspec/ exists but is not a directory.']
  const problems: string[] = []
  const yamlKind = pathKind(join(storeRoot, 'openspec', 'config.yaml'))
  const ymlKind = pathKind(join(storeRoot, 'openspec', 'config.yml'))
  if (yamlKind !== 'file' && ymlKind !== 'file')
    problems.push(
      yamlKind !== 'missing' || ymlKind !== 'missing'
        ? 'OpenSpec config path exists but is not a file.'
        : 'Missing openspec/config.yaml or openspec/config.yml.',
    )
  const planningDir = (rel: string): PathKind => {
    const kind = pathKind(join(storeRoot, rel))
    if (kind !== 'directory' && kind !== 'missing')
      problems.push(`${rel}/ exists but is not a directory.`)
    return kind
  }
  planningDir('openspec/specs')
  if (planningDir('openspec/changes') === 'directory') planningDir('openspec/changes/archive')
  return problems
}

/**
 * Upstream's `inspectRegisteredStore`: identity first (metadata present, valid,
 * naming the registered id), then root health. Reads files only.
 */
function assertHealthyStore(id: string, storeRoot: string): void {
  const actualId = readStoreMetadataId(storeRoot)
  if (actualId === null)
    throw new RootSelectionError({
      code: 'store_identity_mismatch',
      message: `Store '${id}' is missing identity metadata at ${join(storeRoot, STORE_METADATA)}. ${doctorFix(id)}`,
      target: 'store.metadata',
      fix: doctorFix(id),
    })
  if (actualId !== id)
    throw new RootSelectionError({
      code: 'store_identity_mismatch',
      message: `Store '${id}' metadata id '${actualId}' does not match its registered id. ${doctorFix(id)}`,
      target: 'store.metadata',
      fix: doctorFix(id),
    })
  const problems = openspecRootProblems(storeRoot)
  if (problems.length > 0)
    throw new RootSelectionError({
      code: 'unhealthy_store_root',
      message: `Store '${id}' does not have a healthy OpenSpec root at ${storeRoot}: ${problems.join(' ')} ${doctorFix(id)}`,
      target: 'openspec.root',
      fix: doctorFix(id),
    })
}

/**
 * Resolve a store id to a root via the machine registry
 * (`openspec store ls --json`), verifying the store on disk first. Throws a
 * `RootSelectionError` naming the known stores when the id is not registered
 * — a mistyped id fails loudly rather than silently falling back to local.
 * `id` is `unknown` because a `defaultStore` is raw JSON: the lookup is by
 * strict equality, as upstream's is, so a non-string id is never registered.
 */
export async function resolveStore(
  cwd: string,
  id: unknown,
  source: 'store' | 'declared' | 'global_default' = 'store',
): Promise<ResolvedRoot> {
  validateStoreId(id)
  const { stores } = await openspecStoreList(cwd)
  const found = stores.find((s) => s.id === id)
  if (found === undefined) {
    const known = stores.map((s) => s.id).join(', ')
    const message =
      `unknown store '${String(id)}' — register it with 'cospec store register <path>' or check ` +
      `'cospec store ls'. Registered stores: ${known || '(none registered)'}`
    throw new RootSelectionError(
      known === ''
        ? {
            code: 'no_registered_stores',
            message,
            target: 'store.id',
            fix: `Run cospec store setup ${String(id)} or cospec store register <path> first.`,
          }
        : {
            code: 'unknown_store',
            message,
            target: 'store.id',
            fix: 'Pass a registered store id, or run cospec store list.',
          },
    )
  }
  assertHealthyStore(found.id, found.root)
  return {
    base: canonicalize(found.root),
    cwd,
    // Only an explicit `--store` is threaded: a wrapped call spawned in `cwd`
    // re-derives a pointer or `defaultStore` root itself, so its relayed
    // `root.source` reads `declared`/`global_default` as upstream's does.
    storeArgs: source === 'store' ? ['--store', found.id] : [],
    store: found.id,
    source,
  }
}

/**
 * Re-throw a store failure reached through a pointer or `defaultStore` behind
 * upstream's origin prefix, reshaping the unknown-store fix for the actual
 * mistake (the user never passed `--store`).
 */
async function withOrigin(
  select: () => Promise<ResolvedRoot>,
  prefix: string,
  unknownFix: (code: string) => string | undefined,
): Promise<ResolvedRoot> {
  try {
    return await select()
  } catch (error) {
    if (!(error instanceof RootSelectionError)) throw error
    const { code, message, target, fix } = error.diagnostic
    throw new RootSelectionError({
      code,
      message: `${prefix}${message}`,
      target,
      fix: unknownFix(code) ?? fix,
    })
  }
}

/**
 * The machine-global `defaultStore`, read as upstream's `getGlobalConfig()`
 * reads it: the global config file — at the path `openspec config path`
 * prints, so path discovery stays the binary's — parsed as JSON, with its
 * `defaultStore` value returned raw. A padded string, a trailing newline, a
 * number or an array reaches selection unchanged and fails there as the
 * binary's does; `config get` could not carry that, since it prints the value
 * as text. A missing file, a file that is not JSON, and a JSON root that is not
 * an object carry no default, as upstream falls back to its defaults for each.
 */
export async function readDefaultStore(cwd: string): Promise<unknown> {
  const result = await runOpenspec(['config', 'path'], {
    cwd,
    expect: {
      exitCodes: [0],
      postCondition: (r) => /^[^\n]+\n$/u.test(r.stdout) || 'did not print one path',
    },
  })
  let body: string
  try {
    body = readFileSync(result.stdout.slice(0, -1), 'utf8')
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) return undefined
    throw error
  }
  let doc: unknown
  try {
    doc = JSON.parse(body)
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return undefined
  return (doc as Record<string, unknown>).defaultStore
}

// --- Selection ---------------------------------------------------------------

async function resolveQualifyingRoot(cwd: string, base: string): Promise<ResolvedRoot> {
  const pointer = configStorePointer(base)
  if (hasPlanningShape(base)) {
    if (pointer.filePath !== null && pointer.value !== undefined)
      printOwnLine(
        `Warning: ${pointer.filePath} declares store '${pointer.value}', but this directory is ` +
          'a real OpenSpec root; the declaration is ignored.',
      )
    return { base, cwd, storeArgs: [], store: undefined, source: 'nearest' }
  }
  if (pointer.filePath === null || pointer.value === undefined) {
    if (pointer.filePath !== null && pointer.malformed !== undefined) {
      const { filePath, malformed } = pointer
      throw new RootSelectionError({
        code: 'invalid_store_pointer',
        message:
          `Invalid store declaration in ${filePath}: ` +
          (malformed === 'unparseable'
            ? 'the config file could not be read as YAML.'
            : 'the store key must be a single store id string.'),
        target: 'store.pointer',
        fix:
          malformed === 'unparseable'
            ? `Fix the YAML syntax in ${filePath}.`
            : `Edit ${filePath} so the store key is a registered store id, or remove it.`,
      })
    }
    return { base, cwd, storeArgs: [], store: undefined, source: 'nearest' }
  }
  const { filePath, value } = pointer
  return withOrigin(
    () => resolveStore(cwd, value, 'declared'),
    `Declared in ${filePath}: `,
    (code) =>
      code === 'unknown_store'
        ? `Register the store (cospec store register <path> --id ${value}) or edit ${filePath} ` +
          'to name a registered store.'
        : undefined,
  )
}

async function selectRoot(cwd: string, store: string | undefined): Promise<ResolvedRoot> {
  if (store !== undefined) return resolveStore(cwd, store)
  const nearest = findQualifyingRoot(cwd)
  if (nearest !== null) return resolveQualifyingRoot(cwd, nearest)
  // Upstream tests the raw value for truthiness: `""`, `false` and `0` are unset.
  const defaultId = await readDefaultStore(cwd)
  if (defaultId)
    return withOrigin(
      () => resolveStore(cwd, defaultId, 'global_default'),
      `Global defaultStore '${String(defaultId)}': `,
      (code) =>
        code === 'unknown_store' || code === 'no_registered_stores'
          ? `Register the store (cospec store register <path> --id ${String(defaultId)}) or clear the ` +
            'stale global default (cospec config unset defaultStore).'
          : undefined,
    )
  const ids = (await openspecStoreList(cwd)).stores.map((s) => s.id)
  if (ids.length > 0) {
    const registered = ids.toSorted((a, b) => a.localeCompare(b)).join(', ')
    throw new RootSelectionError({
      code: 'no_root_with_registered_stores',
      message:
        'No OpenSpec root found in the current directory or its ancestors. Registered stores: ' +
        `${registered}. Pass --store <id> to use one, or run cospec init to create a local root.`,
      target: 'openspec.root',
      fix: `Rerun with --store <id> (registered: ${registered}) or run cospec init.`,
    })
  }
  return { base: canonicalStart(cwd), cwd, storeArgs: [], store: undefined, source: 'implicit' }
}

/**
 * The operating root for a command (see the header for the selection order).
 * A local root resolves with no wrapped call; a store selection spawns the
 * registry listing, and a rootless cwd reads `defaultStore` and, failing that,
 * the registry. `root.cwd` stays the invocation directory, so wrapped calls
 * spawn where the user ran the command; `root.base` is canonical.
 *
 * In human mode a store-selected root is announced on stderr at resolution
 * time, verbatim from upstream, so the line survives a command that fails
 * after selecting it. An invocation directory that does not exist fails first
 * (`directory_not_found`, cospec's own code: upstream has no `--cwd`).
 */
export async function resolveRoot(ctx: {
  cwd: string
  flags: { store?: string; json?: boolean }
}): Promise<ResolvedRoot> {
  assertInvocationDirectory(ctx.cwd)
  const root = await selectRoot(ctx.cwd, ctx.flags.store)
  if (root.store !== undefined && ctx.flags.json !== true)
    printOwnLine(`Using OpenSpec root: ${root.store} (${root.base})`)
  return root
}
