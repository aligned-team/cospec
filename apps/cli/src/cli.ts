import { resolve } from 'node:path'

import pkg from '../package.json'

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
 * Static command table — the single source for `--help` and for validating an
 * incoming command name. Command tracks add the matching `commands/<name>.ts`
 * file without touching this dispatcher.
 */
export const COMMANDS: CommandEntry[] = [
  {
    name: 'init',
    summary: 'Scaffold cospec into a repo (schemas + harness files)',
    usage: '[path]',
    options: `  --yes              Skip prompts; auto-remove detected opsx leftovers
  --force            Overwrite conflicting managed files
  --harness <list>   claude,codex,opencode,all,none (comma-separate for multiple)
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
  --no-interactive   Never prompt, even for an ambiguous change name`,
  },
  {
    name: 'status',
    summary: "Show a change's status and gate state",
    options: `  --change <slug>   The change to report on (or pass it positionally)`,
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
  --allow-soft      Proceed past a soft block`,
  },
  {
    name: 'apply',
    summary: 'Gate implementation on blockers and required artifacts',
    usage: '<change>',
    options: `  --allow-soft   Proceed past a soft block`,
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
  'check-commit': () => import('./commands/check-commit.ts'),
}

const GLOBAL_OPTIONS = `Global options:
  --json         Machine-readable output
  --no-color     Disable ANSI color
  --cwd <path>   Run as if invoked from <path>
  --store <id>   Operate against a registered OpenSpec store instead of the local repo
  -h, --help     Show this help`

function helpText(): string {
  const visible = COMMANDS.filter((c) => !c.hidden)
  const width = Math.max(...visible.map((c) => c.name.length))
  const rows = visible.map((c) => `  ${c.name.padEnd(width)}  ${c.summary}`).join('\n')
  return `cospec — OpenSpec change management, sized to your commit type.

Usage: cospec <command> [options]

Commands:
${rows}

${GLOBAL_OPTIONS}
  -V, --version  Show version

Run 'cospec <command> --help' for command-specific help.
`
}

/**
 * Per-command help, reachable via `cospec <command> --help` (or `cospec
 * <command> help`, see the dispatcher below). Renders the command's own
 * positionals and flags — not just the shared global options — when the
 * command table declares them.
 */
function commandHelpText(entry: CommandEntry): string {
  const usage = entry.usage !== undefined ? ` ${entry.usage}` : ''
  const options = entry.options !== undefined ? `Command options:\n${entry.options}\n\n` : ''
  return `cospec ${entry.name} — ${entry.summary}

Usage: cospec ${entry.name}${usage} [options]

${options}${GLOBAL_OPTIONS}
`
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const dist: number[] = Array.from({ length: rows * cols }, () => 0)
  for (let i = 0; i < rows; i++) dist[i * cols] = i
  for (let j = 0; j < cols; j++) dist[j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dist[i * cols + j] = Math.min(
        dist[(i - 1) * cols + j]! + 1,
        dist[i * cols + (j - 1)]! + 1,
        dist[(i - 1) * cols + (j - 1)]! + cost,
      )
    }
  }
  return dist[rows * cols - 1]!
}

function closest(input: string, candidates: string[]): string | undefined {
  let best: string | undefined
  let bestDist = Infinity
  for (const c of candidates) {
    const d = levenshtein(input, c)
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  return best !== undefined && bestDist <= 3 ? best : undefined
}

/**
 * Parse argv, apply global flags, and dispatch to the matching command module.
 * Returns the process exit code. Stub-tolerant: a valid command name whose
 * module file does not yet exist reports "not yet implemented" and exits 1, so
 * the repo stays runnable while command tracks land independently.
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
      else if (tok.startsWith('-')) badOption ??= tok
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
    else rest.push(tok)
  }

  const cwd = cwdRaw !== undefined ? resolve(process.cwd(), cwdRaw) : process.cwd()
  flags.cwd = cwd
  if (storeRaw !== undefined && storeRaw.length > 0) flags.store = storeRaw
  if (flags.noColor) process.env.NO_COLOR = '1'

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

  const entry = COMMANDS.find((c) => c.name === command)
  if (entry === undefined) {
    process.stderr.write(`cospec: unknown command '${command}'\n`)
    const suggestion = closest(
      command,
      COMMANDS.filter((c) => !c.hidden).map((c) => c.name),
    )
    if (suggestion !== undefined) process.stderr.write(`Did you mean '${suggestion}'?\n`)
    process.stderr.write("Run 'cospec --help' for a list of commands.\n")
    return EXIT.failure
  }

  // `cospec <command> --help` prints per-command help instead of running the
  // command — critical for state-mutating commands like archive.
  if (wantHelp) {
    process.stdout.write(commandHelpText(entry))
    return EXIT.success
  }

  const loadModule = COMMAND_MODULES[entry.name]
  if (loadModule === undefined) {
    process.stderr.write(`cospec: '${entry.name}' is not yet implemented\n`)
    return EXIT.failure
  }

  const mod = await loadModule()
  if (typeof mod.run !== 'function') {
    process.stderr.write(`cospec: '${entry.name}' is not yet implemented\n`)
    return EXIT.failure
  }

  const ctx: CommandContext = { args: rest, flags, cwd }
  const code = await mod.run(ctx)
  return typeof code === 'number' ? code : EXIT.success
}
