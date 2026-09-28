# Design

## Context

Every gap below was probed against the pinned binary
(`apps/cli/node_modules/@fission-ai/openspec/bin/openspec.js`) under Node in a
throwaway root with HOME, the XDG directories, `CODEX_HOME` and `ZDOTDIR`
redirected into it, `NO_COLOR=1` and `OPENSPEC_TELEMETRY=0`, and against cospec
in this worktree. Line references are to this branch.

| Row                                                                                              | cospec today                             | Root cause                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init --tools <list>`                                                                            | `'--tools' is not supported yet`         | `command-table.ts:275` marks it pending; `resolveTarget` (`init.ts:415`) reads only the positional                                                                                                                                                                                                    |
| `new change <name>` (+ `--schema`, `--description`, `--goal`, hidden `--initiative` / `--areas`) | `'change' is not supported yet`          | `command-table.ts:360` declares `change` as a pending subcommand; `new.ts` builds its wrapped argv from `<type> <slug>` only and forwards `--description` alone                                                                                                                                       |
| `new --json`                                                                                     | `{change: <slug>, type, dir, artifacts}` | `new.ts` discards the wrapped `new change --json` document it already asks for, so `root` and upstream's `change {…}` object never reach the user                                                                                                                                                     |
| `update [path]`                                                                                  | `'[path]' is not supported yet`          | `command-table.ts:317` marks the positional pending; `update.ts:432` works on `ctx.cwd`                                                                                                                                                                                                               |
| `completion generate [shell]`                                                                    | `'generate' is not supported yet`        | `command-table.ts:909` declares a pending subcommand                                                                                                                                                                                                                                                  |
| hidden `experimental`                                                                            | `unknown command 'experimental'`         | no table row, no module in `COMMAND_MODULES` (`cli.ts:82`)                                                                                                                                                                                                                                            |
| program-level `help [command]`                                                                   | `unknown command 'help'`                 | no table row; `parity-pending.yaml` owns it here                                                                                                                                                                                                                                                      |
| `instructions --schema <name>`                                                                   | `'--schema' is not supported yet`        | `command-table.ts:497` marks it pending; `instructions.ts:48` builds argv from `--change` alone                                                                                                                                                                                                       |
| `instructions` with no `--change`                                                                | text refusal even under `--json`         | `instructions.ts:43` refuses locally instead of letting the binary answer                                                                                                                                                                                                                             |
| `instructions --change <id>` with no artifact                                                    | parse-time text refusal                  | the table declares `artifact` required; upstream's is optional and answers `Missing required argument <artifact>. Valid artifacts: …` as one document                                                                                                                                                 |
| successful `instructions` answer                                                                 | relayed byte-for-byte                    | `relayRespelled` (`core/forward-relay.ts`) respells a failed answer only, so the binary's referenced-store `Fetch:`/`Fix:` lines and the built-in `spec-driven` schema's own reference lines reach the user naming bare `openspec` (`REACHABLE_OWNED`, `test/contract/support/remedy-sources.ts:830`) |
| remedy enumeration                                                                               | a `#`-led schema line is skipped         | `YAML_COMMENT = /^#/` (`remedy-enumeration.test.ts:39`) is applied to trimmed source lines (`isComment`, `:49`), so a Markdown heading inside a YAML block scalar counts as a comment                                                                                                                 |

Probed upstream answers this change reproduces (never hand-typed into a test —
every differential row asks the oracle at test time):

- `init --tools` with no value:
  `error: option '--tools <tools>' argument missing`, exit 1.
- `experimental --help`: `--tool <tool-id>  Target AI tool (maps to --tools)`,
  `--no-interactive`; the action prints
  `Note: "openspec experimental" is deprecated. Use "openspec init" instead.`
  and runs init on `.`; `experimental --json` / `--store x` are unknown options.
- `new change x --initiative a`:
  `✖ Error: --initiative is no longer supported. Normal changes no longer attach to initiatives; --store <id> selects the OpenSpec root.`;
  under `--json`
  `{change: null, status: [{severity: error, code: initiative_option_removed, message, target: change.options}]}`.
  `--areas` the same with `areas_option_removed` and
  `--areas is no longer supported. Workspace affected areas are not part of the normal OpenSpec root path.`
  Both run before name validation and root resolution
  (`commands/workflow/new-change.js`).
- `new change foo --goal g --json`:
  `{change: {id, path, metadataPath, schema}, root: {path, source}}`;
  `.openspec.yaml` gains `goal: g`.
