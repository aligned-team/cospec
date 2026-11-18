// Help screens, rendered from the command table: the program's, a command's and a subcommand's.
// Their own module, not cli.ts: `help` and `config` render them, and cli.ts's command registry
// would make each of those commands reach every other one.

import {
  COMMAND_TABLE,
  type CommandRow,
  flagLabel,
  type FlagSpec,
  GLOBAL_FLAGS,
  isPending,
  offeredFlags,
  positionalLabel,
  type PositionalSpec,
  rowGlobalFlags,
  type SubcommandSpec,
  VERSION_DESCRIPTION,
} from './command-table.ts'

const VERSION_LABEL = '-V, --version'

interface HelpLine {
  readonly label: string
  readonly description: string
}

/** Two-column rows, labels padded to the widest label (or `minWidth`) plus two spaces. */
function renderLines(lines: readonly HelpLine[], minWidth = 0): string {
  const width = Math.max(minWidth, ...lines.map((line) => line.label.length))
  return lines
    .map((line) => `  ${line.label.padEnd(width)}  ${line.description}`.trimEnd())
    .join('\n')
}

function flagLines(flags: readonly FlagSpec[]): HelpLine[] {
  return offeredFlags({ flags }).map((flag) => ({
    label: flagLabel(flag),
    description: flag.description,
  }))
}

const GLOBAL_LABEL_WIDTH = Math.max(
  VERSION_LABEL.length,
  ...GLOBAL_FLAGS.map((flag) => flagLabel(flag).length),
)

function globalOptions(flags: readonly FlagSpec[]): string {
  return `Global options:\n${renderLines(flagLines(flags), GLOBAL_LABEL_WIDTH)}`
}

/** The global-flag help block every help screen ends with, rendered from `GLOBAL_FLAGS`. */
export const GLOBAL_OPTIONS = globalOptions(GLOBAL_FLAGS)

/** The program's own help: `cospec --help`, and `cospec help`. */
export function programHelpText(): string {
  const visible = COMMAND_TABLE.filter((row) => !row.hidden)
  const rows = renderLines(visible.map((row) => ({ label: row.name, description: row.summary })))
  return `cospec — OpenSpec change management, sized to your commit type.

Usage: cospec <command> [options]

Commands:
${rows}

${GLOBAL_OPTIONS}
${renderLines([{ label: VERSION_LABEL, description: VERSION_DESCRIPTION }], GLOBAL_LABEL_WIDTH)}

Run 'cospec <command> --help' for command-specific help.
`
}

export function offeredSubcommands(row: CommandRow): SubcommandSpec[] {
  return (row.subcommands ?? []).filter((subcommand) => !isPending(subcommand.status))
}

function offeredPositionals(surface: {
  readonly positionals: readonly PositionalSpec[]
}): PositionalSpec[] {
  return surface.positionals.filter((positional) => !isPending(positional.status))
}

/** `[name]`, or the closed value set (`[bash|zsh|fish]`) when the slot declares one. */
function usagePositional(positional: PositionalSpec): string {
  if (positional.values === undefined) return positionalLabel(positional)
  const values = positional.values.join('|')
  return positional.required ? `<${values}>` : `[${values}]`
}

/**
 * The Usage line's signature after the command path. A row that takes
 * positionals of its own shows them, its subcommands (upstream spellings of
 * it, `new change`) listed under Subcommands; one that only dispatches shows
 * its subcommand choice.
 */
function usageSignature(surface: {
  readonly positionals: readonly PositionalSpec[]
  readonly subcommands?: readonly SubcommandSpec[]
}): string {
  const subcommands = (surface.subcommands ?? []).filter((s) => !isPending(s.status))
  const positionals = offeredPositionals(surface)
  const parts =
    subcommands.length > 0 && positionals.length === 0
      ? [`<${subcommands.map((s) => s.name).join('|')}>`, '[args]']
      : positionals.map(usagePositional)
  return parts.map((part) => ` ${part}`).join('')
}

function argumentLines(positionals: readonly PositionalSpec[]): HelpLine[] {
  return offeredPositionals({ positionals })
    .filter((positional) => positional.description !== undefined)
    .map((positional) => ({
      label: positionalLabel(positional),
      description: positional.description!,
    }))
}

/**
 * Per-command help, reachable via `cospec <command> --help` (or `cospec
 * <command> help`, see the dispatcher below), rendered from the command's
 * table row: its positionals, its subcommands with each one's flags, and every
 * handled or accepted no-op flag — never a pending one.
 */
export function commandHelpText(row: CommandRow): string {
  const sections: string[] = []
  const args = argumentLines(row.positionals)
  if (args.length > 0) sections.push(`Arguments:\n${renderLines(args)}`)
  const subcommands = offeredSubcommands(row)
  if (subcommands.length > 0) {
    const width = Math.max(...subcommands.map((s) => s.name.length))
    const flagWidth = Math.max(
      0,
      ...subcommands.flatMap((s) => flagLines(s.flags).map((line) => line.label.length)),
    )
    const blocks = subcommands.map((subcommand) => {
      const head = renderLines([{ label: subcommand.name, description: subcommand.summary }], width)
      const flags = flagLines(subcommand.flags)
      return flags.length > 0 ? `${head}\n${indent(renderLines(flags, flagWidth))}` : head
    })
    sections.push(`Subcommands:\n${blocks.join('\n')}`)
  }
  const flags = flagLines(row.flags)
  const notes = (row.notes ?? []).map((note) => `  ${note}`)
  if (flags.length > 0 || notes.length > 0) {
    const body = [...(flags.length > 0 ? [renderLines(flags)] : []), ...notes].join('\n')
    sections.push(`Command options:\n${body}`)
  }
  return renderCommandHelp(row, row.name, row.summary, usageSignature(row), sections)
}

/** `cospec <command> <subcommand> --help`: the subcommand's own positionals and flags. */
export function subcommandHelpText(row: CommandRow, subcommand: SubcommandSpec): string {
  const sections: string[] = []
  const args = argumentLines(subcommand.positionals)
  if (args.length > 0) sections.push(`Arguments:\n${renderLines(args)}`)
  const flags = flagLines(subcommand.flags)
  if (flags.length > 0) sections.push(`Command options:\n${renderLines(flags)}`)
  return renderCommandHelp(
    row,
    `${row.name} ${subcommand.name}`,
    subcommand.summary,
    usageSignature(subcommand),
    sections,
  )
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')
}

/** A command's help screen, ending with the global flags its row accepts. */
function renderCommandHelp(
  row: CommandRow,
  path: string,
  summary: string,
  signature: string,
  sections: readonly string[],
): string {
  const body = sections.map((section) => `${section}\n\n`).join('')
  return `cospec ${path} — ${summary}

Usage: cospec ${path}${signature} [options]

${body}${globalOptions(rowGlobalFlags(row))}
`
}
