# Verification

## 1. Setting nothing changes nothing [critical]

- [x] 1.1 @e2e (agent) `cospec init --harness claude` in a fresh repo, with a sandboxed global config that has no `profile` key and, in a second run, one holding only `{"delivery":"both"}` -> profiles.test.ts (nothing set; a `delivery` key alone) -> twelve skills and twelve commands written both times, no `Workflows:` line
- [x] 1.2 @equivalence (agent) render the twelve bodies for every shipped row with all twelve installed and compare with the golden captured in task 1.4 and with the committed `.claude/`, `.agents/`, `.codex/`, `.opencode/` output -> full-set-golden.test.ts (5 tests) byte-compares the twelve bodies for every shipped row with the committed `.claude/`, `.agents/`, `.codex/`, `.opencode/` output, and `mise run generate:check` -> no drift; `mise run check` exit 0
- [x] 1.3 @integration (agent) `cospec update --check` on a repo initialised by the previous release, global config absent -> profiles.test.ts `update --check` on a repo init'd by this build with nothing set (its files byte-equal to the pre-change golden of 1.2) -> exit 0, 'no drift', every file unchanged
- [x] 1.4 @integration (agent) `cospec init` and `cospec update` against a global config with no `profile` key -> profiles.test.ts `a global config with no profile key` -> cospec init and update left `{"delivery":"both"}` byte-identical, while the pinned `init` run twice on a copy (it migrates once it finds its own skills) wrote `profile: custom`

## 2. `init --profile core` installs exactly the six [critical]

- [x] 2.1 @e2e (agent) `cospec init --harness claude --profile core` in a fresh repo -> profiles.test.ts (`--profile core`, and the `core` key) plus a sandbox run -> exactly propose, explore, apply, update, sync-specs, archive as six skills and six commands, receipt `Workflows: 6 of 12 (profile core, set by --profile)`
- [x] 2.2 @integration (agent) `cospec doctor` on the repo of 2.1 -> profiles.test.ts `a repo whose profile came from the flag alone` and the matrix cell `core by flag only` for 16 harness rows -> doctor exit 0, no dangling-ref, stale-harness, mixed-versions or drift finding; one INFO `installed-workflows` names the six it would install (see the judgment call: nothing remembers the flag)
- [x] 2.3 @integration (agent) the same with the global config key `{"profile":"core"}` and no flag, and with the flag overriding `{"profile":"custom","workflows":["archive"]}` -> profiles.test.ts (`core` key; `--profile core` over `custom [archive]`; `delivery` alone) -> six, six, twelve
- [x] 2.4 @integration (agent) every rendered core body, searched for `/cospec:new`, `/cospec:continue`, `/cospec:ff`, `/cospec:verify`, `/cospec:bulk-archive`, `/cospec:onboard` -> narrowed-render.test.ts (no body names an uninstalled workflow, for every narrowed set) and workflow-references.test.ts -> no match for `/cospec:new|continue|ff|verify|bulk-archive|onboard` in any core body; `update`'s hand-off reads as a raw `cospec` command
- [x] 2.5 @equivalence (agent) `cospec init --profile bogus` beside `openspec init --profile bogus` in a sandbox -> profiles.test.ts `init --profile validation` beside the pinned binary -> both exit 1 with `Invalid profile "bogus". Available profiles: core, custom` (cospec prefixed `cospec: `), nothing created

## 3. Custom profiles add `sync-specs` as the binary does [critical]

- [x] 3.1 @e2e (agent) global config `{"profile":"custom","workflows":["archive"]}` and `cospec init --harness claude` -> profiles.test.ts and a sandbox run with `custom [archive]` -> `.claude/skills` holds cospec-archive-change and cospec-sync-specs only, doctor exit 0, the archive body reads `` `cospec apply <slug>` it next``
- [x] 3.2 @equivalence (agent) `workflow-set.ts` against the pinned `core/profiles.js` `getProfileWorkflows` over `[archive]`, `[verify, bulk-archive]`, `[sync, archive]`, `[]`, `undefined` and an unknown id -> workflow-set.test.ts `against the pinned getProfileWorkflows` -> same lists for `[archive]`, `[verify, bulk-archive]`, `[sync, archive]`, `[]`, undefined and an unknown id; `sync` read as `sync-specs`, spliced before the first archive/bulk-archive
- [x] 3.3 @integration (agent) explicit `custom` with no `workflows` key, then `workflows: "archive"` (not an array) -> profiles.test.ts and a sandbox run -> explicit `custom` with no `workflows`, and `workflows: "archive"`, each install nothing; the receipt says `Workflows: 0 of 12 (profile custom, set by the global config; no workflows selected)`, exit 0