- `update ./x` with no `openspec/`: `No OpenSpec directory found.`, exit 1.
- `completion generate zsh extra`: too many arguments, exit 1.
- `help` / `help --bogus` / `help --json`: program help on stdout, exit 0;
  `help list` = `list --help`; `help config path` = `config --help`;
  `help new change` = `new --help`; `help experimental` / `help __complete`
  print those hidden commands' help; `help bogus` / `help help`: program help on
  stderr, exit 1; `help -V`: the version.
- `instructions proposal --json` (no `--change`):
  `{status: [{…, code: change_error, message: "Missing required option --change. Available changes:\n  …"}]}`,
  exit 1; `instructions --change foo --json`:
  `Missing required argument <artifact>. Valid artifacts: …`;
  `instructions apply --json` with no `--change`: the same
  `Missing required option --change` document.
- `instructions … --json` success keys:
  `changeName, artifactId, schemaName, changeDir, planningHome, outputPath, resolvedOutputPath, existingOutputPaths, description, instruction, references?, context?, rules?, template, dependencies, unlocks, skipped?, warning?, root`.
  `references[]` entries:
  `{store_id, root, specs[{id, summary}], fetch, status[]}` for a registered
  store; `{store_id, status[{severity, code, message, target, fix}]}` otherwise.
  Observed `fix` values:
  `git clone -- <remote> '<home>/openspec/<id>' && openspec store register '<home>/openspec/<id>' --id <id>`
  and
  `Get a checkout from a teammate and run: openspec store register <path> --id <id>`;
  the source (`core/references.js`) also emits `Run: openspec store doctor`,
  `Run: openspec store doctor <id>`,
  `List the rest directly: openspec list --specs --store <id>` and
  `Use kebab-case store ids in the references list.`; `fetch` is
  `openspec show <spec-id> --type spec --store <id>`.
- `schema which spec-driven --json`: `{name, source: "package", path, shadows}`.

## Goals / Non-Goals

**Goals:**

- Every pinned upstream spelling listed in the Context table works under
  `cospec`, and its `parity-pending.yaml` entry is gone.
- `cospec instructions` never prints a bare `openspec <command>` the binary
  wrote into a successful answer, and never rewrites a byte the user owns.
- `instructions --json` gives exactly one document on every path past the parse.
- The reachability gate can express command and flag aliases, two ways.
- The remedy enumeration reads a schema file by its own syntax.

**Non-Goals:**

- `completion install` / `uninstall` and the `powershell` shell —
  `completion-install`.
- The 36 tool ids beyond cospec's four harnesses that upstream's `--tools all`
  covers — `tool-matrix` (`--tools` accepts exactly what `--harness` accepts).
- The `context` reference block, and wiring the allowlist into the store,
  workset, config and doctor relays — `passthrough-json-and-doctor`.
- The shared structural respell helper itself — `root-resolution-parity` lands
  it; this change supplies the `instructions` field map and consumes it.

## Decisions

### 1. An alias is a table marking plus an `aliases.yaml` entry, checked two ways

A `FlagSpec`, a `SubcommandSpec` and a command row gain an optional `aliasOf`
naming the cospec spelling (`--harness`, `new`, `completion`, `init`). The
parser accepts the upstream spelling exactly as the table declares it (its own
placeholder, so `--tools` with no value is refused as
`option '--tools <tools>' argument missing`) and stores a flag's value under the
canonical name, so a module reads `flagValue(parsed, '--harness')` for either
spelling; a repeated option across the two spellings is last-wins, as commander
resolves a repeated option. The parsed args also record which spelling supplied
the value, so a module's content refusal (`invalid --tools 'cursor'`) names what
the user typed. A subcommand or row marked `aliasOf` dispatches to the cospec
command's module with its own declared surface parsed.

In `reachability.test.ts`:

- `AliasEntry.upstream.kind` gains `flag` (`{path, flag}`), and `command`
  accepts a subcommand path.
- `cospecReaches` returns false for a surface the table marks `aliasOf` (the
  flag, the subcommand, the row itself). Surfaces declared beneath an aliased
  subcommand or row (`new change --goal`, `completion generate`'s `[shell]`) are
  ordinary table surfaces and resolve to `cospec`.
- `aliasTargetExists` for `flag` / `command` requires the table marking to name
  the alias's `cospec` spelling and that spelling to exist unmarked (the
  `--harness` flag on the same row, the `new` / `completion` / `init` row).
