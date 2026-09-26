# Proposal

## Why

cospec's native commands parse argv with `args.includes('--x')` and take the
first non-dash token as the positional (`validate.ts:620-626`, `status.ts:271`,
`archive.ts:290-292`, `apply.ts:267-276`, `init.ts:416-422`). An option the
command does not know is silently dropped, and when that option takes a value
the value becomes the item, path or change name. Probed on today's build in a
throwaway repo: `cospec validate --type change x` validates an item called
`change`; `cospec status --schema custom` reports `unknown change 'custom'`;
`cospec init --language fr .` scaffolds `./fr`; `cospec init --tools claude .`
scaffolds `./claude`; `cospec validate --report findings --all` reports
`unknown item 'findings'`; `cospec list --bogus`, `cospec context --bogus`,
`cospec view --bogus`, `cospec doctor --bogus` and
`cospec sync-blockers --bogus` all exit 0 as if the flag had never been typed.
The pinned binary rejects every one of these with `error: unknown option '<x>'`
and exit 1, so an OpenSpec script that swaps in cospec gets a different answer —
and, for the value-taking flags, a wrong one.

Two more places diverge for the same reason. `--store-path` is neither accepted
nor rejected: before the command name it becomes a `badOption` and its value
becomes the command (`cospec --store-path /x list` → `unknown command '/x'`);
after the command name it is absorbed silently and the command runs against the
local root (`cospec list --store-path /x` → exit 0). The binary refuses it on
purpose with redirect text and exit 1, in both spellings. And
`cospec show --help` (`cli.ts` `COMMANDS`) omits `--diff` and documents
`--requirements-only` as the spec filter, when upstream marks that flag as the
deprecated change alias and `--requirements` is the spec flag.

Under it all, cospec has no single statement of which command paths, flags,
positionals and tool ids the pinned binary exposes and where each one is
reachable from cospec. Every catch-up so far has audited by hand and missed
entries after merge. That statement is the acceptance bar every later parity
change measures against, so it lands here, first.

## What Changes

- One command table (`apps/cli/src/core/command-table.ts`) declares, per
  command, every positional and flag the pinned `COMMAND_REGISTRY` gives it,
  each marked **handled**, **accepted no-op**, or **pending** (with the change
  slug that implements it), with cospec's own flags alongside. One parser reads
  the table and returns positionals and flag values. On a table-parsed command,
  a token not in the table fails with `cospec <command>: unknown option '<x>'`,
  a closest-match suggestion where one exists, and exit 1 — the
  `commands/feedback.ts` `parseFeedbackArgs` precedent. A pending flag consumes
  its value and fails with `cospec <command>: '<flag>' is not supported yet` and
  exit 1. Neither ever leaks into a positional.
- Each command row carries a parse policy. `table` rows (init, update, doctor,
  new, migrate, validate, status, list, instructions, apply, archive,
  sync-blockers, context, view, completion, feedback, and the hidden
  `__complete` and `check-commit`) are parsed and rejected by cospec. `forward`
  rows (show, templates, schemas, schema, store, workset, config) are declared
  for reachability, `--help` and completion; their wrapper may consume its own
  cospec-only flags and apply its own pre-spawn guards, but every remaining
  token reaches the wrapped binary unchanged after global-flag threading and
  cospec adds no rejection of its own, so the binary stays the unknown-option
  authority on the surfaces it owns. Upstream's per-command `--json` and
  `--store` resolve through cospec's global flags on every row. `openspec show`
  accepts unknown options by design (`allowUnknownOption(true)`), so a
  cospec-side rejection there would be the divergence, not the fix.
- `cli.ts` dispatches through the table and renders per-command `--help` from
  it; `cospec show --help` lists `--diff` and `--requirements`.
  `buildCompletionSpec()` is built from the table rather than by regex over
  pre-formatted help text.
- `--store-path` is rejected on every command in both positions and in both the
  space and `=` forms, with upstream's redirect text respelled to name
  `cospec store register` and `--store <id>` (the output-side rule: no bare
  `openspec` in shipped output), exit 1; under `--json` the refusal is
  upstream's JSON envelope (`code: store_path_not_supported`,
  `target: store.id`, `fix`), respelled the same way.
- Each `table` row declares whether it accepts the global `--json`.
  `cospec view --json` today exits 0 and silently ignores the flag, while the
  pinned binary rejects `view --json` as an unknown option. `view` (and
  `completion`, which already does this) refuses `--json` with exactly one JSON
  document on stdout and exit 1, the `completion.ts` precedent.
