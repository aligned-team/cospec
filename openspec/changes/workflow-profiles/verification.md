# Verification

## 1. Setting nothing changes nothing [critical]

- [ ] 1.1 @e2e (agent) `cospec init --harness claude` in a fresh repo, with a sandboxed global config that has no `profile` key and, in a second run, one holding only `{"delivery":"both"}` -> twelve skills and twelve commands written both times, the same file list as before this change
- [ ] 1.2 @equivalence (agent) render the twelve bodies for every shipped row with all twelve installed and compare with the golden captured in task 1.4 and with the committed `.claude/`, `.agents/`, `.codex/`, `.opencode/` output -> byte-identical, every `contentHash` unchanged, `mise run generate:check` reports no drift
- [ ] 1.3 @integration (agent) `cospec update --check` on a repo initialised by the previous release, global config absent -> exit 0, every file `unchanged`
- [ ] 1.4 @integration (agent) `cospec init` and `cospec update` against a global config with no `profile` key -> the global config file is byte-identical afterwards, whereas the pinned `openspec init` on a copy writes `profile: custom` into it (the migration cospec does not port)

## 2. `init --profile core` installs exactly the six [critical]

- [ ] 2.1 @e2e (agent) `cospec init --harness claude --profile core` in a fresh repo -> exactly `propose`, `explore`, `apply`, `update`, `sync-specs`, `archive` as skills and commands, nothing else under `.claude/skills/cospec-*` or `.claude/commands/cospec/`, and the receipt carries the `Workflows: 6 of 12` line
- [ ] 2.2 @integration (agent) `cospec doctor` on the repo of 2.1 -> no `dangling-ref`, `stale-harness` or `mixed-versions` finding, exit 0
- [ ] 2.3 @integration (agent) the same with the global config key `{"profile":"core"}` and no flag, and with the flag overriding `{"profile":"custom","workflows":["archive"]}` -> six workflows both times; the built-in default alone (`{"delivery":"both"}`) gives twelve
- [ ] 2.4 @integration (agent) every rendered core body, searched for `/cospec:new`, `/cospec:continue`, `/cospec:ff`, `/cospec:verify`, `/cospec:bulk-archive`, `/cospec:onboard` -> no match; `update`'s hand-off to `continue` reads as a raw `cospec` command
- [ ] 2.5 @equivalence (agent) `cospec init --profile bogus` beside `openspec init --profile bogus` in a sandbox -> both exit 1 with `Invalid profile "bogus". Available profiles: core, custom` (cospec prefixed `cospec: `), nothing created by either

## 3. Custom profiles add `sync-specs` as the binary does [critical]

- [ ] 3.1 @e2e (agent) global config `{"profile":"custom","workflows":["archive"]}` and `cospec init --harness claude` -> exactly `sync-specs` and `archive` installed, doctor clean, the `archive` body's "apply it next" reads as `cospec apply <slug>`
- [ ] 3.2 @equivalence (agent) `workflow-set.ts` against the pinned `core/profiles.js` `getProfileWorkflows` over `[archive]`, `[verify, bulk-archive]`, `[sync, archive]`, `[]`, `undefined` and an unknown id -> same lists, `sync` read as `sync-specs`, `sync-specs` spliced immediately before the first `archive`/`bulk-archive`
- [ ] 3.3 @integration (agent) explicit `custom` with no `workflows` key, then `workflows: "archive"` (not an array) -> no workflow installed, the receipt says so, exit 0

## 4. `update` never removes an installed workflow [critical]

- [ ] 4.1 @e2e (agent) a twelve-workflow repo, global config `{"profile":"core"}`, `cospec update` -> every skill and command file byte-identical, no `removed` outcome in `--json`, exit 0
- [ ] 4.2 @integration (agent) `cospec doctor` on the repo of 4.1 -> one INFO `openspec-global-profile` finding naming `new`, `continue`, `ff`, `bulk-archive`, `verify`, `onboard`, and no finding containing "inert"
- [ ] 4.3 @integration (agent) a core-six repo whose profile becomes `custom` adding `verify`, `cospec update` -> only the `verify` skill and command are created
- [ ] 4.4 @integration (agent) twelve claude workflows, then `cospec init --harness opencode` under explicit core -> opencode six, claude still twelve
- [ ] 4.5 @integration (agent) a repo initialised with `custom ["archive"]` (no `propose` skill) and one under `delivery: commands`, `cospec update` -> `claude` is detected in both and the files regenerate; the existing codex-versus-agents detection cases still pass

