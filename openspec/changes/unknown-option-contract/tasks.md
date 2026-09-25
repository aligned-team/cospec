# Tasks

Each numbered group is one track with exclusive files and ends in a commit, so
an interruption loses at most the group in flight. Groups 1–3 land the contract
red; 4–7 turn it green; 8 documents it.

## 1. T1 — the command table and parser (`apps/cli/src/core/command-table.ts`, `apps/cli/test/unit/core/command-table.test.ts`)

- [x] 1.1 Create `command-table.ts`: per-command rows with `name`, `summary`,
      `hidden`, `parse: 'table' | 'forward'`, `json: 'accepted' | 'refused'` on
      `table` rows (`view` and `completion` refused), `positionals[]`, and
      `flags[]` of
      `{name, short?, takesValue?, placeholder?, values?, description,     status: 'handled' | 'no-op' | {pending: '<slug>'}}`;
      seed every flag the pinned `COMMAND_REGISTRY` gives the same-named
      command, then cospec's own flags; mark `init --no-animation`,
      `archive -y/--yes`, `list --changes` as no-ops and every entry in the
      design's pending table as pending with its owner slug
- [x] 1.2 Write `parseCommandArgs(row, args)` returning
      `{positionals,     flags}` or a typed refusal; implement the three refusal
      messages, the `--flag=value` form, and the closest-match line using
      `closest()` moved out of `cli.ts` into the table module
- [x] 1.3 Write the `--store-path` guard (`storePathRefusal(json)`) returning
      the respelled redirect text and the `--json` envelope, and the
      `jsonRefusal(command, message)` helper returning the one-document
      `{version: 1, command, ok: false, message}` envelope (design decision 10)
- [x] 1.4 Unit-test the parser (verification 1.5): the six parse cases, and one
      assertion per no-op and per pending flag; commit
      `feat(cli): add the     command table and parser` (ledger 1.5)

## 2. T6 — parity data files (`apps/cli/src/canon/parity/{aliases,exceptions,deprecated}.yaml`)

- [x] 2.1 Write `aliases.yaml` with the `sync` → `sync-specs` workflow alias,
      `exceptions.yaml` with the single self-upgrade entry, and
      `deprecated.yaml` with the `change` (registry-description) and `spec`
      (runtime-stderr, warning text verbatim) noun groups, in the shapes the
      design gives; commit `chore(canon): add parity data files`

## 3. T7 — reachability test, pending list, oracle (`apps/cli/test/contract/reachability.test.ts`, `apps/cli/test/contract/parity-pending.yaml`, `apps/cli/test/contract/support/upstream-oracle.ts`, `apps/cli/test/contract/unknown-option-differential.test.ts`)

- [x] 3.1 Write `support/upstream-oracle.ts`: scaffold a temp root with the
      pinned binary, `oracleJson(argv, root)` with the color-stripped env and
      `OPENSPEC_TELEMETRY=0`, throwing on non-JSON stdout (ledger 5.4)
- [x] 3.2 Write `parity-pending.yaml` exactly as the design's pending table,
      each entry `{kind, path/id, flag?, value?, source?, owner}`
- [x] 3.3 Write `reachability.test.ts`: import the four dist sources, flatten
      every command path, positional slot, flag, flag value, tool id, alias and
      workflow id, resolve each against the table and the four YAML files, fail
      on zero or two resolutions, resolve `AI_TOOLS` ids against cospec's
      harnesses by importing ONLY the `HARNESS_NAMES` export of
      `apps/cli/src/harness/adapters.ts` (no other symbol of that module; its
      name and shape are frozen by `harness-adapter-table`), assert the reverse
      direction (every table entry marked pending ⇔ exactly one
      `parity-pending.yaml` entry with the same owner, and a stale YAML entry
      fails; design decision 11), verify each `deprecated.yaml` mark against the
      registry description or the oracle's stderr, assert `exceptions.yaml` has
      one entry and every pending entry has an owner (ledger 4.1–4.5)
