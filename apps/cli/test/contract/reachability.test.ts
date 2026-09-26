// Reachability: every surface the pinned OpenSpec binary exposes resolves to
// exactly one place on the cospec side (change `unknown-option-contract`,
// ledger 4.1–4.5). This is the parity gate: a pin bump that adds a flag, a
// tool or a workflow fails here until the flag is declared in the command
// table, aliased, excepted, verified deprecated, or owned by a named change in
// `parity-pending.yaml`.
//
// The walk reads four sources from the pinned dist (tests only, never the
// runtime — the same deep-import pattern version-tripwire.test.ts uses):
// `core/completions/command-registry.js` COMMAND_REGISTRY,
// `core/config.js` AI_TOOLS and TOOL_ID_ALIASES, `core/profiles.js`
// ALL_WORKFLOWS. The hidden surfaces those sources cannot produce
// (`experimental`, commander's implicit program-level `help [command]`, the
// `powershell` completion shell, `__complete`'s `schemas` and
// `archived-changes` types, and `new change --initiative` / `--areas`) are
// added as declared fixtures after the binary is probed for them.
//
// The five places an entry can resolve to:
//   cospec               the command table (a handled or no-op flag, a global
//                        flag, a positional slot, a subcommand), a harness id
//                        from HARNESS_NAMES, or a canon workflow
//   aliases.yaml         apps/cli/src/canon/parity/aliases.yaml
//   exceptions.yaml      apps/cli/src/canon/parity/exceptions.yaml
//   deprecated.yaml      apps/cli/src/canon/parity/deprecated.yaml, counted only
//                        when the binary itself marks the surface deprecated
//   parity-pending.yaml  beside this test, each entry owned by a change slug
//
// Resolution is two-way (design decision 11): every table surface marked
// pending has exactly one parity-pending.yaml entry with the same owner, and
// every parity-pending.yaml entry names a walked surface that the table marks
// pending for that owner. Tool ids, tool aliases and a top-level hidden command
// have no table marking to compare against, so for those the reverse check is
// that the walk produces the surface and nothing on the cospec side resolves it.
//
// A `parse: 'forward'` row (`show`, `templates`, `schemas`, `schema`, `store`,
// `workset`, `config`) delegates its argv to the wrapped binary, which stays
// the unknown-option authority there (design decision 1): its flags and
// positionals are reached by delegation whether the table declares them or
// not, so the resolver counts them for the cospec side on that basis. The
// forward row's declarations serve `--help` and completion, which the
// separate "forward rows declare" test keeps complete at the pin. The
// differential evidence that the binary decides is `unknown-option-
// differential.test.ts`'s forward rows (`show --bogus`, relayed verbatim),
// one per forward row.
//
// The resolver is a pure function over the loaded inputs, so the negative
// cases the ledger names (an entry removed everywhere, listed twice, a stale
// pending entry, a pending marking with no entry) are asserted against mutated
// copies of the real inputs at the bottom of this file.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { parse } from 'yaml'

import {
  COMMAND_TABLE,
  type CommandRow,
  type FlagSpec,
  GLOBAL_FLAGS,
  isPending,
  type PositionalSpec,
  type SurfaceStatus,
} from '../../src/core/command-table.ts'
import { openspecPackageDir } from '../../src/core/openspec.ts'
import { HARNESS_NAMES } from '../../src/harness/adapters.ts'
import { cleanupAll, hashTree } from '../fixtures/support.ts'
import { oracle, type OracleRun, scaffoldOracleRoot } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

// --- pinned sources --------------------------------------------------------------

interface RegistryFlag {
  name: string
  short?: string
  takesValue?: boolean
  values?: string[]
}
interface RegistryCommand {
  name: string
  description: string
  flags: RegistryFlag[]
  positionals?: { name: string }[]
  subcommands?: RegistryCommand[]
}

const DIST = join(openspecPackageDir(), 'dist')
const { COMMAND_REGISTRY } = (await import(join(DIST, 'core/completions/command-registry.js'))) as {
  COMMAND_REGISTRY: RegistryCommand[]
}
const { AI_TOOLS, TOOL_ID_ALIASES } = (await import(join(DIST, 'core/config.js'))) as {
  AI_TOOLS: { value: string }[]
  TOOL_ID_ALIASES: Record<string, string>
}
const { ALL_WORKFLOWS } = (await import(join(DIST, 'core/profiles.js'))) as {
  ALL_WORKFLOWS: readonly string[]
}

// --- cospec-side inputs ------------------------------------------------------------

const APP = resolve(import.meta.dir, '../..')
const PARITY_DIR = join(APP, 'src/canon/parity')
const PENDING_FILE = join(import.meta.dir, 'parity-pending.yaml')

