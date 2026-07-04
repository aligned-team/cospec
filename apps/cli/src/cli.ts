import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import pkg from '../package.json'

/** Global flags accepted before or after the subcommand on every command. */
export interface GlobalFlags {
  json: boolean
  noColor: boolean
  /** Absolute path the command should treat as the repo root. */
  cwd: string
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
}

/**
 * Static command table — the single source for `--help` and for validating an
 * incoming command name. Command tracks add the matching `commands/<name>.ts`
 * file without touching this dispatcher.
 */
export const COMMANDS: CommandEntry[] = [
  { name: 'init', summary: 'Scaffold cospec into a repo (schemas + harness files)' },
  { name: 'update', summary: 'Regenerate managed files from canon' },
  { name: 'doctor', summary: 'Diagnose a cospec setup and report remedies' },
  { name: 'new', summary: 'Create a new typed change (cospec new <type> <slug>)' },
  { name: 'validate', summary: 'Validate changes and specs' },
  { name: 'status', summary: "Show a change's status and gate state" },
  { name: 'list', summary: 'List active changes' },
  { name: 'instructions', summary: 'Print artifact-authoring instructions for a change' },
  { name: 'apply', summary: 'Gate implementation on blockers and required artifacts' },
  { name: 'archive', summary: 'Validate, archive, and fan out blocker updates' },
  { name: 'sync-blockers', summary: 'Reconcile blocking-changes.md checkboxes' },
  {
    name: 'check-commit',
    summary: 'Warn on commit-type/schema mismatch (hook entrypoint)',
    hidden: true,
  },
]

const GLOBAL_OPTIONS = `Global options:
  --json         Machine-readable output
  --no-color     Disable ANSI color
  --cwd <path>   Run as if invoked from <path>
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

/** Per-command help, reachable via `cospec <command> --help`. */
function commandHelpText(entry: CommandEntry): string {
  return `cospec ${entry.name} — ${entry.summary}

Usage: cospec ${entry.name} [options]

${GLOBAL_OPTIONS}
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
  let wantVersion = false
  let wantHelp = false
  let badOption: string | undefined

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!
    if (command === undefined) {
      if (tok === '--json') flags.json = true
      else if (tok === '--no-color') flags.noColor = true
      else if (tok === '--version' || tok === '-V') wantVersion = true
      else if (tok === '--help' || tok === '-h') wantHelp = true
      else if (tok === '--cwd') cwdRaw = argv[++i]
      else if (tok.startsWith('--cwd=')) cwdRaw = tok.slice('--cwd='.length)
      else if (tok.startsWith('-')) badOption ??= tok
      else command = tok
      continue
    }
    // After the command name, absorb global flags anywhere; everything else is
    // the command's own argv. --help/-h is intercepted here too so it can never
    // silently fall through into a state-mutating command's argv.
    if (tok === '--json') flags.json = true
    else if (tok === '--no-color') flags.noColor = true
    else if (tok === '--help' || tok === '-h') wantHelp = true
    else if (tok === '--cwd') cwdRaw = argv[++i]
    else if (tok.startsWith('--cwd=')) cwdRaw = tok.slice('--cwd='.length)
    else rest.push(tok)
  }

  const cwd = cwdRaw !== undefined ? resolve(process.cwd(), cwdRaw) : process.cwd()
  flags.cwd = cwd
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

  const modFile = fileURLToPath(new URL(`./commands/${entry.name}.ts`, import.meta.url))
  if (!existsSync(modFile)) {
    process.stderr.write(`cospec: '${entry.name}' is not yet implemented\n`)
    return EXIT.failure
  }

  const mod = (await import(modFile)) as Partial<CommandModule>
  if (typeof mod.run !== 'function') {
    process.stderr.write(`cospec: '${entry.name}' is not yet implemented\n`)
    return EXIT.failure
  }

  const ctx: CommandContext = { args: rest, flags, cwd }
  const code = await mod.run(ctx)
  return typeof code === 'number' ? code : EXIT.success
}
