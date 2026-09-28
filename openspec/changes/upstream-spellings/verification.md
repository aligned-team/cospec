# Verification

## 1. Upstream spellings reach cospec [critical]

- [ ] 1.1 @regression (agent) `cospec init --tools claude,codex` in an empty temp dir, and the same argv through the pinned binary via the oracle -> before: exit 1, `cospec init: '--tools' is not supported yet`; after: exit 0, `.claude/` and the codex harness files written, no `./claude,codex` directory in either tool's tree, and `cospec init --tools` alone refused as `option '--tools <tools>' argument missing`, exit 1, as the binary refuses it
- [ ] 1.2 @regression (agent) `cospec experimental --tool claude` and `cospec init --harness claude` in two empty temp dirs -> before: `unknown command 'experimental'`, exit 1; after: both exit 0 with `hashTree` equal, `experimental`'s stdout starting `Note: "cospec experimental" is deprecated. Use "cospec init" instead.`, `experimental` absent from `cospec --help`, and `experimental --store x` refused as an unknown option like the binary
- [ ] 1.3 @equivalence (agent) key oracle: `cospec new change foo --schema feat --json` vs `openspec new change foo --schema feat --json` in two copies of one cospec-initialised root -> every key path of the binary's document exists in cospec's with the same JSON type, `change.id` = `foo`, `change.schema` = `feat`, `root.path` equal to that copy's root, and `type`/`dir`/`artifacts` present beside them
- [ ] 1.4 @regression (agent) `cospec new change foo --initiative x`, `--areas x`, and each with `--json`, in a root and outside any root -> before: `'change' is not supported yet`; after: exit 1 with the binary's removed-option message on stderr (text) or one `{change: null, status}` document with code `initiative_option_removed` / `areas_option_removed` and `target: change.options` (`--json`), equal to the oracle's, no change directory created, and neither flag in `cospec new --help` or the completion scripts
- [ ] 1.5 @regression (agent) `cospec update ./other` from a parent whose `./other` is cospec-initialised with one managed file edited -> before: exit 1, `'[path]' is not supported yet`; after: exit 0, the edited file under `./other` regenerated, the parent's tree hash unchanged; `cospec update ./missing` refused with `no openspec/ directory at <abs>/missing`, exit 1
- [ ] 1.6 @regression (agent) `cospec completion generate zsh` vs `cospec completion zsh`, `completion generate zsh extra`, `completion generate --json` -> before: `'generate' is not supported yet`; after: identical scripts, exit 0; too many arguments exit 1 as the binary; the one-document JSON refusal for `--json`
- [ ] 1.7 @regression (agent) `cospec new change foo` in a root whose `config.yaml` says `schema: feat`, and in an upstream-initialised root (`schema: spec-driven`) -> the first creates a `feat` change with `schemaVersion: 2`; the second creates a legacy-lane `spec-driven` change, as the binary would
- [ ] 1.8 @regression (agent) `cospec new change foo --goal "ship it"` and `cospec new feat bar --goal "ship it"` -> before: refused (pending / unknown option); after: each `.openspec.yaml` holds `goal: ship it` beside `schema:` and `created:`
- [ ] 1.9 @regression (agent) `cospec new feat bar --json` -> before: `{change, type, dir, artifacts}`; after: the same keys plus `root` equal to the wrapped document's `root`
- [ ] 1.10 @regression (agent) `cospec new change foo --schema nope --json` -> the binary's `Schema 'nope' not found. Available schemas: …` status relayed as one document, exit 1; `cospec new nope foo` keeps cospec's own unknown-type table
- [ ] 1.11 @equivalence (agent) `apps/cli/test/contract/upstream-spellings.test.ts` runs every row above plus `instructions` rows through cospec and the oracle -> file green, 0 fail, no `test.failing` left

## 2. Program-level help [critical]

- [ ] 2.1 @regression (agent) `cospec help`, `help list`, `help config path`, `help new change`, `help experimental`, `help --bogus`, `help --json`, `help list extra`, `help -- list`, `help -V` -> before: `unknown command 'help'`, exit 1; after: each prints on stdout what `cospec --help` / `cospec <first operand> --help` prints (the version for `-V`), exit 0, matching the binary's outcome class
- [ ] 2.2 @regression (agent) `cospec help bogus`, `cospec help help` -> program help on stderr, empty stdout, exit 1, as the binary
- [ ] 2.3 @equivalence (agent) `precedence-matrix.test.ts` `help` rows (the three former `PENDING_ROWS` plus 2.1/2.2) -> every row agrees with the binary; no row carries `pending: { owner: 'upstream-spellings' }`

