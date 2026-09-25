# Verification

## 1. Unknown and pending options are refused, never leaked [critical]

- [ ] 1.1 @regression (agent) `cospec validate --type change x` in a fixture repo holding a change named `change` -> before: validates the item `change` and reports on it; after: exit 1, stderr `cospec validate: '--type' is not supported yet`, and no validation output for any item
- [ ] 1.2 @regression (agent) `cospec status --schema custom` -> before: `unknown change 'custom'`; after: exit 1 with the not-supported-yet message and no change lookup
- [ ] 1.3 @regression (agent) `cospec init --language fr .` in an empty temp dir -> before: scaffolds `./fr`; after: exit 1 with the not-supported-yet message and no `fr` directory on disk
- [ ] 1.4 @regression (agent) `cospec list --bogus`, `cospec context --bogus`, `cospec view --bogus`, `cospec doctor --bogus`, `cospec sync-blockers --bogus` -> before: each exits 0; after: each exits 1 with `cospec <command>: unknown option '--bogus'` and produces none of its normal output
- [ ] 1.5 @unit (agent) table parser: `--flag value`, `--flag=value`, a value-taking flag with no value (`cospec status: option '--change <slug>' argument missing`), a pending flag consuming its value, `--schem` suggesting `--schema`, and a positional after flags -> each assertion passes in `apps/cli/test/unit/core/command-table.test.ts`
- [ ] 1.6 @unit (agent) every `COMMANDS` entry has a table row, every row with parse policy `table` has a `commands/<name>.ts` that reads `ctx.parsed`, and no `table` command module still calls `args.includes` / `args.find((a) => !a.startsWith('-'))` (`forward` modules are exempt: they hand `ctx.args` to the binary) -> a grep-style unit test over the `table` modules in `apps/cli/src/commands/*.ts` passes
- [ ] 1.7 @regression (agent) `cospec view --json` in a fixture repo -> before: exit 0, the dashboard printed and `--json` silently ignored; after: stdout is exactly one JSON document `{version: 1, command: 'view', ok: false, message}`, exit 1, no `openspec view` spawned; the pinned binary's `openspec view --json` (exit 1, `error: unknown option '--json'`) lands in the same parse-rejected class in the differential; `cospec completion --json` output is byte-identical to before

## 2. Accepted no-ops and `--store-path` [critical]

- [ ] 2.1 @integration (agent) `cospec archive <change> -y` on an archive-ready fixture, `cospec init --no-animation .` in a temp dir, `cospec list --changes` -> each behaves exactly as without the flag; exit codes 0
- [ ] 2.2 @regression (agent) `cospec --store-path /x list` and `cospec list --store-path /x` and `cospec list --store-path=/x` -> before: `unknown command '/x'` / exit 0 / exit 0; after: each prints the redirect text naming `cospec store register <path>` and `--store <id>`, contains no `openspec`, and exits 1
- [ ] 2.3 @equivalence (agent) the redirect text equals the pinned binary's `openspec list --store-path /x` stderr with `openspec` replaced by `cospec` and nothing else; `cospec list --json --store-path /x` stdout is one JSON document whose `status[0]` has `code` `store_path_not_supported` and `target` `store.id`, matching the oracle's envelope with the same respelling -> contract test passes against the pinned binary

## 3. Help and completion read the table

- [ ] 3.1 @regression (agent) `cospec show --help` -> before: no `--diff`, `--requirements-only` described as the spec filter; after: lists `--diff`, `--requirements`, and describes `--requirements-only` as the deprecated alias of `--deltas-only`; exit 0
- [ ] 3.2 @unit (agent) `buildCompletionSpec()` per-command flags equal each table row's handled and accepted-no-op flags, pending flags absent, hidden commands absent; the existing bash/zsh/fish syntax checks in `apps/cli/test/integration/completion.test.ts` still pass -> green
- [ ] 3.3 @unit (agent) for every non-hidden command, the set of flags `--help` prints equals the set the completion spec offers equals the set the parser accepts (minus pending) -> a three-way parity unit test passes

## 4. Reachability: every pinned surface resolves [critical]

