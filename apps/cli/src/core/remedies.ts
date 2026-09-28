// The one allowlist of the pinned binary's own sentences that name a bare
// `openspec <command>`, each with the cospec spelling a relay prints instead
// (design decision: an allowlist of upstream's exact sentences, never a
// pattern over free text). A relayed answer is rewritten only where it holds
// one of these sentences verbatim; every other byte — a path, a quoted
// excerpt, a name, prose that happens to read like a remedy — is relayed as
// the binary wrote it. Each sentence's holes (a name, a path, a list) are
// re-emitted unread, so nothing the user owns is ever rewritten.
//
// The contract suite (`test/contract/remedy-enumeration.test.ts`) reads the
// pinned dist and fails when it names a command in a sentence this table does
// not hold and the suite does not list as unreachable through cospec, so a new
// remedy in a future pin cannot reach a cospec user unspelled.

/**
 * A hole in a sentence template, re-emitted as captured:
 *
 * - `{id}`: a name or id, one token with no whitespace or quote.
 * - `{text}`: anything up to the literal that follows it on the same line (a
 *   path, a list, a quoted name); never the last thing in a sentence.
 * - `{store}`: upstream's `withStoreFlag` suffix, ` --store <id>` or nothing.
 * - `{sgr}`: a color code, or nothing.
 * - `{cmd}`: one of the `command` remedies below, or several joined by
 *   `, then `, itself spelled through cospec.
 */
type Hole = 'id' | 'text' | 'store' | 'sgr' | 'cmd'

export interface Remedy {
  /** Stable name, cited by the enumeration contract test. */
  readonly id: string
  /**
   * `sentence`: matched wherever it occurs verbatim. `command`: a bare command
   * upstream prints as a whole field — a line of its own (after indentation
   * and an optional `Fix: `/`Next: `-style label), a JSON string value, or a
   * `{cmd}` hole — and matched only there.
   */
  readonly kind: 'sentence' | 'command'
  /** Upstream's text, holes as `{id}` … (see `Hole`). */
  readonly upstream: string
  /**
   * cospec's text, with the same holes in the same order. Omitted when it is
   * `upstream` with each `openspec <command>` spelled `cospec <command>`.
   */
  readonly cospec?: string
}

const sentence = (id: string, upstream: string, cospec?: string): Remedy => ({
  id,
  kind: 'sentence',
  upstream,
  ...(cospec === undefined ? {} : { cospec }),
})
const command = (id: string, upstream: string, cospec?: string): Remedy => ({
  id,
  kind: 'command',
  upstream,
  ...(cospec === undefined ? {} : { cospec }),
})

/**
 * Every upstream sentence reachable through a cospec relay, by source module
 * (`dist/…` of `@fission-ai/openspec` 1.13.1). Where cospec's command has
 * another shape the sentence says so (`new change <name>` is
 * `new <type> <name>`); where cospec has no such command the clause goes
 * (the noun-form `change show` / `spec show`).
 */
