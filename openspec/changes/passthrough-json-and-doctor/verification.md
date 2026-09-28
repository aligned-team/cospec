# Verification

Every expected answer below is the pinned binary's for the same argv on the same
fixture, run through `test/contract/support/upstream-oracle.ts` at test time
(Node runtime where a leading `--` matters) with only the allowlisted respelling
applied — never a hand-typed copy. "Before" is this branch's base.

## 1. Store and workset group refusals are the binary's [critical]

- [ ] 1.1 @regression (agent) `passthrough-json.test.ts`: `cospec store bogus --json`, `store --json`, `store --bogus --json`, `store --json -- --bogus` versus the oracle -> before: plain stderr `cospec store: unknown subcommand …`, no document; after: exactly one document, `status[0]` equal to the binary's (`unknown_store_subcommand`, fix unchanged) with `'cospec store'` in the message, exit 1
- [ ] 1.2 @regression (agent) text mode: `cospec store`, `store bogus`, `store --bogus`, `store -- --bogus`, `store new change x`, `store validate` versus the oracle -> before: cospec's one-line refusal; after: the binary's stderr with `Error: … 'cospec store'.` and the example spelled `cospec new <type> x --store <id>` / `cospec validate --store <id>`, exit 1, stdout empty
- [ ] 1.3 @regression (agent) `cospec workset --json`, `workset bogus --json`, `workset --json -- --bogus` versus the oracle -> before: plain stderr; after: one document with `unknown_workset_subcommand`, `'cospec workset'` in the message, exit 1
- [ ] 1.4 @regression (agent) text mode: `cospec workset`, `workset bogus`, `workset -- --bogus`, `workset --bogus`, and `cospec -- workset --bogus` through the published bin (a leading `--` survives it) -> before: `subcommand is required` / `unknown subcommand '--bogus'`; after: the binary's answer for each (`Missing subcommand for 'cospec workset'` for the `--`-guarded token, `error: unknown option '--bogus'` for the bare option), exit 1
- [ ] 1.5 @regression (agent) `cospec workset open x --json` and `cospec workset open <saved> --json` -> before: the handover ran and printed `Fix: Create it first: openspec workset create x`; after: one document, `status[0].code` `workset_open_json_unsupported`, fix `Inspect worksets with: cospec workset list --json`, exit 1, no tool launched (the saved workset's derived `.code-workspace` file untouched)
- [ ] 1.6 @equivalence (agent) `cospec workset open --json` and `workset open x --bogus --json` -> commander's refusal (`missing required argument 'name'`, `unknown option '--bogus'`) on stderr, exit 1, as the binary answers

## 2. Doctor folds OpenSpec's report on every root [critical]

- [ ] 2.1 @regression (agent) `doctor-parity.test.ts`: `cospec doctor --json` and `openspec doctor --json` on the same plain local root (no store, no `references:`) -> before: no `root`/`store`/`references`/`status` keys; after: all four equal the binary's (paths normalised), beside `version`/`findings`/`summary`
- [ ] 2.2 @equivalence (agent) the same key oracle on a `references:` root (usable, broken and unregistered stores), a `--store` root, and a store whose metadata is missing (`store_identity_mismatch`, exit 1) -> the four keys equal the binary's except the allowlisted `fix`/`message` sentences spelled `cospec …`; exit codes equal
- [ ] 2.3 @regression (agent) a root whose only config is `openspec/config.yml` declaring `references: [gone]` -> before: no reference finding; after: `openspec-reference-gone-reference_unresolved` finding and the binary's `references` entry, as `openspec doctor` reports; `checkConfig` names `config.yml`
- [ ] 2.4 @integration (agent) `doctor-relationship.test.ts`, inverted row: a plain local root runs the delegated call (a stub binary counts one `doctor --json` spawn), folds any diagnostic it returns, and prints no `openspec-root` INFO on a healthy plain root -> before: no delegated call; after: one call, text report otherwise unchanged
- [ ] 2.5 @regression (agent) `cospec doctor --json` in a directory with no OpenSpec root, with and without registered stores -> `findings` holds the one `initialized` ERROR, `status` carries the binary's `no_openspec_root` / `no_root_with_registered_stores` diagnostic with `cospec init` in its fix, exit 1
- [ ] 2.6 @unit (agent) `json-envelope.test.ts`: the delegated call's non-call-error path -> the WARNING remedy names `cospec doctor --json`; no finding, remedy or carried field of any doctor fixture in this group contains `openspec <word>` outside a path
- [ ] 2.7 @regression (agent) POST-REBASE: `cospec doctor` from `<root>/openspec/changes` of an initialized project -> before: `initialized` ERROR; after: the enclosing project's report with no `initialized` ERROR and `root.path` equal to the binary's

## 3. Context and schemas respelled structurally (post-rebase)

- [ ] 3.1 @regression (agent) `passthrough-json.test.ts`: `cospec context` and `context --json` on a root referencing `st1` (usable), `st2` (empty checkout), `gone` (unregistered) -> before: `Fetch: openspec show …`, `Fix: Run: openspec store doctor st2`, `…run: openspec store register <path> --id gone`; after: each spelled `cospec …`, the ids unchanged
- [ ] 3.2 @equivalence (agent) text and `--json` on four fixtures (the 3.1 root, self-references only, none declared, an unreadable registry) -> every line and field other than `fetch`/`fix` equals the binary's; `--json` stdout is the binary's document re-serialized byte-for-byte apart from those fields
- [ ] 3.3 @regression (agent) a store id, a root directory and a member path each shaped like `openspec show …` / `Run: openspec store doctor` -> printed as the binary printed them, text and `--json`; `relayed-remedies.test.ts` context success rows now assert this and the respelled fields
- [ ] 3.4 @integration (agent) `cospec context --code-workspace <p>` text mode, fresh path and existing path without `--force` -> the listing prints before the `Wrote …` summary / the `Error:`/`Fix:` refusal, as the binary orders them; the file-exists post-condition still holds; `--json` mode makes one call
- [ ] 3.5 @regression (agent) `cospec schemas` and `schemas --json` with no OpenSpec root and a registered store -> before: `run openspec init` relayed; after: equal to the binary's answer with `cospec init`, exit 1

## 4. Remedies are respelled on every relay

- [ ] 4.1 @regression (agent) `cospec store doctor nope`, `store unregister nope`, `store remove nope --json`, and a store doctor entry with a `Fix:` -> before: `Fix: Run openspec store list …`; after: `Run cospec store list to see registered stores.` in text and in the relayed document, every other field the binary's
- [ ] 4.2 @regression (agent) `cospec workset create w1 --member <p>` and `workset list` with none saved -> before: `openspec workset open w1` / `openspec workset create`; after: the two whole lines spelled `cospec workset …`, every other line the binary's
- [ ] 4.3 @regression (agent) `cospec config profile core` in a sandboxed config home -> before: ``Run `openspec update` …``; after: ``Config updated. Run `cospec update` in your projects to apply.`` then cospec's precedence note, exit 0
- [ ] 4.4 @unit (agent) `respellLines` on whole lines, embedded sentences and split sentences -> a whole allowlisted line is rewritten; the same sentence inside a member path, after a name, or split across lines is untouched
- [ ] 4.5 @unit (agent) `remedy-enumeration.test.ts` green with no `REACHABLE_OWNED` row owned by `passthrough-json-and-doctor`, `OWNERS` without it, `SUCCESS_RELAYS` without `context`/`workset`/`config`, and `config/profile-interactive-required` classified -> mutation: dropping `workset/none-saved` from the allowlist fails the classification test
- [ ] 4.6 @manual (agent) bare-`openspec` sweep: every `store`, `workset`, `config`, `doctor`, `schemas` and `context` argv in `passthrough-json.test.ts`'s matrix, text and `--json`, success and each reachable refusal, sandboxed -> no `openspec <word>` outside a path in stdout or stderr

## 5. Config parity

- [ ] 5.1 @regression (agent) `cospec config get foo --bogus --json`, `config path --bogus --json`, `config set a b --bogus --json` -> before: a cospec envelope (`found: false` / `path: ""`), exit 1; after: the binary's `error: unknown option '--bogus'` on stderr, stdout empty, exit 1
- [ ] 5.2 @regression (agent) `cospec config` and `cospec config --scope global` -> before: `cospec config: a subcommand is required (…)`; after: the text `cospec config --help` prints, on stderr, exit 1, as the binary prints its help on stderr with exit 1; nothing spawned
- [ ] 5.3 @equivalence (agent) `cospec config --json`, `config --scope global --json` -> the binary's `error: unknown option '--json'`, exit 1

## 6. Terminal-handover leaves pre-validate

- [ ] 6.1 @equivalence (agent) `handover-prevalidation.test.ts`: for `workset open`, `config edit`, `config profile`, `config reset --all`, every refusal argv of the differential matrix (unknown option, dangling `--tool`, missing name, excess argument, short clusters, `--store-path`, with and without `--json`) -> cospec's stderr and exit code equal the binary's, and no handover child is spawned (a stub binary records spawns)
- [ ] 6.2 @regression (agent) `cospec config edit --bogus --json` -> before: the `ok: false` envelope; after: `error: unknown option '--bogus'` on stderr, stdout empty, exit 1
- [ ] 6.3 @regression (agent) `cospec workset open <unsaved>` and `workset open <saved-without-tool>` with no TTY on stdin -> before: `Fix: Create it first: openspec workset create …` / `Fix: openspec workset open … --tool <id>` on the inherited stream; after: the binary's refusal with `cospec workset …`, exit 1
- [ ] 6.4 @regression (agent) `cospec config profile` with stdout piped -> before: ``Use `openspec config profile core` …``; after: ``Interactive mode required. Use `cospec config profile core` or set config via environment/flags.``, exit 1
- [ ] 6.5 @unit (agent) pre-flights with interactivity injected as a TTY -> `workset open` pre-flight answers an unsaved name and a workset with no surviving member folder through the piped call; `config profile` pre-flight relays the unreadable-config refusal respelled (`cospec config edit` / `cospec config reset --all`) and hands over only on the interactive-mode-required answer; any other pre-flight answer is a wrapped-call violation
- [ ] 6.6 @unit (agent) the `workset open` handover env and `notRelayed.TIP` -> the env carries `OPENSPEC_NO_COMPLETIONS=1`, `OPENSPEC_TELEMETRY=0`, `BUN_BE_BUN=1`; `notRelayed.TIP` states every spawn sets it
- [ ] 6.7 @manual (agent) under a pseudo-terminal (`script`, keystrokes fed on its stdin), sandboxed: `cospec config profile` through its menu, `cospec workset open <saved> --tool <uninstalled>`, `cospec config edit`, `cospec config reset --all` -> only the sentences design D11 enumerates can name bare `openspec`; each is recorded as the orchestrator ruled (task 7.2)

## 7. Missing working directory (post-rebase)

- [ ] 7.1 @regression (agent) `cospec store list`, `config path`, `workset list` with `--cwd <nonexistent>` -> before: `posix_spawn '<cospec runtime>' ENOENT`; after: `cospec: directory not found: <path>`, exit 1, nothing spawned
- [ ] 7.2 @equivalence (agent) the same six commands (`store`, `config`, `workset`, `context`, `doctor`, `schemas`), text and `--json` -> identical refusal text and, under `--json`, the resolver's `{status:[diagnostic]}` document

## 8. Parity gates

- [ ] 8.1 @unit (agent) `reachability.test.ts` -> green; `parity-pending.yaml` and the command table hold no entry or pending surface owned by `passthrough-json-and-doctor` (the change owns no registry surface)
- [ ] 8.2 @unit (agent) `grep -n "test.failing\|test.todo"` over the four new test files -> no hit
- [ ] 8.3 @integration (agent) the store, workset, context, config and doctor integration suites and the relayed-remedies, remedy-enumeration, unknown-option-differential and precedence-matrix contract suites (whose `store help` / `workset help` rows now compare the binary's respelled refusal by kind) -> green

## 9. Docs and gate

- [ ] 9.1 @manual (agent) `apps/docs/reference/commands.md` -> the doctor, store, workset, config and context rows state the fold on every root, the four keys, the binary's group refusals and `workset open --json` refusal
- [ ] 9.2 @manual (agent) `apps/docs/concepts/stores.md` -> "`cospec doctor` also checks store health" and the workset paragraph match the new behaviour
- [ ] 9.3 @manual (agent) `apps/docs/reference/configuration.md` -> states the no-subcommand help, the parse-refusal relay under `--json`, and the handover pre-validation
- [ ] 9.4 @manual (agent) `docs/stores.md` -> matches the store/workset/context relays
- [ ] 9.5 @manual (agent) `docs/architecture.md` -> the forward-row success relay and terminal-handover class passages state the structural respell, the pre-validation order and the D11 residual
- [ ] 9.6 @manual (agent) `.agents/shared.md` -> "Relayed remedies come from one allowlist" states the success-path rule (the binary's own guidance respelled only in parsed `--json` fields through the shared field-map helper, or as whole allowlisted lines) and the engineering-discipline handover sentence adds the pre-validation; `mise run agents:sync` run, `mise run agents:check` green
- [ ] 9.7 @manual (agent) `openspec/specs/openspec-relationship-health/spec.md` Purpose -> no longer limits the fold to store-backed or `references:` roots
- [ ] 9.8 @integration (agent) `mise run docs:build` -> succeeds
- [ ] 9.9 @integration (agent) `mise run check` -> green