- [x] 3.4 Write `unknown-option-differential.test.ts`: the classifier
      (parse-rejected vs parsed), the per-command row list from verification
      5.1–5.3 with `expect: same | cospec-only | pending`, running each row
      through `cospec` (via `test/fixtures/support.ts`) and the oracle; the
      `--store-path` rows compare cospec's text to the oracle's with only the
      `openspec` → `cospec` respelling (ledger 2.3, 5.1–5.3)
- [x] 3.5 Run `mise run test:contract` and record the red rows (the differential
      and 1.6-style assertions fail on today's parsers); commit
      `test(cli): add the reachability contract and unknown-option     differential`
      with the tests present and the fixture rows that fail today marked `todo`
      in bun so the commit is green, to be un-skipped per command in groups 5
      and 6

## 4. T2 — dispatch and help through the table (`apps/cli/src/cli.ts`)

- [x] 4.1 Replace `COMMANDS[].usage/options` with a render from the table rows;
      `commandHelpText` prints positionals, handled and no-op flags with
      placeholders and descriptions; `helpText` unchanged in shape;
      `cospec     show --help` now lists `--diff` and `--requirements` (ledger
      3.1)
- [x] 4.2 Reject `--store-path` and `--store-path=<v>` in the pre-command loop
      with the guard from 1.3 (text, or the envelope under `--json`), exit 1,
      and treat no later token as the command name (ledger 2.2)
- [x] 4.3 Dispatch: for `table` rows call the parser before loading the command
      module and print the refusal on failure; for `forward` rows pass argv
      through unchanged except for the `--store-path` guard; the
      `CommandContext` gains `parsed?` so a `table` command receives positionals
      and flag values instead of re-reading `ctx.args`
- [x] 4.4 Unit-test `cli.test.ts` for the new help output and the `--store-path`
      positions; un-skip the `--store-path` differential rows; commit
      `fix(cli): dispatch and render help through the command table`

## 5. T4 — lifecycle commands onto the parser (`apps/cli/src/commands/{validate,status,archive,list,apply,migrate,sync-blockers,check-commit}.ts`)

- [ ] 5.1 `validate.ts`: read
      `--strict --fast --all --changes --specs     --archived --no-interactive`
      and the positional from `ctx.parsed`; delete the `includes`/`find` reads
      (regression: ledger 1.1)
- [ ] 5.2 `status.ts`: `--change`, `--all`, positional from `ctx.parsed` (ledger
      1.2)
- [ ] 5.3 `archive.ts`: `--skip-specs`, `--force-incomplete`, the positional;
      `-y/--yes` accepted as no-ops (ledger 2.1)
- [ ] 5.4 `list.ts`: `--specs`, `--blocked`; `--changes` no-op (ledger 1.4, 2.1)
- [ ] 5.5 `apply.ts`, `migrate.ts`, `sync-blockers.ts`, `check-commit.ts`: each
      onto `ctx.parsed`
- [ ] 5.6 Un-skip these commands' differential rows; `mise run test` and
      `mise run test:contract` green; commit
      `fix(cli): parse lifecycle     commands through the command table`

## 6. T5 — setup and passthrough commands onto the parser (`apps/cli/src/commands/{init,update,new,doctor,instructions,show,context,view,complete,completion,feedback}.ts`)

- [ ] 6.1 `init.ts`: `resolveTarget` and `argValue` replaced by `ctx.parsed`;
      `--no-animation` no-op; `--tools`, `--language`, `--profile`,
      `--copilot-cloud`, `--no-copilot-cloud` pending (regression: ledger 1.3)
- [ ] 6.2 `update.ts`, `doctor.ts`, `new.ts`, `context.ts`, `complete.ts`,
      `completion.ts`: each onto `ctx.parsed`, so an unknown option is refused
      before any work (ledger 1.4); `completion.ts` swaps its inline `--json`
      refusal for `jsonRefusal()` with byte-identical output
- [ ] 6.3 `instructions.ts`: onto `ctx.parsed` with `--change`, `--allow-soft`
      handled and `--schema` pending
- [ ] 6.4 `view.ts`: onto `ctx.parsed` (`table` row, `json: 'refused'`);
      `--json` is refused with `jsonRefusal('view', …)` — one JSON document on
      stdout, exit 1, no `openspec view` spawned — instead of being silently
      ignored; its differential row (`view --json`) un-skipped (ledger 1.7)
- [ ] 6.5 `show.ts`: `forward` row — keep forwarding verbatim; its table row
      declares every upstream flag so help and completion list them.
      `feedback.ts`: `table` row — `parseFeedbackArgs` replaced by `ctx.parsed`
      (`<message>`, `--body <text>`, `--upstream`); the `--upstream` relay
      rebuilds its argv from the parsed values
- [ ] 6.6 Un-skip the remaining differential rows; the whole differential and
      the 1.6 no-legacy-parser test (scoped to `table` modules) are live;
      `mise run test:contract` green; commit
      `fix(cli): parse setup and passthrough commands through the command table`

## 7. T3 — completion from the table (`apps/cli/src/core/completions/spec.ts`, `apps/cli/test/unit/core/completions.test.ts`)

- [ ] 7.1 `buildCompletionSpec()` reads table rows: flags = handled + no-op,
      positional sources and dynamic flag values kept; delete `extractFlags` and
      its snapshot
- [ ] 7.2 Add the three-way help/completion/parser parity test (ledger 3.2,
      3.3); `apps/cli/test/integration/completion.test.ts` green; commit
      `fix(cli): build the completion spec from the command table`

## 8. T8 — docs, data loader, shared guidance (`apps/docs/concepts/how-it-relates-to-openspec.md`, `apps/docs/reference/commands.md`, `apps/docs/.vitepress/parity.data.ts`, `apps/docs/package.json`, `bun.lock`, `docs/architecture.md`, `.agents/shared.md`, `CLAUDE.md`, `AGENTS.md`)

- [ ] 8.1 Add `yaml` `2.9.0` (exact) to `apps/docs/devDependencies`, run
      `bun install`, and commit the regenerated `bun.lock` in the same commit
      (ledger 6.6)
- [ ] 8.2 Write `apps/docs/.vitepress/parity.data.ts` (`defineLoader` with
      `watch` on `exceptions.yaml`, `deprecated.yaml`, `parity-pending.yaml`)
      returning the three parsed lists
- [ ] 8.3 `how-it-relates-to-openspec.md`: a named-exceptions section and the
      still-being-implemented list rendered from the loader next to the
      every-capability sentence; align the frontmatter description with the
      drop-in sentence (ledger 6.1, 6.2)
- [ ] 8.4 `reference/commands.md`: the unknown-option contract, the
      `--store-path` redirect, the three no-ops, the forwarded-command rule, and
      `show`'s corrected flag list (ledger 6.3)
- [ ] 8.5 `docs/architecture.md`: the command table, the two parse policies, the
      reachability test and its four sources (ledger 6.4)
- [ ] 8.6 `.agents/shared.md`: the reachability test is the parity gate;
      exceptions live only in `exceptions.yaml`; then `mise run agents:sync` and
      `mise run agents:check` (ledger 6.5)
- [ ] 8.7 `mise run docs:build` and the entry-for-entry check against
      `parity-pending.yaml` (ledger 6.1); commit
      `docs: document the command     table, the unknown-option contract and the parity gate`

## 9. Close-out

- [ ] 9.1 `mise run check` green (ledger 7.1–7.5); every ledger row marked with
      observed evidence
- [ ] 9.2 Grep the new test files (`command-table.test.ts`,
      `reachability.test.ts`, `unknown-option-differential.test.ts`, and any
      `cli.test.ts`/`completions.test.ts` additions) for `test.todo`/`it.todo`
      and confirm zero remain (ledger 7.6)
- [ ] 9.3 `mise run cospec -- archive unknown-option-contract` as the last
      commit on the branch