## 4. `update` never removes an installed workflow [critical]

- [x] 4.1 @e2e (agent) a twelve-workflow repo, global config `{"profile":"core"}`, `cospec update` -> profiles.test.ts `an explicit core key over twelve installed workflows removes nothing` -> every file unchanged, no `removed` outcome in `--json`, exit 0
- [x] 4.2 @integration (agent) `cospec doctor` on the repo of 4.1 -> profiles.test.ts doctor rows -> one INFO `openspec-global-profile` naming new, continue, ff, bulk-archive, verify, onboard; no finding contains "inert"
- [x] 4.3 @integration (agent) a core-six repo whose profile becomes `custom` adding `verify`, `cospec update` -> profiles.test.ts `a custom profile that adds verify creates only verify` -> only the verify skill and command created
- [x] 4.4 @integration (agent) twelve claude workflows, then `cospec init --harness opencode` under explicit core -> profiles.test.ts `a harness added later gets the profile set while claude keeps twelve` -> opencode six, claude twelve
- [x] 4.5 @integration (agent) a repo initialised with `custom ["archive"]` (no `propose` skill) and one under `delivery: commands`, `cospec update` -> profiles.test.ts and update-profile.test.ts detection rows -> claude detected with no propose skill and under commands only; the codex-versus-agents detection cases still pass

## 5. Delivery switches both ways [critical]

- [x] 5.1 @e2e (agent) `delivery: skills`, `cospec init --harness claude` -> profiles.test.ts and matrix -> `delivery: skills` writes twelve skills, nothing under `.claude/commands/cospec/`, and no skill body names a `/cospec:` command
- [x] 5.2 @e2e (agent) `delivery: commands`, `cospec init --harness claude` -> matrix (claude, delivery commands, every profile) -> commands only, no `.claude/skills/cospec-*`
- [x] 5.3 @integration (agent) one repo through `both`, `skills`, `commands`, `both` with `cospec update` between each -> profiles.test.ts `delivery skills, then commands, then both` -> each step removes only the dropped surface's cospec files, every workflow stays installed, the last step restores both, doctor clean in every matrix cell
- [x] 5.4 @integration (agent) `delivery: commands` with `--harness agents`, and with `--harness codex`, and with both -> profiles.test.ts, render-delivery.test.ts and matrix -> agents alone under `commands` writes nothing (no marker either) and the receipt says `No skills or commands were generated for …`; codex keeps its skills and rules file; both selected keep the shared root
- [x] 5.5 @equivalence (agent) delivery predicates against the pinned `core/command-surface.js` over a fixture row of each capability -> delivery.test.ts `each predicate equals the binary over every upstream row and delivery` -> same answers for all four predicates

- [x] 5.6 @e2e (agent) `delivery: skills` with `--harness claude`, `delivery: commands` with `--harness agents,hermes`, `--harness claude` and `--harness codex` -> profiles.test.ts `init: the receipt names only what was written` plus setup-notes.test.ts, workflow-receipt.test.ts and update-restart.test.ts delivery rows -> skills prints a `/cospec-propose` hint and no Claude command restart line; agents and hermes under commands print the zero-artifact line and no `Try:`, setup note or shared-root line; claude and codex keep their notes and hints
- [x] 5.7 @e2e (agent) custom `["archive"]` and custom `["new"]` with `--harness claude` -> profiles.test.ts `a profile without propose or new` and `a profile with new but not propose` -> `Try: cospec new feat <slug>` then the `config profile` line; `Try: /cospec:new …` and no raw command

## 6. A malformed marker fails with the binary's message [critical]

- [x] 6.1 @equivalence (agent) cospec's `resolveOptionalWorkflows` and the pinned `core/templates/optional-workflow.js` over one matrix (nested, missing end, `end` before `if`, an unrecognised `[[opsx:` marker, a truncated block in the dropped branch, whole-line and inline, empty branch, an unknown id) -> optional-workflow-differential.test.ts -> 198 cells identical to the pinned module's output or thrown message
- [x] 6.2 @integration (agent) a canon fixture body holding `[[opsx:if-workflow apply]]x[[opsx:end]]` through `cospec update` in a repo copy -> profiles.test.ts `a canon body with a malformed conditional` (a source copy with a bad apply.md, run as `update` in a repo) -> exit 1 with the binary's `markers are out of order or a block is incomplete` message, project tree hash unchanged
- [x] 6.3 @integration (agent) a body that skips resolution reaching the write point -> profiles.test.ts `a body that skips resolution` (a source copy whose render skips resolution) -> exit 1 with `Skill 'cospec-propose' was generated without resolving its optional-workflow blocks: …`, tree unchanged; the `Command '<id>'` form is pinned in optional-workflow.test.ts and the differential
- [x] 6.4 @unit (agent) the canon check over the twelve bodies -> workflow-references.test.ts -> no bare `/cospec:<id>`, every marker id one of the twelve, no fallback names `/cospec:`