export const REMEDIES: readonly Remedy[] = [
  // commands/change.js
  sentence(
    'change/no-proposal',
    'Run "openspec status --change {id}" to see which artifact comes next.',
  ),
  // commands/show.js
  sentence(
    'show/ambiguous-noun-form',
    'Pass --type change|spec, or use: openspec change show / openspec spec show',
    'Pass --type change|spec.',
  ),
  // commands/validate.js
  sentence(
    'validate/ambiguous-noun-form',
    'Pass --type change|spec, or use: openspec change validate / openspec spec validate',
    'Pass --type change|spec.',
  ),
  command('validate/hint-all', 'openspec validate --all{store}'),
  command('validate/hint-changes', 'openspec validate --changes{store}'),
  command('validate/hint-specs', 'openspec validate --specs{store}'),
  command('validate/hint-item', 'openspec validate <item-name>{store}'),
  sentence(
    'validate/debug-deltas',
    '- Debug parsed deltas: openspec show {id} --json --deltas-only{store}',
  ),
  sentence('validate/details', 'Details: openspec validate {id} --type {id}{store}'),
  // commands/schema.js
  sentence('schema/fork-suggestion', 'Use --force to overwrite or "openspec schema fork" to copy'),
  sentence(
    'schema/use-with',
    '3. Use with: openspec new --schema {id}',
    '3. Use with: cospec new {id} <slug>',
  ),
  // commands/config.js, core/global-config.js
  sentence(
    'config/invalid-file',
    'Fix it with "openspec config edit", or reset it with "openspec config reset --all".',
  ),
  sentence(
    'config/drift-warning',
    'Warning: Global config is not applied to this project. Run `openspec update` to sync.',
  ),
  sentence(
    'config/profile-applied',
    'Config updated. Run `openspec update` in your projects to apply.',
  ),
  sentence('config/list-keys', 'Use "openspec config list" to see available keys.'),
  sentence('config/reset-usage', 'Usage: openspec config reset --all [-y]'),
  // commands/store.js
  command('store/setup-example-json', 'openspec store setup <id> --path ~/openspec/<id> --json'),
  command('store/setup-example', 'openspec store setup {id} --path ~/openspec/{id}'),
  command('store/remove-yes', 'openspec store remove {id} --yes'),
  sentence(
    'store/unregister-registration',
    'Run "openspec store unregister <id>" if you only want to forget the local registration.',
  ),
  command(
    'store/new-change-in-store',
    'openspec new change <change-id> --store {id}',
    'cospec new <type> <change-id> --store {id}',
  ),
  sentence(
    'store/share-it',
    'Share it: teammates clone {text} and run openspec store register <path>.',
  ),
  command(
    'store/setup-team-example',
    'openspec store setup team-context --path ~/openspec/team-context',
  ),
  command('store/register-example', 'openspec store register /path/to/store'),
  sentence(
    'store/unknown-subcommand',
    "Unknown command '{text}' for 'openspec store'. Store subcommands: {text}.",
  ),
  sentence(
    'store/missing-subcommand',
    "Missing subcommand for 'openspec store'. Store subcommands: {text}.",
  ),
  command(
    'store/lifecycle-example',
    'openspec new change <change-id> --store <id>',
    'cospec new <type> <change-id> --store <id>',
  ),
  command(
    'store/lifecycle-example-new',
    'openspec new change {id} --store <id>',
    'cospec new <type> {id} --store <id>',
  ),
  // After the two `new change` shapes: any other lifecycle command upstream
  // echoes back with `--store` has the same shape in cospec.
  command('store/lifecycle-example-other', 'openspec {text} --store <id>'),
  sentence(
    'store/unknown-subcommand-error',
    "Error: unknown command '{text}' for 'openspec store'.",
  ),
  sentence('store/missing-subcommand-error', "Error: missing subcommand for 'openspec store'."),
  // commands/workset.js, commands/workset-input.js, core/worksets.js
  sentence(
    'workset/open-in-code',
    'Open in VS Code or Cursor: openspec workset open {id} --tool code',
  ),
  sentence('workset/open-any-time', 'Open it any time with: openspec workset open {id}'),
  command('workset/create-example', 'openspec workset create <name> --member <path>'),
  command(
    'workset/create-named-example',
    'openspec workset create {id} --member <path> --member <name>=<path>',
  ),
  sentence('workset/none-saved', 'No worksets saved. Create one with: openspec workset create'),
  sentence('workset/inspect', 'Inspect worksets with: openspec workset list --json'),
  sentence(
    'workset/recompose',
    'Recompose it: openspec workset remove {id} --yes && openspec workset create {id} --member <path>',
  ),
  command('workset/open-tool', 'openspec workset open {id} --tool <id>'),
  sentence('workset/open-alternative', 'Run: openspec workset open {id} --tool {id}'),
  command('workset/remove-yes', 'openspec workset remove {id} --yes'),
  sentence(
    'workset/unknown-subcommand',
    "Unknown command '{text}' for 'openspec workset'. Workset subcommands: {text}.",
  ),
  sentence(
    'workset/missing-subcommand',
    "Missing subcommand for 'openspec workset'. Workset subcommands: {text}.",
  ),
  sentence(
    'workset/tool-alternative',
    "Install '{text}' or run: openspec workset open {id} --tool {id}",
  ),
  sentence('workset/tool-rerun', "Install '{text}', then rerun: openspec workset open {id}"),
  sentence('workset/no-tool', 'Install one of: {text}. Then rerun: openspec workset open {id}'),
  sentence('workset/saved-list', 'Saved worksets: {text}. See them with: openspec workset list'),
  sentence('workset/create-first', 'Create it first: openspec workset create {id}'),
  sentence(
    'workset/remove-first',
    'Choose another name, or remove it first: openspec workset remove {id}',
  ),
  // commands/workflow/instructions.js
  sentence(
    'instructions/create-it',
    'Create it with `openspec instructions {id} --change {id}` (`openspec status --change {id}` shows what is left).',
  ),
  sentence(
    'instructions/create-each',
    'Create each with `openspec instructions {id} --change {id}` (`openspec status --change {id}` shows what is left).',
  ),
  sentence(
    'instructions/unread-delta',
    "is not a capability's spec.md, so `openspec validate {id}` rejects it and archive never merges it.",
  ),
  sentence(
    'instructions/no-delta-specs',
    'This change has no delta specs and does not declare `skip_specs: true`, so `openspec validate {id}` fails on it. Write the delta specs before implementing (`openspec instructions {id} --change {id}`), ',
  ),
  // commands/workflow/shared.js, instructions.js, status.js: the new-change
  // hint and the sentences it ends.
  command(
    'workflow/new-change-hint',
    'openspec new change <name>{store}',
    'cospec new <type> <name>{store}',
  ),
  sentence('workflow/no-changes-create', 'No changes found. Create one with: {cmd}'),
  sentence(
    'workflow/not-found-create',
    "Change '{text}' not found. No changes exist. Create one with: {cmd}",
  ),
  sentence('workflow/no-active-create', 'No active changes. Create one with: {cmd}'),
  // commands/workflow/new-change.js
  command('new-change/next', 'openspec status --change {id}{store}'),
  sentence(
    'new-change/implicit-root',
    'Run `openspec init` to finish setting this project up, or delete that directory if you meant a different project.',
  ),
  // core/change-status-policy.js: the next step, as `Next: <command>` or a
  // `command` field, and inside its sentence.
  command('status/next-artifact', 'openspec instructions {id} --change "{text}"{store} --json'),
  command('status/next-apply', 'openspec instructions apply --change "{text}"{store} --json'),
  sentence('status/next-artifact-sentence', 'Run {cmd} before writing that artifact.'),
  sentence(
    'status/next-apply-sentence',
    'All planning artifacts are complete. Run {cmd} to inspect implementation progress.',
  ),
  // core/view.js
  sentence(
    'view/footer',
    'Use {sgr}openspec list --changes{sgr} or {sgr}openspec list --specs{sgr} for detailed views',
  ),
  // core/root-selection.js
  sentence('root/store-doctor', 'Run openspec store doctor {id} to inspect it.'),
  sentence(
    'root/no-registered-stores',
    'Run openspec store setup {id} or openspec store register <path> first.',
  ),
  sentence('root/unknown-store', 'Pass a registered store id, or run openspec store list.'),
  sentence(
    'root/declared-unknown-store',
    'Register the store (openspec store register <path> --id {id}) or edit {text} to name a registered store.',
  ),
  sentence(
    'root/stale-default-store',
    'Register the store (openspec store register <path> --id {id}) or clear the stale global default (openspec config unset defaultStore).',
  ),
  sentence(
    'root/no-root-registered',
    'No OpenSpec root found in the current directory or its ancestors. Registered stores: {text}. Pass --store <id> to use one, or run openspec init to create a local root.',
  ),
  sentence(
    'root/no-root-registered-fix',
    'Rerun with --store <id> (registered: {text}) or run openspec init.',
  ),
  sentence('root/no-root-fix', 'Run openspec init to create a root here.'),
  // core/references.js, core/relationship-health.js
  sentence(
    'references/clone',
    'git clone -- {text} {text} && openspec store register {text} --id {id}',
  ),
  sentence(
    'references/get-checkout',
    'Get a checkout from a teammate and run: openspec store register <path> --id {id}',
  ),
  command('references/fetch', 'openspec show <spec-id> --type spec --store {id}'),
  sentence('references/store-doctor-id', 'Run: openspec store doctor {id}'),
  sentence('references/store-doctor', 'Run: openspec store doctor'),
  sentence('references/list-rest', 'List the rest directly: openspec list --specs --store {id}'),
  // core/store/registry.js, core/store/operations.js
  sentence(
    'store/unregister-first',
    'Use the existing registration, or run openspec store unregister {id} first to switch this id to a different checkout.',
  ),
  sentence('store/list-registered', 'Run openspec store list to see registered stores.'),
  sentence('store/metadata-rerun', 'Create {text} or rerun "openspec store register <path>".'),
  sentence(
    'store/register-then-select',
    'Register a store with openspec store register <path>, then select it with --store <id>.',
  ),
  sentence('store/setup-reevaluate', 'Rerun openspec store setup to re-evaluate the directory.'),
  sentence(
    'store/setup-or-register',
    'Run openspec store setup for a new store, or point register at a checkout whose openspec/ files are present.',
  ),
  sentence(
    'store/one-checkout',
    "One checkout per store id is supported, and '{id}' is already registered. Run openspec store unregister {id} first to register this checkout instead.",
  ),
  sentence(
    'store/unregister-entry',
    'Run "openspec store unregister <id>" if you only want to forget this local registry entry.',
  ),
  command('store/unregister-nested', 'openspec store unregister {id}'),
  sentence(
    'store/remove-nested',
    `Unregister or remove {text} first ({cmd}), or run "openspec store unregister {id}" to forget '{id}' without deleting files.`,
  ),
  sentence('store/register-missing', 'Run openspec store register /path/to/{id} --id {id}.'),
  // core/archive.js
  command('archive/rerun-dash', 'openspec archive {text}{store} -- {text}'),
  command('archive/name-required-json', 'openspec archive <change-name> --json{store}'),
  command(
    'archive/no-validate-yes',
    'openspec archive <change-name> --json --no-validate --yes{store}',
  ),
  command('archive/specs-yes', 'openspec archive <change-name> --json --yes{store}'),
  command('archive/name-required', 'openspec archive <change-name> {text}{store}'),
  // After every fixed shape: upstream's rerun command for a named change.
  command('archive/rerun', 'openspec archive {text} {text}{store}'),
  sentence('archive/tasks-rerun', 'Complete the tasks or rerun with {cmd}'),
  sentence(
    'archive/validation-failed',
    'Run openspec validate {id}{store} for details, fix the errors, or rerun with --no-validate.',
  ),
  sentence(
    'archive/validate-spec',
    'Run openspec validate {id}{store} after fixing the change deltas.',
  ),
  // core/specs-apply.js, core/validation/*
  sentence(
    'archive/purpose-too-brief',
    'characters; openspec validate --strict reports it as too brief.',
  ),
  sentence(
    'validation/purpose-placeholder',
    '(the sentence `openspec archive` writes for a new capability',
  ),
  sentence(
    'validation/no-deltas-tip',
    'Tip: run "openspec change show <change-id> --json --deltas-only" to inspect parsed deltas.',
    'Tip: run "cospec show <change-id> --json --deltas-only" to inspect parsed deltas.',
  ),
  sentence(
    'validation/zero-tasks',
    'so "openspec list" and "openspec status" report no work and "openspec archive" has nothing to flag as incomplete.',
  ),
]