- [ ] 4.1 @equivalence (agent) `apps/cli/test/contract/reachability.test.ts` walks `COMMAND_REGISTRY` (command paths, positionals, flags, flag values), `AI_TOOLS`, `TOOL_ID_ALIASES`, `ALL_WORKFLOWS` from the pinned dist -> every entry resolves to exactly one of the table, `aliases.yaml`, `exceptions.yaml`, `deprecated.yaml`, `parity-pending.yaml`; the test fails when an entry is removed from all five or listed in two
- [ ] 4.5 @equivalence (agent) reachability is two-way: every table flag or value marked `pending` has exactly one `parity-pending.yaml` entry with the same owner, and every `parity-pending.yaml` entry names a walked (or `source: cli`) surface the table marks `pending` for that owner -> the test passes; adding a stale entry (a handled flag such as `list --specs`) to `parity-pending.yaml`, or marking a table flag pending with no YAML entry, each makes the test fail naming the entry; the test reads cospec's harness ids only through the `HARNESS_NAMES` export of `apps/cli/src/harness/adapters.ts`
- [ ] 4.2 @equivalence (agent) `parity-pending.yaml` -> every entry carries a change slug; the entries are exactly those the design's pending table lists (owners `upstream-spellings`, `cli-surface-parity`, `archive-and-sync-parity`, `tool-matrix`, `github-copilot`, `completion-install`, `workflow-profiles`) and nothing else
- [ ] 4.3 @equivalence (agent) `deprecated.yaml` -> the test confirms `change` carries "(deprecated)" in its registry description and `openspec spec list` prints its deprecation warning on stderr in the oracle fixture; temporarily blanking either mark makes the test fail
- [ ] 4.4 @equivalence (agent) `exceptions.yaml` -> exactly one entry, the self-upgrade offer; a second entry fails the test

## 5. Per-command differential against the pinned binary [critical]

- [ ] 5.1 @equivalence (agent) for every `table` command, the fixture runs the argv rows (`validate --typo x`, `status --schem custom`, `list --sortt`, `list --changes`, `archive c -y`, `init --no-animation .`, `view --json`, `list --store-path /x`, a missing-value row per value-taking flag, and one unknown-option row per command) through `cospec` and the pinned binary -> each pair lands in the same class (parse-rejected or parsed) and exit codes are equal whenever both are parse-rejected
- [ ] 5.2 @equivalence (agent) rows marked `cospec-only` (`list --blocked`, `validate --fast`, `apply --allow-soft x`, `archive --force-incomplete x`, `init --harness none .`, `sync-blockers --check`, `feedback m --upstream`) -> cospec parses, the binary parse-rejects, the row passes; rows marked `pending` (every entry in the design's pending table that is a flag on a `table` command) -> cospec exits 1 with `is not supported yet`
- [ ] 5.3 @equivalence (agent) one unknown-option row per `forward` command (`show`, `templates`, `schemas`, `schema which`, `store list`, `workset list`, `config path`) -> cospec relays the binary's own `error: unknown option '--bogus'` and exit 1; for `show <item> --bogus` both tools produce the binary's `too many arguments` answer
- [ ] 5.4 @unit (agent) `support/upstream-oracle.ts` `oracleJson(['list','--json'], root)` on a scaffolded temp root -> returns `{exitCode: 0, json: {changes: [], root: …}}`, and a non-JSON stdout throws rather than returning a partial document

## 6. Docs and shared guidance

- [ ] 6.1 @integration (agent) `mise run docs:build` -> succeeds; the built `concepts/how-it-relates-to-openspec` page contains a named-exceptions section listing the self-upgrade exception and the `change`/`spec` deprecations, and a still-being-implemented list whose entries equal `parity-pending.yaml` entry for entry (asserted by a script that parses the YAML and greps the built HTML)
- [ ] 6.2 @manual (agent) `apps/docs/concepts/how-it-relates-to-openspec.md` frontmatter `description` -> no longer says "wraps OpenSpec rather than replacing it"; it agrees with the page's own drop-in sentence
- [ ] 6.3 @manual (agent) `apps/docs/reference/commands.md` -> states the unknown-option contract (refusal text, closest-match line, `not supported yet` for pending flags, exit 1, `--store-path` redirect, the three accepted no-ops, forwarded commands relaying the binary's answer), once, on that page
- [ ] 6.4 @manual (agent) `docs/architecture.md` -> describes the command table, the two parse policies, and the reachability test as the parity gate, with the four dist sources named
- [ ] 6.5 @manual (agent) `.agents/shared.md` -> states that the reachability test is the parity gate and that exceptions live only in `exceptions.yaml`; `mise run agents:sync` run and `mise run agents:check` clean
- [ ] 6.6 @integration (agent) `apps/docs/package.json` pins `yaml` `2.9.0` exactly and `bun.lock` is regenerated in the same commit -> `bun install --frozen-lockfile` at the repo root succeeds

## 7. Suite

- [ ] 7.1 @unit (agent) `mise run test` -> green
- [ ] 7.2 @equivalence (agent) `mise run test:contract` against the pinned binary -> green, including `reachability.test.ts` and the differential fixture
- [ ] 7.3 @integration (agent) `mise run test:integration` -> green
- [ ] 7.4 @integration (agent) `mise run generate:check` -> zero diff (the table changes no managed file)
- [ ] 7.5 @integration (agent) `mise run check` -> green end to end
- [ ] 7.6 @manual (agent) close-out: `grep -nE '(test|it)\.todo' apps/cli/test/unit/core/command-table.test.ts apps/cli/test/contract/reachability.test.ts apps/cli/test/contract/unknown-option-differential.test.ts` and the new `cli.test.ts`/`completions.test.ts` cases at archive time -> zero matches; no differential row is left skipped
