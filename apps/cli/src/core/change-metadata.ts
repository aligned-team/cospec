// Whether openspec honours a boolean change-metadata marker — its
// `readBooleanMarker` (`src/utils/change-metadata.ts`, 1.13.1), ported. The
// archive retires a capability only on `retire_capabilities: true` that this
// read honours; a marker it cannot honour counts as undeclared, so the archive
// refuses the emptied spec and names the reason. Reading the key alone, as
// cospec did through round 5, retired what the binary refuses.
//
// Honoured means: the whole `.openspec.yaml` passes openspec's
// `ChangeMetadataSchema` (a zod schema, whose first issue is the reason when it
// does not), and its `schema:` is one `listSchemas` lists and `resolveSchema`
// loads (`core/artifact-graph/resolver.ts`, `schema.ts`, `types.ts`). Every
// check and every reason below is ported from those files; the wording of each
// zod issue is zod 4's, as the pinned dist prints it.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync, type Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, posix, relative, resolve, sep, win32 } from 'node:path'

import { parse as parseYaml } from 'yaml'

import { openspecPackageDir } from './openspec.ts'
import { respellRemedies } from './remedies.ts'

export const METADATA_FILENAME = '.openspec.yaml'

/** openspec's `{ declared, invalidReason? }` marker read. */
export interface MarkerRead {
  /** The marker is set and openspec honours it. */
  declared: boolean
  /** Set when the marker is present but cannot be honoured: why, safe to print. */
  invalidReason?: string
}

/** openspec's `readRetireCapabilitiesMarker`. */
export function readRetireCapabilitiesMarker(changeDir: string): MarkerRead {
  return readBooleanMarker(changeDir, 'retire_capabilities')
}

/**
 * A marker that cannot be honoured. Control characters never leave, as
 * upstream's `unhonorable` guarantees; a remedy the reason names is spelled
 * through cospec.
 */
// oxlint-disable-next-line no-control-regex -- upstream strips exactly these
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

function unhonorable(reason: string): MarkerRead {
  return { declared: false, invalidReason: respellRemedies(reason.replace(CONTROL_CHARS, '?')) }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function readBooleanMarker(changeDir: string, key: 'retire_capabilities'): MarkerRead {
  let raw: string
  try {
    raw = readFileSync(join(changeDir, METADATA_FILENAME), 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { declared: false }
    return unhonorable(`the metadata file cannot be read (${errorMessage(err)})`)
  }
  let parsed: unknown
  try {
    parsed = parseYaml(raw)
  } catch {
    const mentioned = new RegExp(`^\\s*(['"]?)${key}\\1\\s*:`, 'm').test(raw)
    return mentioned ? unhonorable('the file is not valid YAML') : { declared: false }
  }
  const issue = changeMetadataIssue(parsed)
  if (issue === undefined) {
    const data = parsed as Record<string, unknown>
    if (data[key] !== true) return { declared: false }
    const schema = data.schema as string
    try {
      const projectRoot = resolve(changeDir, '../../..')
      if (!listSchemas(projectRoot).includes(schema))
        return unhonorable(`schema: unknown schema '${schema}'`)
      loadSchema(schema, projectRoot)
    } catch (err) {
      return unhonorable(errorMessage(err))
    }
    return { declared: true }
  }
  // Key presence, not value, as upstream: an explicit `false` is simply unmarked.
  const record = parsed as Record<string, unknown>
  const mentioned =
    typeof parsed === 'object' && parsed !== null && key in record && record[key] !== false
  if (!mentioned) return { declared: false }
  const where = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
  return unhonorable(`${where}${issue.message}`)
}

// --- zod 4, as far as openspec's two schemas reach ---------------------------

interface ZodIssue {
  path: (string | number)[]
  message: string
}

/** zod 4's name for a value's type in `Invalid input: expected …, received <type>`. */
function receivedType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN'
  if (value instanceof Date) return 'Date'
  return typeof value
}

function invalidType(path: (string | number)[], expected: string, value: unknown): ZodIssue {
  return { path, message: `Invalid input: expected ${expected}, received ${receivedType(value)}` }
}

const TOO_SMALL_STRING = 'Too small: expected string to have >=1 characters'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** openspec's `KEBAB_ID_REGEX` (`core/id.ts`). */
const KEBAB_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const KEBAB_ID_DESCRIPTION =
  'must be kebab-case with lowercase letters, numbers, and single hyphen separators'

/** Every issue `ChangeMetadataSchema.safeParse` raises, in zod's order (the schema's key order). */
function changeMetadataIssues(value: unknown): ZodIssue[] {
  if (!isRecord(value)) return [invalidType([], 'object', value)]
  const out: ZodIssue[] = []
  const { schema, created, goal } = value
  if (typeof schema !== 'string') out.push(invalidType(['schema'], 'string', schema))
  else if (schema.length < 1) out.push({ path: ['schema'], message: 'schema is required' })
  if (created !== undefined) {
    if (typeof created !== 'string') out.push(invalidType(['created'], 'string', created))
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(created))
      out.push({ path: ['created'], message: 'created must be YYYY-MM-DD format' })
  }
  if (goal !== undefined) {
    if (typeof goal !== 'string') out.push(invalidType(['goal'], 'string', goal))
    else if (goal.length < 1) out.push({ path: ['goal'], message: TOO_SMALL_STRING })
  }
  const areas = value.affected_areas
  if (areas !== undefined) {
    if (!Array.isArray(areas)) out.push(invalidType(['affected_areas'], 'array', areas))
    else
      areas.forEach((area: unknown, i) => {
        if (typeof area !== 'string') out.push(invalidType(['affected_areas', i], 'string', area))
        else if (area.length < 1)
          out.push({ path: ['affected_areas', i], message: TOO_SMALL_STRING })
      })
  }
  const initiative = value.initiative
  if (initiative !== undefined) {
    if (!isRecord(initiative)) out.push(invalidType(['initiative'], 'object', initiative))
    else {
      for (const [field, label] of [
        ['store', 'Store id'],
        ['id', 'Initiative id'],
      ] as const) {
        const id = initiative[field]
        if (typeof id !== 'string') out.push(invalidType(['initiative', field], 'string', id))
        else if (!KEBAB_ID_RE.test(id))
          out.push({ path: ['initiative', field], message: `${label} ${KEBAB_ID_DESCRIPTION}` })
      }
      // `.strict()`: unknown keys are one issue, after the known keys' own.
      const unknown = Object.keys(initiative).filter((k) => k !== 'store' && k !== 'id')
      if (unknown.length > 0)
        out.push({
          path: ['initiative'],
          message: `Unrecognized key${unknown.length > 1 ? 's' : ''}: ${unknown.map((k) => `"${k}"`).join(', ')}`,
        })
    }
  }
  for (const field of ['skip_specs', 'retire_capabilities'] as const) {
    const flag = value[field]
    if (flag !== undefined && typeof flag !== 'boolean')
      out.push(invalidType([field], 'boolean', flag))
  }
  return out
}

