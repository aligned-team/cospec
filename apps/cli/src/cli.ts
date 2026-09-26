import { resolve } from 'node:path'

import pkg from '../package.json'
import {
  closest,
  COMMAND_TABLE,
  commandRow,
  type CommandRow,
  type FlagSpec,
  flagLabel,
  GLOBAL_FLAGS,
  isPending,
  isStorePathToken,
  offeredFlags,
  parseCommandArgs,
  type ParsedArgs,
  type PositionalSpec,
  positionalLabel,
  storePathRefusal,
  type SubcommandSpec,
  jsonRefusal,
} from './core/command-table.ts'

/** Global flags accepted before or after the subcommand on every command. */
export interface GlobalFlags {
  json: boolean
  noColor: boolean
  /** Absolute path the command should treat as the repo root. */
  cwd: string
  /** Registered store id to operate against instead of the local repo, if any. */
  store?: string
}

/** What every `src/commands/<name>.ts` module receives. */
export interface CommandContext {
  /** Command-specific argv with global flags already stripped out. */
  args: string[]
  flags: GlobalFlags
  /** Absolute working directory (resolved from --cwd, defaulting to process.cwd()). */
  cwd: string
  /**
   * `args` parsed against the command's table row. Set for every `parse:
   * 'table'` row (which has already refused anything undeclared, pending or
   * missing its value); absent for `forward` rows, which hand `args` to the
   * wrapped binary.
   */
  parsed?: ParsedArgs
}

/**
 * The contract command modules implement. The dispatcher lazy-imports
 * `./commands/<name>.ts` and calls `run`; the returned number is the process
 * exit code (see EXIT). A module missing this export is treated as unimplemented.
 */
export interface CommandModule {
  run(ctx: CommandContext): number | Promise<number>
}

/** The uniform exit-code contract (DESIGN §2). */
export const EXIT = {
  success: 0,
  failure: 1,
  blocked: 2,
  softBlocked: 3,
} as const

/**
 * Static command-module registry. Each value is a literal `import()` so
 * `bun build --compile` can statically bundle every command module into the
 * standalone binary. A computed import path (the previous
 * `new URL('./commands/' + name)`) is invisible to the bundler, which silently
 * drops the modules — the compiled binary then reports every subcommand as "not
 * yet implemented" and only `--version`/`--help` (which short-circuit before
 * dispatch) work. A `COMMAND_TABLE` row absent here is treated as
 * unimplemented.
 */
export const COMMAND_MODULES: Record<string, () => Promise<Partial<CommandModule>>> = {
  init: () => import('./commands/init.ts'),
  update: () => import('./commands/update.ts'),
  doctor: () => import('./commands/doctor.ts'),
  new: () => import('./commands/new.ts'),
  migrate: () => import('./commands/migrate.ts'),
  validate: () => import('./commands/validate.ts'),
  status: () => import('./commands/status.ts'),
  list: () => import('./commands/list.ts'),
  instructions: () => import('./commands/instructions.ts'),
  apply: () => import('./commands/apply.ts'),
  archive: () => import('./commands/archive.ts'),
  'sync-blockers': () => import('./commands/sync-blockers.ts'),
  store: () => import('./commands/store.ts'),
  context: () => import('./commands/context.ts'),
  workset: () => import('./commands/workset.ts'),
  show: () => import('./commands/show.ts'),
  view: () => import('./commands/view.ts'),
  schemas: () => import('./commands/schemas.ts'),
  schema: () => import('./commands/schema.ts'),
  templates: () => import('./commands/templates.ts'),
  config: () => import('./commands/config.ts'),
  completion: () => import('./commands/completion.ts'),
  feedback: () => import('./commands/feedback.ts'),
  __complete: () => import('./commands/complete.ts'),
  'check-commit': () => import('./commands/check-commit.ts'),
}

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

/** The global-flag help block every help screen ends with, rendered from `GLOBAL_FLAGS`. */
export const GLOBAL_OPTIONS = `Global options:\n${renderLines(flagLines(GLOBAL_FLAGS), GLOBAL_LABEL_WIDTH)}`

function helpText(): string {
  const visible = COMMAND_TABLE.filter((row) => !row.hidden)
  const rows = renderLines(visible.map((row) => ({ label: row.name, description: row.summary })))
  return `cospec — OpenSpec change management, sized to your commit type.

Usage: cospec <command> [options]

Commands:
${rows}

${GLOBAL_OPTIONS}
${renderLines([{ label: VERSION_LABEL, description: 'Show version' }], GLOBAL_LABEL_WIDTH)}

Run 'cospec <command> --help' for command-specific help.
`
}

