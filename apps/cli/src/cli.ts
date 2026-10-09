import { homedir } from 'node:os'
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
  rowGlobalFlags,
  globalUnknownOptionRefusal,
  isPending,
  isStorePathToken,
  offeredFlags,
  parseCommandArgs,
  type ParsedArgs,
  type PositionalSpec,
  positionalLabel,
  splitShortCluster,
  storePathRefusal,
  storePathTakesValue,
  type SubcommandSpec,
  jsonRefusal,
  takesNextToken,
  VERSION_DESCRIPTION,
} from './core/command-table.ts'
import { offerCompletionTip } from './core/completion-tip.ts'
import { RootSelectionError, rootSelectionDocument } from './core/root.ts'

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
  /**
   * The command's own empty payload in its `--json` failure document, printed
   * ahead of `status` when root selection fails, as upstream's
   * `failurePayload` is (`context`: `{ root: null, members: [] }`).
   */
  readonly jsonFailurePayload?: Readonly<Record<string, unknown>>
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
  'sync-specs': () => import('./commands/sync-specs.ts'),
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
  help: () => import('./commands/help.ts'),
  __complete: () => import('./commands/complete.ts'),
  'check-commit': () => import('./commands/check-commit.ts'),
  experimental: () => import('./commands/experimental.ts'),
}

const VERSION_LABEL = '-V, --version'

/** `--cwd`/`--store` in the `--flag value` or `--flag=value` form (never `--store-path`). */
function isGlobalValueToken(tok: string): boolean {
  return ['--cwd', '--store'].some((flag) => tok === flag || tok.startsWith(`${flag}=`))
}