- A new reverse check: every `aliasOf` marking in the table has exactly one
  `aliases.yaml` entry for the same spelling, and every `flag` / `command` entry
  matches a marking. Workflow and tool aliases have no table marking and keep
  their current check.
- A flag alias must agree with upstream on `takesValue`, as a reached flag does.
- Negative cases on mutated copies of the real inputs: the `init --tools` entry
  removed from `aliases.yaml` resolves nowhere; the table marking dropped (a
  plain handled flag) resolves in two places; an `aliases.yaml` entry with no
  marking fails; `--harness` removed fails. One positive assertion: the walked
  `flag init --tools` resolves to `aliases.yaml` and nowhere else.

`--help` and completion list an alias flag like any other offered flag (its
description says whose spelling it is), because upstream's `init --help` lists
`--tools`; `new --help` lists the `change` subcommand and `completion --help`
the `generate` subcommand. `experimental` stays hidden. The three-way
help/completion/parser parity test needs no change: an alias flag is an offered
flag.

Rejected: a `SurfaceStatus` variant `{alias: …}`. Every consumer of `status`
(parser, help, completion, pending markings, the docs loader) would need a new
branch for what is, to all of them, a handled surface; only reachability needs
to tell an alias apart.

### 2. `aliases.yaml` gains exactly four entries

```yaml
- upstream: { kind: flag, path: [init], flag: --tools }
  cospec: --harness
- upstream: { kind: command, path: [new, change] }
  cospec: new
- upstream: { kind: command, path: [completion, generate] }
  cospec: completion
- upstream: { kind: command, path: [experimental] }
  cospec: init
```

`experimental --tool` is not walked (the hidden fixture covers the command
only), so it is a plain handled flag of the `experimental` row that its module
maps onto `--harness`; it carries no alias marking and needs no entry.

### 3. The `parity-pending.yaml` entries this change removes, and the one it adds

Removed, each in the commit that implements it:

```yaml
- { kind: flag, path: [init], flag: --tools, owner: upstream-spellings }
- { kind: command, path: [new, change], owner: upstream-spellings }
- { kind: positional, path: [update], index: 0, owner: upstream-spellings }
- { kind: command, path: [completion, generate], owner: upstream-spellings }
- {
    kind: flag,
    path: [instructions],
    flag: --schema,
    owner: upstream-spellings,
  }
- {
    kind: command,
    path: [experimental],
    source: cli,
    owner: upstream-spellings,
  }
- { kind: command, path: [help], source: cli, owner: upstream-spellings }
```

Added, with a matching hidden fixture (probe `completion generate powershell`,
the same probe the existing `[completion]` fixture uses), because
`completion generate` now declares its own `[shell]` positional with
`pendingValues: {powershell: completion-install}` and the two-way check requires
an entry for that marking:

```yaml
- kind: positional-value
  path: [completion, generate]
  index: 0
  value: powershell
  source: cli
  owner: completion-install
```

At close-out `upstream-spellings` leaves `PendingOwner` (`command-table.ts`),
`KNOWN_OWNERS` (`reachability.test.ts`) and `OWNERS`
(`support/remedy-sources.ts`), and the section header leaves
`parity-pending.yaml`. The hidden fixtures stay: they keep probing the binary
and now resolve through the table and `aliases.yaml`.

### 4. `init --tools`

`--tools <tools>` is an `upstream` flag on the `init` row marked
`aliasOf: '--harness'`; `init.ts`'s harness selection reads `--harness` and so
needs only the refusal-spelling change. The list forms are `--harness`'s (`all`,
`none`, comma-separated, cospec's four ids); an upstream id cospec has no
harness for is refused as `--harness` refuses it today, until `tool-matrix`.

### 5. `experimental`

A hidden `table` row, `aliasOf: 'init'`, `store: 'refused'` (upstream refuses
`--store` as an unknown option), `json: 'accepted'` (like `init`, a cospec-only
acceptance recorded as a `cospec-only` differential row), no positionals, flags
`--tool <tool-id>` (handled) and `--no-interactive` (no-op: cospec's init never
prompts). A new module `apps/cli/src/commands/experimental.ts` prints
`Note: "cospec experimental" is deprecated. Use "cospec init" instead.` on
stdout (omitted under `--json`, which must stay one document), then re-parses
`['.', …(--tool ? ['--harness', value] : [])]` against the `init` row and calls
`init.ts`'s `run`, as `instructions apply` re-parses against `apply`'s row.
`COMMAND_MODULES` (`cli.ts`) gains `experimental` and `help`. The
`notRelayed.EXPERIMENTAL` reason becomes: `cospec experimental` is native — it
prints its own respelled note and runs `cospec init`, never the binary's
`experimental`.

