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

interface CommandEntry {
  name: string
  summary: string
  hidden?: boolean
  /** Positional signature shown right after the command name in the Usage line. */
  usage?: string
  /** Pre-formatted `--flag  description` lines shown under "Command options:". */
  options?: string
}

/**
 * @deprecated Legacy pre-formatted help strings, read only by
 * `core/completions/spec.ts` until the completion spec is built from
 * `COMMAND_TABLE`. Dispatch and `--help` read `COMMAND_TABLE`; nothing new
 * may read this.
 */
export const COMMANDS: CommandEntry[] = [
  {
    name: 'init',
    summary: 'Scaffold cospec into a repo (schemas + harness files)',
    usage: '[path]',
    options: `  --yes              Skip prompts; auto-remove detected opsx leftovers
  --force            Overwrite conflicting managed files
  --harness <list>   claude,codex,opencode,agents,all,none (comma-separate for multiple)
  --gate             Force-enable the commit gate (mise + hk + commitlint)
  --no-gate          Force-disable the commit gate
  --remove-opsx      Delete provably openspec-generated leftover files`,
  },
  {
    name: 'update',
    summary: 'Regenerate managed files from canon',
    options: `  --check   Drift gate: exit nonzero on drift, write nothing
  --force   Overwrite conflicting managed files`,
  },
  { name: 'doctor', summary: 'Diagnose a cospec setup and report remedies' },
  {
    name: 'new',
    summary: 'Create a new typed change (cospec new <type> <slug>)',
    usage: '<type> <slug>',
    options: `  --description <text>   Seed the proposal with a one-line description`,
  },
  { name: 'migrate', summary: 'Migrate a v1 change to schemaVersion 2 (opt-in)', usage: '<slug>' },
  {
    name: 'validate',
    summary: 'Validate changes and specs',
    usage: '[name]',
    options: `  --strict          Promote warnings to errors
  --fast             Skip slower cross-checks
  --all              Validate every change and spec
  --changes          Validate changes only
  --specs            Validate specs only
  --archived         Validate already-archived changes instead (delegated; openspec >=1.9.0)
  --no-interactive   Never prompt, even for an ambiguous change name`,
  },
  {
    name: 'status',
    summary: "Show a change's status and gate state",
    options: `  --change <slug>   The change to report on (or pass it positionally)
  --all             Report every active change instead of one (mutually exclusive with --change)`,
  },
  {
    name: 'list',
    summary: 'List active changes',
    options: `  --specs     List living specs by requirement count instead
  --blocked   Only changes with a non-clear gate state`,
  },
  {
    name: 'instructions',
    summary: 'Print artifact-authoring instructions for a change',
    usage: '<artifact>',
    options: `  --change <slug>   The change the artifact belongs to (required)
  --allow-soft      Proceed past a soft block
  artifacts: proposal, blocking-changes, specs, design, verification, tasks, apply, archive
  ('archive' is read-only guidance — unlike 'apply', it is not an alias for 'cospec archive')`,
  },
  {
    name: 'apply',
    summary: 'Gate implementation on blockers and required artifacts',
    usage: '<change>',
    options: `  --allow-soft   Proceed past a soft block
  --skip-specs   Satisfy the specs requirement for this run (persist with skip_specs: true instead)`,
  },
  {
    name: 'archive',
    summary: 'Validate, archive, and fan out blocker updates',
    usage: '<change>',
    options: `  --skip-specs         Skip spec-sync even when the schema has a specs artifact
  --force-incomplete   Override the tasks-incomplete gate (verification gates never lift)`,
  },
  {
    name: 'sync-blockers',
    summary: 'Reconcile blocking-changes.md checkboxes',
    options: `  --check            Report only; write nothing
  --change <slug>    Limit to one change's blocking-changes.md`,
  },
  {
    name: 'store',
    summary: 'Manage registered OpenSpec stores',
    usage: '<setup|register|unregister|remove|list|doctor> [args]',
    options: `  --no-cospec-init   Skip the auto 'cospec init --harness none' (setup/register only)`,
  },
  {
    name: 'context',
    summary: "Show a store's cross-repo working-set context",
    options: `  --code-workspace <path>   Also write/update a VS Code multi-root workspace file
  --force                   Overwrite a code-workspace file cospec did not author`,
  },
  {
    name: 'workset',
    summary: 'Manage personal cross-repo worksets',
    usage: '<create|list|remove|open> [args]',
  },
  {
    name: 'show',
    summary: 'Show a change or spec (text or JSON)',
    usage: '<item>',
    options: `  --type <change|spec>     Disambiguate an id that matches both
  --deltas-only            Changes only: print deltas, skip the proposal body
  --requirements-only       Specs only: print requirements, skip prose
  -r, --requirement <id>   Show a single requirement
  --no-scenarios           Omit scenario blocks`,
  },
  { name: 'view', summary: 'Show the OpenSpec dashboard' },
  { name: 'schemas', summary: 'List resolvable schemas' },
  {
    name: 'schema',
    summary: 'Inspect a schema (which/validate)',
    usage: '<which|validate|fork|init> [args]',
    options: `  --description <text>   init only: seed the new schema's description
  --artifacts <list>      init only: comma-separated artifact ids to include`,
  },
  {
    name: 'templates',
    summary: 'List per-artifact template paths',
    options: `  --schema <name>   Schema whose templates to list (default: spec-driven)`,
  },
  {
    name: 'config',
    summary: 'View and modify machine-global OpenSpec configuration',
    usage: '<path|list|get|set|unset|reset|edit|profile> [args]',
    options: `  --scope <scope>   Config scope (only "global" is implemented upstream)
  (config is machine-global: --store never applies; edit/profile/reset without -y
   hand the terminal over and cannot emit JSON)`,
  },
  {
    name: 'completion',
    summary: 'Print the shell completion script for cospec',
    usage: '[bash|zsh|fish]',
    options: `  (shell omitted: detected from $SHELL; the script is printed, never installed)`,
  },
  {
    name: 'feedback',
    summary: "File feedback about cospec (--upstream files OpenSpec's)",
    usage: '<message>',
    options: `  --body <text>   Detailed description for the report
  --upstream      File at Fission-AI/OpenSpec instead of aligned-team/cospec`,
  },
  {
    name: '__complete',
    summary: 'Dynamic completion source (changes|specs|types)',
    hidden: true,
  },
  {
    name: 'check-commit',
    summary: 'Warn on commit-type/schema mismatch (hook entrypoint)',
    hidden: true,
  },
]

