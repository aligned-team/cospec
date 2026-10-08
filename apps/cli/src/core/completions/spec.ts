// The shell-agnostic completion model. cospec generates completions from its
// OWN command table (`command-table.ts`'s `COMMAND_TABLE` + `GLOBAL_FLAGS`)
// rather than passing `openspec completion` through: upstream's generator is
// driven by openspec's registry and its installer writes a completion
// function for the `openspec` binary — shipping that from cospec would write
// a permanent instruction to run bare `openspec` into the user's dotfiles,
// which is exactly what the routing discipline forbids.
//
// A command's completion flags are exactly its `--help` flags and its
// parser's accepted flags: all three read the same table row (`offeredFlags`
// — handled and accepted-no-op, never pending), so the three surfaces cannot
// drift apart (change `unknown-option-contract`; see the three-way parity
// test in `completions.test.ts`).

import {
  COMMAND_TABLE,
  type FlagSpec,
  GLOBAL_FLAGS,
  isPending,
  offeredFlags,
  rowGlobalFlags,
  type SubcommandSpec,
  VERSION_DESCRIPTION,
} from '../command-table.ts'

/** A completion source resolved at Tab time by the hidden `cospec __complete`. */
export type DynamicSource = 'changes' | 'specs' | 'types' | 'schemas'

/** A flag's completion tooltip and whether it consumes the next word as its value. */
export interface CompletionFlagInfo {
  description: string
  takesValue: boolean
}

/** A subcommand's completion surface (`schema which`, `completion generate`). */
export interface CompletionSubcommand {
  name: string
  summary: string
  /** Every `--flag` / `-x` the subcommand's table surface offers (handled + no-op). */
  flags: string[]
  /** Tooltip and value-taking, per token in `flags` (a short and its long share one). */
  flagInfo: Record<string, CompletionFlagInfo>
  /** The closed value set of its first positional (`completion generate <shell>`). */
  choices: string[]
}

export interface CompletionCommand {
  name: string
  summary: string
  /** Every `--flag` / `-x` the command's table row offers (handled + no-op). */
  flags: string[]
  /** Sources completing this command's positional argument, in order. */
  positional: DynamicSource[]
  /** Flags whose VALUE is dynamically completed (e.g. `--change <slug>`). */
  flagValues: Record<string, DynamicSource>
  /** Sources completing a subcommand's first positional, per subcommand (`schema which <name>`). */
  subcommandPositional: Record<string, DynamicSource[]>
  /**
   * The global flags offered after the command's name: its row's accepted
   * globals (`rowGlobalFlags`, so no `--store` on a `store: 'refused'` row)
   * plus `-V`/`--version`.
   */
  globalFlags: string[]
  /** Tooltip and value-taking, per token in `flags` (a short and its long share one). */
  flagInfo: Record<string, CompletionFlagInfo>
  /** The closed value set of the command's first positional (`completion <shell>`); never a pending value. */
  choices: string[]
  /** The offered (non-pending) subcommands, in the table's order. */
  subcommands: CompletionSubcommand[]
}

export interface CompletionSpec {
  commands: CompletionCommand[]
  /** Every global flag, offered before the command name. */
  globalFlags: string[]
  /** Tooltip and value-taking, per token in `globalFlags`. */
  globalFlagInfo: Record<string, CompletionFlagInfo>
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

/**
 * Flags whose value is a dynamic id, per command. Every row that declares
 * `--schema` also completes its value from `schemas` (`buildCompletionSpec`),
 * where the wrapped binary's own scripts complete schema names.
 */
const FLAG_VALUES: Record<string, Record<string, DynamicSource>> = {
  status: { '--change': 'changes' },
  instructions: { '--change': 'changes' },
  'sync-blockers': { '--change': 'changes' },
}

/** Subcommand positionals completed dynamically: the schema a `schema` subcommand names. */
const SUBCOMMAND_POSITIONAL: Record<string, Record<string, DynamicSource[]>> = {
  schema: { which: ['schemas'], validate: ['schemas'], fork: ['schemas'] },
}

/**
 * The offered (handled + accepted-no-op) flags of a surface, as completion
 * tokens: short form immediately before its long form, same order `flagLabel`
 * renders (`-r, --requirement`). Pending flags are never offered.
 */
export function offeredFlagTokens(flags: readonly FlagSpec[]): string[] {
  const tokens: string[] = []
  for (const flag of offeredFlags({ flags })) {
    if (flag.short !== undefined) tokens.push(flag.short)
    tokens.push(flag.name)
  }
  return tokens
}

/** Per token (short and long) of the offered flags: the tooltip text and value-taking. */
function flagInfoOf(flags: readonly FlagSpec[]): Record<string, CompletionFlagInfo> {
  const info: Record<string, CompletionFlagInfo> = {}
  for (const flag of offeredFlags({ flags })) {
    const entry = { description: flag.description, takesValue: flag.takesValue === true }
    if (flag.short !== undefined) info[flag.short] = entry
    info[flag.name] = entry
  }
  return info
}

/** The closed value set of a surface's first positional; a pending positional offers none. */
function choicesOf(surface: Pick<SubcommandSpec, 'positionals'>): string[] {
  const first = surface.positionals[0]
  return first === undefined || isPending(first.status) ? [] : [...(first.values ?? [])]
}

/**
 * Build the completion model from `COMMAND_TABLE`. Hidden commands
 * (`check-commit`, `__complete`) are filtered out — they are entrypoints for
 * hooks and for completion itself, not things a user tabs to. Every row
 * (`table` and `forward` alike) contributes its own declared flags: a
 * `forward` row is declared for exactly this reason (reachability, help,
 * completion), even though the wrapped binary — not cospec — accepts or
 * rejects its argv.
 */
export function buildCompletionSpec(): CompletionSpec {
  const globalFlags = [...offeredFlagTokens(GLOBAL_FLAGS), '-V', '--version']
  const version = { description: VERSION_DESCRIPTION, takesValue: false }
  const globalFlagInfo = { ...flagInfoOf(GLOBAL_FLAGS), '-V': version, '--version': version }
  const commands = COMMAND_TABLE.filter((row) => !row.hidden).map((row) => ({
    name: row.name,
    summary: row.summary,
    flags: offeredFlagTokens(row.flags),
    positional: POSITIONAL[row.name] ?? [],
    flagValues: {
      ...FLAG_VALUES[row.name],
      ...(offeredFlags(row).some((f) => f.name === '--schema')
        ? { '--schema': 'schemas' as const }
        : {}),
    },
    subcommandPositional: SUBCOMMAND_POSITIONAL[row.name] ?? {},
    globalFlags: [...offeredFlagTokens(rowGlobalFlags(row)), '-V', '--version'],
    flagInfo: flagInfoOf(row.flags),
    choices: choicesOf(row),
    subcommands: (row.subcommands ?? [])
      .filter((sub) => !isPending(sub.status))
      .map((sub) => ({
        name: sub.name,
        summary: sub.summary,
        flags: offeredFlagTokens(sub.flags),
        flagInfo: flagInfoOf(sub.flags),
        choices: choicesOf(sub),
      })),
  }))
  return { commands, globalFlags, globalFlagInfo }
}

/** The commands whose post-name global flags differ from the program's. */
export function narrowedGlobals(spec: CompletionSpec): CompletionCommand[] {
  return spec.commands.filter((c) => c.globalFlags.join(' ') !== spec.globalFlags.join(' '))
}