### 6. `new change`

The `new` row's `change` subcommand is declared, `aliasOf: 'new'`, with
positional `name` (required) and flags `--schema <name>`,
`--description <text>`, `--goal <text>`, and `--initiative <x>` / `--areas <x>`
marked with a new `FlagSpec.hidden` attribute that `offeredFlags` omits
(upstream hides both from help; the reachability arity check still sees
`takesValue`). The `new` row gains a cospec-origin `--goal <text>` too.

`new.ts` gets one entry for both spellings:

1. `new change` only: `--initiative` / `--areas` refused first with the probed
   message, text or the `{change: null, status}` document with the probed code —
   before name validation and root resolution, as upstream.
2. The type is `--schema`, else the resolved root's `config.yaml` / `config.yml`
   `schema:`, else `spec-driven` — upstream's `root.defaultSchema`.
3. From there the existing lanes run unchanged (cospec type → installed check,
   slug grammar, active/archived collision, delegate, verify, stamp
   `schemaVersion: 2`; legacy schema → delegated legacy lane). A `--schema` that
   is neither a cospec type nor a resolvable legacy schema is delegated on the
   `new change` spelling so the binary's own
   `Schema '<s>' not found. Available schemas: …` answer is relayed;
   `new <type> <slug>` keeps cospec's own unknown-type table (a cospec opinion,
   unchanged).
4. `--goal` is forwarded to the wrapped `new change` (the binary writes
   `goal:`); `stampSchemaVersion` already preserves unknown keys.
5. JSON: the wrapped call already runs with `--json`; its document is parsed and
   its `change` and `root` lifted. `new change <name> --json` prints
   `{change: {id, path, metadataPath, schema}, root, type, dir, artifacts}`
   (legacy lane: `…, root, type, dir, legacy, note`); `new <type> <slug> --json`
   prints `{change: <slug>, root, type, dir, artifacts}`. The key-oracle
   assertion: every key path of the binary's document exists in cospec's with a
   value of the same JSON type, and `change.id` / `change.schema` are equal.

### 7. `update [path]`

The positional becomes handled; `update.ts` works on
`resolve(ctx.cwd, path ?? '.')` wherever it used `ctx.cwd`, so the existing
`no openspec/ directory at <path>` refusal names the path.

### 8. `completion generate [shell]`

A declared `generate` subcommand of the `completion` row,
`aliasOf: 'completion'`, positional `shell` (optional, values bash/zsh/fish,
`pendingValues: {powershell: completion-install}`), no flags; its `[shell]`
feeds `completion.ts`'s existing `run`. The row's `json: 'refused'` document
applies to both spellings.

### 9. Program-level `help [command]`

A `help` row (visible, last in `--help`'s command list, as upstream lists
`help [command]`), `parse: 'table'`, `store: 'accepted'`, `json: 'accepted'`,
positional `command` (optional), no flags, and a new row attribute
`operands: 'lenient'` that the table parser honours by ignoring undeclared
options and excess operands instead of refusing them — commander's help command
does exactly that (`help --bogus`, `help list extra` exit 0). A new module
`apps/cli/src/commands/help.ts` takes the first operand: none → the program help
(`rootHelp`) on stdout, exit 0; a row name, hidden rows included, other than
`help` → that row's `--help` text on stdout, exit 0; anything else → the program
help on stderr, exit 1. `-V` is already answered program-wide. The row accepts
`--json` and still prints text, deliberately: the binary's `help --json` prints
its help on stdout, exit 0, and `json: 'refused'` would answer with a
one-document refusal and exit 1 — a different outcome class from the binary's.
The precedence matrix's three `PENDING_ROWS` for `help` become agreement rows,
and `help bogus`, `help help`, `help --bogus`, `help -- list` join them.

### 10. `instructions`: forwarding, and one document on every path