/**
 * Static command-module registry. Each value is a literal `import()` so
 * `bun build --compile` can statically bundle every command module into the
 * standalone binary. A computed import path (the previous
 * `new URL('./commands/' + name)`) is invisible to the bundler, which silently
 * drops the modules — the compiled binary then reports every subcommand as "not
 * yet implemented" and only `--version`/`--help` (which short-circuit before
 * dispatch) work. A name present in COMMANDS but absent here is treated as
 * unimplemented.
 */
const COMMAND_MODULES: Record<string, () => Promise<Partial<CommandModule>>> = {
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

/**
 * The global-flag help block, rendered from `GLOBAL_FLAGS`. Still exported
 * because `core/completions/spec.ts` extracts the global completion flags
 * from it until the completion spec reads the table directly.
 */
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
    // After the command name, absorb global flags anywhere; everything else is
    // the command's own argv. --help/-h is intercepted here too so it can never
    // silently fall through into a state-mutating command's argv.
    if (tok === '--json') flags.json = true
    else if (tok === '--no-color') flags.noColor = true
    else if (tok === '--help' || tok === '-h') wantHelp = true
    else if (tok === '--cwd') cwdRaw = argv[++i]
    else if (tok.startsWith('--cwd=')) cwdRaw = tok.slice('--cwd='.length)
    else if (tok === '--store') storeRaw = argv[++i]
    else if (tok.startsWith('--store=')) storeRaw = tok.slice('--store='.length)
    else {
      // Forward rows get no parser, so the post-command `--store-path` is
      // caught here for every row alike (up to a `--` terminator).
      if (isStorePathToken(tok) && !rest.includes('--')) storePath = true
      rest.push(tok)
    }
  }

  const cwd = cwdRaw !== undefined ? resolve(process.cwd(), cwdRaw) : process.cwd()
  flags.cwd = cwd
  if (storeRaw !== undefined && storeRaw.length > 0) flags.store = storeRaw
  if (flags.noColor) process.env.NO_COLOR = '1'

  if (storePath && !wantHelp && !wantVersion) {
    const refusal = storePathRefusal(flags.json)
    process[refusal.stream].write(refusal.text)
    return EXIT.failure
  }

  if (command === undefined) {
    if (wantVersion) {
      process.stdout.write(`${pkg.version}\n`)
      return EXIT.success
    }
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
