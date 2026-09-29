// `cospec __complete <changes|specs|types|schemas|archived-changes>` — the
// hidden dynamic-completion source the generated shell scripts call at Tab
// time. Emits tab-separated `id<TAB>description` lines. The source name is
// matched case-insensitively, as upstream's `__complete <type>` matches it.
//
// EVERY failure is silent: exit 1 with nothing on stdout and nothing on stderr.
// A completion helper runs mid-keystroke, where an error message would corrupt
// the user's command line — so an unknown source, a missing openspec root, an
// unregistered store, or an unparseable wrapped payload all look the same:
// no suggestions. The whole payload is built before anything is written, so a
// late failure can never leave half a list on stdout. (Parse-time refusals from
// the command table — an unknown option, or a missing source (commander's
// `missing required argument`, as upstream prints it) — do reach stderr; the
// generated scripts call this with `2>/dev/null`.)

import { existsSync, readdirSync } from 'node:fs'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { archiveDir, COSPEC_TYPES, openspecDir } from '../core/change.ts'
import { openspecList, passthroughOpenspec } from '../core/openspec.ts'
import { resolveRoot, type ResolvedRoot } from '../core/root.ts'
import { TYPE_ARTIFACTS } from '../core/rules/type-facts.ts'

export const COMPLETE_SOURCES = [
  'changes',
  'specs',
  'types',
  'schemas',
  'archived-changes',
] as const
export type CompleteSource = (typeof COMPLETE_SOURCES)[number]

function isCompleteSource(name: string): name is CompleteSource {
  return (COMPLETE_SOURCES as readonly string[]).includes(name)
}

/** Render `id<TAB>description` lines (empty description → id alone). */
export function renderCompletionItems(items: { id: string; description?: string }[]): string {
  return items
    .map((item) =>
      item.description === undefined || item.description.length === 0
        ? `${item.id}\n`
        : `${item.id}\t${item.description}\n`,
    )
    .join('')
}

/** The 11 conventional-commit types, described by the artifacts each declares. */
function typeItems(): { id: string; description: string }[] {
  return COSPEC_TYPES.map((type) => ({
    id: type,
    description: TYPE_ARTIFACTS[type].declared.join(', '),
  }))
}

async function changeItems(ctx: CommandContext): Promise<{ id: string; description: string }[]> {
  const root = await resolveRoot(ctx)
  const list = await openspecList(root)
  return list.changes.map((change) => ({
    id: change.name,
    description: `${change.status}, ${change.completedTasks}/${change.totalTasks} tasks`,
  }))
}

interface SpecsPayload {
  specs?: { id: string; requirementCount: number }[]
}

async function specItems(ctx: CommandContext): Promise<{ id: string; description: string }[]> {
  const root = await resolveRoot(ctx)
  const result = await passthroughOpenspec(
    { command: ['list'], threaded: ['--json', ...root.storeArgs], args: ['--specs'] },
    { cwd: root.cwd },
  )
  if (result.exitCode !== 0) throw new Error('list --specs failed')
  const payload = JSON.parse(result.stdout) as SpecsPayload
  return (payload.specs ?? []).map((spec) => ({
    id: spec.id,
    description: `${spec.requirementCount} requirements`,
  }))
}

/** A root that holds an `openspec/` tree; outside one there is nothing to complete. */
async function plannedRoot(ctx: CommandContext): Promise<ResolvedRoot> {
  const root = await resolveRoot(ctx)
  if (!existsSync(openspecDir(root.base))) throw new Error('no openspec root')
  return root
}

interface SchemasPayloadEntry {
  name?: unknown
  description?: unknown
}

/**
 * Every schema `openspec schemas --json` lists, in its order, described by its
 * `description` (else `schema`, upstream's own description).
 */
async function schemaItems(ctx: CommandContext): Promise<{ id: string; description: string }[]> {
  const root = await plannedRoot(ctx)
  const result = await passthroughOpenspec(
    { command: ['schemas'], threaded: ['--json', ...root.storeArgs] },
    { cwd: root.cwd },
  )
  if (result.exitCode !== 0) throw new Error('schemas failed')
  const payload = JSON.parse(result.stdout) as unknown
  if (!Array.isArray(payload)) throw new Error('schemas printed no list')
  return (payload as SchemasPayloadEntry[]).map((entry) => {
    if (typeof entry.name !== 'string') throw new Error('a schema without a name')
    const description = typeof entry.description === 'string' ? entry.description : ''
    return { id: entry.name, description: description.length > 0 ? description : 'schema' }
  })
}

/**
 * The archived change directories under the resolved root's
 * `openspec/changes/archive/` (non-dot, sorted), each `archived change`. No
 * wrapped call: upstream reads the same directory, though under its cwd
 * rather than the selected root (design D9).
 */
async function archivedItems(ctx: CommandContext): Promise<{ id: string; description: string }[]> {
  const root = await plannedRoot(ctx)
  const dir = archiveDir(root.base)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .toSorted()
    .map((id) => ({ id, description: 'archived change' }))
}

async function itemsFor(
  source: CompleteSource,
  ctx: CommandContext,
): Promise<{ id: string; description?: string }[]> {
  switch (source) {
    case 'types':
      return typeItems()
    case 'changes':
      return changeItems(ctx)
    case 'specs':
      return specItems(ctx)
    case 'schemas':
      return schemaItems(ctx)
    case 'archived-changes':
      return archivedItems(ctx)
  }
}

export async function run(ctx: CommandContext): Promise<number> {
  // Required in the table: the parser has refused a missing one.
  const source = ctx.parsed!.positionals[0]!.toLowerCase()
  if (!isCompleteSource(source)) return EXIT.failure
  try {
    const items = await itemsFor(source, ctx)
    process.stdout.write(renderCompletionItems(items))
    return EXIT.success
  } catch {
    // Deliberate blanket catch: see the module header. Nothing is written, so
    // the shell simply offers no suggestions.
    return EXIT.failure
  }
}