The row's `artifact` positional becomes optional (upstream's `[artifact]`) and
`--schema` handled. `instructions.ts` forwards `--change` and `--schema`
whenever given and adds no refusal of its own: no `--change`, or no artifact,
reaches the binary, whose `Missing required option --change` /
`Missing required argument <artifact>` answer is relayed (one document under
`--json`). `instructions apply` with no `--change` is forwarded the same way —
there is no change to gate, and the binary's answer lists the available changes;
with a change it re-parses against `apply`'s row as today. The precedence
matrix's `instructions` missing-argument rows move from `cospecOnly` to
agreement with the binary, and the row's help usage reads
`cospec instructions [artifact]`.

### 11. `instructions` success path: build the answer from the document

Applies to every artifact except `apply` (the gate) and `archive` (its document
holds only the user's `context` / `operationGuidance`, relayed as today).

1. Spawn `instructions <artifact> [--change] [--schema] --json` always.
2. Failure: under `--json`, relay the document through `relayRespelled`
   (remedies respelled, including `Create one with: …`); in text mode re-run the
   same argv without `--json` and relay that through `relayRespelled`, so the
   failure text stays the binary's (`✖ Error: …`, its `Fix:` line) exactly as
   `unknown-option-contract` pinned it. The call is read-only, so the second run
   changes nothing.
3. Success: parse the document, then rewrite through the shared structural
   respell helper from `passthrough-command.ts` with this field map:
   - `references[].fetch`
   - `references[].status[].fix`

   The per-field rule is the remedy allowlist applied to the whole value: a
   field is rewritten only when its entire string is one of the allowlisted
   `references/*` sentences or commands in `core/remedies.ts`
   (`references/fetch`, `references/clone`, `references/get-checkout`,
   `references/store-doctor`, `references/store-doctor-id`,
   `references/list-rest`), each hole re-emitted as captured. A value that
   matches no entry (`Use kebab-case store ids in the references list.`) stays
   verbatim. A store id or checkout path holding `openspec` sits in a hole and
   is never read.

4. Built-in schema: when `schemaName` is not a cospec type, one
   `schema which <schemaName> --json` call gives its `source`; only
   `source: package` enables the schema-line rule on `instruction` and
   `template`: each line of the field that equals one entry of a new
   `SCHEMA_LINES` allowlist (in `core/remedies.ts`: the pinned
   `schemas/spec-driven/schema.yaml` and `templates/proposal.md` lines that name
   a bare `openspec <command>`, each with its cospec spelling) is replaced;
   every other line is untouched. A project or user copy of the schema resolves
   with another source and stays verbatim.
5. Output: `--json` prints the rewritten document as
   `JSON.stringify(doc, null, 2)` plus a newline (the binary's own formatting,
   so the bytes are the binary's where nothing was rewritten); text mode renders
   it with a port of `printInstructionsText`, `renderReferencedStoresBlock`,
   `renderEntryLines`, `specLine`, `sanitizeInline`, `escapeEnvelopeTags` and
   `escapeEnvelopeAttribute` into a new
   `apps/cli/src/core/instructions-render.ts`. `isBlocked` is derived from
   `dependencies` as the binary derives it. The binary's `ora` spinner line on
   stderr is not reproduced (cospec never spawns the text form on success).
6. `REACHABLE_OWNED`'s `instructions` / `upstream-spellings` rows leave
   `support/remedy-sources.ts`: the six `core/references.js` lines are already
   allowlist entries (their `context` rows stay, owned by
   `passthrough-json-and-doctor`), and the ten `schemas/spec-driven/**` lines
   become `REMEDY_SOURCES` rows naming their `SCHEMA_LINES` entries.

The equivalence evidence: for a fixture with no referenced stores on a
project-local schema, cospec's text and `--json` equal the binary's
byte-for-byte; with the three-reference fixture, they equal the binary's with
only the listed fields respelled (checked by applying the expected rewrite to
the oracle's document and rendering both). Fixtures cover a blocked artifact, a
`skip_specs` artifact, `context` + `rules`, and a `context` that forges
`</task>` and a `<referenced_stores>` block.

This track runs after the rebase onto `root-resolution-parity`, which owns
`passthrough-command.ts` and its helper.

### 12. Remedy enumeration reads YAML as YAML

`remedy-enumeration.test.ts` parses each pinned `.yaml` file with `yaml` and
enumerates the lines of every string scalar (trimmed), so a comment is dropped
by the parser and a `#`-led Markdown heading inside a block scalar is
enumerated; `YAML_COMMENT` and its branch of `isComment` go. The classified
lines keep their trimmed form, so existing entries match unchanged.

### 13. Tests first

The new `apps/cli/test/contract/upstream-spellings.test.ts` lands first with
every acceptance row as `test.failing` against the oracle; the existing
`expect: 'pending'` rows in `unknown-option-differential.test.ts`
(`init --tools claude .`, `update .`, `update --force .`, `new change x`,
`completion generate bash`, `instructions … --schema spec-driven`, plus new
`same` rows `help --bogus` and `experimental --bogus`), the precedence matrix's
`help` `PENDING_ROWS` and its `instructions` missing-argument rows, the
`instructions` rows of `relayed-remedies.test.ts`'s "a successful context or
instructions is relayed byte-for-byte" block (its `context` rows stay), and the
pending lists in `test/unit/core/command-table.test.ts` are rewritten to their
target expectation in the same commit, marked `test.failing`. Each implementing
commit flips its rows to `test`. The close-out row asserts no `test.failing` or
`test.todo` remains in any file this change touched.

### 14. Track files

The command modules are exclusive to one track each. The shared registries —
`command-table.ts`, `aliases.yaml`, `parity-pending.yaml`, the differential and
matrix fixtures — are edited row by row: each track touches only its own
command's row, its own alias line and its own pending entry, in the commit that
implements that surface, so "the change that implements a surface deletes its
entry in the same commit" holds.

## Risks / Trade-offs

- [The structural respell helper lands with a different per-field rule shape
  than decision 11 needs (a leading-token rule would leave `Run: openspec store
  doctor <id>` and the `git clone … && openspec store register …` fix
  unspelled)] → the field map is data; if the helper's rule is leading-token
  only, this change adds the whole-value allowlist rule to it after the rebase,
  in `passthrough-command.ts`, and says so in the PR body.
- [A text-mode failure costs a second spawn] → read-only, failure path only;
  keeps the failure text and its tests byte-identical.
- [The ported printer drifts from the binary's on a pin bump] → the equivalence
  rows compare against the oracle at test time, so a printer change in a new pin
  fails the suite.
- [`schema which --json` adds a spawn on non-cospec schemas] → only when the
  schema is not one of the eleven cospec types, and only on success.
- [`instructions [artifact]` optional loosens a parse-time refusal] → the
  binary's answer is strictly more informative (it lists the valid artifacts)
  and is the upstream contract; the matrix rows pin it.
- [`experimental --json` is accepted where upstream refuses it] → declared
  `cospec-only`, like `init --json`.

## Operational surface

- **Where it runs**: the `cospec` process on the user's machine or a CI runner;
  no server, bind address, container or secret. The new contract tests run in
  the existing contract suite against the pinned binary under
  `apps/cli/node_modules`, each in a scratch root with HOME/XDG/`CODEX_HOME`/
  `ZDOTDIR` sandboxed by the upstream oracle.
- **Binary versions and arches**: the wrapped binary stays at the dev/CI pin
  (accepted range unchanged); cospec on Bun for dev/CI and Node for the
  published launcher; every platform package gets the same table and modules
  because they are compiled into the single-file executable.
- **Interactive surface**: new spellings print the same text / JSON their cospec
  counterparts print; `help` prints help; `experimental` adds one note line;
  `instructions` text is rendered by cospec. No prompt is added, and the
  `0`/`1`/`2`/`3` exit-code contract is unchanged.

## Integration contract

- **Wrapped-call discipline**: `instructions` declares exit codes `[0, 1]`, the
  deny-list and the one-document post-condition for every `--json` call it makes
  (the success spawn, the failure re-run, `schema which --json`); `new` keeps
  its `.openspec.yaml` post-condition and now also requires the wrapped document
  to parse with a `change` object and a `root` object.
- **Fixture shape**: a cospec-initialised root (for the key oracle and the typed
  lanes), a plain upstream-initialised root with the `spec-driven` default (for
  `new change` defaults and the built-in schema lines), a root with a project
  copy of `spec-driven`, and a root whose `config.yaml` references a registered
  store with id `openspec-shared` (setup under the oracle's sandboxed data
  directory), an unregistered store with a remote, and one without.
- **Schema reconciliation**: `new change` resolves its default schema the way
  upstream's `root.defaultSchema` does, so a cospec root (`schema: feat`) gets a
  typed change and a plain OpenSpec root (`schema: spec-driven` or none) gets
  the legacy lane.
- **Helper contract consumed from `root-resolution-parity`**: a parsed JSON
  document and a field map (paths with `[]` for array members) in, the rewritten
  document out, with a per-field rule; this change supplies the map and the
  whole-value allowlist rule of decision 11.