const isStoreToken = (tok: string): boolean => tok === '--store' || tok.startsWith('--store=')

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
function subcommandHelpText(row: CommandRow, subcommand: SubcommandSpec): string {
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

/** Global flag values, read before the command name (phase A) and after it (phase B). */
interface GlobalState {
  json: boolean
  noColor: boolean
  cwdRaw?: string
  storeRaw?: string
  /** A `--cwd`/`--store` that was the last token, so it has no value. */
  missing?: GlobalValueFlag
  /** The first `--cwd`/`--store` given an empty value (`--store=`, `--cwd ''`). */
  empty?: GlobalValueFlag
  /** Some `--cwd` was given an empty value (never a root, on any row). */
  emptyCwd?: true
}

type GlobalValueFlag = '--cwd' | '--store'

/**
 * `--version`, or `-V` alone or starting a short cluster: `-V` is the
 * program's own option, and commander splits a cluster whose first letter it
 * declares, so `-Vh` is the version too.
 */
const isVersionToken = (tok: string): boolean => tok === '--version' || tok.startsWith('-V')
const isHelpToken = (tok: string): boolean => tok === '--help' || tok === '-h'
/** Commander's test for a token that is an option rather than an operand. */
const isOptionLike = (tok: string): boolean => tok.length > 1 && tok.startsWith('-')

/** Reads `--cwd`/`--store` at `tokens[i]`, in either form; returns the last index consumed. */
function takeGlobalValue(tokens: readonly string[], i: number, state: GlobalState): number {
  const tok = tokens[i]!
  const flag: GlobalValueFlag = tok.startsWith('--cwd') ? '--cwd' : '--store'
  const eq = tok.indexOf('=')
  // Like commander, a required value is the next token whatever it looks like.
  const last = eq === -1 ? i + 1 : i
  const value = eq === -1 ? tokens[last] : tok.slice(eq + 1)
  if (value === undefined) state.missing ??= flag
  else if (value.length === 0) {
    state.empty ??= flag
    // An empty store id is still the value a root-selecting row resolves
    // (the resolver refuses it, as upstream's does), and the last one wins.
    if (flag === '--cwd') state.emptyCwd = true
    else state.storeRaw = value
  } else if (flag === '--cwd') state.cwdRaw = value
  else state.storeRaw = value
  return last
}

function valueRefusal(command: string | undefined, flag: GlobalValueFlag, empty: boolean): number {
  const spec = GLOBAL_FLAGS.find((f) => f.name === flag)!
  const prefix = command === undefined ? 'cospec' : `cospec ${command}`
  const problem = empty ? 'must not be empty' : 'missing'
  process.stderr.write(`${prefix}: option '${spec.name} ${spec.placeholder}' argument ${problem}\n`)
  return EXIT.failure
}

function storePathAnswer(json: boolean): number {
  const refusal = storePathRefusal(json)
  process[refusal.stream].write(refusal.text)
  return EXIT.failure
}

function rootHelp(): number {
  process.stdout.write(programHelpText())
  return EXIT.success
}

/**
 * Whether upstream's program-level commander finds a help flag among `tokens`,
 * the argv it left unconsumed. It files every token after the first
 * option-like one as unknown, a later `--` and its operands included, and
 * answers help when a help flag is among them; before that point, a `--` ends
 * the scan. `unknown` says the program level is already past such a token.
 */
function programHelpRequested(tokens: readonly string[], unknown: boolean): boolean {
  let pastOption = unknown
  for (const tok of tokens) {
    if (tok === '--') {
      if (!pastOption) return false
      continue
    }
    if (isHelpToken(tok)) return true
    if (isOptionLike(tok)) pastOption = true
  }
  return false
}

/**
 * Commander's implicit `help [subcommand]` on a command with subcommands,
 * unless the upstream command refuses `help` as an unknown subcommand.
 */
function hasHelpSubcommand(row: CommandRow): boolean {
  return (row.subcommands?.length ?? 0) > 0 && row.helpSubcommand !== false
}

/**
 * Routes the operands after a `--` that is the first token to reach `row`:
 * commander still dispatches the first operand as the subcommand (its implicit
 * `help` included) and keeps every later token an operand. Pushes the routed
 * argv onto `rest`; returns whether the subcommand was commander's `help`.
 */
function routeOperands(row: CommandRow, operands: readonly string[], rest: string[]): boolean {
  const [first, ...tail] = operands
  if (first === 'help' && hasHelpSubcommand(row)) {
    rest.push(...tail)
    return true
  }
  if (first === undefined) return false
  // A forward row's wrapper reads an option-like first token as an option at
  // the command's level, so an operand that looks like one keeps its `--`
  // (`subcommandOf` reads the token after it as the subcommand name).
  const routed =
    row.parse === 'forward'
      ? row.subcommands !== undefined && !isOptionLike(first)
      : row.subcommands?.some((s) => s.name === first) === true
  const kept = routed ? tail : operands
  if (routed) rest.push(first)
  if (kept.length > 0) rest.push('--', ...kept)
  return false
}

/**
 * `tokens` (the argv after the command name) without the tokens upstream's
 * program level takes out before the command parses: every `--no-color`
 * before the first `--` (recorded in `state`), wherever it sits, so it is
 * never a value-taking flag's value. `-V`/`--version` there never reaches
 * phase B (`run` answers it first). Past that `--` — which phase B reaches
 * only as a flag's value — the program level has stopped, so either token is
 * the command's own, refused as an unknown option like any other.
 */
function withoutProgramLevel(tokens: readonly string[], state: GlobalState): string[] {
  const end = tokens.indexOf('--')
  return tokens.filter((tok, i) => {
    if (tok !== '--no-color' || (end !== -1 && i > end)) return true
    state.noColor = true
    return false
  })
}

/** Whether commander, splitting cluster `tok` step by step, reaches a bare `-h`. */
function clusterRequestsHelp(
  surfaces: readonly { readonly flags: readonly FlagSpec[] }[],
  tok: string,
): boolean {
  let rest = tok
  for (;;) {
    const split = splitShortCluster(surfaces, rest)
    if (split === undefined) return isHelpToken(rest)
    if (split.takesValue) return false
    rest = split.tail
  }
}

/** The surfaces whose value-taking flags phase B pairs with their value. */
function surfaceOf(
  row: CommandRow,
  subcommand: SubcommandSpec | undefined,
): readonly { readonly flags: readonly FlagSpec[] }[] {
  return subcommand === undefined ? [row] : [row, subcommand]
}

/** What phase A hands phase B: the command name and every token after it. */
interface CommandCall {
  readonly command: string
  readonly tokens: readonly string[]
  /** The command name followed a leading `--`, so every token is an operand. */
  readonly terminated: boolean
}

/**
 * Phase A, the program level: reads the tokens before the command name (or a
 * leading `--`) and either stops with its own answer — an exit code — or hands
 * the command name and the rest to phase B. It stops, in the order upstream's
 * program-level commander does, on a `--cwd`/`--store` left without a value,
 * then on the first help flag or undeclared option: help anywhere in the argv
 * it never dispatched prints the program's help; otherwise the undeclared
 * option is refused (`--store-path` with its redirect). With no command name
 * it refuses an empty `--cwd`/`--store` value, then prints the program's help.
 */
function resolveProgram(argv: readonly string[], state: GlobalState): number | CommandCall {
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!
    if (tok === '--') {
      const command = argv[i + 1]
      if (command === undefined) break
      return { command, tokens: argv.slice(i + 2), terminated: true }
    }
    if (tok === '--json') state.json = true
    else if (tok === '--no-color') state.noColor = true
    else if (isVersionToken(tok)) continue
    else if (isGlobalValueToken(tok)) {
      i = takeGlobalValue(argv, i, state)
      if (state.missing !== undefined) return valueRefusal(undefined, state.missing, false)
    } else if (isOptionLike(tok)) {
      const rest = argv.slice(i + 1)
      if (isHelpToken(tok) || programHelpRequested(rest, true)) return rootHelp()
      if (!isStorePathToken(tok)) {
        process.stderr.write(globalUnknownOptionRefusal(tok))
        return EXIT.failure
      }
      // A `--json` anywhere before a `--` asks for the redirect as a document.
      const beforeTerminator = rest.includes('--') ? rest.slice(0, rest.indexOf('--')) : rest
      return storePathAnswer(state.json || beforeTerminator.includes('--json'))
    } else return { command: tok, tokens: argv.slice(i + 1), terminated: false }
  }
  if (state.empty !== undefined) return valueRefusal(undefined, state.empty, true)
  return rootHelp()
}