## 5. Delivery switches both ways [critical]

- [ ] 5.1 @e2e (agent) `delivery: skills`, `cospec init --harness claude` -> twelve skills, no file under `.claude/commands/cospec/`, no skill body naming a `/cospec:` command
- [ ] 5.2 @e2e (agent) `delivery: commands`, `cospec init --harness claude` -> twelve commands, no `.claude/skills/cospec-*`
- [ ] 5.3 @integration (agent) one repo through `both`, `skills`, `commands`, `both` with `cospec update` between each -> each step removes only the dropped surface's cospec-managed files (a user file beside them survives), every workflow stays installed, the last step restores both surfaces, doctor clean at every step
- [ ] 5.4 @integration (agent) `delivery: commands` with `--harness agents`, and with `--harness codex`, and with both -> agents alone writes nothing and the receipt prints `No skills or commands were generated for …`; codex keeps its skills; both selected keeps the shared files
- [ ] 5.5 @equivalence (agent) delivery predicates against the pinned `core/command-surface.js` over a fixture row of each capability -> same answers for all four predicates

## 6. A malformed marker fails with the binary's message [critical]

- [ ] 6.1 @equivalence (agent) cospec's `resolveOptionalWorkflows` and the pinned `core/templates/optional-workflow.js` over one matrix (nested, missing end, `end` before `if`, an unrecognised `[[opsx:` marker, a truncated block in the dropped branch, whole-line and inline, empty branch, an unknown id) -> identical output or identical thrown message in every cell
- [ ] 6.2 @integration (agent) a canon fixture body holding `[[opsx:if-workflow apply]]x[[opsx:end]]` through `cospec update` in a repo copy -> exit 1 with the `markers are out of order or a block is incomplete` message, no file written, no partial tree
- [ ] 6.3 @integration (agent) a body that skips resolution reaching the write point -> `Skill '<name>' was generated without resolving its optional-workflow blocks` (and the `Command '<id>'` form), nothing written
- [ ] 6.4 @unit (agent) the canon check over the twelve bodies -> no bare `/cospec:<id>`, every marker id is one of the twelve, no fallback names `/cospec:`

## 7. `--language` refuses a context that differs [critical]

- [ ] 7.1 @e2e (agent) `cospec init --language Português` in a fresh repo -> `openspec/config.yaml` has `context: |` and the three directive lines, matching `openspec init --language Português` run in a sandbox
- [ ] 7.2 @equivalence (agent) a repo whose `config.yaml` context lacks the directive, `cospec init --language English` beside the pinned `openspec init --tools claude --language English` -> both exit 1 with the does-not-overwrite message (cospec prefixed `cospec: `) and no file changed; the same for a config with no `context`; the same value already present exits 0 on both
- [ ] 7.3 @equivalence (agent) `--language "  "`, a value with a control character, one with `U+200B`, and one over 50 KB, beside the binary -> each refuses with the binary's message and exit 1, and nothing is created
- [ ] 7.4 @integration (agent) `--language` with an unwritable `openspec/` destination -> `Cannot create openspec/config.yaml for --language: the destination is not writable.`

## 8. The pending list is empty