- Three upstream flags cospec already satisfies by construction are accepted as
  no-ops: `init --no-animation` (cospec has no animation), `archive -y` /
  `--yes` (cospec never prompts), `list --changes` (the default).
- Three data files under `apps/cli/src/canon/parity/` — `aliases.yaml` (cospec
  spellings of upstream names; starts with workflow `sync` → `sync-specs`),
  `exceptions.yaml` (exactly one entry: upstream `update`'s offer to
  self-upgrade the wrapped binary) and `deprecated.yaml` (the `change` and
  `spec` noun groups) — plus `apps/cli/test/contract/parity-pending.yaml` (every
  registry entry a later change owns, tagged with that change's slug).
- A reachability contract test (`apps/cli/test/contract/reachability.test.ts`)
  imports four sources from the pinned dist, in tests only: `COMMAND_REGISTRY`
  (every command path, positional, flag and flag value set), `AI_TOOLS`,
  `TOOL_ID_ALIASES` and `ALL_WORKFLOWS`. Every entry must resolve to exactly one
  of the command table, `aliases.yaml`, `exceptions.yaml`, `deprecated.yaml` or
  `parity-pending.yaml`, and a `deprecated.yaml` entry counts only when the
  pinned binary itself marks that surface deprecated — in its registry
  description or by its runtime stderr warning. A per-command differential
  fixture runs the same argv through `cospec` and the pinned binary and asserts
  the same parse outcome. `support/upstream-oracle.ts` runs the pinned binary on
  a fixture and returns its JSON document, for the differential tests later
  changes add.
- Docs: a named-exceptions section on
  `apps/docs/concepts/how-it-relates-to-openspec.md`, rendered from
  `exceptions.yaml` and `deprecated.yaml` by a VitePress data loader at build
  time, and the still-being-implemented list rendered from `parity-pending.yaml`
  next to the every-capability sentence; the page's frontmatter description
  aligned with its own drop-in sentence. `apps/docs/reference/commands.md` gets
  the unknown-option contract. `docs/architecture.md` gets the table and the
  test. `.agents/shared.md` states that the reachability test is the parity gate
  and that exceptions live only in `exceptions.yaml`, then
  `mise run agents:sync`.

**BREAKING.** Flags that a table-parsed command used to ignore now fail with
exit 1. Named upstream flags this affects: `init --tools`, `--language`,
`--profile`, `--copilot-cloud`, `--no-copilot-cloud`; `list --sort`;
`validate --type`, `--report`, `--concurrency`; `status --schema`;
`archive --no-validate`; `instructions --schema`. Each is pending on the change
that implements it and fails with `is not supported yet` until then. Any other
unrecognised option on a table-parsed command (today exit 0 on `list`,
`context`, `view`, `doctor`, `sync-blockers`, `update`, `init`) now fails with
`unknown option`. An unrecognised option before the command name
(`cospec --bogus list`, today exit 0 listing changes) now fails on every command
with `cospec: unknown option '--bogus'`, as `openspec --bogus list` does.
`cospec view --json`, today exit 0 with the dashboard, now exits 1 with a
one-document JSON refusal, as upstream also rejects it.

Positionals break the same way, on every table-parsed command — every command
except the forwarded `show`, `templates`, `schemas`, `schema`, `store`,
`workset` and `config`, which relay the binary's own answer. An excess
positional now fails with
`cospec <command>: too many arguments. Expected N argument(s) but got M.` and
exit 1, before any work, where it used to be dropped and the command run on the
rest. For example, `cospec new feat add login` — a multi-word slug, which today
creates a change named `add` and discards `login` — now refuses; spell the slug
`add-login`, or pass the one-argument `cospec new "feat: add login"`. Likewise
`cospec init a b` (today scaffolds `./a`), `cospec apply <slug> extra`,
`cospec migrate <slug> extra`, `cospec status a b`,
`cospec instructions <artifact> extra`, `cospec archive a b`,
`cospec validate a b`, `cospec sync-blockers <slug>`, `cospec check-commit a b`
and `cospec list a`. Upstream refuses the same argv on the commands it shares
(`openspec new feat …` as an unknown command). `cospec update [path]` —
including `cospec update .` and `cospec update --force .`, which today run
against the cwd and exit 0, as upstream's `openspec update .` does — now fails
with `cospec update: '[path]' is not supported yet` until `upstream-spellings`
honours the path, and the upstream subcommands `new change`,
`completion generate`, `completion install` and `completion uninstall` fail with
`cospec <command>: '<subcommand>' is not supported yet` until their owning
changes land.

Global flags and help follow upstream's two-level parse too. After a
post-command `--`, every token is an operand, as in upstream:
`cospec list -- --json` now fails with too many arguments instead of running
`list --json`. A `--store` or `--cwd` with no value (or an empty one) now fails
with `option '--store <id>' argument missing` (or `argument must not be empty`),
exit 1, instead of being dropped so the command ran against the local repo. Help
before the command name is the program's help, whatever follows:
`cospec --help list` and `cospec -h show foo` now print cospec's command list
instead of that command's help, and `cospec bogus --help` prints it too (exit 0)
instead of refusing the unknown command; `cospec list --help` is unchanged. A
bare `help` after a forwarded command answers as upstream does:
`cospec store help` and `cospec workset help` now fail with
`unknown subcommand 'help'`, exit 1, and `cospec show help`,
`cospec schemas help` and `cospec templates help` reach the binary (exit 1)
instead of printing help; `cospec config help` and `cospec schema help` still
print help, as `cospec <command> help` does on every table-parsed command.

A token right after an option that takes a value is that option's value whatever
it looks like, as upstream's commander reads it: `cospec status --change --help`
now looks up a change named `--help` (exit 1) instead of printing help,
`cospec templates --schema --json` asks OpenSpec for a schema named `--json`
instead of switching to JSON output, and `cospec show c1 --type --store st` no
longer selects the store `st` — likewise for every value-taking option
(`init --tools`, `feedback --body`, `schema init --description`,
`store setup --path`, `show -r`, …). `--no-color` is never such a value, because
upstream takes it out before the command reads its options:
`cospec list --store --no-color` fails with
`option '--store <id>' argument missing`. A value-taking option left without a
value on a forwarded command is now refused by OpenSpec
(`cospec store setup s1 --path` fails with
`option '--path <path>' argument missing`, exit 1, and writes nothing) instead
of taking the `--json` cospec adds as its value and setting a store up at
`./--json`. `cospec store setup s1 --path --no-cospec-init` now sets the store
up at `./--no-cospec-init`, as `openspec store setup` does, instead of opting
out of cospec init, and `cospec feedback --upstream -- --x` files `--x` as the
message instead of failing with `unknown option '--x'`.

## Capabilities

### New Capabilities

- `cli-option-contract`: the command table, its parser and parse policies, the
  unknown-option and not-supported-yet refusals, the `--store-path` rejection,
  the accepted no-op flags, per-command `--help` rendered from the table, the
  parity data files, and the reachability contract test that every later parity
  change reports against.

### Modified Capabilities

- `cospec-shell-completion`: the completion spec is built from the command table
  rather than extracted from pre-formatted help text by regex; the "extracted
  from help text by a pure function with a snapshot test" clause was the
  mechanism the living spec described and it no longer holds.

## Impact

- `apps/cli/src/core/command-table.ts` (new): the table, the parser, the refusal
  messages, the `--store-path` guard, the `--json` refusal envelope.
- `apps/cli/src/cli.ts`: dispatch, `--help` rendering, `--store-path` in the
  pre-command position.
- `apps/cli/src/core/completions/spec.ts`: `buildCompletionSpec()` reads the
  table; `extractFlags` goes.
- `apps/cli/src/commands/{validate,status,archive,list,apply,migrate,sync-blockers,check-commit}.ts`
  and
  `apps/cli/src/commands/{init,update,new,doctor,instructions,show,context,view,complete,completion,feedback}.ts`:
  each moves onto the parser (or, for `forward` rows, onto the table's
  declaration only).
- `apps/cli/src/canon/parity/{aliases,exceptions,deprecated}.yaml` (new).
- `apps/cli/test/contract/reachability.test.ts`,
  `apps/cli/test/contract/parity-pending.yaml`,
  `apps/cli/test/contract/support/upstream-oracle.ts` (new), plus unit coverage
  for the parser.
- `apps/docs/concepts/how-it-relates-to-openspec.md`,
  `apps/docs/reference/commands.md`, a VitePress data loader under
  `apps/docs/.vitepress/`, `apps/docs/package.json` (`yaml` 2.9.0, exact) and
  `bun.lock`; `docs/architecture.md`; `.agents/shared.md` then `CLAUDE.md` /
  `AGENTS.md` via `mise run agents:sync`.
- Exit codes: no new codes. Exit 1 now covers unknown options, not-supported-yet
  flags, `--store-path` on every command, and `--json` on `view`.
- No schema, artifact, gate or archive-behaviour change. The wrapped binary is
  spawned exactly as before; the tests deep-import its dist, the runtime never
  does.

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