## 3. instructions forwarding and one document [critical]

- [ ] 3.1 @regression (agent) `cospec instructions proposal --change foo --schema spec-driven --json` and `--schema nope --json` -> before: `'--schema' is not supported yet`; after: the wrapped call received `--schema`, the success document (or the binary's `Schema 'nope' not found` status, exit 1) as the oracle's
- [ ] 3.2 @regression (agent) `cospec instructions proposal --json`, `instructions --change foo --json`, `instructions --json`, `instructions apply --json` (no `--change`) in a root with two changes -> before: text refusals (`--change <id> is required`, `missing required argument 'artifact'`, apply's missing change); after: stdout is exactly one JSON document whose status message is the binary's (`Missing required option --change. Available changes: …` / `Missing required argument <artifact>. Valid artifacts: …`), exit 1; the text forms print the binary's message; and `cospec instructions apply --change nope --json` prints exactly one document, exit 1
- [ ] 3.3 @regression (agent) `cospec instructions proposal --change nope --json` and text, in a root with no changes -> one document / one stderr message whose `Create one with:` names `cospec new <type> <name>` and no bare `openspec` (through the shared helper after the rebase), exit 1
- [ ] 3.4 @equivalence (agent) `precedence-matrix.test.ts` `instructions` rows (`--change x`, `--change x --json`, `--store-path /x`, `--json`, `proposal --schema --help`) -> each agrees with the binary; none is `cospecOnly`

## 4. instructions success path names cospec, never rewrites user bytes [critical]

- [ ] 4.1 @equivalence (agent) text rendering: `cospec instructions <artifact> --change <id>` on a project-local-schema change with no references — plain, blocked, `skip_specs`, `context` + `rules`, and a `context` forging `</task>` and `<referenced_stores>` -> stdout byte-identical to the binary's text for the same argv; `--json` byte-identical to the binary's document
- [ ] 4.2 @regression (agent) a root whose `config.yaml` references a registered store `openspec-shared` (checkout under a path holding `/openspec/`), an unregistered store with a remote, and one without -> before: `Fetch: openspec show …`, `Fix: git clone … && openspec store register …`, `Fix: Get a checkout … run: openspec store register …` relayed; after: those lines and `references[].fetch` / `references[].status[].fix` name `cospec`, the id `openspec-shared` and every path unchanged, and every other byte equals the binary's answer with only those fields respelled
- [ ] 4.3 @unit (agent) the `instructions` field map through the shared helper -> a whole-value match of each `references/*` allowlist entry is respelled; `Use kebab-case store ids in the references list.`, a value with extra text, a `specs[].summary` or a `context` holding the same sentence is untouched
- [ ] 4.4 @regression (agent) `cospec instructions proposal --change <id>` on a `spec-driven` change in an upstream-initialised root -> before: the ten `schemas/spec-driven/**` lines relayed naming bare `openspec`; after: each names `cospec`, text and `--json`, and no other `instruction`/`template` line changes
- [ ] 4.5 @regression (agent) the same change with a project copy of `spec-driven` under `openspec/schemas/spec-driven/` -> `schema which spec-driven --json` reports `source: project`, and the answer equals the binary's byte-for-byte
- [ ] 4.6 @equivalence (agent) `remedy-enumeration.test.ts` -> no `REACHABLE_OWNED` row names `upstream-spellings` or the `instructions` relay, `SUCCESS_RELAYS` no longer lists `instructions`; the ten schema lines are `REMEDY_SOURCES` rows naming `SCHEMA_LINES` entries; the file is green

## 5. Reachability aliases [critical]

- [ ] 5.1 @equivalence (agent) `reachability.test.ts` walks `init --tools` -> it resolves to `aliases.yaml` alone through the `flag` kind; negative cases on mutated inputs fail as designed: entry removed (resolves nowhere), table marking removed (two places), entry with no marking, `--harness` removed
- [ ] 5.2 @equivalence (agent) walk `new change`, `completion generate`, `experimental` -> each resolves to `aliases.yaml` alone; `new change --schema/--description/--goal/--initiative/--areas`, `new change` positional 0 and `completion generate` positional 0 resolve to the table; the two-way alias check passes and fails on a mutated marking
- [ ] 5.3 @equivalence (agent) `parity-pending.yaml` -> the seven entries of design decision 3 are absent, the `[completion, generate]` `powershell` entry (owner `completion-install`) and its hidden fixture are present, and `upstream-spellings` is absent from `PendingOwner`, `KNOWN_OWNERS` and `OWNERS`
- [ ] 5.4 @unit (agent) `command-table.test.ts` -> the parser stores an alias flag's value under `--harness` and records the typed spelling; last-wins across `--tools`/`--harness`; `--tools` with no value refused naming `--tools <tools>`; hidden flags absent from `offeredFlags`; the `help` row's lenient operands ignore undeclared options and excess operands; the pending list holds no `upstream-spellings` row
- [ ] 5.5 @unit (agent) `commandRow('experimental')`, `commandRow('help')` and `COMMAND_MODULES` -> both rows live in `COMMAND_TABLE` (`core/command-table.ts`) with a module each in `COMMAND_MODULES` (`cli.ts`), and `cli.ts` declares no command list of its own

## 6. Remedy enumeration reads YAML by its syntax

- [ ] 6.1 @regression (agent) `remedy-enumeration.test.ts` with a mutated in-memory copy of `schemas/spec-driven/schema.yaml` whose block scalar gains `## Run openspec list first` -> before: the line is skipped as a comment and the test passes; after: the test fails naming that line, and a real `# comment` line naming `openspec init` is still skipped

## 7. Differential flips and relay reasons

- [ ] 7.1 @equivalence (agent) `unknown-option-differential.test.ts` former `pending` rows (`init --tools claude .`, `update .`, `update --force .`, `new change x`, `completion generate bash`, `instructions … --schema spec-driven`) -> each now `same` (or `cospec-only` where declared), passing; `experimental --json` is `cospec-only`, `help --bogus` (both parsed, exit 0) and `experimental --bogus` (both parse-rejected, exit 1) are `same`
- [ ] 7.2 @unit (agent) `support/remedy-sources.ts` `notRelayed.EXPERIMENTAL` -> states that `cospec experimental` is native, prints its own respelled note and never spawns the binary's `experimental`; no reason names a command this change adds as absent
- [ ] 7.3 @unit (agent) `git grep -n 'test\.failing\|test\.todo'` over every file this change touched -> no match

## 8. Docs and shared guidance

- [ ] 8.1 @manual (agent) `apps/docs/reference/commands.md` -> documents `init --tools`, `new change <name> [--schema] [--description] [--goal]`, the removed-option messages, `update [path]`, `completion generate [shell]`, `help [command]`, `instructions [artifact] --schema`, and that `instructions` answers are built from the binary's document with only command-bearing fields respelled; the stale "`instructions <artifact>` are required" and "relayed untouched" lines are corrected
- [ ] 8.2 @manual (agent) `apps/docs/guide/installation.md` -> the completion section names `cospec completion generate [shell]` as upstream's spelling of `cospec completion [shell]`
- [ ] 8.3 @integration (agent) `apps/docs/.vitepress/parity.data.ts` reads `aliases.yaml` and `apps/docs/concepts/how-it-relates-to-openspec.md` renders the upstream-spelling list from it; run `mise run docs:build` -> it succeeds and the rendered list equals `aliases.yaml` entry for entry, and the still-being-implemented list no longer shows this change's seven surfaces
- [ ] 8.4 @manual (agent) `docs/architecture.md` -> the reachability section describes the table `aliasOf` marking and the two-way alias check; the instructions section describes the document-built answer and the field map
- [ ] 8.5 @integration (agent) `.agents/shared.md` parity-gate paragraph names the alias marking + `aliases.yaml` pairing, and its relayed-remedies paragraph names the document-built `instructions` answer (field map, `SCHEMA_LINES` for the pinned built-in schema only) in place of "a schema's own text must pass through byte-for-byte" for that schema; `mise run agents:sync` then `mise run agents:check` -> zero drift in `CLAUDE.md` / `AGENTS.md`

## 9. Agent-facing output

- [ ] 9.1 @eval (human) `mise run eval:e2e` with a `spec-driven` change and a references fixture in the eval set -> advisory report: no agent transcript runs a bare `openspec` command taken from `cospec instructions` output, and scores do not regress against the last main run

## 10. Suite

- [ ] 10.1 @integration (agent) `mise run test` -> 0 fail
- [ ] 10.2 @integration (agent) `mise run test:contract` -> 0 fail
- [ ] 10.3 @integration (agent) `mise run test:integration` -> 0 fail
- [ ] 10.4 @integration (agent) `mise run generate:check` -> zero diff
- [ ] 10.5 @integration (agent) `mise run check` -> green