function offeredSubcommands(row: CommandRow): SubcommandSpec[] {
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

/** The Usage line's signature after the command path. */
function usageSignature(surface: {
  readonly positionals: readonly PositionalSpec[]
  readonly subcommands?: readonly SubcommandSpec[]
}): string {
  const subcommands = (surface.subcommands ?? []).filter((s) => !isPending(s.status))
  const parts =
    subcommands.length > 0
      ? [`<${subcommands.map((s) => s.name).join('|')}>`, '[args]']
      : offeredPositionals(surface).map(usagePositional)
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
function commandHelpText(row: CommandRow): string {
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
  return renderCommandHelp(row.name, row.summary, usageSignature(row), sections)
}

/** `cospec <command> <subcommand> --help`: the subcommand's own positionals and flags. */
function subcommandHelpText(row: CommandRow, subcommand: SubcommandSpec): string {
  const sections: string[] = []
  const args = argumentLines(subcommand.positionals)
  if (args.length > 0) sections.push(`Arguments:\n${renderLines(args)}`)
  const flags = flagLines(subcommand.flags)
  if (flags.length > 0) sections.push(`Command options:\n${renderLines(flags)}`)
  return renderCommandHelp(
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

function renderCommandHelp(
  path: string,
  summary: string,
  signature: string,
  sections: readonly string[],
): string {
  const body = sections.map((section) => `${section}\n\n`).join('')
  return `cospec ${path} — ${summary}

Usage: cospec ${path}${signature} [options]

${body}${GLOBAL_OPTIONS}
`
}

/**
 * Parse argv, apply global flags, and dispatch to the matching command module.
 * Returns the process exit code. A `table` row's argv is parsed against its
 * row before the module loads, so an undeclared, pending or value-less option
 * is refused (exit 1) before any work; a `forward` row's argv reaches its
 * wrapper unchanged. `--store-path` is refused on every command, in either
 * position, with upstream's redirect respelled to cospec.
 */
export async function run(argv: string[]): Promise<number> {
  const flags: GlobalFlags = { json: false, noColor: false, cwd: process.cwd() }
  let command: string | undefined
  const rest: string[] = []
  let cwdRaw: string | undefined
  let storeRaw: string | undefined
  let wantVersion = false
  let wantHelp = false
  let badOption: string | undefined
  let storePath = false
  // Set true for exactly one iteration: the token immediately following the
  // command name. A bare `help` there means `cospec <command> help` ==
  // `cospec <command> --help` — a common typo/muscle-memory (other CLIs
  // accept it) that must never fall through into a state-mutating command's
  // argv (e.g. `cospec archive help` must not try to archive a change called
  // "help").
  let expectHelpToken = false
  // Set once a post-command `--` is seen: like upstream's commander, every
  // later token is an operand, so no global flag is absorbed after it.
  let terminated = false

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!
    if (command === undefined) {
      if (tok === '--json') flags.json = true
      else if (tok === '--no-color') flags.noColor = true
      else if (tok === '--version' || tok === '-V') wantVersion = true
      else if (tok === '--help' || tok === '-h') wantHelp = true
      else if (tok === '--cwd') cwdRaw = argv[++i]
      else if (tok.startsWith('--cwd=')) cwdRaw = tok.slice('--cwd='.length)
      else if (tok === '--store') storeRaw = argv[++i]
      else if (tok.startsWith('--store=')) storeRaw = tok.slice('--store='.length)
      else if (isStorePathToken(tok)) {
        // Consume its value so `/x` in `--store-path /x list` is never taken
        // for the command name; the refusal is printed after the loop, once
        // a later `--json` is known.
        storePath = true
        if (tok === '--store-path') i++
      } else if (tok.startsWith('-')) badOption ??= tok
      else {
        command = tok
        expectHelpToken = true
      }
      continue
    }
    if (expectHelpToken) {
      expectHelpToken = false
      if (tok === 'help') {
        wantHelp = true
        continue
      }
    }
    if (terminated || tok === '--') {
      // `--` itself stays in the command's argv: the table parser and the
      // wrapped binary both read it as the operand terminator.
      terminated = true
      rest.push(tok)
      continue
    }
    // After the command name and before any `--`, absorb global flags anywhere;
    // everything else is the command's own argv. --help/-h is intercepted here
    // too so it can never silently fall through into a state-mutating command's
    // argv.
    if (tok === '--json') flags.json = true
    else if (tok === '--no-color') flags.noColor = true
    else if (tok === '--help' || tok === '-h') wantHelp = true
    // Upstream's commander honours the program-level `-V, --version` after any
    // subcommand, so cospec does too.
    else if (tok === '--version' || tok === '-V') wantVersion = true
    else if (tok === '--cwd') cwdRaw = argv[++i]
    else if (tok.startsWith('--cwd=')) cwdRaw = tok.slice('--cwd='.length)
    else if (tok === '--store') storeRaw = argv[++i]
    else if (tok.startsWith('--store=')) storeRaw = tok.slice('--store='.length)
    else {
      // Forward rows get no parser, so the post-command `--store-path` is
      // caught here for every row alike.
      if (isStorePathToken(tok)) storePath = true
      rest.push(tok)
    }
  }

  const cwd = cwdRaw !== undefined ? resolve(process.cwd(), cwdRaw) : process.cwd()
  flags.cwd = cwd
  if (storeRaw !== undefined && storeRaw.length > 0) flags.store = storeRaw
  if (flags.noColor) process.env.NO_COLOR = '1'

  // Upstream answers a version request before anything else in the argv —
  // help, an unknown option, `--store-path`, or the command itself.
  if (wantVersion) {
    process.stdout.write(`${pkg.version}\n`)
    return EXIT.success
  }

  if (storePath && !wantHelp) {
    const refusal = storePathRefusal(flags.json)
    process[refusal.stream].write(refusal.text)
    return EXIT.failure
  }

  if (command === undefined) {
    if (badOption !== undefined) {
      process.stderr.write(`cospec: unknown option '${badOption}'\n`)
      process.stderr.write(helpText())
      return EXIT.failure
    }
    // No command and no version request → help (covers empty argv and --help).
    process.stdout.write(helpText())
    return EXIT.success
  }

  const row = commandRow(command)
  if (row === undefined) {
    process.stderr.write(`cospec: unknown command '${command}'\n`)
    const suggestion = closest(
      command,
      COMMAND_TABLE.filter((r) => !r.hidden).map((r) => r.name),
    )
    if (suggestion !== undefined) process.stderr.write(`Did you mean '${suggestion}'?\n`)
    process.stderr.write("Run 'cospec --help' for a list of commands.\n")
    return EXIT.failure
  }

  // `cospec <command> --help` prints per-command help instead of running the
  // command — critical for state-mutating commands like archive.
  if (wantHelp) {
    const first = rest[0]
    const subcommand =
      first !== undefined ? offeredSubcommands(row).find((s) => s.name === first) : undefined
    process.stdout.write(
      subcommand !== undefined ? subcommandHelpText(row, subcommand) : commandHelpText(row),
    )
    return EXIT.success
  }

  let parsed: ParsedArgs | undefined
  if (row.parse === 'table') {
    // A `--json` caller is owed one parseable document even on refusal, so
    // this answers before the parser can print a stderr-only refusal.
    if (row.json === 'refused' && flags.json) {
      process.stdout.write(jsonRefusal(row.name, row.jsonRefusalMessage))
      return EXIT.failure
    }
    const result = parseCommandArgs(row, rest)
    if (!result.ok) {
      if (result.refusal.kind === 'store-path') {
        const refusal = storePathRefusal(flags.json)
        process[refusal.stream].write(refusal.text)
      } else process.stderr.write(result.refusal.message)
      return EXIT.failure
    }
    parsed = result.parsed
  }

  const loadModule = COMMAND_MODULES[row.name]
  if (loadModule === undefined) {
    process.stderr.write(`cospec: '${row.name}' is not yet implemented\n`)
    return EXIT.failure
  }

  const mod = await loadModule()
  if (typeof mod.run !== 'function') {
    process.stderr.write(`cospec: '${row.name}' is not yet implemented\n`)
    return EXIT.failure
  }

  const ctx: CommandContext = {
    args: rest,
    flags,
    cwd,
    ...(parsed !== undefined ? { parsed } : {}),
  }
  const code = await mod.run(ctx)
  return typeof code === 'number' ? code : EXIT.success
}