## 7. `--language` refuses a context that differs [critical]

- [x] 7.1 @e2e (agent) `cospec init --language Português` in a fresh repo -> profiles.test.ts `init --language` and a sandbox run with Português -> `config.yaml` has `context: |` and the three directive lines, equal to the pinned binary's
- [x] 7.2 @equivalence (agent) a repo whose `config.yaml` context lacks the directive, `cospec init --language English` beside the pinned `openspec init --tools claude --language English` -> profiles.test.ts binary-paired rows -> both exit 1 with the does-not-overwrite message (cospec prefixed), no file changed; no `context` likewise; the same value already present exits 0 on both
- [x] 7.3 @equivalence (agent) `--language "  "`, a value with a control character, one with `U+200B`, and one over 50 KB, beside the binary -> profiles.test.ts -> blank, control character, U+200B and over-50KB values each refused with the binary's message, exit 1, nothing created
- [x] 7.4 @integration (agent) `--language` with an unwritable `openspec/` destination -> profiles.test.ts -> `Cannot create openspec/config.yaml for --language: the destination is not writable.`

- [x] 7.5 @equivalence (agent) `init` over a config-only `openspec/` whose `config.yaml` holds `store: team-plans`, `schema: [`, `store: 5`, or sits in `config.yml`, in the project and in a subdirectory, with and without `--language en`, beside the pinned binary -> profiles.test.ts `init: a config-only openspec dir that declares a store` -> both exit 1 with the same text (`openspec init` spelled `cospec init`), the pointer message wins over `--language`, and the project tree hash is unchanged (a legacy `.kimi` root is not moved); a real root with a `store:` line still initialises

- [x] 7.6 @equivalence (agent) `init --language English` over a `config.yaml` that is a bare string, empty, `0`, unparseable, has a non-string or over-50KB `context`, and one with invalid `schema`, `rules`, `operations`, `references`, `store` and `githubCopilot` fields, beside the pinned binary -> profiles.test.ts `init --language` warning rows -> stderr identical line for line (the warnings, then the refusal), and a config that already carries the directive prints its warning once and exits 0

## 8. The pending list is empty

- [x] 8.1 @integration (agent) `grep -c "owner: workflow-profiles" apps/cli/test/contract/parity-pending.yaml` before and after, and the reachability test inside `mise run test:contract` -> `grep -c "owner: workflow-profiles" parity-pending.yaml` -> 0 (the file is `[]`); reachability.test.ts resolves `--profile` and `--language` to the table alone; `mise run check` runs the contract suite, 3184 pass, 0 fail
- [x] 8.2 @integration (agent) the reachability and command-table negative cases, retargeted to a synthetic row -> reachability.test.ts, command-table.test.ts, parse-rejection.test.ts and cli.test.ts now mark a synthetic `--pending-fixture` flag (or, for the reachability checker that must walk a pinned surface, `list --specs` on a table copy) -> every case fails for the reason it names; no `init --profile` or `init --language` is used
- [x] 8.3 @integration (agent) `mise run docs:build` with an empty `parity-pending.yaml` -> docs:build exit 0 and parity-docs-loader.test.ts (2 tests) -> the loader returns `pending: []`; the how-it-relates page renders without its still-being-implemented section
- [x] 8.4 @integration (agent) the reachability assertion that `parity-pending.yaml` is empty, run on the rebased branch -> reachability.test.ts `parity-pending.yaml is empty` on the rebased branch (origin/main f81499d3) -> passes, with completion-install, github-copilot and tool-matrix merged

## 9. Root-level legacy blocks follow the binary

- [x] 9.1 @equivalence (agent) the eight filenames against the pinned `core/legacy-cleanup.js` `LEGACY_CONFIG_FILES` -> legacy-config-blocks.test.ts `LEGACY_CONFIG_FILES is the binary's list, in its order` -> equal
- [x] 9.2 @equivalence (agent) `CLAUDE.md` holding only a block and `AGENTS.md` holding `keep me` plus a block, `cospec init --remove-opsx` beside `openspec init --tools claude --force` on a copy -> profiles.test.ts `a file holding only the block is written empty, never deleted` and legacy-config-blocks.test.ts against the pinned `removeMarkerBlock` -> CLAUDE.md zero bytes and kept, AGENTS.md `keep me\n`, byte-identical to the binary
- [x] 9.3 @integration (agent) an inline start-marker mention, a CRLF file, and a file with three blank lines around the block -> profiles.test.ts and legacy-config-blocks.test.ts -> inline mention untouched, CRLF kept, blank-line runs collapsed to two, as the binary's `removeMarkerBlock`
- [x] 9.4 @integration (agent) `cospec init` without consent, then `cospec doctor` -> profiles.test.ts `without --remove-opsx or --yes the files are listed and nothing changes`, and the doctor row -> files byte-identical, listed in `opsx.found`, one `opsx-leftover` WARNING per file