const HOLE = /\{(id|text|store|sgr|cmd)\}/g

/** `upstream` with each `openspec <command>` spelled `cospec <command>`. */
function cospecSpelling(remedy: Remedy): string {
  return remedy.cospec ?? remedy.upstream.replace(/\bopenspec (?=[a-z{])/g, 'cospec ')
}

/** A template's literal segments and the holes between them. */
function split(template: string): { literals: string[]; holes: Hole[] } {
  const literals: string[] = []
  const holes: Hole[] = []
  let last = 0
  for (const m of template.matchAll(HOLE)) {
    literals.push(template.slice(last, m.index))
    holes.push(m[1] as Hole)
    last = m.index + m[0].length
  }
  literals.push(template.slice(last))
  return { literals, holes }
}

/** How a relayed answer quotes a sentence: as printed, or inside a JSON string. */
type Dialect = 'text' | 'json'

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const encode = (s: string, dialect: Dialect) =>
  dialect === 'json' ? JSON.stringify(s).slice(1, -1) : s

// A name or id: no whitespace, quote, backslash, paren or comma.
const TOKEN = String.raw`[^\s'"\x60\\(),]`

function holePattern(hole: Hole, dialect: Dialect, last: boolean): string {
  switch (hole) {
    case 'id':
      // A trailing name runs to the end of its token.
      return `${TOKEN}+?${last ? `(?!${TOKEN})` : ''}`
    case 'text':
      return dialect === 'json' ? String.raw`(?:[^"\\\n]|\\.)*?` : String.raw`[^\n]*?`
    case 'store':
      return `(?: --store ${TOKEN}+)?`
    case 'sgr':
      // The ESC that opens a color code, as printed or JSON-escaped.
      return dialect === 'json'
        ? String.raw`(?:\\u001b\[[0-9;]*m)?`
        : String.raw`(?:\x1b\[[0-9;]*m)?`
    case 'cmd':
      return commandList(dialect)
  }
}

/** A template's own pattern, each hole a capture group when `capture`. */
function body(template: string, dialect: Dialect, capture: boolean): string {
  const { literals, holes } = split(template)
  let out = escapeRegExp(encode(literals[0]!, dialect))
  holes.forEach((hole, i) => {
    const last = i === holes.length - 1 && literals[i + 1] === ''
    const inner = holePattern(hole, dialect, last)
    out += capture ? `(${inner})` : `(?:${inner})`
    out += escapeRegExp(encode(literals[i + 1]!, dialect))
  })
  return out
}

const COMMANDS = REMEDIES.filter((remedy) => remedy.kind === 'command')

/** One or more command remedies joined by `, then `, as a `{cmd}` hole holds them. */
function commandList(dialect: Dialect): string {
  const one = `(?:${COMMANDS.map((c) => body(c.upstream, dialect, false)).join('|')})`
  return `${one}(?:, then ${one})*`
}

/** Where a command remedy stands as a whole field. */
const FIELD: Record<Dialect, { before: string; after: string }> = {
  // A line of its own, after indentation, a list dash and a `Fix: `-style label.
  text: { before: String.raw`(?<=^[ \t]*(?:- )?(?:[A-Z][a-z]+: )?)`, after: String.raw`(?=\r?$)` },
  // A JSON string value.
  json: { before: String.raw`(?<=(?:^|[:[,])[ \t]*")`, after: '(?=")' },
}
/** Inside a `{cmd}` hole: between the hole's own `, then ` joins. */
const IN_HOLE = { before: '(?<=^|, then )', after: '(?=$|, then )' }

interface Compiled {
  readonly remedy: Remedy
  readonly holes: Hole[]
  readonly cospec: { literals: string[]; holes: Hole[] }
  readonly pattern: Record<Dialect, RegExp>
  readonly inHole?: Record<Dialect, RegExp>
}

function compile(remedy: Remedy): Compiled {
  const { holes } = split(remedy.upstream)
  const pattern = (dialect: Dialect, context?: { before: string; after: string }) => {
    const core = body(remedy.upstream, dialect, true)
    if (context !== undefined) return new RegExp(`${context.before}${core}${context.after}`, 'gm')
    // A sentence that starts or ends in a word does not start or end mid-word,
    // and one that ends in a `{text}` or `{cmd}` hole ends with its field.
    const before = /^[\w-]/.test(remedy.upstream) ? String.raw`(?<![\w-])` : ''
    const after = /\{(?:text|cmd)\}$/.test(remedy.upstream)
      ? FIELD[dialect].after
      : /[\w-]$/.test(remedy.upstream)
        ? String.raw`(?![\w-])`
        : ''
    return new RegExp(`${before}${core}${after}`, 'gm')
  }
  const compiled: Compiled = {
    remedy,
    holes,
    cospec: split(cospecSpelling(remedy)),
    pattern:
      remedy.kind === 'command'
        ? { text: pattern('text', FIELD.text), json: pattern('json', FIELD.json) }
        : { text: pattern('text'), json: pattern('json') },
    ...(remedy.kind === 'command'
      ? { inHole: { text: pattern('text', IN_HOLE), json: pattern('json', IN_HOLE) } }
      : {}),
  }
  return compiled
}

// Sentences first, longest first, so a sentence that ends in a `{cmd}` hole
// spells its command before the field rule could; then commands in table
// order, where a fixed shape precedes the general one it would also match.
const SENTENCES = REMEDIES.filter((r) => r.kind === 'sentence')
  .map(compile)
  .toSorted((a, b) => b.remedy.upstream.length - a.remedy.upstream.length)
const COMMAND_RULES = COMMANDS.map(compile)

function replacement(rule: Compiled, dialect: Dialect) {
  return (...args: unknown[]): string => {
    const captures = args.slice(1, 1 + rule.holes.length) as string[]
    const { literals, holes } = rule.cospec
    let out = encode(literals[0]!, dialect)
    holes.forEach((hole, i) => {
      const captured = captures[i] ?? ''
      out += hole === 'cmd' ? respellCommands(captured, dialect) : captured
      out += encode(literals[i + 1]!, dialect)
    })
    return out
  }
}

/** A `{cmd}` hole's content with each command it joins spelled through cospec. */
function respellCommands(hole: string, dialect: Dialect): string {
  return COMMAND_RULES.reduce(
    (out, rule) => out.replace(rule.inHole![dialect], replacement(rule, dialect)),
    hole,
  )
}

/**
 * `text` with each allowlisted upstream sentence it holds verbatim spelled
 * through cospec — as printed, or inside a JSON string — and every other byte
 * unchanged.
 */
export function respellRemedies(text: string): string {
  let out = text
  for (const dialect of ['text', 'json'] as const) {
    for (const rule of SENTENCES)
      out = out.replace(rule.pattern[dialect], replacement(rule, dialect))
    for (const rule of COMMAND_RULES)
      out = out.replace(rule.pattern[dialect], replacement(rule, dialect))
  }
  return out
}

/** Every remedy as a whole-value pattern, in `respellRemedies`' precedence. */
const WHOLE = [...SENTENCES, ...COMMAND_RULES].map((rule) => ({
  rule,
  whole: new RegExp(`^${body(rule.remedy.upstream, 'text', true)}$`),
}))

/** `value` spelled through cospec when it is, whole, one allowlisted remedy. */
function respellWhole(value: string): string | undefined {
  const hit = WHOLE.find(({ whole }) => whole.test(value))
  return hit === undefined ? undefined : value.replace(hit.whole, replacement(hit.rule, 'text'))
}

// The reference block's own lines, as the binary renders them: a
// `Fetch: <recipe>` or `Fix: <remedy>` line, or under `--json` (pretty-printed,
// one property a line) a `"fetch"` or `"fix"` property.
const REFERENCE_LINE = /^([ \t]*(?:Fetch|Fix): )(.*?)(\r?)$/gm
const REFERENCE_FIELD = /^([ \t]*"(?:fetch|fix)": )("(?:[^"\\\n]|\\.)*")(,?\r?)$/gm

/**
 * A successful `context` or `instructions` answer with only its reference
 * lines spelled through cospec: a `Fetch:`/`Fix:` line, or a `fetch`/`fix`
 * JSON property, whose whole value is one allowlisted remedy. Every other
 * byte — schema text, `config.yaml` context and rules, spec summaries, paths,
 * any other JSON value — is relayed as the binary wrote it.
 */
export function respellReferenceRemedies(text: string): string {
  return text
    .replace(REFERENCE_LINE, (line: string, label: string, value: string, cr: string) => {
      const spelled = respellWhole(value)
      return spelled === undefined ? line : `${label}${spelled}${cr}`
    })
    .replace(REFERENCE_FIELD, (line: string, key: string, literal: string, tail: string) => {
      const spelled = respellWhole(JSON.parse(literal) as string)
      return spelled === undefined ? line : `${key}${JSON.stringify(spelled)}${tail}`
    })
}
