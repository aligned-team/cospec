// `cospec __complete <changes|specs|types>` — the hidden dynamic-completion
// source the generated shell scripts call at Tab time. Emits tab-separated
// `id<TAB>description` lines.
//
// EVERY failure is silent: exit 1 with nothing on stdout and nothing on stderr.
// A completion helper runs mid-keystroke, where an error message would corrupt
// the user's command line — so an unknown source, a missing openspec root, an
// unregistered store, or an unparseable wrapped payload all look the same:
// no suggestions. The whole payload is built before anything is written, so a
// late failure can never leave half a list on stdout.

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { COSPEC_TYPES } from '../core/change.ts'
import { openspecList, passthroughOpenspec } from '../core/openspec.ts'
import { resolveRoot } from '../core/root.ts'
import { TYPE_ARTIFACTS } from '../core/rules/type-facts.ts'

export const COMPLETE_SOURCES = ['changes', 'specs', 'types'] as const
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
  const result = await passthroughOpenspec(['list', '--specs', '--json'], {
    cwd: root.cwd,
    storeArgs: root.storeArgs,
  })
  if (result.exitCode !== 0) throw new Error('list --specs failed')
  const payload = JSON.parse(result.stdout) as SpecsPayload
  return (payload.specs ?? []).map((spec) => ({
    id: spec.id,
    description: `${spec.requirementCount} requirements`,
  }))
}

export async function run(ctx: CommandContext): Promise<number> {
  const source = ctx.args[0]
  if (source === undefined || !isCompleteSource(source)) return EXIT.failure
  try {
    const items =
      source === 'types'
        ? typeItems()
        : source === 'changes'
          ? await changeItems(ctx)
          : await specItems(ctx)
    process.stdout.write(renderCompletionItems(items))
    return EXIT.success
  } catch {
    // Deliberate blanket catch: see the module header. Nothing is written, so
    // the shell simply offers no suggestions.
    return EXIT.failure
  }
}