## 10. The generated config.yaml documents three more keys

- [x] 10.1 @integration (agent) `cospec init` in a fresh repo, then `openspec status` and `openspec doctor` in the sandbox -> profiles.test.ts `carries the commented operations, store and references examples` and `the pinned reader sees no warning in it` -> the file holds the three commented examples; `openspec new change` prints no warning for it
- [x] 10.2 @integration (agent) `cospec init` over an existing `config.yaml` -> profiles.test.ts `init over an existing config.yaml` -> byte-identical after a second init, with and without --language, and for a hand-written file

## 11. Dependencies rebased

- [x] 11.1 @integration (agent) after rebasing onto the `main` that carries `tool-matrix` and `github-copilot`, the full matrix of group 8's task over every row with a distinct command surface -> profiles.test.ts matrix over one row per distinct command surface (16 rows including github-copilot) x profile x delivery -> 17 tests pass; the D13 touch points are in the body of bf28f857 (the rebase's gate commit)
- [x] 11.2 @integration (agent) `cospec init --harness github-copilot --profile core` and `--copilot-cloud` together -> profiles.test.ts `github-copilot under a profile` -> six prompts and six skills written, both cloud files written, and a later `update` removes nothing and keeps them

## 12. The interactive surface

- [~] 12.1 @manual (human) run `cospec init --profile core`, `cospec init --language <lang>` and `cospec doctor` in a scratch repo from a terminal -> defer: @manual (human) row; an agent ran `init --profile core`, `init --language Português`, `init --language "  "` and `doctor` in a sandbox and read receipts, refusal (`cospec: The --language option requires a non-empty value.`) and findings as designed, naming `cospec` and never a bare `openspec`; the human terminal walkthrough remains

## 13. Docs and shared guidance

- [x] 13.1 @integration (agent) `mise run docs:build` and a grep for `no core/custom profile split` across `apps/docs` and `docs` -> `mise run docs:build` exit 0; grep for `no core/custom profile split` across apps/docs and docs -> none; harness-setup.md describes explicit-only profiles, delivery and never-removes
- [x] 13.2 @integration (agent) `apps/docs/reference/configuration.md` read against the table and this change's spec -> configuration.md documents `profile`, `workflows`, `delivery`, `context` and the config.yaml examples; the "inert" note is gone (grep empty)
- [x] 13.3 @integration (agent) `apps/docs/reference/commands.md` `init`, `update` and `doctor` rows and the BREAKING cases, each flag compared with `cospec init --help` -> commands.md init/update/doctor rows against `cospec init --help` in a sandbox -> `--yes --force --harness/--tools --gate/--no-gate --remove-opsx --language --profile --copilot-cloud/--no-copilot-cloud` all listed and described
- [x] 13.4 @integration (agent) `docs/harness-integration.md`, `docs/architecture.md` and `apps/docs/concepts/how-it-relates-to-openspec.md` -> harness-integration.md, architecture.md and how-it-relates-to-openspec.md -> no statement that profiles are absent or inert; architecture names the grammar port, the one reader and the capability derivation
- [x] 13.5 @integration (agent) `mise run agents:sync` then `mise run agents:check` -> `mise run agents:sync` then `agents:check` -> exit 0 (CLAUDE.md OK); shared.md states the explicit-only rule and the never-removes policy

- [x] 13.6 @unit (agent) every table in `apps/docs` and `docs` -> table-shape.test.ts -> header and delimiter agree on column count and no row carries more cells than the header; the test fails on the pre-fix `commands.md` `init` row (`--profile core | custom`), which now reads `--profile core\|custom`

## 14. The whole gate

- [x] 14.1 @integration (agent) `mise run check` on the rebased branch -> `mise run check` on the rebased branch -> exit 0
- [x] 14.2 @integration (agent) `mise run test:contract`, `mise run test:integration` and `mise run test:pack` -> `mise run check` (contract 3184 pass, integration 355 pass, unit 2932 pass), `mise run test:pack` (2 pass) and `mise run test:pack:standalone` (3 pass; the compiled binary's `init --profile core` writes six skills and six commands) -> exit 0