/** cospec's canon workflow ids: one `<id>.md` per workflow under canon/workflows. */
const CANON_WORKFLOWS: readonly string[] = readdirSync(join(APP, 'src/canon/workflows'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.slice(0, -'.md'.length))

/** The change slugs that may own a pending surface (the design's Non-Goals list). */
const KNOWN_OWNERS: ReadonlySet<string> = new Set([
  'upstream-spellings',
  'passthrough-json-and-doctor',
  'validation-parity',
  'cli-surface-parity',
  'archive-and-sync-parity',
  'tool-matrix',
  'github-copilot',
  'completion-install',
  'workflow-profiles',
])

type PendingKind = 'command' | 'flag' | 'positional' | 'positional-value' | 'tool' | 'tool-alias'

interface PendingEntry {
  kind: PendingKind
  path?: string[]
  flag?: string
  index?: number
  value?: string
  id?: string
  target?: string
  source?: 'cli'
  owner?: string
}
interface AliasEntry {
  upstream: { kind: 'workflow' | 'tool' | 'tool-alias' | 'command'; id?: string; path?: string[] }
  cospec: string
}
interface ExceptionEntry {
  upstream: { kind: 'command'; path: string[]; surface?: string }
  reason: string
}
interface DeprecatedEntry {
  upstream: { kind: 'command'; path: string[] }
  mark: 'registry-description' | 'runtime-stderr'
  warning?: string
  subcommands: string[]
}

function readYamlList<T>(file: string): T[] {
  const doc = parse(readFileSync(file, 'utf8')) as unknown
  if (!Array.isArray(doc)) throw new Error(`${file}: expected a YAML list`)
  return doc as T[]
}

const PENDING = readYamlList<PendingEntry>(PENDING_FILE)
const ALIASES = readYamlList<AliasEntry>(join(PARITY_DIR, 'aliases.yaml'))
const EXCEPTIONS = readYamlList<ExceptionEntry>(join(PARITY_DIR, 'exceptions.yaml'))
const DEPRECATED = readYamlList<DeprecatedEntry>(join(PARITY_DIR, 'deprecated.yaml'))

// --- the walk ----------------------------------------------------------------------

type Entry =
  | { kind: 'command'; path: string[] }
  | { kind: 'positional'; path: string[]; index: number }
  | { kind: 'flag'; path: string[]; flag: string; short?: string; takesValue: boolean }
  | { kind: 'flag-value'; path: string[]; flag: string; value: string }
  | { kind: 'positional-value'; path: string[]; index: number; value: string }
  | { kind: 'tool'; id: string }
  | { kind: 'tool-alias'; id: string; target: string }
  | { kind: 'workflow'; id: string }

function label(entry: Entry | PendingEntry): string {
  const path = 'path' in entry && entry.path !== undefined ? entry.path.join(' ') : ''
  switch (entry.kind) {
    case 'command':
      return `command \`${path}\``
    case 'positional':
      return `positional #${entry.index} of \`${path}\``
    case 'flag':
      return `flag \`${path} ${entry.flag}\``
    case 'flag-value':
      return `value \`${entry.value}\` of \`${path} ${entry.flag}\``
    case 'positional-value':
      return `value \`${entry.value}\` of positional #${entry.index} of \`${path}\``
    case 'tool':
      return `tool id \`${entry.id}\``
    case 'tool-alias':
      return `tool alias \`${entry.id}\``
    case 'workflow':
      return `workflow \`${entry.id}\``
  }
}

function walkRegistry(registry: readonly RegistryCommand[]): Entry[] {
  const out: Entry[] = []
  const visit = (cmd: RegistryCommand, parent: string[]): void => {
    const path = [...parent, cmd.name]
    out.push({ kind: 'command', path })
    for (const index of (cmd.positionals ?? []).keys())
      out.push({ kind: 'positional', path, index })
    for (const f of cmd.flags) {
      const flag = `--${f.name}`
      out.push({
        kind: 'flag',
        path,
        flag,
        ...(f.short !== undefined ? { short: `-${f.short}` } : {}),
        takesValue: f.takesValue === true,
      })
      for (const value of f.values ?? []) out.push({ kind: 'flag-value', path, flag, value })
    }
    for (const sub of cmd.subcommands ?? []) visit(sub, path)
  }
  for (const cmd of registry) visit(cmd, [])
  return out
}

/**
 * Hidden surfaces outside the four sources (design decision 6). Each is added
 * to the walk only after `present` confirms the pinned binary still has it.
 * `new change --initiative` / `--areas` are hidden-help options that print a
 * removed-option error; they resolve to the pending `new change` subtree in
 * `parity-pending.yaml`, so they need no entries of their own. `help`'s
 * `[command]` positional resolves to the pending `help` subtree the same way.
 */
const HIDDEN_FIXTURES: readonly {
  entry: Entry
  probe: string[]
  present: (run: OracleRun) => boolean
}[] = [
  {
    entry: { kind: 'command', path: ['experimental'] },
    probe: ['experimental', '--help'],
    present: (run) => run.exitCode === 0 && run.stdout.includes('Usage: openspec experimental'),
  },
  // Commander's implicit `help [command]` on the program, and its positional.
  {
    entry: { kind: 'command', path: ['help'] },
    probe: ['help'],
    present: (run) => run.exitCode === 0 && run.stdout.includes('Usage: openspec [options]'),
  },
  {
    entry: { kind: 'positional', path: ['help'], index: 0 },
    probe: ['help', 'list'],
    present: (run) => run.exitCode === 0 && run.stdout.includes('Usage: openspec list [options]'),
  },
  {
    entry: { kind: 'positional-value', path: ['completion'], index: 0, value: 'powershell' },
    probe: ['completion', 'generate', 'powershell'],
    present: (run) =>
      run.exitCode === 0 && run.stdout.includes('PowerShell completion script for OpenSpec'),
  },
  // `__complete` answers an unknown type with a silent exit 1 (asserted below),
  // so exit 0 is what tells a served type apart.
  {
    entry: { kind: 'positional-value', path: ['__complete'], index: 0, value: 'schemas' },
    probe: ['__complete', 'schemas'],
    present: (run) => run.exitCode === 0 && run.stdout.includes('spec-driven'),
  },
  {
    entry: { kind: 'positional-value', path: ['__complete'], index: 0, value: 'archived-changes' },
    probe: ['__complete', 'archived-changes'],
    present: (run) => run.exitCode === 0,
  },
  {
    entry: { kind: 'flag', path: ['new', 'change'], flag: '--initiative', takesValue: true },
    probe: ['new', 'change', 'hidden-probe', '--initiative', 'x'],
    present: (run) =>
      run.exitCode === 1 && run.stderr.includes('--initiative is no longer supported'),
  },
  {
    entry: { kind: 'flag', path: ['new', 'change'], flag: '--areas', takesValue: true },
    probe: ['new', 'change', 'hidden-probe', '--areas', 'x'],
    present: (run) => run.exitCode === 1 && run.stderr.includes('--areas is no longer supported'),
  },
]

// --- resolution ---------------------------------------------------------------------

interface Surface {
  readonly positionals: readonly PositionalSpec[]
  readonly flags: readonly FlagSpec[]
}

/** The table surface at `path`, and the pending owner of it or its nearest ancestor. */
function tableSurface(
  table: readonly CommandRow[],
  path: readonly string[],
): { surface: Surface; pendingOwner?: string } | undefined {
  const row = table.find((r) => r.name === path[0])
  if (row === undefined) return undefined
  if (path.length === 1) return { surface: row }
  if (path.length > 2) return undefined
  const sub = row.subcommands?.find((s) => s.name === path[1])
  if (sub === undefined) return undefined
  return isPending(sub.status)
    ? { surface: sub, pendingOwner: sub.status.pending }
    : { surface: sub }
}

function ownerOf(status: SurfaceStatus): string | undefined {
  return isPending(status) ? status.pending : undefined
}

interface Model {
  registry: readonly RegistryCommand[]
  aiTools: readonly string[]
  toolAliases: Readonly<Record<string, string>>
  workflows: readonly string[]
  hidden: readonly Entry[]
  table: readonly CommandRow[]
  globalFlags: readonly string[]
  harnessNames: readonly string[]
  canonWorkflows: readonly string[]
  pending: readonly PendingEntry[]
  aliases: readonly AliasEntry[]
  exceptions: readonly ExceptionEntry[]
  /** Only the deprecated.yaml entries whose mark the binary was found to carry. */
  deprecated: readonly DeprecatedEntry[]
}

function walk(model: Model): Entry[] {
  return [
    ...walkRegistry(model.registry),
    ...model.aiTools.map((id): Entry => ({ kind: 'tool', id })),
    ...Object.entries(model.toolAliases).map(
      ([id, target]): Entry => ({ kind: 'tool-alias', id, target }),
    ),
    ...model.workflows.map((id): Entry => ({ kind: 'workflow', id })),
    ...model.hidden,
  ]
}

/** The table's own flag spec for a registry flag at `path`, if declared. */
function tableFlag(model: Model, path: readonly string[], flag: string): FlagSpec | undefined {
  return tableSurface(model.table, path)?.surface.flags.find((f) => f.name === flag)
}

/** Whether `path` lands on a `parse: 'forward'` row, whose argv the binary decides. */
function delegated(model: Model, path: readonly string[]): boolean {
  return model.table.find((row) => row.name === path[0])?.parse === 'forward'
}

/**
 * The flags and positionals a forward row's `--help` and completion miss: every
 * walked flag or positional on a forward row that its table surface does not
 * declare (a global flag counts as declared).
 */
function undeclaredOnForwardRows(model: Model): string[] {
  const missing: string[] = []
  for (const entry of walk(model)) {
    if (!('path' in entry) || !delegated(model, entry.path)) continue
    const surface = tableSurface(model.table, entry.path)?.surface
    if (surface === undefined) continue
    if (entry.kind === 'flag' && !model.globalFlags.includes(entry.flag))
      if (!surface.flags.some((f) => f.name === entry.flag)) missing.push(label(entry))
    if (entry.kind === 'positional' && surface.positionals[entry.index] === undefined)
      missing.push(label(entry))
  }
  return missing
}

/**
 * Whether the cospec side reaches `entry` (handled, no-op, global, harness,
 * workflow, or delegated to the binary on a forward row).
 */
function cospecReaches(model: Model, entry: Entry): boolean {
  switch (entry.kind) {
    case 'tool':
    case 'tool-alias':
      return model.harnessNames.includes(entry.id)
    case 'workflow':
      return model.canonWorkflows.includes(entry.id)
    default: {
      const found = tableSurface(model.table, entry.path)
      if (found === undefined || found.pendingOwner !== undefined) return false
      if (delegated(model, entry.path)) return true
      const { surface } = found
      switch (entry.kind) {
        case 'command':
          return true
        case 'positional': {
          const slot = surface.positionals[entry.index]
          return slot !== undefined && !isPending(slot.status)
        }
        case 'positional-value': {
          const slot = surface.positionals[entry.index]
          return (
            slot !== undefined &&
            !isPending(slot.status) &&
            (slot.values ?? []).includes(entry.value) &&
            slot.pendingValues?.[entry.value] === undefined
          )
        }
        case 'flag': {
          if (model.globalFlags.includes(entry.flag)) return true
          const spec = surface.flags.find((f) => f.name === entry.flag)
          return spec !== undefined && !isPending(spec.status)
        }
        case 'flag-value': {
          const spec = surface.flags.find((f) => f.name === entry.flag)
          return (
            spec !== undefined &&
            !isPending(spec.status) &&
            spec.values?.includes(entry.value) === true
          )
        }
      }
    }
  }
}

/** The owner the table marks `entry` pending for, when the table can express it. */
function tableMarking(model: Model, entry: Entry): string | undefined {
  if (entry.kind === 'tool' || entry.kind === 'tool-alias' || entry.kind === 'workflow')
    return undefined
  const found = tableSurface(model.table, entry.path)
  if (found === undefined) return undefined
  if (found.pendingOwner !== undefined) return found.pendingOwner
  const { surface } = found
  switch (entry.kind) {
    case 'command':
      return undefined
    case 'positional': {
      const slot = surface.positionals[entry.index]
      return slot !== undefined ? ownerOf(slot.status) : undefined
    }
    case 'positional-value': {
      const slot = surface.positionals[entry.index]
      if (slot === undefined) return undefined
      return ownerOf(slot.status) ?? slot.pendingValues?.[entry.value]
    }
    case 'flag':
    case 'flag-value': {
      if (entry.kind === 'flag' && model.globalFlags.includes(entry.flag)) return undefined
      const spec = surface.flags.find((f) => f.name === entry.flag)
      return spec !== undefined ? ownerOf(spec.status) : undefined
    }
  }
}

function isPrefix(prefix: readonly string[], path: readonly string[]): boolean {
  return prefix.length <= path.length && prefix.every((seg, i) => path[i] === seg)
}

function samePath(a: readonly string[] | undefined, b: readonly string[]): boolean {
  return a !== undefined && a.length === b.length && isPrefix(a, b)
}

function pendingMatches(pe: PendingEntry, entry: Entry): boolean {
  switch (pe.kind) {
    case 'command':
      return 'path' in entry && pe.path !== undefined && isPrefix(pe.path, entry.path)
    case 'flag':
      return (
        (entry.kind === 'flag' || entry.kind === 'flag-value') &&
        samePath(pe.path, entry.path) &&
        pe.flag === entry.flag
      )
    case 'positional':
      return (
        entry.kind === 'positional' && samePath(pe.path, entry.path) && pe.index === entry.index
      )
    case 'positional-value':
      return (
        entry.kind === 'positional-value' &&
        samePath(pe.path, entry.path) &&
        pe.index === entry.index &&
        pe.value === entry.value
      )
    case 'tool':
      return entry.kind === 'tool' && pe.id === entry.id
    case 'tool-alias':
      return entry.kind === 'tool-alias' && pe.id === entry.id
  }
}

function aliasMatches(alias: AliasEntry, entry: Entry): boolean {
  const up = alias.upstream
  if (up.kind === 'command') return entry.kind === 'command' && samePath(up.path, entry.path)
  return entry.kind === up.kind && 'id' in entry && entry.id === up.id
}

/** An alias counts only when its cospec spelling exists. */
function aliasTargetExists(model: Model, alias: AliasEntry): boolean {
  switch (alias.upstream.kind) {
    case 'workflow':
      return model.canonWorkflows.includes(alias.cospec)
    case 'tool':
    case 'tool-alias':
      return model.harnessNames.includes(alias.cospec)
    case 'command':
      return model.table.some((r) => r.name === alias.cospec)
  }
}

function pendingKey(pe: PendingEntry): string {
  return JSON.stringify([
    pe.kind,
    pe.path ?? null,
    pe.flag ?? null,
    pe.index ?? null,
    pe.value ?? null,
    pe.id ?? null,
  ])
}

/**
 * A pending entry the table can express must be marked pending in the table
 * for the same owner. Tool ids, tool aliases and top-level commands (the table
 * has no top-level pending row) are exempt.
 */
function needsTableMarking(pe: PendingEntry): boolean {
  if (pe.kind === 'tool' || pe.kind === 'tool-alias') return false
  if (pe.kind === 'command') return (pe.path?.length ?? 0) >= 2
  return true
}

function pendingAsEntry(pe: PendingEntry): Entry | undefined {
  const path = pe.path ?? []
  switch (pe.kind) {
    case 'command':
      return { kind: 'command', path }
    case 'flag':
      return pe.flag !== undefined
        ? { kind: 'flag', path, flag: pe.flag, takesValue: false }
        : undefined
    case 'positional':
      return pe.index !== undefined ? { kind: 'positional', path, index: pe.index } : undefined
    case 'positional-value':
      return pe.index !== undefined && pe.value !== undefined
        ? { kind: 'positional-value', path, index: pe.index, value: pe.value }
        : undefined
    case 'tool':
      return pe.id !== undefined ? { kind: 'tool', id: pe.id } : undefined
    case 'tool-alias':
      return pe.id !== undefined
        ? { kind: 'tool-alias', id: pe.id, target: pe.target ?? '' }
        : undefined
  }
}

/** Every pending marking in the table, as the parity-pending.yaml entry it needs. */
function tablePendingMarkings(table: readonly CommandRow[]): PendingEntry[] {
  const out: PendingEntry[] = []
  const surface = (path: string[], s: Surface): void => {
    for (const f of s.flags) {
      const owner = ownerOf(f.status)
      if (owner !== undefined) out.push({ kind: 'flag', path, flag: f.name, owner })
    }
    for (const [index, p] of s.positionals.entries()) {
      const owner = ownerOf(p.status)
      if (owner !== undefined) out.push({ kind: 'positional', path, index, owner })
      for (const [value, valueOwner] of Object.entries(p.pendingValues ?? {}))
        out.push({ kind: 'positional-value', path, index, value, owner: valueOwner })
    }
  }
  for (const row of table) {
    surface([row.name], row)
    for (const sub of row.subcommands ?? []) {
      const owner = ownerOf(sub.status)
      if (owner !== undefined) out.push({ kind: 'command', path: [row.name, sub.name], owner })
      surface([row.name, sub.name], sub)
    }
  }
  return out
}

/** Every reachability failure for `model`, as human-readable lines. Empty means green. */
function checkReachability(model: Model): string[] {
  const failures: string[] = []
  const entries = walk(model)

  // Forward: every pinned entry resolves to exactly one place.
  for (const entry of entries) {
    const places: string[] = []
    if (cospecReaches(model, entry)) places.push('cospec')
    for (const alias of model.aliases)
      if (aliasMatches(alias, entry) && aliasTargetExists(model, alias)) places.push('aliases.yaml')
    // An exception naming a `surface` (the self-upgrade offer) is not a walked
    // entry; only a whole-command exception would resolve one.
    for (const exc of model.exceptions)
      if (
        exc.upstream.surface === undefined &&
        entry.kind === 'command' &&
        samePath(exc.upstream.path, entry.path)
      )
        places.push('exceptions.yaml')
    for (const dep of model.deprecated)
      if ('path' in entry && isPrefix(dep.upstream.path, entry.path)) places.push('deprecated.yaml')
    const pendingHits = model.pending.filter((pe) => pendingMatches(pe, entry))
    places.push(...pendingHits.map(() => 'parity-pending.yaml'))

    if (places.length !== 1) {
      failures.push(
        places.length === 0
          ? `${label(entry)} resolves nowhere`
          : `${label(entry)} resolves in ${places.length} places: ${places.join(', ')}`,
      )
      continue
    }

    const marked = tableMarking(model, entry)
    const hit = pendingHits[0]
    if (hit !== undefined && marked !== undefined && hit.owner !== marked)
      failures.push(
        `${label(entry)} is pending on '${hit.owner}' in parity-pending.yaml but on '${marked}' in the command table`,
      )
    if (hit === undefined && marked !== undefined)
      failures.push(
        `${label(entry)} is marked pending on '${marked}' in the command table but resolves to ${places[0]}`,
      )

    // A reached flag must match upstream's spelling of its short form and arity.
    if (
      entry.kind === 'flag' &&
      places[0] === 'cospec' &&
      !model.globalFlags.includes(entry.flag)
    ) {
      const spec = tableFlag(model, entry.path, entry.flag)
      if (spec !== undefined && spec.short !== entry.short)
        failures.push(
          `${label(entry)}: short form is ${spec.short ?? 'absent'} in the table, ${entry.short ?? 'absent'} upstream`,
        )
      if (spec !== undefined && (spec.takesValue === true) !== entry.takesValue)
        failures.push(
          `${label(entry)}: takesValue disagrees with upstream (upstream: ${entry.takesValue})`,
        )
    }
  }

  // Reverse, part 1: every pending marking in the table has exactly one entry, same owner.
  for (const marking of tablePendingMarkings(model.table)) {
    const hits = model.pending.filter((pe) => pendingKey(pe) === pendingKey(marking))
    if (hits.length !== 1)
      failures.push(
        `the command table marks ${label(marking)} pending on '${marking.owner}' but parity-pending.yaml has ${hits.length} entries for it`,
      )
    else if (hits[0]!.owner !== marking.owner)
      failures.push(
        `${label(marking)}: owner '${hits[0]!.owner}' in parity-pending.yaml, '${marking.owner}' in the command table`,
      )
  }

  // Reverse, part 2: every pending entry is owned, unique, walked, and not stale.
  const seen = new Set<string>()
  const hiddenKeys = new Set(model.hidden.map((h) => JSON.stringify(h)))
  for (const pe of model.pending) {
    const name = label(pe)
    if (pe.owner === undefined || pe.owner === '') {
      failures.push(`parity-pending.yaml: ${name} has no owner`)
      continue
    }
    if (!KNOWN_OWNERS.has(pe.owner))
      failures.push(`parity-pending.yaml: ${name} has unknown owner '${pe.owner}'`)
    const key = pendingKey(pe)
    if (seen.has(key)) failures.push(`parity-pending.yaml: ${name} is listed twice`)
    seen.add(key)

    const asEntry = pendingAsEntry(pe)
    if (asEntry === undefined) {
      failures.push(`parity-pending.yaml: ${name} is missing a required field for its kind`)
      continue
    }
    if (pe.source === 'cli') {
      if (!hiddenKeys.has(JSON.stringify(asEntry)))
        failures.push(
          `parity-pending.yaml: ${name} is marked source: cli but is no declared hidden fixture`,
        )
    } else if (!entries.some((e) => pendingMatches(pe, e))) {
      failures.push(
        `parity-pending.yaml: ${name} names a surface the pinned binary does not have (stale)`,
      )
    }
    if (cospecReaches(model, asEntry))
      failures.push(`parity-pending.yaml: ${name} is already reached by cospec (stale)`)
    if (needsTableMarking(pe)) {
      const marked = tableMarking(model, asEntry)
      if (marked !== pe.owner)
        failures.push(
          `parity-pending.yaml: ${name} is owned by '${pe.owner}' but the command table marks it ${marked === undefined ? 'not pending' : `pending on '${marked}'`}`,
        )
    }
    if (pe.kind === 'tool-alias' && pe.id !== undefined && model.toolAliases[pe.id] !== pe.target)
      failures.push(
        `parity-pending.yaml: ${name} targets '${pe.target}' but the pinned alias maps to '${model.toolAliases[pe.id]}'`,
      )
  }

  // aliases.yaml: every alias names a walked surface and an existing cospec spelling.
  for (const alias of model.aliases) {
    const name = `aliases.yaml: ${alias.upstream.kind} ${alias.upstream.id ?? alias.upstream.path?.join(' ')}`
    if (!entries.some((e) => aliasMatches(alias, e)))
      failures.push(`${name} names a surface the pinned binary does not have`)
    if (!aliasTargetExists(model, alias))
      failures.push(`${name} → '${alias.cospec}' does not exist in cospec`)
  }

  // exceptions.yaml: exactly one, and it names a pinned command.
  if (model.exceptions.length !== 1)
    failures.push(`exceptions.yaml has ${model.exceptions.length} entries; exactly one is allowed`)
  for (const exc of model.exceptions)
    if (!entries.some((e) => e.kind === 'command' && samePath(exc.upstream.path, e.path)))
      failures.push(
        `exceptions.yaml: command \`${exc.upstream.path.join(' ')}\` is not in the pinned registry`,
      )

  // deprecated.yaml: the subcommand list matches the pin, and cospec has no row for it.
  for (const dep of model.deprecated) {
    const cmd = findRegistry(model.registry, dep.upstream.path)
    const upstreamSubs = (cmd?.subcommands ?? []).map((s) => s.name).toSorted()
    if (JSON.stringify(upstreamSubs) !== JSON.stringify(dep.subcommands.toSorted()))
      failures.push(
        `deprecated.yaml: \`${dep.upstream.path.join(' ')}\` lists [${dep.subcommands.join(', ')}], the pin has [${upstreamSubs.join(', ')}]`,
      )
  }

  return failures
}

function findRegistry(
  registry: readonly RegistryCommand[],
  path: readonly string[],
): RegistryCommand | undefined {
  let level: readonly RegistryCommand[] = registry
  let found: RegistryCommand | undefined
  for (const seg of path) {
    found = level.find((c) => c.name === seg)
    if (found === undefined) return undefined
    level = found.subcommands ?? []
  }
  return found
}

/**
 * Whether the pinned binary marks `dep` deprecated: in its registry
 * description, or by printing `dep.warning` verbatim as a stderr line when
 * `<path> list` runs.
 */
function deprecationMarked(
  dep: DeprecatedEntry,
  registry: readonly RegistryCommand[],
  listStderr: string,
): boolean {
  if (dep.mark === 'registry-description')
    return findRegistry(registry, dep.upstream.path)?.description.includes('(deprecated)') === true
  return (
    dep.warning !== undefined &&
    dep.warning.length > 0 &&
    listStderr.split('\n').some((line) => line.trim() === dep.warning!.trim())
  )
}

// --- loading the live model -------------------------------------------------------

const listStderr = new Map<string, string>()
const hiddenFound: Entry[] = []
let probesChangedRoot = false
let unknownCompleteType: OracleRun
let model: Model

beforeAll(async () => {
  const root = await scaffoldOracleRoot()
  const runtime = DEPRECATED.filter((dep) => dep.mark === 'runtime-stderr')
  const listRuns = await Promise.all(
    runtime.map((dep) => oracle([...dep.upstream.path, 'list'], root)),
  )
  for (const [i, dep] of runtime.entries())
    listStderr.set(dep.upstream.path.join(' '), listRuns[i]!.stderr)
  const beforeProbes = hashTree(root)
  const probes = await Promise.all(HIDDEN_FIXTURES.map((f) => oracle(f.probe, root)))
  probesChangedRoot = JSON.stringify(hashTree(root)) !== JSON.stringify(beforeProbes)
  unknownCompleteType = await oracle(['__complete', 'no-such-type'], root)
  for (const [i, fixture] of HIDDEN_FIXTURES.entries())
    if (fixture.present(probes[i]!)) hiddenFound.push(fixture.entry)
  model = {
    registry: COMMAND_REGISTRY,
    aiTools: AI_TOOLS.map((t) => t.value),
    toolAliases: TOOL_ID_ALIASES,
    workflows: ALL_WORKFLOWS,
    hidden: hiddenFound,
    table: COMMAND_TABLE,
    globalFlags: GLOBAL_FLAGS.map((f) => f.name),
    harnessNames: HARNESS_NAMES,
    canonWorkflows: CANON_WORKFLOWS,
    pending: PENDING,
    aliases: ALIASES,
    exceptions: EXCEPTIONS,
    deprecated: DEPRECATED.filter((dep) =>
      deprecationMarked(dep, COMMAND_REGISTRY, listStderr.get(dep.upstream.path.join(' ')) ?? ''),
    ),
  }
}, 60_000)

// --- the gate ---------------------------------------------------------------------

describe('reachability: every pinned OpenSpec surface resolves exactly once', () => {
  test('the four dist sources load and are non-empty', () => {
    expect(COMMAND_REGISTRY.length).toBeGreaterThan(0)
    expect(AI_TOOLS.length).toBeGreaterThan(0)
    expect(Object.keys(TOOL_ID_ALIASES).length).toBeGreaterThan(0)
    expect(ALL_WORKFLOWS.length).toBeGreaterThan(0)
  })

  test('every hidden fixture is still present in the pinned binary', () => {
    expect(hiddenFound).toEqual(HIDDEN_FIXTURES.map((f) => f.entry))
    expect(probesChangedRoot, 'a hidden-surface probe must not write to the fixture').toBe(false)
    // The exit-0 probes for `__complete` types mean something only because an
    // unknown type exits nonzero.
    expect(unknownCompleteType.exitCode).not.toBe(0)
    // Hidden means the four sources cannot produce it; otherwise it belongs to the walk.
    const walked = walkRegistry(COMMAND_REGISTRY).map((e) => JSON.stringify(e))
    for (const f of HIDDEN_FIXTURES) expect(walked).not.toContain(JSON.stringify(f.entry))
  })

  test('every walked entry resolves to exactly one place, and the reverse holds', () => {
    expect(checkReachability(model)).toEqual([])
  })

  test('forward rows declare every pinned flag and positional, for --help and completion', () => {
    expect(undeclaredOnForwardRows(model)).toEqual([])
    // Delegation is the binary's: a forward row owes nothing to a later change.
    for (const row of COMMAND_TABLE.filter((r) => r.parse === 'forward')) {
      const surfaces = [row, ...(row.subcommands ?? [])]
      expect(
        surfaces.flatMap((sf) => sf.flags).some((f) => isPending(f.status)),
        row.name,
      ).toBe(false)
      expect(
        (row.subcommands ?? []).some((sub) => isPending(sub.status)),
        row.name,
      ).toBe(false)
    }
  })
})

describe('parity data files', () => {
  test('every parity-pending.yaml entry carries a known owner slug', () => {
    const bad = PENDING.filter((pe) => pe.owner === undefined || !KNOWN_OWNERS.has(pe.owner))
    expect(bad.map((pe) => label(pe))).toEqual([])
  })

  test('exceptions.yaml holds exactly one entry: the self-upgrade offer on update', () => {
    expect(EXCEPTIONS).toHaveLength(1)
    expect(EXCEPTIONS[0]!.upstream).toEqual({
      kind: 'command',
      path: ['update'],
      surface: 'self-upgrade-offer',
    })
    expect(EXCEPTIONS[0]!.reason.length).toBeGreaterThan(0)
  })

  test('change is marked deprecated in its registry description', () => {
    const dep = DEPRECATED.find((d) => samePath(d.upstream.path, ['change']))
    expect(dep?.mark).toBe('registry-description')
    expect(deprecationMarked(dep!, COMMAND_REGISTRY, '')).toBe(true)
  })

  test('spec prints its deprecation warning verbatim on stderr when `spec list` runs', () => {
    const dep = DEPRECATED.find((d) => samePath(d.upstream.path, ['spec']))
    expect(dep?.mark).toBe('runtime-stderr')
    expect(deprecationMarked(dep!, COMMAND_REGISTRY, listStderr.get('spec') ?? '')).toBe(true)
  })

  test('every deprecated.yaml entry is verified against the binary', () => {
    expect(model.deprecated).toHaveLength(DEPRECATED.length)
  })
})

// --- the gate fails when it should -------------------------------------------------

/** A deep copy of the table with one flag's status replaced. */
function withFlagStatus(path: string[], flag: string, status: SurfaceStatus): CommandRow[] {
  const table = structuredClone(COMMAND_TABLE) as CommandRow[]
  const found = tableSurface(table, path)
  const spec = found?.surface.flags.find((f) => f.name === flag)
  if (spec === undefined) throw new Error(`no ${path.join(' ')} ${flag} in the table`)
  ;(spec as { status: SurfaceStatus }).status = status
  return table
}

describe('reachability: negative cases (ledger 4.1, 4.3, 4.5)', () => {
  test('a flag a forward row stops declaring is still reached, but its help misses it', () => {
    const table = structuredClone(COMMAND_TABLE) as CommandRow[]
    const show = table.find((row) => row.name === 'show')!
    ;(show as { flags: FlagSpec[] }).flags = show.flags.filter((f) => f.name !== '--diff')
    expect(checkReachability({ ...model, table })).toEqual([])
    expect(undeclaredOnForwardRows({ ...model, table })).toEqual(['flag `show --diff`'])
  })

  test('an entry removed from every place resolves nowhere and fails', () => {
    const pending = PENDING.filter((pe) => !(pe.kind === 'tool' && pe.id === 'cursor'))
    const failures = checkReachability({ ...model, pending })
    expect(failures).toContain('tool id `cursor` resolves nowhere')
  })

  test('an entry listed in two places fails', () => {
    const aliases = [
      ...ALIASES,
      { upstream: { kind: 'workflow', id: 'apply' }, cospec: 'apply' } as AliasEntry,
    ]
    const failures = checkReachability({ ...model, aliases })
    expect(failures).toContain('workflow `apply` resolves in 2 places: cospec, aliases.yaml')
  })

  test('a stale pending entry for a handled flag (list --specs) fails', () => {
    const stale: PendingEntry = {
      kind: 'flag',
      path: ['list'],
      flag: '--specs',
      owner: 'cli-surface-parity',
    }
    const failures = checkReachability({ ...model, pending: [...PENDING, stale] })
    expect(failures).toContain(
      'flag `list --specs` resolves in 2 places: cospec, parity-pending.yaml',
    )
    expect(failures).toContain(
      'parity-pending.yaml: flag `list --specs` is already reached by cospec (stale)',
    )
  })

  test('a pending entry for a surface the pin does not have fails', () => {
    const stale: PendingEntry = {
      kind: 'flag',
      path: ['list'],
      flag: '--no-such-flag',
      owner: 'cli-surface-parity',
    }
    const failures = checkReachability({ ...model, pending: [...PENDING, stale] })
    expect(failures).toContain(
      'parity-pending.yaml: flag `list --no-such-flag` names a surface the pinned binary does not have (stale)',
    )
  })

  test('a table flag marked pending with no parity-pending.yaml entry fails', () => {
    const table = withFlagStatus(['list'], '--specs', { pending: 'cli-surface-parity' })
    const failures = checkReachability({ ...model, table })
    expect(failures).toContain(
      "the command table marks flag `list --specs` pending on 'cli-surface-parity' but parity-pending.yaml has 0 entries for it",
    )
  })

  test('a pending entry whose owner disagrees with the table fails', () => {
    const pending = PENDING.filter((pe) => !(pe.kind === 'flag' && pe.flag === '--sort'))
    pending.push({ kind: 'flag', path: ['list'], flag: '--sort', owner: 'tool-matrix' })
    const failures = checkReachability({ ...model, pending })
    expect(failures).toContain(
      "flag `list --sort` is pending on 'tool-matrix' in parity-pending.yaml but on 'cli-surface-parity' in the command table",
    )
  })

  test('an untagged pending entry fails', () => {
    const pending = PENDING.filter((pe) => !(pe.kind === 'tool' && pe.id === 'zed'))
    pending.push({ kind: 'tool', id: 'zed' })
    expect(checkReachability({ ...model, pending })).toContain(
      'parity-pending.yaml: tool id `zed` has no owner',
    )
  })

  test('a second exceptions.yaml entry fails', () => {
    const extra: ExceptionEntry = { upstream: { kind: 'command', path: ['view'] }, reason: 'x' }
    expect(checkReachability({ ...model, exceptions: [...EXCEPTIONS, extra] })).toContain(
      'exceptions.yaml has 2 entries; exactly one is allowed',
    )
  })

  test('a blanked deprecation mark is not counted, so its subtree resolves nowhere', () => {
    const change = DEPRECATED.find((d) => samePath(d.upstream.path, ['change']))!
    const spec = DEPRECATED.find((d) => samePath(d.upstream.path, ['spec']))!
    const blankRegistry = COMMAND_REGISTRY.map((c) =>
      c.name === 'change' ? { ...c, description: 'Manage OpenSpec change proposals' } : c,
    )
    expect(deprecationMarked(change, blankRegistry, '')).toBe(false)
    expect(deprecationMarked(spec, COMMAND_REGISTRY, '')).toBe(false)
    const failures = checkReachability({ ...model, deprecated: [] })
    expect(failures).toContain('command `change` resolves nowhere')
    expect(failures).toContain('command `spec list` resolves nowhere')
  })
})