/** The first issue `ChangeMetadataSchema.safeParse` raises, if any — the one upstream quotes. */
export function changeMetadataIssue(value: unknown): ZodIssue | undefined {
  return changeMetadataIssues(value)[0]
}

// --- listSchemas / resolveSchema ---------------------------------------------

/** openspec's `getGlobalDataDir()`/schemas (`core/global-config.ts`). */
function userSchemasDir(): string {
  const xdg = process.env.XDG_DATA_HOME
  if (xdg !== undefined && xdg.length > 0) return join(xdg, 'openspec', 'schemas')
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA
    return local !== undefined && local.length > 0
      ? join(local, 'openspec', 'schemas')
      : join(homedir(), 'AppData', 'Local', 'openspec', 'schemas')
  }
  return join(homedir(), '.local', 'share', 'openspec', 'schemas')
}

/**
 * The pinned package's built-in schemas. A package that cannot be located has
 * none to list, as `core/change.ts`'s `resolveSchema` treats it — and it never
 * holds a cospec type.
 */
function packageSchemasDir(): string | undefined {
  try {
    return join(openspecPackageDir(), 'schemas')
  } catch {
    return undefined
  }
}

/** openspec's `isOwnedTransientSchemaDir`. */
function isTransientSchemaDir(name: string): boolean {
  return (
    name.startsWith('.fork-staging-') ||
    name.includes('.fork-backup-') ||
    name.startsWith('.init-staging-') ||
    name.includes('.init-backup-')
  )
}

/** openspec's `isSchemaDir`: a directory, or a symlink to one. */
function isSchemaDir(parent: string, entry: Dirent): boolean {
  if (isTransientSchemaDir(entry.name)) return false
  if (entry.isDirectory()) return true
  if (!entry.isSymbolicLink()) return false
  try {
    return statSync(join(parent, entry.name)).isDirectory()
  } catch {
    return false
  }
}

/** openspec's `listSchemas(projectRoot)`: package, user and project schema names, sorted. */
export function listSchemas(projectRoot: string): string[] {
  const names = new Set<string>()
  for (const dir of [
    packageSchemasDir(),
    userSchemasDir(),
    join(projectRoot, 'openspec', 'schemas'),
  ]) {
    if (dir === undefined || !existsSync(dir)) continue
    for (const entry of readdirSync(dir, { withFileTypes: true }))
      if (isSchemaDir(dir, entry) && existsSync(join(dir, entry.name, 'schema.yaml')))
        names.add(entry.name)
  }
  return [...names].toSorted()
}

