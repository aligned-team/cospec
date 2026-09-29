// The command table — one row per cospec command, the single source that argv
// parsing, per-command `--help` and the completion spec all read, so the three
// can never drift apart (change `unknown-option-contract`).
//
// Every row declares its positionals and every flag, including every flag the
// pinned OpenSpec `COMMAND_REGISTRY` gives the same-named upstream command.
// Each flag is exactly one of `handled`, `no-op` (cospec already behaves as the
// flag asks) or `{pending: <slug>}` (owned by a later change, refused with
// "not supported yet" until then). The per-command `--json` and `--store` the
// registry lists are cospec globals (`GLOBAL_FLAGS`), stripped by `cli.ts`
// before a row's parser runs, so rows never repeat them.
//
// Parse policy: a `table` row is parsed here and rejects anything undeclared.
// A `forward` row is declared only for reachability, help and completion — its
// wrapper hands the remaining argv to the wrapped binary, which stays the
// unknown-option authority for the surfaces it owns (`openspec show` sets
// `allowUnknownOption(true)`, so a local rejection there would be a
// regression, and a newer in-range binary's new flag must keep working).
// `parse: 'forward'` is the marker the reachability test reads: a forward
// row's surfaces count as reached by delegation to the binary.
//
// This module imports nothing: `cli.ts` imports it, so any import back into the
// dispatcher would be a cycle.

// --- shape -------------------------------------------------------------------

/** Every change slug that owns a pending surface. */
export type PendingOwner =
  | 'passthrough-json-and-doctor'
  | 'validation-parity'
  | 'cli-surface-parity'
  | 'archive-and-sync-parity'
  | 'tool-matrix'
  | 'github-copilot'
  | 'completion-install'
  | 'workflow-profiles'

export type SurfaceStatus = 'handled' | 'no-op' | { readonly pending: PendingOwner }

/** `upstream`: the same-named upstream command has it. `cospec`: cospec-only. */
export type SurfaceOrigin = 'upstream' | 'cospec'

export interface FlagSpec {
  /** Long form, dashes included (`--change`). The key a parsed value is stored under. */
  readonly name: `--${string}`
  readonly short?: `-${string}`
  readonly takesValue?: true
  /** Help/refusal placeholder, angle brackets included (`<slug>`). Set iff `takesValue`. */
  readonly placeholder?: string
  /** The value set, when closed. Documentation and completion only — never enforced here. */
  readonly values?: readonly string[]
  readonly description: string
  readonly status: SurfaceStatus
  readonly origin: SurfaceOrigin
  /**
   * Upstream's spelling of the flag this names on the same surface
   * (`--tools` for `--harness`): parsed with its own placeholder, its value
   * stored under that flag's name, the typed spelling recorded
   * (`flagSpelling`). The reachability test resolves an aliased flag through
   * `aliases.yaml`, never the table.
   */
  readonly aliasOf?: `--${string}`
  /** Parsed like any flag, never offered to `--help` or completion (upstream hides it too). */
  readonly hidden?: true
}

export interface PositionalSpec {
  readonly name: string
  /**
   * `<name>` vs `[name]`, and enforced: given nothing, a required positional
   * is refused as commander's `missing required argument '<name>'`, after the
   * scan's unknown options and before too many arguments or any action-level
   * refusal (`--store-path`, a root check).
   */
  readonly required: boolean
  /**
   * A value holding `separator` also fills every positional after this one:
   * `new "feat: add a thing"` is a type and, derived from its text, a slug.
   * `label` spells that form in the usage.
   */
  readonly compound?: { readonly separator: string; readonly label: string }
  readonly description?: string
  readonly values?: readonly string[]
  /** Values a user may type that are owed by a later change (refused as pending). */
  readonly pendingValues?: Readonly<Record<string, PendingOwner>>
  /**
   * The command reads the value case-insensitively (upstream's `completion`
   * lowercases its shell name), so a pending value is matched lowercased too.
   */
  readonly foldCase?: true
  /**
   * A cospec-only positional that spells what these flags select. Upstream
   * has no such positional, so given together with any of them it is the
   * excess argument commander refuses (`status foo --change bar`).
   */
  readonly displacedBy?: readonly `--${string}`[]
  readonly status: SurfaceStatus
  readonly origin: SurfaceOrigin
}

interface SurfaceSpec {
  readonly positionals: readonly PositionalSpec[]
  readonly flags: readonly FlagSpec[]
}

/**
 * A subcommand. A pending one declares no positionals or flags: its whole
 * subtree is owed by the owning change.
 */
export interface SubcommandSpec extends SurfaceSpec {
  readonly name: string
  readonly summary: string
  readonly status: SurfaceStatus
  readonly origin: SurfaceOrigin
  /**
   * The cospec command this subcommand is upstream's spelling of (`new change`
   * of `new`): it dispatches to that command's module with its own declared
   * surface parsed, and the reachability test resolves it through
   * `aliases.yaml`.
   */
  readonly aliasOf?: string
}

interface RowBase extends SurfaceSpec {
  readonly name: string
  readonly summary: string
  readonly hidden: boolean
  readonly subcommands?: readonly SubcommandSpec[]
  /**
   * `false` when the same-named upstream command refuses a bare `help`
   * subcommand as unknown instead of offering commander's implicit one. A
   * row with subcommands otherwise answers `<command> help [sub]` with help.
   */
  readonly helpSubcommand?: false
  /** Extra help lines printed after the flag list. */
  readonly notes?: readonly string[]
  /**
   * The same-named upstream command declares the hidden `--store-path <path>`
   * (upstream's `list`, `view`, `archive`, `validate`, `show`, `status`,
   * `instructions`, `schemas`, `new change`, `context`, `doctor`), so the
   * token after it is its value and the command refuses it in its action,
   * after the whole parse. Elsewhere — upstream's `init`, `update`,
   * `completion`, `feedback`, `config`, `schema`, `workset`, `store`,
   * `templates`, and every cospec-only command — it is an unknown option that
   * takes nothing: refused in scan order, outranked by help, and never a
   * document under `--json`.
   */
  readonly declaresStorePath?: true
  /**
   * The cospec command this row is upstream's spelling of (`experimental` of
   * `init`), resolved through `aliases.yaml` by the reachability test.
   */
  readonly aliasOf?: string
  /**
   * `lenient`: nothing is refused, as commander's implicit `help [command]`
   * reads its argv — the first undeclared option ends the operands (commander
   * files it and everything after it as unknown), and excess operands are
   * ignored. The dispatcher hands such a row its whole argv, cospec's global
   * flags included: upstream's help command declares none of them.
   */
  readonly operands?: 'lenient'
}

export type TableCommandRow = RowBase & {
  readonly parse: 'table'
  /**
   * Whether the command honours the global `--store <id>`. A `refused` row's
   * module never reads it, so the parser refuses it as an unknown option in
   * either form, as the binary does on `init`, `update` and `completion`,
   * instead of absorbing and ignoring it.
   */
  readonly store: 'accepted' | 'refused'
} & (
    | { readonly json: 'accepted' }
    /** The row refuses the global `--json` with `jsonRefusal(name, jsonRefusalMessage)`. */
    | { readonly json: 'refused'; readonly jsonRefusalMessage: string }
  )