- [ ] 8.1 @integration (agent) `grep -c "owner: workflow-profiles" apps/cli/test/contract/parity-pending.yaml` before and after, and the reachability test inside `mise run test:contract` -> 2 before, 0 after; `--profile` and `--language` resolve to the table alone
- [ ] 8.2 @integration (agent) the reachability and command-table negative cases, retargeted to a synthetic row -> every case still fails for the reason it names, with no real surface used as a fixture
- [ ] 8.3 @integration (agent) `mise run docs:build` with an empty `parity-pending.yaml` -> the data loader succeeds and the how-it-relates page shows no capabilities as still being implemented
- [ ] 8.4 @integration (agent) the reachability assertion that `parity-pending.yaml` is empty, run on the rebased branch -> passes, with `completion-install`, `github-copilot` and `tool-matrix` merged

## 9. Root-level legacy blocks follow the binary

- [ ] 9.1 @equivalence (agent) the eight filenames against the pinned `core/legacy-cleanup.js` `LEGACY_CONFIG_FILES` -> equal, in order
- [ ] 9.2 @equivalence (agent) `CLAUDE.md` holding only a block and `AGENTS.md` holding `keep me` plus a block, `cospec init --remove-opsx` beside `openspec init --tools claude --force` on a copy -> `CLAUDE.md` is zero bytes and exists on both, `AGENTS.md` is `keep me\n` on both, byte-identical results
- [ ] 9.3 @integration (agent) an inline start-marker mention, a CRLF file, and a file with three blank lines around the block -> inline untouched, CRLF kept, runs collapsed to two, as the binary's `removeMarkerBlock` does on a copy
- [ ] 9.4 @integration (agent) `cospec init` without consent, then `cospec doctor` -> files byte-identical, listed in `opsx.found`, one `opsx-leftover` WARNING per file

## 10. The generated config.yaml documents three more keys

- [ ] 10.1 @integration (agent) `cospec init` in a fresh repo, then `openspec status` and `openspec doctor` in the sandbox -> the file holds the three commented examples and the binary prints no warning for it
- [ ] 10.2 @integration (agent) `cospec init` over an existing `config.yaml` -> byte-identical

## 11. Dependencies rebased

- [ ] 11.1 @integration (agent) after rebasing onto the `main` that carries `tool-matrix` and `github-copilot`, the full matrix of group 8's task over every row with a distinct command surface -> passes; the touch points listed in design D13 are recorded in the rebase commit body
- [ ] 11.2 @integration (agent) `cospec init --harness github-copilot --profile core` and `--copilot-cloud` together -> the six workflows are written as prompts and skills, the cloud-agent files are written and are never removed by a later `update`

## 12. The interactive surface

- [ ] 12.1 @manual (human) run `cospec init --profile core`, `cospec init --language <lang>` and `cospec doctor` in a scratch repo from a terminal -> the receipt lines, refusals and findings read as the design states and name `cospec`, never bare `openspec`

## 13. Docs and shared guidance

- [ ] 13.1 @integration (agent) `mise run docs:build` and a grep for `no core/custom profile split` across `apps/docs` and `docs` -> build succeeds and the sentence is gone; `harness-setup.md` describes explicit-only profiles, delivery and never-removes
- [ ] 13.2 @integration (agent) `apps/docs/reference/configuration.md` read against the table and this change's spec -> `profile`, `workflows`, `delivery` and `context` are documented on that page, the "inert" note is gone, and the `config.yaml` examples appear
- [ ] 13.3 @integration (agent) `apps/docs/reference/commands.md` `init`, `update` and `doctor` rows and the BREAKING cases, each flag compared with `cospec init --help` -> flags and behaviours match
- [ ] 13.4 @integration (agent) `docs/harness-integration.md`, `docs/architecture.md` and `apps/docs/concepts/how-it-relates-to-openspec.md` -> no statement that profiles are absent or inert; the architecture page names the grammar port, the one reader and the capability derivation
- [ ] 13.5 @integration (agent) `mise run agents:sync` then `mise run agents:check` -> exit 0, and `.agents/shared.md` states the explicit-only rule and the never-removes policy

## 14. The whole gate

- [ ] 14.1 @integration (agent) `mise run check` on the rebased branch -> exit 0
- [ ] 14.2 @integration (agent) `mise run test:contract`, `mise run test:integration` and `mise run test:pack` -> exit 0, with the compiled binary's `init --profile core` writing six workflows
