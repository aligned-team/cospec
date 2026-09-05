// The shell-agnostic completion model. cospec generates completions from its
// OWN static command table (`cli.ts`'s `COMMANDS` + `GLOBAL_OPTIONS`) rather
// than passing `openspec completion` through: upstream's generator is driven by
// openspec's registry and its installer writes a completion function for the
// `openspec` binary — shipping that from cospec would write a permanent
// instruction to run bare `openspec` into the user's dotfiles, which is exactly
// what the routing discipline forbids.
//
// Flags are extracted from each table entry's pre-formatted `options` help
// block. That extraction is the one fragile part of this module, so it is a
// pure exported function with a snapshot unit test: a table row the extractor
// cannot parse fails CI rather than silently shrinking completion.

import { COMMANDS, GLOBAL_OPTIONS } from '../../cli.ts'

/** A completion source resolved at Tab time by the hidden `cospec __complete`. */
export type DynamicSource = 'changes' | 'specs' | 'types'

export interface CompletionCommand {
  name: string
  summary: string
  /** Every `--flag` / `-x` the command's own help block declares. */
  flags: string[]
  /** Sources completing this command's positional argument, in order. */
  positional: DynamicSource[]
  /** Flags whose VALUE is dynamically completed (e.g. `--change <slug>`). */
  flagValues: Record<string, DynamicSource>
}

export interface CompletionSpec {
  commands: CompletionCommand[]
  globalFlags: string[]
}

/** Positional argument sources, per command (`cli.ts` `usage` positionals). */
const POSITIONAL: Record<string, DynamicSource[]> = {
  new: ['types'],
  migrate: ['changes'],
  validate: ['changes'],
  status: ['changes'],
  apply: ['changes'],
  archive: ['changes'],
  show: ['changes', 'specs'],
}

/** Flags whose value is a dynamic id, per command. */
const FLAG_VALUES: Record<string, Record<string, DynamicSource>> = {
  status: { '--change': 'changes' },
  instructions: { '--change': 'changes' },
  'sync-blockers': { '--change': 'changes' },
}

// A leading option token in a help line: `--flag`, `-x`, optionally followed by
// a `<value>`/`[value]` placeholder and a `, ` separator before the next alias.
const LEADING_FLAG = /^[ \t]*(-{1,2}[A-Za-z][A-Za-z0-9-]*)(?:[ \t]*(?:<[^>]*>|\[[^\]]*\]))?(?:,)?/

/**
 * Extract the option tokens from a pre-formatted help block (`CommandEntry.options`
 * or `GLOBAL_OPTIONS`). Only the run of option tokens at the START of a line is
 * taken, so a description mentioning a flag is never mistaken for one, and a
 * continuation line that opens with prose (`artifacts: proposal, …`) contributes
 * nothing. Pure.
 */
export function extractFlags(options: string | undefined): string[] {
  if (options === undefined) return []
  const found: string[] = []
  for (const line of options.split('\n')) {
    let rest = line
    for (;;) {
      const match = LEADING_FLAG.exec(rest)
      if (match === null) break
      const flag = match[1]!
      if (!found.includes(flag)) found.push(flag)
      rest = rest.slice(match[0].length)
    }
  }
  return found
}

/**
 * Build the completion model from cospec's own command table. Hidden commands
 * (`check-commit`, `__complete`) are filtered out — they are entrypoints for
 * hooks and for completion itself, not things a user tabs to.
 */
export function buildCompletionSpec(): CompletionSpec {
  const globalFlags = [...extractFlags(GLOBAL_OPTIONS), '-V', '--version']
  const commands = COMMANDS.filter((entry) => entry.hidden !== true).map((entry) => ({
    name: entry.name,
    summary: entry.summary,
    flags: extractFlags(entry.options),
    positional: POSITIONAL[entry.name] ?? [],
    flagValues: FLAG_VALUES[entry.name] ?? {},
  }))
  return { commands, globalFlags }
}