export interface ForwardCommandRow extends RowBase {
  readonly parse: 'forward'
  /**
   * `accepted` when the command selects its root through the global
   * `--store <id>` (`show`, `schemas`, `templates`, `schema`). Unset where
   * it takes no root (`store`, `workset`, `config`).
   */
  readonly store?: 'accepted'
}

export type CommandRow = TableCommandRow | ForwardCommandRow

export function isPending(status: SurfaceStatus): status is { readonly pending: PendingOwner } {
  return typeof status === 'object'
}

// --- builders ------------------------------------------------------------------

const HANDLED = 'handled' as const
const NO_OP = 'no-op' as const
function pending(owner: PendingOwner): { readonly pending: PendingOwner } {
  return { pending: owner }
}

type FlagInput = Omit<FlagSpec, 'origin' | 'status'> & { status?: SurfaceStatus }
type PositionalInput = Omit<PositionalSpec, 'origin' | 'status'> & { status?: SurfaceStatus }

function upstream(spec: FlagInput): FlagSpec {
  return { ...spec, status: spec.status ?? HANDLED, origin: 'upstream' }
}
function cospec(spec: FlagInput): FlagSpec {
  return { ...spec, status: spec.status ?? HANDLED, origin: 'cospec' }
}
function upstreamArg(spec: PositionalInput): PositionalSpec {
  return { ...spec, status: spec.status ?? HANDLED, origin: 'upstream' }
}
function cospecArg(spec: PositionalInput): PositionalSpec {
  return { ...spec, status: spec.status ?? HANDLED, origin: 'cospec' }
}
function sub(
  name: string,
  summary: string,
  surface: Partial<SurfaceSpec> & { aliasOf?: string } = {},
): SubcommandSpec {
  return {
    name,
    summary,
    status: HANDLED,
    origin: 'upstream',
    positionals: surface.positionals ?? [],
    flags: surface.flags ?? [],
    ...(surface.aliasOf !== undefined ? { aliasOf: surface.aliasOf } : {}),
  }
}
function pendingSub(name: string, summary: string, owner: PendingOwner): SubcommandSpec {
  return { name, summary, status: pending(owner), origin: 'upstream', positionals: [], flags: [] }
}

// --- global flags ----------------------------------------------------------------

/**
 * Flags accepted before or after the command name on every command, stripped
 * by `cli.ts` before a row's parser runs. `-V, --version` is absorbed in any
 * position too (it wins over everything else, as upstream's does) but is not
 * listed here: it is program-level, not a per-command help line.
 */
export const GLOBAL_FLAGS: readonly FlagSpec[] = [
  upstream({ name: '--json', description: 'Machine-readable output' }),
  upstream({ name: '--no-color', description: 'Disable ANSI color' }),
  cospec({
    name: '--cwd',
    takesValue: true,
    placeholder: '<path>',
    description: 'Run as if invoked from <path>',
  }),
  upstream({
    name: '--store',
    takesValue: true,
    placeholder: '<id>',
    description: 'Operate against a registered OpenSpec store instead of the local repo',
  }),
  upstream({ name: '--help', short: '-h', description: 'Show this help' }),
]

/**
 * The global flags `row` accepts after its name: every one, except `--store`
 * on a `table` row marked `store: 'refused'`.
 */
export function rowGlobalFlags(row: CommandRow): readonly FlagSpec[] {
  return row.parse === 'table' && row.store === 'refused'
    ? GLOBAL_FLAGS.filter((flag) => flag.name !== '--store')
    : GLOBAL_FLAGS
}

// --- the table -------------------------------------------------------------------

