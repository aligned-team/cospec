# Design

## Context

Every native cospec command grew its own argv reader: `args.includes` for
booleans, `args.indexOf(flag) + 1` for values, and
`args.find((a) => !a.startsWith('-'))` for the positional (`validate.ts`,
`status.ts`, `archive.ts`, `apply.ts`, `list.ts`, `init.ts`, `update.ts`,
`migrate.ts`, `sync-blockers.ts`, `context.ts`, `instructions.ts`, `new.ts`).
None of them has a notion of "not a flag I know", so an unknown option is
invisible and a value-taking one hands its value to the positional slot.
`cli.ts` only reports a `badOption` when the token comes before the command
name, and it takes the next non-dash token as the command, which is how
`cospec --store-path /x list` becomes `unknown command '/x'`.

`--help` and completion have the same root: `COMMANDS[].options` is a
pre-formatted string and `core/completions/spec.ts` extracts flags from it by
regex. Three surfaces (parser, help, completion) describe the same flags with no
shared source, which is why `show --help` can omit `--diff` while `show.ts`
forwards it fine.

The pinned binary's own behaviour, probed at
`apps/cli/node_modules/.bin/openspec` (1.13.1) in a throwaway root with
`NO_COLOR=1`:

| argv                                                                                                                                                                                                                                    | exit | stderr / stdout                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list --bogus`                                                                                                                                                                                                                          | 1    | `error: unknown option '--bogus'`                                                                                                                                                                                                 |
| `validate --typo x`                                                                                                                                                                                                                     | 1    | `error: unknown option '--typo'` then `(Did you mean --type?)`                                                                                                                                                                    |
| `status --schem custom`                                                                                                                                                                                                                 | 1    | `error: unknown option '--schem'` then `(Did you mean --schema?)`                                                                                                                                                                 |
| `list --sort`                                                                                                                                                                                                                           | 1    | `error: option '--sort <order>' argument missing`                                                                                                                                                                                 |
| `init --tools`                                                                                                                                                                                                                          | 1    | `error: option '--tools <tools>' argument missing`                                                                                                                                                                                |
| `list --store-path /x`, `--store-path=/x`                                                                                                                                                                                               | 1    | `✖ Error: --store-path is not supported. Register the path with openspec store register <path>, then select it with --store <id>.` then `Fix: openspec store register <path>, then rerun with --store <id>.`                      |
| `--store-path /x list`                                                                                                                                                                                                                  | 1    | `error: unknown option '--store-path'`                                                                                                                                                                                            |
| `list --json --store-path /x`                                                                                                                                                                                                           | 1    | stdout: `{"changes":[],"root":null,"status":[{"severity":"error","code":"store_path_not_supported","message":…,"target":"store.id","fix":…}]}`                                                                                    |
| `show foo --bogus`                                                                                                                                                                                                                      | 1    | `error: too many arguments for 'show'. Expected 1 argument but got 2.` (`allowUnknownOption(true)` turns the flag into a positional)                                                                                              |
| `show --bogus`                                                                                                                                                                                                                          | —    | runs; the flag is absorbed                                                                                                                                                                                                        |
| `view --json`                                                                                                                                                                                                                           | 1    | `error: unknown option '--json'`                                                                                                                                                                                                  |
| `templates --bogus`, `schemas --bogus`, `store list --bogus`, `config path --bogus`, `workset list --bogus`, `schema which --bogus`, `context --bogus`, `doctor --bogus`, `instructions proposal --bogus`, `completion install --bogus` | 1    | `error: unknown option '--bogus'`                                                                                                                                                                                                 |
| `list --changes`                                                                                                                                                                                                                        | 0    | lists                                                                                                                                                                                                                             |
| `archive c -y`                                                                                                                                                                                                                          | 1    | `✖ Error: Change 'c' not found…` (the flag parsed)                                                                                                                                                                                |
| `show --help`                                                                                                                                                                                                                           | 0    | lists `--diff`, `--requirements`, `--requirements-only` as "Alias for --deltas-only (deprecated, change)"                                                                                                                         |
| `change list`                                                                                                                                                                                                                           | 0    | stderr `Warning: The "openspec change ..." commands are deprecated. Prefer verb-first commands (e.g., "openspec list", "openspec validate --changes").` and `Warning: "openspec change list" is deprecated. Use "openspec list".` |
| `spec list`                                                                                                                                                                                                                             | 0    | stderr `Warning: The "openspec spec ..." commands are deprecated. Prefer verb-first commands (e.g., "openspec show", "openspec validate --specs").`                                                                               |

In the dist: the `--store-path` option is a hidden per-command
`Option('--store-path <path>', …).hideHelp()` in `dist/cli/index.js:38`,
registered explicitly on every root-scoped command so `allowUnknownOption`
cannot swallow it; `change`'s registry description reads "Manage OpenSpec change
proposals (deprecated)"; `spec`'s does not, and its warning is printed at
runtime by `dist/commands/spec.js:127`.

## Goals / Non-Goals

**Goals:**

- One table, one parser, one `--help` renderer and one completion spec, all
  reading the same rows.
- Upstream's accept-or-reject answer on every argv, on every command, with exit
  1 where upstream exits 1.
- A machine-checked statement of which pinned surfaces are reachable, where, and
  which are still owed to which change.

**Non-Goals:**

- Self-upgrading the wrapped OpenSpec binary (upstream `update`'s pre-action
  offer). This is the one named exception, recorded in `exceptions.yaml`.
- Implementing any pending flag. Each is owned by a later change:
  `upstream-spellings`, `passthrough-json-and-doctor`, `validation-parity`,
  `cli-surface-parity`, `archive-and-sync-parity`, `tool-matrix`,
  `github-copilot`, `completion-install`, `workflow-profiles`.
- The ancestor walk and store-pointer semantics of `resolveRoot`, and `--store`
  on `templates`/`schema` (`root-resolution-parity`, alongside).

## Decisions

1. **Parse policy per row: `table` or `forward`.** A `table` row is parsed by
   cospec and rejects anything undeclared: anything not in the table fails,
   except on forward commands, where the binary decides. A `forward` row is
   declared (for reachability, `--help`, completion); its wrapper may consume
   its own cospec-only flags (`store --no-cospec-init`, `config --scope` lifted
   into canonical position) and apply its own pre-spawn guards (`schema`'s
   canon-type destination refusal, `config`/`store`/`workset` subcommand
   checks), but every remaining token reaches the binary unchanged after
   global-flag threading and cospec adds no unknown-option rejection of its own.
   The threaded flags (`--json`, `--no-color`, `--store <id>`) go right after
   the command path, ahead of the user's argv (`threadedArgv`): commander gives
   a required-value option the next token whatever it looks like, so a flag
   appended after the user's argv became the value of a dangling `--path` and
   the binary ran (`store setup s1 --path` set a store up at `./--json`).
   Upstream's `templates` and `schema` subcommands declare no `--store`, so
   their rows carry `storeInArgv`: a `--store <id>` typed after the command name
   is never absorbed as cospec's global but reaches the binary where the user
   typed it, and the binary parses it in the user's order — naming an earlier
   unknown option (`templates --bogus --store st` says `--bogus`, as `openspec`
   does) or keeping an earlier `--store-path`'s redirect, raising a later flag's
   missing value, writing nothing. Threaded ahead of the argv it would be the
   first unknown option in every such run. A `--store` before the command name
   selects no root for these two: it is threaded right after the command path,
   where the binary refuses it as `unknown option '--store'` (an earlier missing
   value still first, as commander orders it), as
   `openspec --store <id> templates` does — and where a dangling flag cannot
   take it (appended after, `--store st schema init --description` created a
   schema named `st`). `root-resolution-parity` stops threading `--store` onto
   these two commands altogether, which retires the marker.
   - A forward wrapper relays the binary's answer, and the binary writes its
     remedies as bare `openspec <command>`. `relayRespelled`
     (`core/forward-relay.ts`) spells each of upstream's remedy sentences
     through cospec from one allowlist (`core/remedies.ts`, decision 13:
     `show`'s `Run "openspec status --change <id>"` and its noun-form
     `openspec change show / openspec spec show`, `view`'s
     `openspec list --changes`/`--specs`, the no-root `run openspec init`,
     legacy `status`'s `Next: openspec instructions …`, and every other sentence
     of the pin that names a command) as the cospec command of the same shape,
     or drops the clause where cospec has none (the noun-form commands), on a
     failed call, and on a successful `context` or `instructions` only on the
     remedies the binary generates for its references (the `Fetch:`/`Fix:` lines
     of its own reference block, located by structure; the parsed document's
     `fetch`/`fix` reference fields under `--json`) — a change or spec a
     successful `show` prints, and the schema text, config context and rules,
     spec summaries and paths around a reference block, are the user's own,
     relayed untouched. `view` respells its footer, and `status --change <id>`
     on a schema cospec does not type relays the binary's own status for it in
     text mode instead of pointing at bare `openspec status`. `forward` rows:
     `show`, `templates`, `schemas`, `schema`, `store`, `workset`, `config`.
     `feedback` is a `table` row: `parseFeedbackArgs` already rejects unknown
     options, so the shared parser replaces it and the `--upstream` relay
     rebuilds its argv from the parsed values as it does today. Everything else
     is `table`. Upstream's per-command `--json` and `--store` are cospec
     globals (`GLOBAL_OPTIONS`, stripped in `cli.ts`); the reachability test
     resolves them for every row through the global list rather than per-row
     duplicates. Each `table` row also declares `json: 'accepted' | 'refused'`:
     whether the command honours the global `--json` (decision 10).
   - `parse: 'forward'` is the per-command marker the reachability test reads
     (the roadmap owner's ruling): a forward row's flags and positionals count
     as reached by delegation to the binary, whether declared or not, and a
     separate check keeps its declarations complete at the pin for `--help` and
     completion. A forward row carries no pending surface — the binary answers
     every one. The acceptance evidence is the differential's `show --bogus` and
     `show foo --bogus` rows, which assert cospec's stdout, stderr and exit code
     equal the binary's; every forward row has a differential row.
   - Why not table-parse everything: `openspec show` sets
     `allowUnknownOption(true)`, so upstream _accepts_ `show --bogus`. A
     cospec-side rejection there would be a regression against the binary, not
     parity with it. More generally, a forwarded command on a newer in-range
     binary (`>=1.0.0 <2.0.0`) keeps working when upstream adds a flag; a
     pre-rejecting table would break it until cospec caught up. The binary is
     the unknown-option authority on the surfaces it owns, and it already prints
     `error: unknown option '<x>'` with exit 1.
   - Why not forward everything: a `table` command does cospec's own work
     (`validate`, `apply`, `archive`, `init`, …) and never reaches the binary
     with the user's argv, so nothing else can reject for it. `context`, `view`
     and `instructions` build their wrapped argv explicitly and drop the rest
     today, so they are `table` too (`instructions --schema` is pending on
     `upstream-spellings`, which makes it forward every handled flag).
   - Rejected alternative: a third policy "table-then-forward" that rejects
     unknowns locally and forwards the rest. It would re-create the `show`
     regression and add nothing the binary does not already do.
   - `show`'s one pre-spawn guard (`commands/show.ts` `binaryAnswers`) answers
     only an argv commander would leave with no item — where the binary prints
     its "Nothing to show" screen of bare `openspec` commands — and reads the
     argv as commander does: an undeclared option is the item, a value-taking
     flag consumes its value, and a short option is split with the table's
     `splitShortCluster` (a value-taking short takes the rest of its token, so
     `-r1`, `-r=1` and `-rr` are `-r` with a value and no item; a boolean short
     leaves `-<rest>` as the next token — dormant at the pin, where `-r` is
     `show`'s only short, and kept so a newer in-range binary's boolean short
     reads right). Round 14 added the split: before it, those three reached the
     binary's screen.
2. **`--store-path` is refused on every command, in both positions.** A
   forwarded `--store-path` would produce upstream's text, which names
   `openspec store register` — bare `openspec` in shipped output, which the
   output-side rule forbids. cospec prints upstream's text with `openspec`
   respelled to `cospec`, and under `--json` the same envelope shape upstream
   emits (`status[0].code` `store_path_not_supported`, `target` `store.id`,
   `message`, `fix`) respelled the same way. Upstream prints a plain
   `error: unknown option '--store-path'` in the pre-command position; cospec
   prints the redirect there too, because the redirect is the more useful answer
   and the differential still agrees (both reject, exit 1). Where the refusal
   lands follows the binary, which refuses a declared `--store-path` in its
   action, after the whole parse: on a `table` row marked `declaresStorePath`
   the parser records the first `--store-path` (consuming its value; with none,
   it is refused while parsing like any missing value) and answers the redirect
   only after the row's unknown-option, pending and too-many-arguments checks
   pass. On a `table` row without the marker it is an unknown option that takes
   nothing, recorded in scan order like any other: an earlier unknown option
   answers first, help outranks it (`cospec init --store-path --help` prints
   `init`'s help, exit 0, as the binary does), and the redirect goes to stderr
   even under `--json`, as commander's refusal precedes any output. On a
   `forward` row the binary is the `--store-path` authority; cospec respells the
   relay. `cli.ts` neither scans for the token nor pre-decides anything: the
   row's argv reaches its wrapper unchanged, and the binary refuses a
   post-command `--store-path` itself, in its own order, never running the
   command when the token is in option position — and running it when the token
   is another flag's value (`schema init s1 --description --store-path` creates
   `s1`, exit 0, in both tools; `show --type --store-path c1` looks up `c1`).
   The wrapper's only job is output-side (`core/forward-relay.ts`): when a
   failed call's answer is the binary's own `--store-path` refusal — the
   redirect, its `--json` envelope, or commander's
   `unknown option '--store-path'` / `argument missing` — it prints cospec's
   redirect in its place, a document only where the binary emitted its envelope
   for a `--json` caller (commander's plain refusal is text, `--json` or not); a
   call that exited 0 ran its command and is never reclassified. Each forward
   wrapper's parse-rejection relay (`isParseRejection`) recognises the redirect
   shape as well as every refusal commander 14 raises while it parses —
   enumerated from the pin's `lib/command.js`: unknown option, unknown command,
   `option … argument missing`, `missing required argument`, too many arguments
   (the five the pin reaches: it declares no `.choices()`, `.conflicts()`,
   required option, argument parser or env-backed option), and the
   invalid-argument, invalid-env-value, invalid-command-argument,
   required-option and conflicting-option shapes a newer in-range binary could
   raise — so a stderr-only refusal under `--json` (`cospec store unregister`
   with no id) is relayed, never reported as a wrapped-call violation. The
   terminal-handover pre-spawn check prints the redirect as text even under
   `--json`: neither `config` nor `workset` declares `--store-path` upstream, so
   the binary's refusal there is commander's, before any output. The one
   exception is the terminal-handover class (`config edit`, `config profile`
   with no preset, `config reset --all` without `-y`, `workset open`): its
   inherited stdio leaves nothing to respell, so for that closed set only the
   wrapper checks statically, from the row's declared flags, whether
   `--store-path` is in option position — a value-taking flag's next token is
   its value, an earlier undeclared option is the binary's to refuse first, `--`
   ends the scan — and prints the redirect without spawning, so the terminal is
   never taken. Rejected: asking the binary first on any argv carrying a raw
   `--store-path` token (this decision's previous form). It assumed the binary
   refuses every such argv; when the token is another flag's value the binary
   runs the command, mutates and exits 0, and cospec reported a false failure
   naming bare `openspec`. After a leading `--`, `--store-path` is an operand
   and nothing intercepts it: `cospec -- config --store-path /x` is `config`'s
   unknown subcommand, as `openspec -- config --store-path /x` is. After the
   command name a space-form `--store-path` takes the next token as its value
   whatever it looks like, as commander does, so phase B keeps the pair together
   and neither absorbs a global flag there nor reads a help flag:
   `cospec list --store-path --json` is the text redirect with no document, and
   `cospec show c1 --store-path --store foo` the binary's too many arguments.
   That holds only where the upstream command declares `--store-path` — the
   per-row `declaresStorePath` marker, set on `list`, `view`, `archive`,
   `validate`, `status`, `instructions`, `new`, `context` and `doctor` (table)
   and `show` and `schemas` (forward), read from the pin's
   `hiddenStorePathOption()` calls in `dist/cli/index.js` and the options
   `commands/context.js` and `commands/doctor.js` add. Upstream `init`,
   `update`, `completion`, `feedback`, `config`, `schema`, `workset`, `store`
   and `templates` refuse it as an unknown option that takes nothing, and a
   cospec-only command (`apply`, `migrate`, `sync-blockers`, `check-commit`,
   `__complete`) has no upstream declaration either, so a help flag after it is
   help there (`cospec workset list --store-path -h` prints cospec's
   `workset list` help, where pairing them had relayed the binary's own help
   screen, bare `openspec` included). An option where a forward row's subcommand
   belongs (`cospec config --store-path /x`, `cospec schema --bogus`) is the
   binary's to refuse at the command's level, so the wrapper relays it
   (`relayCommandLevel`) instead of refusing an unknown subcommand; an operand
   that looks like an option after a leading `--` keeps that `--`, so
   `cospec -- config --store-path /x` stays `config`'s unknown subcommand.
   Before the command name the program level declares no `--store-path`, so it
   takes no value and help outranks it (`--store-path --help list` is the
   program's help). This is per-level parsing, not a cross-phase priority flag:
   neither phase reads the other's tokens. The precedence matrix compares the
   refusal's kind, counting any refusal whose subject is `--store-path` as the
   same kind in either dialect, so it measures where the refusal lands, not its
   wording.
3. **Refusal formats.** Unknown option: `cospec <command>: unknown option '<x>'`
   (the `parseFeedbackArgs` precedent), followed on the next line by
   `Did you mean '<flag>'?` when `closest()` (the Levenshtein helper `cli.ts`
   already uses for command names, threshold 3) finds one — cospec's existing
   suggestion style rather than upstream's parenthesised form, so command and
   flag suggestions read the same. Missing value:
   `cospec <command>: option '<flag> <placeholder>' argument missing`, the shape
   upstream uses, prefixed the cospec way. Pending:
   `cospec <command>: '<flag>' is not supported yet`. All three exit 1. A
   required positional with nothing given is worded as commander words it,
   prefixed the same way
   (`cospec feedback: missing required argument 'message'`), with the command's
   usage on the next line
   (`cospec feedback: usage — cospec feedback <message>`), and is the parser's,
   on every `table` row: `PositionalSpec`'s `required` is enforced, not display
   only, checked after the scan's unknown options and before too many arguments
   and a declared `--store-path` — the order of commander's `_parseCommand`
   (`unknownOption`, then `_checkNumberOfArguments`: missing before excess) and
   before any action — so `new feat --store-path /x` refuses the slug, as the
   pin's `new change --store-path /x` refuses `name` (probed). Text under
   `--json`: commander emits no document there. A `compound` marker on `new`'s
   `type` (separator `:`) lets `"<type>: <description>"` fill the slug. Arity
   follows the pin where the positional is upstream's and required there
   (`feedback <message>`, `__complete <type>`); upstream's
   `archive [change-name]` and `instructions [artifact]` are optional (its
   actions prompt or pick), but cospec's actions have always required them, so
   their rows keep `required: true` and their matrix rows state cospec's answer
   (`archive --store-path /x` refuses the change where the binary answers the
   redirect). `check-commit`'s message file is declared optional, the truth
   about an advisory hook that exits 0 without one. The modules' own
   missing-argument branches (`new`'s usage refusal, the "is required" of
   `apply`, `archive`, `migrate` and `instructions`, `feedback`'s and
   `__complete`'s missing message or source) became unreachable and are removed.
   `new` relays a failed wrapped call's reason with only upstream's own remedy
   sentences respelled (decision 13) and nothing from a schema load error's
   `Failed to parse schema at '…':` / `Invalid schema at '…':` payload on (the
   binary's `resolver.js` shapes), which quotes the user's own schema. A
   short-option cluster splits as commander's `parseOptions` splits it, one step
   at a time: only when its first letter is a short flag the parsing surface
   declares (a boolean leaves `-<rest>` as the next token, a value-taking flag
   takes `<rest>` as its value); an undeclared first letter leaves the whole
   token one unknown option, and `-h` never starts a split because commander
   keeps help out of its option list (`-hy` is unknown). Phase B splits on a
   `table` row and rescans the pieces, so a split-out `-h` is help and a
   split-out value stays paired; on a `forward` row the binary gets the cluster
   as typed and phase B answers only a `-h` the split would reach, with cospec's
   help (`cospec config reset -yh` had relayed `Usage: openspec config reset`).
   `-V` is the program's option and the program level parses the whole argv, so
   any `-V…` cluster before a `--` is the version (`cospec list -Vh`), while
   `-yV` on `archive` splits to the command's unknown `-V`. A cospec-only
   positional that spells an upstream flag declares `displacedBy`: `status`'s
   change is displaced by `--change` and `--all`, so beside either it is the
   excess argument upstream's commander refuses
   (`Expected 0 arguments but got 1.`) instead of being dropped.
4. **Three accepted no-ops, no more.** `init --no-animation` (cospec has no
   animation), `archive -y`/`--yes` (cospec never prompts) and `list --changes`
   (the default). `validate --no-interactive` and `show --no-interactive` were
   already accepted; they stay handled. A no-op is only for a flag whose
   requested behaviour cospec already has by construction — every other upstream
   flag is either handled or pending, so the table can never hide a real gap as
   a no-op.
5. **Positionals resolve by presence, not by display name or optionality.** The
   registry names `item-name`, `change-name`, `path`; cospec's usage strings say
   `<item>`, `<change>`, `[path]`. The reachability test matches positional
   slots by index on the same command path. Optionality is not a reachability
   entry: `openspec archive` with no name opens an interactive picker, which no
   script can drive, and non-interactively it errors as cospec does.
6. **The four registry sources are the walk; the hidden surfaces get explicit
   fixtures.** `experimental` (hidden alias), `--store-path` (hidden per-command
   option), `powershell` (`positionalType: 'shell'` with no `values`), the
   hidden `__complete <type>` command's `schemas` and `archived-changes` types,
   `new change --initiative` / `--areas` (hidden-help options that print a
   removed-option error), and commander's implicit program-level
   `help [command]` (`openspec help`, `openspec help list`) are not in
   `COMMAND_REGISTRY`, `AI_TOOLS`, `TOOL_ID_ALIASES` or `ALL_WORKFLOWS`. The
   differential fixture covers `--store-path` directly. The rest are
   reachability fixtures, each added to the walk only after a probe of the
   pinned binary confirms it: `experimental` and `powershell` are owed by
   `upstream-spellings` and `completion-install`, `__complete schemas` /
   `archived-changes` by `cli-surface-parity` (cospec's `__complete` marks both
   values pending), each listed in `parity-pending.yaml` under a `source: cli`
   marker; `--initiative` and `--areas` resolve to the pending `new change`
   subtree. `help` is owed by `upstream-spellings`, which owns upstream
   spellings and `cli.ts`'s command list: one `source: cli` command entry whose
   subtree covers the `[command]` positional (a hidden fixture too, probed with
   `openspec help list`). Until then cospec answers `cospec help` as an unknown
   command, exit 1 — there is no `help` row to refuse it with
   `not supported yet`, and the reachability gate requires that nothing on the
   cospec side resolves a pending top-level command, as with `experimental` —
   and the precedence matrix pins both answers in `pending` rows. So the pending
   list is complete even though the walk cannot produce these surfaces.
7. **Differential classification, not exit-code equality.** Each run is classed
   `parse-rejected` when stderr matches one of the four refusal shapes (unknown
   option, argument missing, too many arguments, `--store-path`) or `parsed`
   otherwise. A cospec run on a `json: 'refused'` row counts as `parse-rejected`
   when stdout is its one-document `--json` refusal envelope (decision 10), so
   `view --json` lands in the same class as upstream's
   `error: unknown option '--json'`. Both tools must land in the same class, and
   exit codes must be equal only when both are parse-rejected.
   `validate --type change x` exits 1 in both tools today for different reasons
   (pending versus unknown item); the class split is what keeps that assertion
   honest. Fixture rows carry `expect: same | cospec-only | pending`.
8. **Data files are YAML under canon and read by tests and docs.**
   `aliases.yaml`, `exceptions.yaml`, `deprecated.yaml` live in
   `apps/cli/src/canon/parity/`; `parity-pending.yaml` lives beside the test
   that reads it, because it is test state, not canon. `apps/docs` has no YAML
   parser and the isolated linker (`bunfig.toml`) keeps it from reaching
   `apps/cli`'s, so `apps/docs/package.json` gains `yaml` `2.9.0` (exact, the
   same version `apps/cli` pins) and `bun.lock` is regenerated in the same task.
   A VitePress `defineLoader` in `apps/docs/.vitepress/parity.data.ts` reads the
   three files with `watch` so a dev server re-renders on edit, and the page
   renders them through a `<script setup>` import of the loader's `data`. The
   docs build fails if any file is unreadable, which is the intended coupling.
9. **Deprecation is verified, not asserted.** `deprecated.yaml` entries count
   only when the test finds the mark: `change` by its registry description,
   `spec` by running `openspec spec list` in the oracle fixture and matching the
   full warning line in `deprecated.yaml` against its stderr verbatim. A pin
   bump that un-deprecates either turns the entry into a hard failure.
10. **A `table` row declares whether it accepts `--json`.** `--json` is a cospec
    global stripped in `cli.ts`, so a command that never reads `ctx.flags.json`
    silently accepts and ignores it. `cospec view --json` does exactly that
    today, while the pinned binary rejects `view --json` with
    `error: unknown option '--json'` and exit 1. A row marked `json: 'refused'`
    refuses `--json` with exactly one JSON document on stdout and exit 1,
    following the `completion.ts` precedent
    (`{version: 1, command, ok: false, message}`): a `--json` caller is entitled
    to one parseable document even on refusal, and a stderr-only refusal would
    leave it nothing to parse. `view` and `completion` are the `json: 'refused'`
    rows; every other `table` row is `json: 'accepted'`. The envelope is built
    by one shared `jsonRefusal(command, message)` helper in `command-table.ts`,
    which `completion.ts` adopts in place of its inline copy with no change to
    its output. `forward` rows carry no marking: the binary answers `--json` for
    the surfaces it owns. Each `table` row declares
    `store: 'accepted' | 'refused'` the same way. `--store` is a cospec global
    too, so `init --store nosuch` absorbed it and scaffolded the cwd, where the
    binary refuses `init --store` as an unknown option. A `refused` row —
    `init`, `update`, `completion`, `feedback`, `check-commit`, the rows whose
    module never resolves a root — keeps a post-command `--store` in the argv,
    so the table parser refuses it as an unknown option in commander's order (a
    missing value first, help wins), never suggesting `--store` itself; a
    program-level `--store` is refused with the row's other parse refusals once
    the row is known. Its `--help` omits `--store`, and completion offers each
    command only the globals its row accepts after the command name (all of them
    before it). A unit test derives the marking from each module's source
    (`resolveRoot`, the passthrough helpers or `flags.store`), so a module that
    starts reading a root cannot stay refused.
11. **Reachability is two-way.** The walk proves every pinned entry resolves to
    exactly one place, and the reverse is asserted too: every table flag or
    value marked `pending` has exactly one `parity-pending.yaml` entry with the
    same owner slug, and every `parity-pending.yaml` entry names a surface that
    the walk produced (or a `source: cli` fixture from decision 6) and that the
    table marks `pending` for that owner. A stale YAML entry — its surface now
    handled, gone from the pin, or pending under a different owner — fails the
    test, so a later change that implements a flag must delete its entry in the
    same commit.
12. **Global flags resolve in two phases, never ranked across them.** Three
    review rounds each found a new precedence bug in a one-pass loop that ranked
    program-level and command-level answers against each other with a growing
    set of priority flags (`cospec --help list --store` refused the missing
    value instead of printing help; `cospec --store-path /x list --store` gave
    the missing-value error instead of the redirect; `cospec -- config help`
    exited 1). Upstream's commander does not rank across levels: its program
    level parses the whole argv for its own options, stops on its own answer,
    and only a dispatched subcommand parses its argv. `cli.ts` mirrors that. A
    `-V`/`--version` anywhere before `--` answers first (a program-level option
    commander honours wherever it appears). Phase A reads the tokens before the
    command name or a leading `--`: a missing global value, then the first help
    flag or undeclared option (help anywhere in the undispatched argv prints the
    program's help; otherwise the option is refused, `--store-path` with its
    redirect); an unknown command is never dispatched either, so a help flag
    after it prints the program's help. Phase B is the row's own parse in
    commander's per-level order — missing value, help, the row's other parse
    refusals, empty value, run — and a `forward` row's argv reaches the binary
    unchanged but for the threaded globals. Within a `table` row's parse the
    order is commander's scan: it raises a missing value the moment it meets it
    but collects an unknown option and reports it after the scan, so the parser
    records the first unknown option or pending flag and keeps scanning; a
    trailing value-taking flag (`--store-path` included, answered with its
    redirect) returns first, then the recorded refusal, then too many arguments,
    then `--store-path` (`cospec status --help --bogus --change` refuses the
    missing `--change`, as upstream does). After a leading `--` the first
    operand is dispatched as the subcommand (commander's implicit `help`
    included, on rows that have it: the new `helpSubcommand: false` marks
    `store` and `workset`, whose upstream refuses `help`), replacing the old
    "unless it starts with `-`" heuristic. The same routing applies to a `--`
    that is the first token to reach a row with subcommands (`config -- path`
    runs `config path`, `config --` is a bare `config`), and a bare `help` is
    the help token when it is the first token to reach the row's argv, after any
    absorbed global flag (`config --no-color help`), not only at the first argv
    position. Phase B also keeps a space-form value-taking flag the row declares
    (or its subcommand declares, once the first positional names one) together
    with its next token, whatever that token looks like, as commander does:
    `cospec status --change --help` looks up a change named `--help` and
    `cospec templates --schema --json` hands both tokens to the binary. Before
    reading the row's argv it takes out every `--no-color` before the first
    `--`, because upstream's program level extracts that option wherever it sits
    before commander dispatches (`openspec status --change --no-color` refuses
    the missing value); past a `--` a flag took as its value the program level
    has stopped, so `--no-color` and `--version` there are the command's unknown
    options. Rejected: a fixed list of global tokens that may never be a value —
    the binary proves only `--no-color` and the version flags are program-level;
    `--json`, `--store` and `-h`/`--help` are each command's own and are values
    there. No cross-phase priority flag is added for any of these (the routing,
    the help token, the scan order, the value pairs): each is phase B's own
    reading of the row's argv. A precedence matrix
    (`apps/cli/test/contract/precedence-matrix.test.ts`) runs every row against
    the binary under Node, which keeps a leading `--` intact, and compares a
    finer outcome than decision 7's split (version, whose help, unknown command,
    parse-rejected, parsed) plus the exit code; cospec-only rows state their
    intended outcome. Kept on purpose: the `--store-path` redirect in both
    positions (and its `--json` document), `view --json`'s refusal document, no
    unknown-option refusal of cospec's own on `forward` rows,
    `cospec <command> help` as help on every `table` row, and a bare `cospec`
    (or `cospec --`) printing help with exit 0 where upstream exits 1.

13. **Relayed remedies: an allowlist of upstream's exact sentences, never a
    pattern over free text.** `core/remedies.ts` holds every sentence of the
    pinned dist that names a bare `openspec <command>`, each with its cospec
    spelling; a relay rewrites an answer only where it holds one verbatim. A
    sentence's holes (a name, a path, a list — upstream's `${…}`) are matched up
    to the sentence's own next literal and re-emitted unread, so nothing the
    user owns is ever rewritten, whatever it reads like. A bare command upstream
    prints as a whole field (`Fix: openspec store register …`, a `fix`/`command`
    JSON value, an indented example line) is matched only as that field, and
    inside a sentence's `{cmd}` hole (`Create one with: <hint>`). Each sentence
    also matches its JSON-escaped form, for `--json` messages. `new` keeps one
    cut: a schema load error's payload is the user's schema, relayed as is even
    where it copies an upstream sentence. On success, `context` and
    `instructions` respell only the remedies the binary generates for its
    references (`respellReferenceRemedies`), each whole value one allowlisted
    remedy, and locate them by the binary's structure, never by what a line
    says. Text `instructions`: the `  Fetch:` and `  Fix:` entry lines, after a
    `Store <store-id> (<root>):` or `Store <store-id>: <message>` header
    (`renderEntryLines`), inside the `<referenced_stores>` element that
    `printInstructionsText` prints next in its layout — the `<artifact …>` line,
    a blank line, a blocked artifact's `<warning>` element when there is one,
    the `<task>` element, the `<project_context>` element when there is one —
    through its `</referenced_stores>`; an answer of any other shape
    (`instructions archive`'s inputs, which print the context raw) has no block.
    The layout is the anchor because upstream's `escapeEnvelopeTags` escapes
    `</task>` and `</project_context>` in the prose it frames (description,
    context, rules, instruction, template) but not `<referenced_stores>`: a
    template or context can print a lookalike block, a `Store` header or a
    `Fix:` line anywhere, and it is relayed as written. The one value printed
    unescaped ahead of the block is the blocked-artifact `Missing:` list, whose
    entries are the artifact ids of the user's own schema (`z.string().min(1)`,
    no line-break check upstream). Text `context` (`printHumanWorkingSet`, which
    prints no repo prose): the `    Fetch:` lines of the `Referenced stores`
    section and the `    Fix:`/`  Fix:` lines of
    `Not available on this machine`, each section opened by its exact header
    line after a blank one and closed by the next blank line. `--json`: the
    document, from its first line that opens with `{` (upstream's
    `FileSystemUtils` logs a non-ENOENT stat failure to stdout through
    `console.debug`, and that line is relayed as written), is parsed — an exit-0
    answer with no JSON document fails with
    `the wrapped OpenSpec call answered --json with no JSON document`, exit 1 —
    and only its reference fields — `references[].fetch` and
    `references[].status[].fix` for `instructions` (`assembleReferenceIndex`),
    `members[].fetch`, `members[].status[].fix` and `status[].fix` for `context`
    (`assembleWorkingSet`) — are re-encoded in place with `JSON.stringify`,
    every other byte of the document the binary's; no pattern runs over a text
    answer's lines as JSON. `relayRespelled` takes the answering command
    (`'context'`/`'instructions'`) in place of round 14's `'references'`.
    Everything else on success (the schema template and instruction,
    `config.yaml` context and rules, a referenced spec's Purpose summary, the
    `Write to:` path, every other `--json` value such as `root.path` and
    `changeDir`, and stderr) is relayed byte-for-byte; round 13's whole-stdout
    respell rewrote each of those wherever it held an allowlisted sentence, and
    round 14's line patterns (`Fetch:`/`Fix:` at any indent, a `"fetch"`/`"fix"`
    line in any answer) still rewrote a user line that read like one. `show`
    stays verbatim: a successful `show` prints the user's change or spec, which
    may quote upstream's sentences word for word (this repo's own specs do). A
    legacy schema's instruction text (the package's `schemas/spec-driven`,
    outside `dist/`) is schema content and is relayed as the binary prints it.
    In a relayed failure, user text that reproduces a whole upstream remedy
    sentence verbatim outside the payload cut is respelled. Enforced by
    `test/contract/remedy-enumeration.test.ts`, which reads the pinned dist and
    fails on any line naming `openspec <command>` that is neither an allowlist
    entry nor listed (`test/contract/support/remedy-sources.ts`) with the reason
    no cospec relay prints it (only `init`/`update` run it, a terminal handover
    prints it, cospec answers first, a noun-form command cospec lacks, …), keyed
    by module and trimmed line, never line number. Rejected, after rounds 10–12:
    respelling `openspec <table command>` after a remedy lead-in (`Run`, `with`,
    `:`, `(`, a backtick), masking single-quoted spans, and cutting the reason
    at `already exists at` — each left a free-text case (an apostrophe ends a
    quoted span early; an unquoted path in
    `Invalid store declaration in <path>: …`; `(openspec list)` in a directory
    name). Entries for sentences only `store`/`workset`/`config`/`schema`/
    `validate`/`archive`/`doctor` relay are data here; wiring those relays is
    owned by the changes that own those files.

### Initial data-file contents

`aliases.yaml` — cospec spellings of upstream names that already work:

```yaml
- upstream: { kind: workflow, id: sync }
  cospec: sync-specs
```

`exceptions.yaml` — exactly one entry:

```yaml
- upstream: { kind: command, path: [update], surface: self-upgrade-offer }
  reason: >-
    upstream update offers to install a newer OpenSpec and re-run; cospec pins
    the wrapped binary and the contract suite runs against that pin.
```

`deprecated.yaml` — the two noun groups, with how the binary marks each:

```yaml
- upstream: { kind: command, path: [change] }
  mark: registry-description
  subcommands: [show, list, validate]
- upstream: { kind: command, path: [spec] }
  mark: runtime-stderr
  warning: >-
    Warning: The "openspec spec ..." commands are deprecated. Prefer verb-first
    commands (e.g., "openspec show", "openspec validate --specs").
  subcommands: [show, list, validate]
```

`parity-pending.yaml` — derived by diffing the four pinned sources against
today's cospec (`apps/cli/src/cli.ts` `COMMANDS`, the command modules,
`harness/adapters.ts`, `canon/workflows/harness.yaml`). Every entry carries its
owner:

| entry                                                                                                                                                                                                                                                                                                                                                                                                | owner                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `init --tools <list>` (alias of `--harness`)                                                                                                                                                                                                                                                                                                                                                         | `upstream-spellings`      |
| `new change <name>` (the whole subtree: `--description`, `--goal`, `--schema`, `--json`, `--store`, hidden `--initiative`/`--areas`)                                                                                                                                                                                                                                                                 | `upstream-spellings`      |
| `update [path]` positional                                                                                                                                                                                                                                                                                                                                                                           | `upstream-spellings`      |
| `completion generate [shell]`                                                                                                                                                                                                                                                                                                                                                                        | `upstream-spellings`      |
| `instructions --schema <name>`                                                                                                                                                                                                                                                                                                                                                                       | `upstream-spellings`      |
| `experimental` (source: cli, hidden)                                                                                                                                                                                                                                                                                                                                                                 | `upstream-spellings`      |
| `help [command]` (source: cli, hidden: commander's program-level help)                                                                                                                                                                                                                                                                                                                               | `upstream-spellings`      |
| `list --sort <recent\|name>` and its values                                                                                                                                                                                                                                                                                                                                                          | `cli-surface-parity`      |
| `status --schema <name>`                                                                                                                                                                                                                                                                                                                                                                             | `cli-surface-parity`      |
| `validate --type <change\|spec>` and its values                                                                                                                                                                                                                                                                                                                                                      | `cli-surface-parity`      |
| `validate --report <full\|findings>` and its values                                                                                                                                                                                                                                                                                                                                                  | `cli-surface-parity`      |
| `validate --concurrency <n>`                                                                                                                                                                                                                                                                                                                                                                         | `cli-surface-parity`      |
| `__complete` types `schemas`, `archived-changes` (source: cli, hidden)                                                                                                                                                                                                                                                                                                                               | `cli-surface-parity`      |
| `archive --no-validate`                                                                                                                                                                                                                                                                                                                                                                              | `archive-and-sync-parity` |
| `AI_TOOLS`: `amazon-q`, `antigravity`, `auggie`, `bob`, `cline`, `command-code`, `codeartsagent`, `devin`, `forgecode`, `codebuddy`, `continue`, `costrict`, `crush`, `cursor`, `factory`, `gemini`, `hermes`, `iflow`, `junie`, `kilocode`, `kimi`, `kiro`, `lingma`, `minimax-code`, `vibe`, `oh-my-pi`, `pi`, `codeassistant`, `qoder`, `qwen`, `rovodev`, `roocode`, `trae`, `zed`, `zcode` (35) | `tool-matrix`             |
| `TOOL_ID_ALIASES`: `windsurf` → `devin`                                                                                                                                                                                                                                                                                                                                                              | `tool-matrix`             |
| `AI_TOOLS`: `github-copilot`                                                                                                                                                                                                                                                                                                                                                                         | `github-copilot`          |
| `init --copilot-cloud`, `init --no-copilot-cloud`                                                                                                                                                                                                                                                                                                                                                    | `github-copilot`          |
| `completion install [shell] --verbose`                                                                                                                                                                                                                                                                                                                                                               | `completion-install`      |
| `completion uninstall [shell] -y/--yes`                                                                                                                                                                                                                                                                                                                                                              | `completion-install`      |
| `completion` shell value `powershell` (source: cli)                                                                                                                                                                                                                                                                                                                                                  | `completion-install`      |
| `init --profile <core\|custom>` and its values                                                                                                                                                                                                                                                                                                                                                       | `workflow-profiles`       |
| `init --language <language>`                                                                                                                                                                                                                                                                                                                                                                         | `workflow-profiles`       |

Every per-command `--json` and `--store` in the registry resolves through
cospec's global flags, which apply to every row. Everything else in the four
sources resolves to the table today: `init [path] --force`; `update --force`;
`list --specs --json --store`; `view --store`;
`validate [item] --all --changes --specs --archived --strict --json --no-interactive --store`;
every `show` flag; `archive [change] --skip-specs --json --store`;
`status --change --all --json --store`;
`instructions [artifact] --change --json --store`; `templates --schema --json`;
`schemas --json --store`; every `store`, `workset`, `config` and `schema`
subcommand, positional and flag (all forwarded verbatim by their wrappers);
`context --json --store --code-workspace --force`; `doctor --json --store`;
`feedback <message> --body`; `AI_TOOLS` `claude`, `codex`, `opencode`, `agents`
(through `HARNESS_NAMES`); all twelve `ALL_WORKFLOWS` ids (eleven by name,
`sync` through the alias). `change` and `spec` resolve to `deprecated.yaml`. No
entry in the four sources is owned by no change. `archive -y/--yes`,
`init --no-animation` and `list --changes` resolve to the table as accepted
no-ops from this change on.

## Risks / Trade-offs

- **[A `forward` wrapper that quietly re-parses]** → `store.ts`, `config.ts`,
  `workset.ts`, `schema.ts` and `show.ts` all pass their remaining argv to the
  binary verbatim today (confirmed by reading each). The differential fixture
  includes one unknown-option row per forwarded command so a future local parse
  that drops tokens fails the contract suite.
- **[A pending marking that outlives its owner]** → each later change's
  acceptance evidence includes its entries leaving `parity-pending.yaml`; the
  reachability test fails on an entry that is both pending and handled.
- **[Scripts that passed a now-rejected flag]** → the breaking list in the
  proposal names each upstream flag that moves from silently ignored to exit 1,
  and the message says `not supported yet`, which is a better answer than
  scaffolding `./fr`.
- **[`--store-path` text drifting from upstream]** → the differential row for
  `--store-path` asserts cospec's message equals upstream's with `openspec` →
  `cospec` applied and nothing else, taken from the oracle at test time rather
  than a hand-typed copy.
- **[The docs loader and the test reading different files]** → they read the
  same paths; the docs build is gated on every PR that touches `apps/docs`, and
  the verification ledger asserts the rendered pending list matches the YAML
  entry for entry.
- **[Deep-importing the pinned dist]** → tests only, never runtime, and the same
  pattern `version-tripwire.test.ts` already uses to walk the shipped source. A
  dist reshuffle in a pin bump fails the reachability test first, which is the
  intended tripwire.

## Operational surface

- **Where it runs**: the `cospec` process itself, on the user's machine or a CI
  runner; no server, no bind address, no container, no secrets. The contract
  tests run on the ordinary CI runner alongside the existing contract suite and
  read only the pinned dist under `apps/cli/node_modules`.
- **Binary versions and arches**: the wrapped `@fission-ai/openspec` pinned at
  1.13.1 (accepted `>=1.0.0 <2.0.0`); cospec on Bun 1.3 for dev/CI and
  `node >=18` for the published launcher; every platform package
  (`darwin-arm64`, `darwin-x64`, `linux-arm64-gnu`, `linux-arm64-musl`,
  `linux-x64-gnu`, `linux-x64-musl`, `win32-x64`) gets the same table because it
  is compiled into the single-file executable like every other module.
- **Interactive surface**: stderr text on refusal, stdout for `--help` and the
  `--json` envelope; no prompt is added or removed, and the exit-code contract
  (`0`/`1`/`2`/`3`) is unchanged.

## Integration contract

- **Wrapped binary**: `@fission-ai/openspec`, pinned 1.13.1, accepted range
  `>=1.0.0 <2.0.0`. No new wrapped call; forwarded commands spawn with the same
  argv they do today minus `--store-path`.
- **Dist symbols the tests import** (never the runtime):
  `dist/core/completions/command-registry.js` `COMMAND_REGISTRY` (entries with
  `name`, `positionals[]`, `flags[]` of `{name, short?, takesValue?, values?}`,
  `subcommands[]`); `dist/core/config.js` `AI_TOOLS` (`value` is the id) and
  `TOOL_ID_ALIASES`; `dist/core/profiles.js` `ALL_WORKFLOWS`.
- **cospec harness ids**: the reachability test resolves `AI_TOOLS` ids against
  cospec's harnesses by importing only the existing `HARNESS_NAMES` export of
  `apps/cli/src/harness/adapters.ts` (a `readonly` array of harness-id strings).
  It reads no other symbol of that module and no harness data file.
  `harness-adapter-table` refactors that file alongside this change and keeps
  `HARNESS_NAMES`'s name and shape frozen, so the two changes do not conflict.
- **`view --json`** — probed `openspec view --json` at the pin: exit 1,
  `error: unknown option '--json'`. cospec's refusal is the one-document
  envelope instead (decision 10); the differential classes both as
  parse-rejected.
- **Upstream strings cospec reproduces**, and where each was captured:
  - `--store-path` redirect, both lines, and the `--json` envelope — probed
    `openspec list --store-path /x` and `openspec list --json --store-path /x`
    at the pin (table above); source `dist/cli/index.js:38`.
  - `error: unknown option '<x>'` and `(Did you mean <flag>?)` — probed
    `validate --typo x`; commander's own suggestion. cospec mirrors the refusal
    and uses its own suggestion line (decision 3).
  - `error: option '<flag> <placeholder>' argument missing` — probed
    `list --sort`, `init --tools`, `config --scope`.
  - deprecation warnings — probed `change list`, `spec list`; source
    `dist/cli/index.js:361,388` and `dist/commands/spec.js:127`.
- **Oracle fixture shape** (`support/upstream-oracle.ts`): a temp root
  scaffolded by `openspec init --tools none --no-animation .`, one function
  `oracleJson(argv, root)` that spawns the pinned binary by resolved path with
  `OPENSPEC_TELEMETRY=0` and the color-stripped env from
  `test/fixtures/support.ts`, parses stdout as one JSON document, and returns
  `{exitCode, json, stderr}`. Later changes' differential tests call it.
