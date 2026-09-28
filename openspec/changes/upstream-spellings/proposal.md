# Proposal

## Why

Several of the pinned OpenSpec binary's own spellings fail under `cospec`, so an
existing `openspec` invocation stops working when the user swaps in `cospec`.
`init --tools claude,codex` is refused as not supported yet;
`new change <name>`, upstream's only create spelling, is refused, and with it
`--goal` and the explanatory `--initiative` / `--areas` removed-option errors;
`update ./other` is refused instead of updating `./other`;
`completion generate zsh` is refused; the hidden `experimental` alias and
commander's program-level `help [command]` answer "unknown command"; and
`instructions --schema <name>` is refused, while `instructions` with no
`--change` answers text under `--json` instead of upstream's one document.

A successful `cospec instructions` answer also still reaches the user naming a
bare `openspec` command: the referenced-store block (`Fetch: openspec show …`,
`Fix: Run: openspec store doctor <id>`, and the `references[].fetch` /
`references[].status[].fix` fields under `--json`) and, for a change on the
built-in `spec-driven` schema, that schema's own instruction and template text.
An agent that follows those lines bypasses every cospec gate. Finally, the
remedy enumeration test skips any line of a pinned schema file that starts with
`#`, which also skips Markdown headings inside that schema's YAML block scalars
— rendered text, not comments — so a future heading naming `openspec <command>`
could reach a user unaccounted for.

## What Changes

- `cospec init --tools <list>` is upstream's spelling of `--harness <list>`,
  with the same `all`, `none` and comma forms. The command table marks it an
  alias of `--harness`, and `aliases.yaml` records it.
- `cospec experimental [--tool <id>] [--no-interactive]` is a hidden table row
  aliased to `init`: it prints upstream's deprecation note spelled through
  cospec, then runs `init` on `.` with `--tool` read as `--harness`.
- `cospec new change <name> [--schema <s>] [--description <text>] [--goal <text>]`
  creates a change. `--schema` names a cospec type or a legacy schema; without
  it the root's `config.yaml` `schema:` default applies, else `spec-driven`, as
  upstream does. `--goal` is stored in `.openspec.yaml`. `--initiative` and
  `--areas` print upstream's removed-option message (text), or its
  `initiative_option_removed` / `areas_option_removed` document under `--json`.
  `new change <name> --json` emits upstream's
  `change {id, path, metadataPath, schema}` and `root`, with cospec's `type`,
  `dir` and `artifacts` beside them; `new <type> <slug> --json` keeps
  `change: <slug>` and gains `root`. `new <type> <slug>` accepts `--goal` too.
- `cospec update [path]` updates the named project instead of refusing the
  positional.
- `cospec completion generate [shell]` is upstream's spelling of
  `cospec completion [shell]`.
- `cospec help [command]` prints the program help, or the named command's help,
  as commander's implicit `help` does; an unknown name prints the program help
  on stderr and exits 1.
- `cospec instructions` forwards `--schema <name>` to the wrapped call. With no
  `--change`, or no artifact, it lets the binary answer (upstream's
  `Available changes` / `Valid artifacts` message), so `--json` gets one
  document on every action-level path, including `instructions apply` with no
  change.
- A successful `cospec instructions <artifact>` answer is built from the
  binary's `--json` document: the command-bearing fields of its referenced store
  entries are spelled through cospec by the shared structural respell helper,
  the built-in `spec-driven` schema's own reference lines are spelled through
  cospec when that schema resolves from the pinned package (a project or user
  copy stays verbatim), and the human text is rendered from the rewritten
  document by a port of upstream's instruction printer. Every other byte
  (context, rules, template, store ids, paths) is the user's and is relayed as
  the binary wrote it.
- The remedy enumeration test stops treating `#`-led lines inside a schema's
  YAML block scalars as comments.
- The reachability test's `aliases.yaml` entries gain a `flag` kind and
  subcommand paths, and the command table gains an alias marking that the test
  checks two ways against `aliases.yaml`. Seven pending entries owned by this
  change leave `parity-pending.yaml`.

## Capabilities

### New Capabilities

- `upstream-command-spellings`: the pinned binary's own spellings that cospec
  accepts beside its own — `init --tools`, `experimental`, `new change`,
  `update [path]`, `completion generate`, and program-level `help [command]`.

### Modified Capabilities

- `cli-option-contract`: reachability resolves alias markings two ways against
  `aliases.yaml`; a successful `instructions` answer is no longer relayed
  byte-for-byte — its command-bearing fields are respelled structurally; a
  lenient `help` row ignores what commander's help command ignores, and
  `instructions [artifact]` is optional as upstream declares it.
- `openspec-read-passthroughs`: `instructions` forwards every table-handled
  flag, lets the binary answer a missing `--change` or artifact, and renders its
  human text from the respelled `--json` document.

## Impact

- `apps/cli/src/core/command-table.ts` — alias marking on flags, subcommands and
  rows; `experimental` and `help` rows; `new change` and `completion generate`
  subcommands declared; `instructions [artifact]` optional; hidden-flag
  attribute for `--initiative` / `--areas`; the `upstream-spellings` pending
  owner removed.
- `apps/cli/src/commands/{init,new,update,completion,instructions}.ts`, and a
  new `apps/cli/src/commands/help.ts`; `apps/cli/src/cli.ts` dispatch for
  `experimental` and `help`.
- `apps/cli/src/core/instructions-render.ts` (new) — the ported printer;
  `apps/cli/src/core/passthrough-command.ts` — consumed (the shared respell
  helper lands with `root-resolution-parity`); `apps/cli/src/core/remedies.ts` —
  the built-in schema's reference lines.
- `apps/cli/src/canon/parity/aliases.yaml`,
  `apps/cli/test/contract/parity-pending.yaml`, the reachability, differential,
  precedence-matrix, relayed-remedies and remedy-enumeration tests,
  `test/contract/support/remedy-sources.ts`, and the new
  `apps/cli/test/contract/upstream-spellings.test.ts`.
- Docs: `apps/docs/reference/commands.md`, `apps/docs/guide/installation.md`,
  `apps/docs/concepts/how-it-relates-to-openspec.md` with
  `apps/docs/.vitepress/parity.data.ts`, `docs/architecture.md`,
  `.agents/shared.md` (+ `CLAUDE.md` / `AGENTS.md` via `agents:sync`).
- No dependency change. Output changes: `cospec instructions` text is rendered
  by cospec from the binary's document (stdout byte-identical where no field is
  respelled; the binary's spinner line on stderr is not reproduced).

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [x] agent-behavior — prompts, tools, model routing, or agent output shape