/** Row order is `--help`'s command order. */
export const COMMAND_TABLE: readonly CommandRow[] = [
  {
    name: 'init',
    summary: 'Scaffold cospec into a repo (schemas + harness files)',
    hidden: false,
    parse: 'table',
    json: 'accepted',
    store: 'refused',
    positionals: [upstreamArg({ name: 'path', required: false })],
    flags: [
      cospec({ name: '--yes', description: 'Skip prompts; auto-remove detected opsx leftovers' }),
      upstream({ name: '--force', description: 'Overwrite conflicting managed files' }),
      cospec({
        name: '--harness',
        takesValue: true,
        placeholder: '<list>',
        description: 'claude,codex,opencode,agents,all,none (comma-separate for multiple)',
      }),
      cospec({
        name: '--gate',
        description: 'Force-enable the commit gate (mise + hk + commitlint)',
      }),
      cospec({ name: '--no-gate', description: 'Force-disable the commit gate' }),
      cospec({
        name: '--remove-opsx',
        description: 'Delete provably openspec-generated leftover files',
      }),
      upstream({
        name: '--no-animation',
        description: 'Accepted for OpenSpec compatibility (cospec has no animation)',
        status: NO_OP,
      }),
      upstream({
        name: '--tools',
        takesValue: true,
        placeholder: '<tools>',
        description: "OpenSpec's spelling of --harness (same values)",
        aliasOf: '--harness',
      }),
      upstream({
        name: '--language',
        takesValue: true,
        placeholder: '<language>',
        description: 'Write new artifacts in this language',
        status: pending('workflow-profiles'),
      }),
      upstream({
        name: '--profile',
        takesValue: true,
        placeholder: '<profile>',
        values: ['core', 'custom'],
        description: 'Override the global config profile (core or custom)',
        status: pending('workflow-profiles'),
      }),
      upstream({
        name: '--copilot-cloud',
        description: 'Generate GitHub Copilot cloud coding-agent files',
        status: pending('github-copilot'),
      }),
      upstream({
        name: '--no-copilot-cloud',
        description: 'Skip generating GitHub Copilot cloud coding-agent files',
        status: pending('github-copilot'),
      }),
    ],
  },
  {
    name: 'update',
    summary: 'Regenerate managed files from canon',
    hidden: false,
    parse: 'table',
    json: 'accepted',
    store: 'refused',
    positionals: [
      upstreamArg({
        name: 'path',
        required: false,
        description: 'The project to update (default: the current directory)',
      }),
    ],
    flags: [
      cospec({ name: '--check', description: 'Drift gate: exit nonzero on drift, write nothing' }),
      upstream({ name: '--force', description: 'Overwrite conflicting managed files' }),
    ],
  },
  {
    name: 'doctor',
    summary: 'Diagnose a cospec setup and report remedies',
    hidden: false,
    parse: 'table',
    json: 'accepted',
    store: 'accepted',
    declaresStorePath: true,
    positionals: [],
    flags: [],
  },
  {
    name: 'new',
    summary: 'Create a new typed change (cospec new <type> <slug>)',
    hidden: false,
    parse: 'table',
    json: 'accepted',
    store: 'accepted',
    declaresStorePath: true,
    positionals: [
      cospecArg({
        name: 'type',
        required: true,
        description: 'Conventional-commit type',
        compound: { separator: ':', label: '"<type>: <description>"' },
      }),
      cospecArg({ name: 'slug', required: true, description: 'Kebab-case change id' }),
    ],
    flags: [
      cospec({
        name: '--description',
        takesValue: true,
        placeholder: '<text>',
        description: 'Seed the proposal with a one-line description',
      }),
      cospec({
        name: '--goal',
        takesValue: true,
        placeholder: '<text>',
        description: "Store goal metadata in the change's .openspec.yaml",
      }),
    ],
    subcommands: [
      // Upstream's spelling of `new`: the type is `--schema`, else the root's
      // default schema (`config.yaml`'s `schema:`, else `spec-driven`).
      sub('change', "OpenSpec's spelling: create a change of --schema's type", {
        aliasOf: 'new',
        positionals: [
          upstreamArg({ name: 'name', required: true, description: 'Kebab-case change id' }),
        ],
        flags: [
          upstream({
            name: '--schema',
            takesValue: true,
            placeholder: '<name>',
            description: "The change's type (default: the root's config.yaml schema)",
          }),
          upstream({
            name: '--description',
            takesValue: true,
            placeholder: '<text>',
            description: 'Seed the proposal with a one-line description',
          }),
          upstream({
            name: '--goal',
            takesValue: true,
            placeholder: '<text>',
            description: "Store goal metadata in the change's .openspec.yaml",
          }),
          // Removed upstream and hidden from its help; refused with its message.
          upstream({
            name: '--initiative',
            takesValue: true,
            placeholder: '<id>',
            description: 'Removed upstream (refused)',
            hidden: true,
          }),
          upstream({
            name: '--areas',
            takesValue: true,
            placeholder: '<names>',
            description: 'Removed upstream (refused)',
            hidden: true,
          }),
        ],
      }),
    ],
  },
  {
    name: 'migrate',
    summary: 'Migrate a v1 change to schemaVersion 2 (opt-in)',
    hidden: false,
    parse: 'table',
    json: 'accepted',
    store: 'accepted',
    positionals: [cospecArg({ name: 'slug', required: true })],
    flags: [],
  },
  {
    name: 'validate',
    summary: 'Validate changes and specs',
    hidden: false,
    parse: 'table',
    json: 'accepted',
    store: 'accepted',
    declaresStorePath: true,
    positionals: [upstreamArg({ name: 'name', required: false })],
    flags: [
      upstream({ name: '--strict', description: 'Promote warnings to errors' }),
      cospec({ name: '--fast', description: 'Skip slower cross-checks' }),
      upstream({ name: '--all', description: 'Validate every change and spec' }),
      upstream({ name: '--changes', description: 'Validate changes only' }),
      upstream({ name: '--specs', description: 'Validate specs only' }),
      upstream({
        name: '--archived',
        description: 'Validate already-archived changes instead (delegated; openspec >=1.9.0)',
      }),
      upstream({
        name: '--no-interactive',
        description: 'Never prompt, even for an ambiguous change name',
      }),
      upstream({
        name: '--type',
        takesValue: true,
        placeholder: '<type>',
        values: ['change', 'spec'],
        description: 'Specify item type when ambiguous',
        status: pending('cli-surface-parity'),
      }),
      upstream({
        name: '--report',
        takesValue: true,
        placeholder: '<report>',
        values: ['full', 'findings'],
        description: 'Select bulk report content',
        status: pending('cli-surface-parity'),
      }),
      upstream({
        name: '--concurrency',
        takesValue: true,
        placeholder: '<n>',
        description: 'Max concurrent validations',
        status: pending('cli-surface-parity'),
      }),
    ],
  },
  {
    name: 'status',
    summary: "Show a change's status and gate state",
    hidden: false,
    parse: 'table',
    json: 'accepted',
    store: 'accepted',
    declaresStorePath: true,
    positionals: [
      cospecArg({ name: 'change', required: false, displacedBy: ['--change', '--all'] }),
    ],
    flags: [
      upstream({
        name: '--change',
        takesValue: true,
        placeholder: '<slug>',
        description: 'The change to report on (or pass it positionally)',
      }),
      upstream({
        name: '--all',
        description: 'Report every active change instead of one (mutually exclusive with --change)',
      }),
      upstream({
        name: '--schema',
        takesValue: true,
        placeholder: '<name>',
        description: 'Schema override',
      }),
    ],
  },
  {
    name: 'list',
    summary: 'List active changes',
    hidden: false,
    parse: 'table',
    json: 'accepted',
    store: 'accepted',
    declaresStorePath: true,
    positionals: [],
    flags: [
      upstream({ name: '--specs', description: 'List living specs by requirement count instead' }),
      cospec({ name: '--blocked', description: 'Only changes with a non-clear gate state' }),
      upstream({
        name: '--changes',
        description: 'List changes explicitly (the default)',
        status: NO_OP,
      }),
      upstream({
        name: '--sort',
        takesValue: true,
        placeholder: '<order>',
        values: ['recent', 'name'],
        description: 'Sort order: "recent" (default) or "name"',
      }),
    ],
  },
  {
    name: 'instructions',
    summary: 'Print artifact-authoring instructions for a change',
    hidden: false,
    parse: 'table',
    json: 'accepted',
    store: 'accepted',
    declaresStorePath: true,
    // Upstream's `instructions [artifact]` is optional: with no artifact (or
    // no `--change`) the binary answers itself, listing the valid ones.
    positionals: [upstreamArg({ name: 'artifact', required: false })],
    flags: [
      upstream({
        name: '--change',
        takesValue: true,
        placeholder: '<slug>',
        description: 'The change the artifact belongs to',
      }),
      cospec({ name: '--allow-soft', description: 'Proceed past a soft block' }),
      upstream({
        name: '--schema',
        takesValue: true,
        placeholder: '<name>',
        description: 'Schema override',
      }),
    ],
    notes: [
      'artifacts: proposal, blocking-changes, specs, design, verification, tasks, apply, archive',
      "('archive' is read-only guidance — unlike 'apply', it is not an alias for 'cospec archive')",
    ],
  },
  {
    name: 'apply',
    summary: 'Gate implementation on blockers and required artifacts',
    hidden: false,
    parse: 'table',
    json: 'accepted',
    store: 'accepted',
    positionals: [cospecArg({ name: 'change', required: true })],
    flags: [
      cospec({ name: '--allow-soft', description: 'Proceed past a soft block' }),
      cospec({
        name: '--skip-specs',
        description:
          'Satisfy the specs requirement for this run (persist with skip_specs: true instead)',
      }),
    ],
  },
  {
    name: 'archive',
    summary: 'Validate, archive, and fan out blocker updates',
    hidden: false,
    parse: 'table',
    json: 'accepted',
    store: 'accepted',
    declaresStorePath: true,
    // Upstream's `archive [change-name]` is optional (it prompts, and without
    // a TTY aborts with exit 0); cospec requires it, so a missing change is
    // refused at parse, ahead of the `--store-path` redirect.
    positionals: [upstreamArg({ name: 'change', required: true })],
    flags: [
      upstream({
        name: '--skip-specs',
        description: 'Skip spec-sync even when the schema has a specs artifact',
      }),
      cospec({
        name: '--force-incomplete',
        description: 'Override the tasks-incomplete gate (verification gates never lift)',
      }),
      upstream({
        name: '--yes',
        short: '-y',
        description: 'Accepted for OpenSpec compatibility (cospec archive never prompts)',
        status: NO_OP,
      }),
      upstream({
        name: '--no-validate',
        description: 'Skip validation (not recommended)',
        status: pending('archive-and-sync-parity'),
      }),
    ],
  },
  {
    name: 'sync-blockers',
    summary: 'Reconcile blocking-changes.md checkboxes',
    hidden: false,
    parse: 'table',
    json: 'accepted',
    store: 'accepted',
    positionals: [],
    flags: [
      cospec({ name: '--check', description: 'Report only; write nothing' }),
      cospec({
        name: '--change',
        takesValue: true,
        placeholder: '<slug>',
        description: "Limit to one change's blocking-changes.md",
      }),
    ],
  },
  {
    name: 'store',
    summary: 'Manage registered OpenSpec stores',
    hidden: false,
    parse: 'forward',
    positionals: [],
    flags: [],
    helpSubcommand: false,
    subcommands: [
      sub('setup', 'Create or register a local store', {
        positionals: [upstreamArg({ name: 'id', required: false })],
        flags: [
          upstream({
            name: '--path',
            takesValue: true,
            placeholder: '<dir>',
            description: 'Directory to use for the store',
          }),
          upstream({ name: '--init-git', description: 'Initialize a Git repository in the store' }),
          upstream({ name: '--no-init-git', description: 'Skip Git repository initialization' }),
          upstream({
            name: '--remote',
            takesValue: true,
            placeholder: '<url>',
            description: 'Canonical clone source recorded in store.yaml',
          }),
          cospec({
            name: '--no-cospec-init',
            description: "Skip the auto 'cospec init --harness none'",
          }),
        ],
      }),
      sub('register', 'Register an existing store directory', {
        positionals: [upstreamArg({ name: 'path', required: false })],
        flags: [
          upstream({
            name: '--id',
            takesValue: true,
            placeholder: '<id>',
            description: 'Store id',
          }),
          upstream({ name: '--yes', description: 'Confirm creating store identity metadata' }),
          cospec({
            name: '--no-cospec-init',
            description: "Skip the auto 'cospec init --harness none'",
          }),
        ],
      }),
      sub('unregister', 'Forget a local store registration without deleting files', {
        positionals: [upstreamArg({ name: 'id', required: true })],
      }),
      sub('remove', 'Forget a local store registration and delete its local folder', {
        positionals: [upstreamArg({ name: 'id', required: true })],
        flags: [upstream({ name: '--yes', description: 'Confirm local store folder deletion' })],
      }),
      sub('list', 'List registered stores'),
      sub('ls', 'List registered stores'),
      sub('doctor', 'Check local store registration and metadata', {
        positionals: [upstreamArg({ name: 'id', required: false })],
      }),
    ],
  },
  {
    name: 'context',
    summary: "Show a store's cross-repo working-set context",
    hidden: false,
    parse: 'table',
    json: 'accepted',
    store: 'accepted',
    declaresStorePath: true,
    positionals: [],
    flags: [
      upstream({
        name: '--code-workspace',
        takesValue: true,
        placeholder: '<path>',
        description: 'Also write/update a VS Code multi-root workspace file',
      }),
      upstream({
        name: '--force',
        description: 'Overwrite a code-workspace file cospec did not author',
      }),
    ],
  },
  {
    name: 'workset',
    summary: 'Manage personal cross-repo worksets',
    hidden: false,
    parse: 'forward',
    positionals: [],
    flags: [],
    helpSubcommand: false,
    subcommands: [
      sub('create', 'Compose and save a named working view of folders you choose', {
        positionals: [upstreamArg({ name: 'name', required: false })],
        flags: [
          upstream({
            name: '--member',
            takesValue: true,
            placeholder: '<path>',
            description:
              'Member folder as <path> or <name>=<path>; repeatable, first is the primary',
          }),
          upstream({
            name: '--tool',
            takesValue: true,
            placeholder: '<tool>',
            description: 'Preferred tool to open this workset with',
          }),
        ],
      }),
      sub('list', 'Show saved worksets with their members'),
      sub('ls', 'Show saved worksets with their members'),
      sub('open', 'Open a saved workset in your tool (editor window or agent session)', {
        positionals: [upstreamArg({ name: 'name', required: true })],
        flags: [
          upstream({
            name: '--tool',
            takesValue: true,
            placeholder: '<tool>',
            description: 'Open with this tool just this once',
          }),
        ],
      }),
      sub('remove', 'Delete a saved workset (member folders are never touched)', {
        positionals: [upstreamArg({ name: 'name', required: true })],
        flags: [upstream({ name: '--yes', description: 'Confirm removal non-interactively' })],
      }),
    ],
  },
  {
    name: 'show',
    summary: 'Show a change or spec (text or JSON)',
    hidden: false,
    parse: 'forward',
    store: 'accepted',
    declaresStorePath: true,
    positionals: [upstreamArg({ name: 'item', required: true })],
    flags: [
      upstream({
        name: '--type',
        takesValue: true,
        placeholder: '<change|spec>',
        values: ['change', 'spec'],
        description: 'Disambiguate an id that matches both',
      }),
      upstream({ name: '--no-interactive', description: 'Disable interactive prompts' }),
      upstream({
        name: '--deltas-only',
        description: 'Changes only: show only deltas (JSON only)',
      }),
      upstream({
        name: '--requirements-only',
        description: 'Deprecated alias of --deltas-only (changes only)',
      }),
      upstream({
        name: '--diff',
        description: 'Changes only: show per-requirement diffs for delta specs',
      }),
      upstream({
        name: '--requirements',
        description: 'Specs only: show only requirements, exclude scenarios (JSON only)',
      }),
      upstream({
        name: '--no-scenarios',
        description: 'Specs only: exclude scenario content (JSON only)',
      }),
      upstream({
        name: '--requirement',
        short: '-r',
        takesValue: true,
        placeholder: '<id>',
        description: 'Specs only: show a single requirement by id (JSON only)',
      }),
    ],
  },
  {
    name: 'view',
    summary: 'Show the OpenSpec dashboard',
    hidden: false,
    parse: 'table',
    json: 'refused',
    store: 'accepted',
    declaresStorePath: true,
    jsonRefusalMessage: 'cospec view renders a text dashboard and cannot emit JSON',
    positionals: [],
    flags: [],
  },
  {
    name: 'schemas',
    summary: 'List resolvable schemas',
    hidden: false,
    parse: 'forward',
    store: 'accepted',
    declaresStorePath: true,
    positionals: [],
    flags: [],
  },
  {
    name: 'schema',
    summary: 'Inspect a schema (which/validate)',
    hidden: false,
    parse: 'forward',
    store: 'accepted',
    positionals: [],
    flags: [],
    subcommands: [
      sub('which', 'Show where a schema resolves from', {
        positionals: [upstreamArg({ name: 'name', required: false })],
        flags: [
          upstream({
            name: '--all',
            description: 'List all schemas with their resolution sources',
          }),
        ],
      }),
      sub('validate', 'Validate a schema structure and templates', {
        positionals: [upstreamArg({ name: 'name', required: false })],
        flags: [upstream({ name: '--verbose', description: 'Show detailed validation steps' })],
      }),
      sub('fork', 'Copy an existing schema to the project for customization', {
        positionals: [
          upstreamArg({ name: 'source', required: true }),
          upstreamArg({ name: 'name', required: false }),
        ],
        flags: [upstream({ name: '--force', description: 'Overwrite existing destination' })],
      }),
      sub('init', 'Create a new project-local schema', {
        positionals: [upstreamArg({ name: 'name', required: true })],
        flags: [
          upstream({
            name: '--description',
            takesValue: true,
            placeholder: '<text>',
            description: "Seed the new schema's description",
          }),
          upstream({
            name: '--artifacts',
            takesValue: true,
            placeholder: '<list>',
            description: 'Comma-separated artifact ids to include',
          }),
          upstream({ name: '--default', description: 'Set as the project default schema' }),
          upstream({ name: '--no-default', description: 'Do not prompt to set as default' }),
          upstream({ name: '--force', description: 'Overwrite an existing schema' }),
        ],
      }),
    ],
  },
  {
    name: 'templates',
    summary: 'List per-artifact template paths',
    hidden: false,
    parse: 'forward',
    store: 'accepted',
    positionals: [],
    flags: [
      upstream({
        name: '--schema',
        takesValue: true,
        placeholder: '<name>',
        description: 'Schema whose templates to list (default: spec-driven)',
      }),
    ],
  },
  {
    name: 'config',
    summary: 'View and modify machine-global OpenSpec configuration',
    hidden: false,
    parse: 'forward',
    positionals: [],
    flags: [
      upstream({
        name: '--scope',
        takesValue: true,
        placeholder: '<scope>',
        values: ['global'],
        description: 'Config scope (only "global" is implemented upstream)',
      }),
    ],
    subcommands: [
      sub('path', 'Show config file location'),
      sub('list', 'Show all current settings'),
      sub('get', 'Get a specific value (raw, scriptable)', {
        positionals: [upstreamArg({ name: 'key', required: true })],
      }),
      sub('set', 'Set a value (auto-coerce types)', {
        positionals: [
          upstreamArg({ name: 'key', required: true }),
          upstreamArg({ name: 'value', required: true }),
        ],
        flags: [
          upstream({ name: '--string', description: 'Force value to be stored as string' }),
          upstream({ name: '--allow-unknown', description: 'Allow setting unknown keys' }),
        ],
      }),
      sub('unset', 'Remove a key (revert to default)', {
        positionals: [upstreamArg({ name: 'key', required: true })],
      }),
      sub('reset', 'Reset configuration to defaults', {
        flags: [
          upstream({ name: '--all', description: 'Reset all configuration (required)' }),
          upstream({ name: '--yes', short: '-y', description: 'Skip confirmation prompts' }),
        ],
      }),
      sub('edit', 'Open config in $EDITOR'),
      sub('profile', 'Configure workflow profile (interactive picker or preset shortcut)', {
        positionals: [upstreamArg({ name: 'preset', required: false })],
      }),
    ],
    notes: [
      '(config is machine-global: --store never applies; edit/profile/reset without -y',
      ' hand the terminal over and cannot emit JSON)',
    ],
  },
  {
    name: 'completion',
    summary: 'Print the shell completion script for cospec',
    hidden: false,
    parse: 'table',
    json: 'refused',
    store: 'refused',
    jsonRefusalMessage: 'cospec completion emits a shell script and cannot emit JSON',
    positionals: [
      cospecArg({
        name: 'shell',
        required: false,
        values: ['bash', 'zsh', 'fish'],
        pendingValues: { powershell: 'completion-install' },
        foldCase: true,
      }),
    ],
    flags: [],
    subcommands: [
      // Upstream's spelling of `completion [shell]`.
      sub('generate', 'Generate completion script for a shell (outputs to stdout)', {
        aliasOf: 'completion',
        positionals: [
          upstreamArg({
            name: 'shell',
            required: false,
            values: ['bash', 'zsh', 'fish'],
            pendingValues: { powershell: 'completion-install' },
            foldCase: true,
          }),
        ],
      }),
      pendingSub('install', 'Install completion script for a shell', 'completion-install'),
      pendingSub('uninstall', 'Uninstall completion script for a shell', 'completion-install'),
    ],
    notes: ['(shell omitted: detected from $SHELL; the script is printed, never installed)'],
  },
  {
    name: 'feedback',
    summary: "File feedback about cospec (--upstream files OpenSpec's)",
    hidden: false,
    parse: 'table',
    json: 'accepted',
    store: 'refused',
    positionals: [upstreamArg({ name: 'message', required: true })],
    flags: [
      upstream({
        name: '--body',
        takesValue: true,
        placeholder: '<text>',
        description: 'Detailed description for the report',
      }),
      cospec({
        name: '--upstream',
        description: 'File at Fission-AI/OpenSpec instead of aligned-team/cospec',
      }),
    ],
  },
  {
    // Commander's implicit program-level `help [command]`, last in upstream's
    // command list too. It reads only its first operand, never refuses, and
    // declares no `--store` (`openspec --store x help` is an unknown option).
    name: 'help',
    summary: 'Display help for a command',
    hidden: false,
    parse: 'table',
    json: 'accepted',
    store: 'refused',
    operands: 'lenient',
    positionals: [upstreamArg({ name: 'command', required: false })],
    flags: [],
  },
  {
    name: '__complete',
    summary: 'Dynamic completion source (changes|specs|types)',
    hidden: true,
    parse: 'table',
    json: 'accepted',
    store: 'accepted',
    positionals: [
      cospecArg({
        name: 'source',
        required: true,
        values: ['changes', 'specs', 'types'],
        // Upstream's hidden `__complete <type>` also serves these two.
        pendingValues: { schemas: 'cli-surface-parity', 'archived-changes': 'cli-surface-parity' },
      }),
    ],
    flags: [],
  },
  {
    name: 'check-commit',
    summary: 'Warn on commit-type/schema mismatch (hook entrypoint)',
    hidden: true,
    parse: 'table',
    json: 'accepted',
    store: 'refused',
    // Optional: an advisory commit-msg hook never refuses, so with no message
    // file it exits 0 and says nothing.
    positionals: [cospecArg({ name: 'msg-file', required: false })],
    flags: [],
  },
  {
    // Upstream's hidden, deprecated alias of `init`. It declares no
    // `--store` and no `--json`; cospec accepts `--json` as `init` does.
    name: 'experimental',
    summary: 'Alias for init (deprecated)',
    hidden: true,
    aliasOf: 'init',
    parse: 'table',
    json: 'accepted',
    store: 'refused',
    positionals: [],
    flags: [
      upstream({
        name: '--tool',
        takesValue: true,
        placeholder: '<tool-id>',
        description: 'Target AI tool (maps to --harness)',
      }),
      upstream({
        name: '--no-interactive',
        description: 'Accepted for OpenSpec compatibility (cospec init never prompts)',
        status: NO_OP,
      }),
    ],
  },
]