/**
 * Phase B, the command level: `row`'s own argv. A `--no-color` before the
 * first `--` is taken out first, as upstream's program level does, so it is
 * never a value. Global flags are absorbed up to a `--` (`--store` only on a
 * row that reads it: a `store: 'refused'` row's parser refuses it), except a
 * token that is the value of a space-form value-taking flag the row or its
 * named subcommand declares, `--store-path` where it takes a value (kept with
 * it, whatever it looks like — a help flag, a global, `--`); a table row
 * parses the rest, a
 * forward row hands it to its wrapper untouched, `--store-path` included (the
 * binary is its authority there; the wrapper only respells the binary's
 * refusal). Outcomes follow
 * commander's per-level order: a missing value (the global's or the row's
 * own, anywhere in the argv — a trailing `--store-path` answers its redirect
 * here) is raised while the argv parses, then help, then the row's other
 * parse refusals (`view --json`'s refusal document, then the first unknown
 * option or pending flag in argv order, then too many arguments or a pending
 * positional, then `--store-path`), then an empty `--cwd`/`--store` value,
 * then the command runs.
 */
async function runCommand(row: CommandRow, call: CommandCall, state: GlobalState): Promise<number> {
  const rest: string[] = []
  let wantHelp = false
  // A row that never reads `--store` refuses it: after the command name the
  // token stays in the argv for the table parser to refuse as unknown, and a
  // program-level one is refused below with the row's other parse refusals.
  const storeRefused = row.parse === 'table' && row.store === 'refused'
  const programStore = state.storeRaw !== undefined || state.empty === '--store'
  // After a leading `--`, or a `--` that is the first token to reach a row
  // with subcommands, every token is an operand.
  if (call.terminated) wantHelp = routeOperands(row, call.tokens, rest)
  // A lenient row (commander's help command) reads its argv itself: no
  // global, help flag or `help` token is taken out of it.
  else if (row.parse === 'table' && row.operands === 'lenient')
    rest.push(...withoutProgramLevel(call.tokens, state))
  else {
    const tokens = withoutProgramLevel(call.tokens, state)
    const storePath = storePathTakesValue(row)
    // The row's surface, plus its subcommand's once the first positional names one.
    let subcommand: SubcommandSpec | undefined
    let positionals = 0
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!
      if (tok === '--') {
        if (rest.length === 0 && (row.subcommands?.length ?? 0) > 0) {
          wantHelp ||= routeOperands(row, tokens.slice(i + 1), rest)
        } else {
          // `--` stays in the command's argv: the table parser and the wrapped
          // binary both read it as the operand terminator.
          rest.push(...tokens.slice(i))
        }
        break
      }
      // Like commander, a space-form value-taking flag the row or its named
      // subcommand declares (`--store-path` only where upstream declares it)
      // takes the next token as its value whatever it looks like — a help
      // flag, a global, `--` — so it is never intercepted or absorbed: the
      // table parser or the binary gets both, and parsing goes on after them.
      if (i + 1 < tokens.length && takesNextToken(surfaceOf(row, subcommand), tok, storePath)) {
        rest.push(tok, tokens[++i]!)
        continue
      }
      // A short cluster whose first letter the row declares splits as
      // commander splits it (`archive -yh` is `-y -h`). A table row's parser
      // gets the pieces, rescanned here so a split-out `-h` is help and a
      // split-out value stays with its flag; a forward row's binary gets the
      // cluster as typed, and only the help it would split out is answered
      // here, with cospec's help, never the binary's own screen.
      const split = splitShortCluster(surfaceOf(row, subcommand), tok)
      if (split !== undefined) {
        if (row.parse === 'table') {
          tokens.splice(i, 1, split.head, split.tail)
          i--
          continue
        }
        wantHelp ||= clusterRequestsHelp(surfaceOf(row, subcommand), tok)
        rest.push(tok)
        continue
      }
      // `cospec <command> help` — `help` as the first token to reach the row,
      // after any absorbed global — is `cospec <command> --help` on every table
      // row (it must never reach a state-mutating command's argv: `archive
      // help` must not archive a change called "help"), and commander's
      // implicit help subcommand on a forward row that has one.
      if (rest.length === 0 && tok === 'help' && (row.parse === 'table' || hasHelpSubcommand(row)))
        wantHelp = true
      else if (tok === '--json') state.json = true
      else if (isHelpToken(tok)) wantHelp = true
      else if (isGlobalValueToken(tok) && !(storeRefused && isStoreToken(tok)))
        i = takeGlobalValue(tokens, i, state)
      else {
        if (!isOptionLike(tok) && positionals++ === 0)
          subcommand = row.subcommands?.find((s) => s.name === tok)
        rest.push(tok)
      }
    }
  }

  if (state.missing !== undefined) return valueRefusal(row.name, state.missing, false)

  const result = row.parse === 'table' ? parseCommandArgs(row, rest) : undefined
  if (result?.ok === false && result.refusal.kind === 'missing-value') {
    if (result.refusal.flag === '--store-path') return storePathAnswer(state.json)
    process.stderr.write(result.refusal.message)
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

  if (row.parse === 'table') {
    // A `--json` caller is owed one parseable document even on refusal, so
    // this answers before the parser's stderr-only refusals.
    if (row.json === 'refused' && state.json) {
      process.stdout.write(jsonRefusal(row.name, row.jsonRefusalMessage))
      return EXIT.failure
    }
    if (storeRefused && programStore) {
      process.stderr.write(`cospec ${row.name}: unknown option '--store'\n`)
      return EXIT.failure
    }
    if (result?.ok === false) {
      if (result.refusal.kind === 'store-path') return storePathAnswer(state.json)
      process.stderr.write(result.refusal.message)
      return EXIT.failure
    }
  }

  // An empty `--store` on a row that selects its root through it reaches the
  // resolver, which refuses it with upstream's `invalid_store_id` (text, or the
  // `--json` document); every other empty value is refused here.
  if (state.empty !== undefined) {
    const storeRow = row.store === 'accepted'
    if (!storeRow || state.emptyCwd === true)
      return valueRefusal(row.name, storeRow ? '--cwd' : state.empty, true)
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

  const cwd = state.cwdRaw !== undefined ? resolve(process.cwd(), state.cwdRaw) : process.cwd()
  const flags: GlobalFlags = {
    json: state.json,
    noColor: state.noColor,
    cwd,
    ...(state.storeRaw !== undefined ? { store: state.storeRaw } : {}),
  }
  if (flags.noColor) process.env.NO_COLOR = '1'
  const ctx: CommandContext = {
    args: rest,
    flags,
    cwd,
    ...(result?.ok === true ? { parsed: result.parsed } : {}),
  }
  let code: number
  try {
    code = await mod.run(ctx)
  } catch (error) {
    // A `--json` caller is owed one document for a resolver hard-error too;
    // every other failure keeps the top-level prose.
    if (!(state.json && error instanceof RootSelectionError)) throw error
    process.stdout.write(rootSelectionDocument(error, mod.jsonFailurePayload))
    return EXIT.failure
  }
  // After the command's own output and whatever its exit code. Help, parse
  // refusals, unknown commands and thrown errors all return before this line.
  await offerCompletionTip({
    command: row.name,
    hidden: row.hidden,
    json: flags.json,
    env: process.env,
    home: homedir(),
    platform: process.platform,
    stderrIsTTY: process.stderr.isTTY === true,
    stderr: (text) => {
      process.stderr.write(text)
    },
    detectShell: async () =>
      (await import('./commands/completion.ts')).detectShell(
        process.env.SHELL,
        process.env.PSModulePath,
      ),
  })
  return typeof code === 'number' ? code : EXIT.success
}

/**
 * Parse argv, apply global flags, and dispatch to the matching command module.
 * Returns the process exit code. Like upstream's commander, the two levels
 * never rank against each other: a `-V`/`--version` anywhere before a `--`
 * answers first (it is a program-level option commander honours wherever it
 * appears); then phase A resolves the program level completely and stops on
 * any answer of its own; only a known command reaches phase B. A `table`
 * row's argv is parsed against its row before the module loads; a `forward`
 * row's argv reaches its wrapper unchanged. `--store-path` is refused on every
 * command, in either position, with upstream's redirect respelled to cospec —
 * before the command name by phase A, on a `table` row by its parser after the
 * row's other parse refusals, and on a `forward` row by the binary itself,
 * whose refusal the row's wrapper respells.
 */
export async function run(argv: string[]): Promise<number> {
  const beforeTerminator = argv.includes('--') ? argv.slice(0, argv.indexOf('--')) : argv
  if (beforeTerminator.some(isVersionToken)) {
    process.stdout.write(`${pkg.version}\n`)
    return EXIT.success
  }

  const state: GlobalState = { json: false, noColor: false }
  const call = resolveProgram(argv, state)
  if (typeof call === 'number') return call

  const row = commandRow(call.command)
  if (row === undefined) {
    // Upstream's program level never dispatches an unknown command, so a help
    // flag in the argv it left unconsumed still prints the program's help.
    if (!call.terminated && programHelpRequested(call.tokens, false)) return rootHelp()
    process.stderr.write(`cospec: unknown command '${call.command}'\n`)
    const suggestion = closest(
      call.command,
      COMMAND_TABLE.filter((r) => !r.hidden).map((r) => r.name),
    )
    if (suggestion !== undefined) process.stderr.write(`Did you mean '${suggestion}'?\n`)
    process.stderr.write("Run 'cospec --help' for a list of commands.\n")
    return EXIT.failure
  }

  return runCommand(row, call, state)
}