/** openspec's `FileSystemUtils.isPathWithin`. */
function isPathWithin(dir: string, target: string): boolean {
  const rel = relative(dir, target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/**
 * openspec's `getSchemaCandidateDir`: the dir, when its schema.yaml stays
 * inside it — as written and once every symlink is resolved
 * (`FileSystemUtils.assertPathWithin`). Both exist by then, so upstream's
 * canonical form of each is its realpath; one that cannot be resolved is no
 * candidate.
 */
function schemaCandidateDir(schemasDir: string, name: string): string | undefined {
  const dir = join(schemasDir, name)
  const file = join(dir, 'schema.yaml')
  if (!existsSync(file)) return undefined
  try {
    const within =
      isPathWithin(resolve(dir), resolve(file)) &&
      isPathWithin(realpathSync.native(dir), realpathSync.native(file))
    return within ? dir : undefined
  } catch {
    return undefined
  }
}

/** openspec's `getSchemaDir(name, projectRoot)`: project, then user, then package. */
function schemaDir(name: string, projectRoot: string): string | undefined {
  if (
    name.length === 0 ||
    name === '.' ||
    name === '..' ||
    /[\\/]/u.test(name) ||
    /^[A-Za-z]:/u.test(name) ||
    posix.isAbsolute(name) ||
    win32.isAbsolute(name)
  )
    return undefined
  for (const schemas of [
    join(projectRoot, 'openspec', 'schemas'),
    userSchemasDir(),
    packageSchemasDir(),
  ]) {
    if (schemas === undefined) continue
    const dir = schemaCandidateDir(schemas, name)
    if (dir !== undefined) return dir
  }
  return undefined
}

/**
 * openspec's `resolveSchema(name, projectRoot)`, for its throw alone: the
 * schema is found, read, parsed and validated, or the error says why.
 */
function loadSchema(name: string, projectRoot: string): void {
  const normalized = name.replace(/\.ya?ml$/, '')
  const dir = schemaDir(normalized, projectRoot)
  if (dir === undefined)
    throw new Error(
      `Schema '${normalized}' not found. Available schemas: ${listSchemas(projectRoot).join(', ')}`,
    )
  const path = join(dir, 'schema.yaml')
  let content: string
  try {
    content = readFileSync(path, 'utf8')
  } catch (err) {
    throw new Error(`Failed to read schema at '${path}': ${errorMessage(err)}`, { cause: err })
  }
  let parsed: unknown
  try {
    parsed = parseYaml(content)
  } catch (err) {
    throw new Error(`Failed to parse schema at '${path}': ${errorMessage(err)}`, { cause: err })
  }
  const problem = schemaProblem(parsed)
  if (problem !== undefined) throw new Error(`Invalid schema at '${path}': ${problem}`)
}

/** openspec's `relativePathSchema(fieldName)` refinement. */
function isRelativeInside(value: string): boolean {
  const segments = value.split(/[\\/]+/u)
  const drive = /^[A-Za-z]:/u.test(value)
  const absolute = posix.isAbsolute(value) || win32.isAbsolute(value) || drive
  return !absolute && !segments.includes('..') && !value.includes('\0')
}

function relativePathIssues(path: (string | number)[], field: string, value: unknown): ZodIssue[] {
  if (typeof value !== 'string') return [invalidType(path, 'string', value)]
  if (value.length < 1) return [{ path, message: `${field} is required` }]
  if (!isRelativeInside(value))
    return [{ path, message: `${field} must be a relative path inside its allowed directory` }]
  return []
}

function optionalString(path: (string | number)[], value: unknown): ZodIssue[] {
  return value === undefined || typeof value === 'string'
    ? []
    : [invalidType(path, 'string', value)]
}

function stringArray(path: (string | number)[], value: unknown): ZodIssue[] {
  if (!Array.isArray(value)) return [invalidType(path, 'array', value)]
  return value.flatMap((v: unknown, i) =>
    typeof v === 'string' ? [] : [invalidType([...path, i], 'string', v)],
  )
}

interface Artifact {
  id: string
  requires: string[]
}

/** openspec's `SchemaYamlSchema` issues, then `parseSchema`'s graph checks — its first throw's text. */
function schemaProblem(value: unknown): string | undefined {
  if (!isRecord(value)) return `Invalid schema: : ${invalidType([], 'object', value).message}`
  const issues: ZodIssue[] = []
  const { name, version, description, artifacts, apply } = value
  if (typeof name !== 'string') issues.push(invalidType(['name'], 'string', name))
  else if (name.length < 1) issues.push({ path: ['name'], message: 'Schema name is required' })
  if (typeof version !== 'number' || !Number.isFinite(version))
    issues.push(invalidType(['version'], 'number', version))
  else if (!Number.isInteger(version))
    issues.push({ path: ['version'], message: 'Invalid input: expected int, received number' })
  else if (version <= 0)
    issues.push({ path: ['version'], message: 'Version must be a positive integer' })
  issues.push(...optionalString(['description'], description))
  if (!Array.isArray(artifacts)) issues.push(invalidType(['artifacts'], 'array', artifacts))
  else {
    if (artifacts.length < 1)
      issues.push({ path: ['artifacts'], message: 'At least one artifact required' })
    if (artifacts.length > 1000)
      issues.push({ path: ['artifacts'], message: 'A schema may declare at most 1000 artifacts' })
    artifacts.forEach((artifact: unknown, i) => {
      const at = ['artifacts', i]
      if (!isRecord(artifact)) {
        issues.push(invalidType(at, 'object', artifact))
        return
      }
      if (typeof artifact.id !== 'string')
        issues.push(invalidType([...at, 'id'], 'string', artifact.id))
      else if (artifact.id.length < 1)
        issues.push({ path: [...at, 'id'], message: 'Artifact ID is required' })
      issues.push(
        ...relativePathIssues([...at, 'generates'], 'generates field', artifact.generates),
      )
      if (typeof artifact.description !== 'string')
        issues.push(invalidType([...at, 'description'], 'string', artifact.description))
      issues.push(...relativePathIssues([...at, 'template'], 'template field', artifact.template))
      issues.push(...optionalString([...at, 'instruction'], artifact.instruction))
      if (artifact.requires !== undefined)
        issues.push(...stringArray([...at, 'requires'], artifact.requires))
    })
  }
  if (apply !== undefined) {
    if (!isRecord(apply)) issues.push(invalidType(['apply'], 'object', apply))
    else {
      const requiresIssues = stringArray(['apply', 'requires'], apply.requires)
      issues.push(...requiresIssues)
      if (requiresIssues.length === 0 && (apply.requires as unknown[]).length < 1)
        issues.push({ path: ['apply', 'requires'], message: 'At least one required artifact' })
      if (apply.tracks !== undefined && apply.tracks !== null)
        issues.push(...relativePathIssues(['apply', 'tracks'], 'apply.tracks', apply.tracks))
      issues.push(...optionalString(['apply', 'instruction'], apply.instruction))
    }
  }
  if (issues.length > 0)
    return `Invalid schema: ${issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`

  const graph: Artifact[] = (artifacts as Record<string, unknown>[]).map((a) => ({
    id: a.id as string,
    requires: (a.requires as string[] | undefined) ?? [],
  }))
  const seen = new Set<string>()
  for (const a of graph) {
    if (seen.has(a.id)) return `Duplicate artifact ID: ${a.id}`
    seen.add(a.id)
  }
  for (const a of graph)
    for (const req of a.requires)
      if (!seen.has(req))
        return `Invalid dependency reference in artifact '${a.id}': '${req}' does not exist`
  if (isRecord(apply)) {
    const ids = graph.map((a) => a.id)
    for (const req of apply.requires as string[])
      if (!ids.includes(req))
        return `Invalid apply.requires reference: '${req}' does not exist (artifacts: ${ids.join(', ')})`
  }
  const cycle = findCycle(graph)
  return cycle === undefined ? undefined : `Cyclic dependency detected: ${cycle}`
}

/** openspec's `validateNoCycles` DFS, reporting the same cycle path. */
function findCycle(artifacts: readonly Artifact[]): string | undefined {
  const byId = new Map(artifacts.map((a) => [a.id, a]))
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const parent = new Map<string, string>()
  const dfs = (id: string): string | undefined => {
    visited.add(id)
    inStack.add(id)
    const artifact = byId.get(id)
    if (artifact === undefined) return undefined
    for (const dep of artifact.requires) {
      if (!visited.has(dep)) {
        parent.set(dep, id)
        const cycle = dfs(dep)
        if (cycle !== undefined) return cycle
      } else if (inStack.has(dep)) {
        const path = [dep]
        let current = id
        while (current !== dep) {
          path.unshift(current)
          current = parent.get(current)!
        }
        path.unshift(dep)
        return path.join(' → ')
      }
    }
    inStack.delete(id)
    return undefined
  }
  for (const a of artifacts)
    if (!visited.has(a.id)) {
      const cycle = dfs(a.id)
      if (cycle !== undefined) return cycle
    }
  return undefined
}