export function commandRow(name: string): CommandRow | undefined {
  return COMMAND_TABLE.find((row) => row.name === name)
}

// --- help labels -----------------------------------------------------------------

/** `-r, --requirement <id>` / `--sort <order>` / `--strict`. */
export function flagLabel(flag: FlagSpec): string {
  const long = flag.placeholder !== undefined ? `${flag.name} ${flag.placeholder}` : flag.name
  return flag.short !== undefined ? `${flag.short}, ${long}` : long
}

/** `<change>` when required, `[path]` when not. */
export function positionalLabel(positional: PositionalSpec): string {
  return positional.required ? `<${positional.name}>` : `[${positional.name}]`
}

/** The flags `--help` and completion list: handled and accepted no-ops, never pending or hidden. */
export function offeredFlags(surface: { readonly flags: readonly FlagSpec[] }): FlagSpec[] {
  return surface.flags.filter((flag) => !isPending(flag.status) && flag.hidden !== true)
}

// --- suggestion ------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const cols = b.length + 1
  const prev = Array.from({ length: cols }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!
    prev[0] = i
    for (let j = 1; j < cols; j++) {
      const tmp = prev[j]!
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + cost)
      diag = tmp
    }
  }
  return prev[cols - 1]!
}

/** The nearest candidate within an edit distance of 3, or undefined. */
export function closest(input: string, candidates: readonly string[]): string | undefined {
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

// --- refusals --------------------------------------------------------------------

export type ParseRefusal =
  | {
      readonly kind: 'unknown-option'
      readonly command: string
      readonly option: string
      /** Commander's closest long options, sorted; absent when none is close. */
      readonly suggestions?: readonly string[]
      readonly message: string
    }
  /**
   * With `flag` `--store-path`, `message` is the redirect's text form: answer
   * it as a `store-path` refusal (a document under `--json`), ranked as a
   * missing value.
   */
  | {
      readonly kind: 'missing-value'
      readonly command: string
      readonly flag: string
      readonly message: string
    }
  | {
      readonly kind: 'pending'
      readonly command: string
      /** The flag, subcommand, positional label or positional value refused. */
      readonly surface: string
      readonly owner: PendingOwner
      readonly message: string
    }
  /** `message` names the positional, then gives the command's usage. */
  | {
      readonly kind: 'missing-argument'
      readonly command: string
      readonly argument: string
      readonly message: string
    }
  | {
      readonly kind: 'too-many-arguments'
      readonly command: string
      readonly expected: number
      readonly received: number
      readonly message: string
    }
  /**
   * `message` is the stderr text form. Under `--json`, write
   * `storePathRefusal(true).text` to stdout instead of printing `message`.
   */
  | { readonly kind: 'store-path'; readonly command: string; readonly message: string }

export interface ParsedArgs {
  readonly subcommand?: string
  readonly positionals: readonly string[]
  /**
   * Keyed by long flag name (`-y` lands under `--yes`, an alias flag's value
   * under the flag it is an alias of); a boolean flag's value is `true`.
   */
  readonly flags: Readonly<Record<string, string | true>>
  /** The alias spelling that supplied a flag's value, keyed by the flag's name. */
  readonly spellings?: Readonly<Record<string, string>>
}

export type ParseResult =
  | { readonly ok: true; readonly parsed: ParsedArgs }
  | { readonly ok: false; readonly refusal: ParseRefusal }

export function hasFlag(parsed: ParsedArgs, name: `--${string}`): boolean {
  return parsed.flags[name] !== undefined
}

/** A value-taking flag's value; undefined when absent. */
export function flagValue(parsed: ParsedArgs, name: `--${string}`): string | undefined {
  const value = parsed.flags[name]
  return typeof value === 'string' ? value : undefined
}

/**
 * The spelling the user typed for flag `name`: an alias of it when that
 * supplied the value (`--tools` for `--harness`), else `name`.
 */
export function flagSpelling(parsed: ParsedArgs, name: `--${string}`): `--${string}` {
  const typed = parsed.spellings?.[name]
  return typed !== undefined ? (typed as `--${string}`) : name
}

const MAX_SUGGEST_DISTANCE = 3

/** Commander's optimal-string-alignment distance, capped as `suggestSimilar` caps it. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > MAX_SUGGEST_DISTANCE) return Math.max(a.length, b.length)
  const d: number[][] = []
  for (let i = 0; i <= a.length; i++) d[i] = [i]
  for (let j = 0; j <= b.length; j++) d[0]![j] = j
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const row = d[i]!
      row[j] = Math.min(d[i - 1]![j]! + 1, row[j - 1]! + 1, d[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        row[j] = Math.min(row[j]!, d[i - 2]![j - 2]! + 1)
    }
  }
  return d[a.length]![b.length]!
}

/**
 * The long candidates commander's `suggestSimilar` offers for an unknown
 * option, sorted: none for a short option; else, comparing the whole token
 * and each candidate without their `--` (an `=value` stays part of the token),
 * every candidate longer than one character whose similarity
 * `(length - distance) / length` exceeds 0.4 at the best distance within 3.
 */
function optionSuggestions(option: string, candidates: readonly string[]): string[] {
  if (!option.startsWith('--')) return []
  const word = option.slice(2)
  let similar: string[] = []
  let bestDistance = MAX_SUGGEST_DISTANCE
  for (const candidate of new Set(candidates.map((c) => c.slice(2)))) {
    if (candidate.length <= 1) continue
    const distance = editDistance(word, candidate)
    const length = Math.max(word.length, candidate.length)
    if ((length - distance) / length <= 0.4) continue
    if (distance < bestDistance) {
      bestDistance = distance
      similar = [candidate]
    } else if (distance === bestDistance) similar.push(candidate)
  }
  return similar.toSorted((a, b) => a.localeCompare(b)).map((candidate) => `--${candidate}`)
}

function suggestionHint(suggestions: readonly string[]): string {
  const quoted = suggestions.map((name) => `'${name}'`)
  if (quoted.length > 1) return `Did you mean one of ${quoted.join(', ')}?\n`
  return quoted.length === 1 ? `Did you mean ${quoted[0]}?\n` : ''
}

/**
 * The refusal for an undeclared option before the command name, where only the
 * global flags (and `-V, --version`) are declared: upstream's program-level
 * commander refuses it there whatever command follows.
 */
export function globalUnknownOptionRefusal(option: string): string {
  const candidates = [...GLOBAL_FLAGS.map((flag) => flag.name), '--version']
  const hint = suggestionHint(optionSuggestions(option, candidates))
  return `cospec: unknown option '${option}'\n${hint}`
}

function unknownOption(command: string, option: string, candidates: string[]): ParseRefusal {
  const suggestions = optionSuggestions(option, candidates)
  return {
    kind: 'unknown-option',
    command,
    option,
    ...(suggestions.length > 0 ? { suggestions } : {}),
    message: `cospec ${command}: unknown option '${option}'\n${suggestionHint(suggestions)}`,
  }
}

function pendingRefusal(command: string, surface: string, owner: PendingOwner): ParseRefusal {
  return {
    kind: 'pending',
    command,
    surface,
    owner,
    message: `cospec ${command}: '${surface}' is not supported yet\n`,
  }
}

/**
 * The first required positional in `slots` that `values` leaves empty, as
 * commander checks them in order; none once a compound value fills the rest.
 */
function missingPositional(
  slots: readonly PositionalSpec[],
  values: readonly string[],
): PositionalSpec | undefined {
  for (const [index, slot] of slots.entries()) {
    const value = values[index]
    if (value === undefined) {
      if (slot.required) return slot
      continue
    }
    if (slot.compound !== undefined && value.includes(slot.compound.separator)) return undefined
  }
  return undefined
}

/** `cospec new <type> <slug> | cospec new "<type>: <description>"`. */
function usage(command: string, slots: readonly PositionalSpec[]): string {
  const offered = slots.filter((slot) => !isPending(slot.status))
  const forms = [offered.map(positionalLabel)]
  for (const [index, slot] of offered.entries()) {
    if (slot.compound !== undefined)
      forms.push([...offered.slice(0, index).map(positionalLabel), slot.compound.label])
  }
  return forms.map((form) => [`cospec ${command}`, ...form].join(' ')).join(' | ')
}

function missingArgument(
  command: string,
  slot: PositionalSpec,
  slots: readonly PositionalSpec[],
): ParseRefusal {
  return {
    kind: 'missing-argument',
    command,
    argument: slot.name,
    message: `cospec ${command}: missing required argument '${slot.name}'\ncospec ${command}: usage — ${usage(command, slots)}\n`,
  }
}

function plural(n: number): string {
  return n === 1 ? '1 argument' : `${n} arguments`
}

// Upstream's redirect (probed at the 1.13.1 pin, `dist/cli/index.js`), with
// `openspec` respelled to `cospec` and nothing else changed — bare `openspec`
// never reaches shipped output.
export const STORE_PATH_MESSAGE =
  '--store-path is not supported. Register the path with cospec store register <path>, then select it with --store <id>.'
export const STORE_PATH_FIX = 'cospec store register <path>, then rerun with --store <id>.'
const STORE_PATH_TEXT = `✖ Error: ${STORE_PATH_MESSAGE}\nFix: ${STORE_PATH_FIX}\n`

// --- the parser ------------------------------------------------------------------

/** A token commander would treat as an option: dash-led and more than a bare `-`. */
function isOptionToken(tok: string): boolean {
  return tok.length > 1 && tok.startsWith('-')
}

/** `--store-path` or `--store-path=<v>` — intercepted on every command, both positions. */
export function isStorePathToken(tok: string): boolean {
  return tok === '--store-path' || tok.startsWith('--store-path=')
}

/**
 * What commander searches for a hint: the long options the command's help
 * shows, then its parent's (`-V, --version` among them).
 */
function suggestionCandidates(surface: SurfaceSpec, globals: readonly FlagSpec[]): string[] {
  const visible = [...surface.flags, ...globals].filter((flag) => flag.hidden !== true)
  return [...visible.map((flag) => flag.name), '--version']
}

function parseSurface(
  command: string,
  surface: SurfaceSpec,
  globals: readonly FlagSpec[],
  args: readonly string[],
  declaresStorePath: boolean,
  lenient = false,
): ParseResult {
  const positionals: string[] = []
  const flags: Record<string, string | true> = {}
  const spellings: Record<string, string> = {}
  const storePath: ParseRefusal = { kind: 'store-path', command, message: STORE_PATH_TEXT }
  // Commander's order: a missing value is raised the moment the scan meets it,
  // while an unknown option is collected and reported only after the scan,
  // and where upstream declares `--store-path <path>` it refuses it in the
  // action. So the scan records the first unknown option or pending flag and
  // keeps going; only a missing value returns early.
  let recorded: ParseRefusal | undefined
  let sawStorePath = false

  for (let i = 0; i < args.length; i++) {
    const tok = args[i]!
    if (tok === '--') {
      positionals.push(...args.slice(i + 1))
      break
    }
    if (!isOptionToken(tok)) {
      positionals.push(tok)
      continue
    }
    const eq = tok.startsWith('--') ? tok.indexOf('=') : -1
    const name = eq > 0 ? tok.slice(0, eq) : tok
    const inline = eq > 0 ? tok.slice(eq + 1) : undefined
    const flag = surface.flags.find((f) => f.name === name || f.short === name)
    // On a lenient row the first undeclared option ends the operands, as
    // commander files it and every later token as unknown.
    if (lenient && flag === undefined) break
    if (isStorePathToken(tok) && !declaresStorePath) {
      // Undeclared upstream, so an unknown option that takes nothing: the
      // redirect, on stderr only, in the unknown option's place in the order.
      recorded ??= { kind: 'unknown-option', command, option: tok, message: STORE_PATH_TEXT }
      continue
    }
    if (isStorePathToken(tok)) {
      if (tok === '--store-path' && ++i >= args.length) {
        return {
          ok: false,
          refusal: {
            kind: 'missing-value',
            command,
            flag: '--store-path',
            message: STORE_PATH_TEXT,
          },
        }
      }
      sawStorePath = true
      continue
    }

    // `--bool=x` is unknown as a whole token, as commander reports it.
    if (flag === undefined || (inline !== undefined && flag.takesValue !== true)) {
      recorded ??= unknownOption(command, tok, suggestionCandidates(surface, globals))
      continue
    }

    let value: string | true = true
    if (flag.takesValue === true) {
      // Like commander, a required value is the next token whatever it looks like.
      if (inline !== undefined) value = inline
      else if (i + 1 < args.length) value = args[++i]!
      else {
        return {
          ok: false,
          refusal: {
            kind: 'missing-value',
            command,
            flag: flag.name,
            message: `cospec ${command}: option '${flag.name} ${flag.placeholder}' argument missing\n`,
          },
        }
      }
    }
    if (isPending(flag.status)) {
      recorded ??= pendingRefusal(command, flag.name, flag.status.pending)
      continue
    }
    // An alias and the flag it spells are one option: the last one typed wins.
    const key = flag.aliasOf ?? flag.name
    flags[key] = value
    if (flag.aliasOf !== undefined) spellings[key] = flag.name
    else delete spellings[key]
  }

  if (recorded !== undefined) return { ok: false, refusal: recorded }
  const slots = surface.positionals.filter(
    (p) => p.displacedBy?.some((name) => flags[name] !== undefined) !== true,
  )
  if (lenient) positionals.splice(slots.length)
  const missing = missingPositional(slots, positionals)
  if (missing !== undefined) return { ok: false, refusal: missingArgument(command, missing, slots) }
  for (const [index, value] of positionals.entries()) {
    const slot = slots[index]
    if (slot === undefined) {
      const expected = slots.filter((p) => !isPending(p.status)).length
      return {
        ok: false,
        refusal: {
          kind: 'too-many-arguments',
          command,
          expected,
          received: positionals.length,
          message: `cospec ${command}: too many arguments. Expected ${plural(expected)} but got ${positionals.length}.\n`,
        },
      }
    }
    if (isPending(slot.status)) {
      return {
        ok: false,
        refusal: pendingRefusal(command, positionalLabel(slot), slot.status.pending),
      }
    }
    const folded = slot.foldCase === true ? value.toLowerCase() : value
    const owner = slot.pendingValues?.[folded]
    if (owner !== undefined) return { ok: false, refusal: pendingRefusal(command, folded, owner) }
  }

  if (sawStorePath) return { ok: false, refusal: storePath }
  const parsed: ParsedArgs =
    Object.keys(spellings).length > 0 ? { positionals, flags, spellings } : { positionals, flags }
  return { ok: true, parsed }
}

/**
 * Parse a `table` row's argv (global flags already stripped by `cli.ts`,
 * except a `store: 'refused'` row's `--store`, refused here as unknown).
 * Returns the positionals and flag values, or the refusal commander would
 * reach first: a value-taking flag with no value, anywhere in the argv (a
 * pending flag's included, from its placeholder like a handled one, and
 * `--store-path`'s on a row that declares it, as a `missing-value` whose
 * message is the redirect); then the first undeclared option or pending flag
 * in argv order (a pending flag's value consumed first, so it can never leak
 * into a positional; `--store-path` on a row that does not declare it, as an
 * `unknown-option` whose message is the redirect); then a required
 * positional given nothing (commander's `missing required argument`, text
 * under `--json` too); then too many positionals or a pending positional; and
 * only then a declared `--store-path`, whose value is consumed like any
 * other. Every refusal exits 1.
 */
export function parseCommandArgs(row: TableCommandRow, args: readonly string[]): ParseResult {
  const first = args[0]
  const subcommand =
    first !== undefined ? row.subcommands?.find((s) => s.name === first) : undefined
  const globals = rowGlobalFlags(row)
  const storePath = storePathTakesValue(row)
  const lenient = row.operands === 'lenient'
  if (subcommand === undefined)
    return parseSurface(row.name, row, globals, args, storePath, lenient)
  if (isPending(subcommand.status)) {
    return {
      ok: false,
      refusal: pendingRefusal(row.name, subcommand.name, subcommand.status.pending),
    }
  }
  const result = parseSurface(
    `${row.name} ${subcommand.name}`,
    subcommand,
    globals,
    args.slice(1),
    storePath,
  )
  return result.ok
    ? { ok: true, parsed: { ...result.parsed, subcommand: subcommand.name } }
    : result
}

/**
 * Parse one subcommand's own argv (`sub` of `row`, the row's global flags
 * already stripped) as `parseCommandArgs` parses a table row's: the same
 * scan, order and refusal text. For a `forward` row's leaf that cospec must
 * refuse itself before the binary runs (a terminal handover), since nothing
 * the binary prints there can be relayed.
 */
export function parseSubcommandArgs(
  row: CommandRow,
  sub: SubcommandSpec,
  args: readonly string[],
): ParseResult {
  const result = parseSurface(
    `${row.name} ${sub.name}`,
    sub,
    rowGlobalFlags(row),
    args,
    storePathTakesValue(row),
  )
  return result.ok ? { ok: true, parsed: { ...result.parsed, subcommand: sub.name } } : result
}

// --- --store-path and --json refusals ----------------------------------------------

/**
 * The `--store-path` refusal: upstream's two-line redirect on stderr, or under
 * `--json` one document on stdout carrying upstream's `status[0]` shape.
 * Upstream also prefixes each command's null payload (`changes: [], root: null`
 * on `list`); cospec emits only the status array, so compare `status[0]`.
 */
export function storePathRefusal(json: boolean): {
  readonly stream: 'stdout' | 'stderr'
  readonly text: string
} {
  if (!json) return { stream: 'stderr', text: STORE_PATH_TEXT }
  const envelope = {
    status: [
      {
        severity: 'error',
        code: 'store_path_not_supported',
        message: STORE_PATH_MESSAGE,
        target: 'store.id',
        fix: STORE_PATH_FIX,
      },
    ],
  }
  return { stream: 'stdout', text: `${JSON.stringify(envelope, null, 2)}\n` }
}

/**
 * Whether `--store-path` takes the next token as its value on `row`: only
 * where the upstream command declares it (`declaresStorePath`, design
 * decision 2). Elsewhere it is an unknown option that takes nothing.
 */
export function storePathTakesValue(row: CommandRow): boolean {
  return row.declaresStorePath === true
}

/**
 * Whether `tok` is the space form of a value-taking flag declared on one of
 * `surfaces` (a row and, once named, its subcommand), or `--store-path` where
 * `storePath` says it takes a value: commander takes the next token as its
 * value whatever it looks like — a help flag, a global, `--`.
 */
export function takesNextToken(
  surfaces: readonly { readonly flags: readonly FlagSpec[] }[],
  tok: string,
  storePath: boolean,
): boolean {
  if (tok === '--store-path') return storePath
  return surfaces.some((surface) =>
    surface.flags.some((f) => f.takesValue === true && (f.name === tok || f.short === tok)),
  )
}

/**
 * One step of commander's short-option cluster split: a token `-ab…` (a single
 * dash, two or more letters) whose first letter is a short flag one of
 * `surfaces` declares. A boolean flag leaves the rest as the next token
 * (`-b…`); a value-taking one takes the rest as its value. Undefined when the
 * token is no cluster or its first letter is undeclared — then commander
 * treats the whole token as one unknown option. `-h` never starts a split:
 * commander keeps help out of its option list, so `-hy` stays whole.
 */
export function splitShortCluster(
  surfaces: readonly { readonly flags: readonly FlagSpec[] }[],
  tok: string,
):
  | { readonly head: `-${string}`; readonly tail: string; readonly takesValue: boolean }
  | undefined {
  if (tok.length <= 2 || tok[0] !== '-' || tok[1] === '-') return undefined
  const head = `-${tok[1]}` as const
  const flag = surfaces.flatMap((surface) => surface.flags).find((f) => f.short === head)
  if (flag === undefined) return undefined
  const takesValue = flag.takesValue === true
  return { head, tail: takesValue ? tok.slice(2) : `-${tok.slice(2)}`, takesValue }
}

/**
 * Whether `args` (a terminal-handover leaf's own argv, global flags already
 * stripped) carries `--store-path` in option position before any other
 * undeclared option — where the binary refuses it without running the
 * command. `surfaces` are the command and subcommand whose declared flags the
 * scan knows: a value-taking flag consumes the next token (so a
 * `--store-path` there is its value), and the scan stops at `--`. An earlier
 * undeclared option is the binary's to refuse first, so the answer is false.
 */
export function storePathInOptionPosition(
  surfaces: readonly SurfaceSpec[],
  args: readonly string[],
): boolean {
  const flags = surfaces.flatMap((surface) => surface.flags)
  for (let i = 0; i < args.length; i++) {
    const tok = args[i]!
    if (tok === '--') return false
    if (!isOptionToken(tok)) continue
    if (isStorePathToken(tok)) return true
    const eq = tok.startsWith('--') ? tok.indexOf('=') : -1
    const name = eq > 0 ? tok.slice(0, eq) : tok
    const flag = flags.find((f) => f.name === name || f.short === name)
    if (flag === undefined) return false
    if (flag.takesValue === true && eq <= 0) i++
  }
  return false
}

/**
 * Whether a wrapped run's answer is the binary's own refusal of `--store-path`:
 * its redirect (text, or the `--json` envelope), or commander's plain
 * `unknown option '--store-path'` / `argument missing` on a command that does
 * not declare it, or declares it and was given no value.
 */
export function isUpstreamStorePathRefusal(run: {
  readonly stdout: string
  readonly stderr: string
}): boolean {
  if (/--store-path is not supported\./.test(run.stderr)) return true
  if (/^error: unknown option '--store-path(?:=[^']*)?'$/m.test(run.stderr)) return true
  if (/^error: option '--store-path .+' argument missing$/m.test(run.stderr)) return true
  return /"code":\s*"store_path_not_supported"/.test(run.stdout)
}

/**
 * The one-document `--json` refusal for a row marked `json: 'refused'`: a
 * `--json` caller is owed exactly one parseable document even on refusal.
 */
export function jsonRefusal(command: string, message: string): string {
  return `${JSON.stringify({ version: 1, command, ok: false, message })}\n`
}
