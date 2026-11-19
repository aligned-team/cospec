# Proposal

## Why

152 living requirements in 27 capabilities have descriptions longer than
OpenSpec's 500-character requirement limit. OpenSpec 1.14.1 and later report
that limit as a WARNING, which `--strict` turns into a failure, and the 1.15.0
parity change adopts it as cospec's `specs/requirement-too-long` rule. That rule
would fail this repo's own `cospec validate --all --strict` on every one of
them, so the specs are wrong against the contract cospec is about to enforce,
and they have to come down before the rule can land.

The rewording is split out of the parity change so that change's real spec
changes (new obligations, new rules, new commands) stay reviewable instead of
sitting among about 150 editorial rewrites. This change carries only the
rewrites that #100 made to fit the limit and that alter no behaviour, plus one
rewrite of its own (below).

## What Changes

Each requirement below, except the one named after the table, is replaced by
pr-100's living text, verbatim, as a `MODIFIED` delta carrying the whole block
(description and every scenario). The shortened description is at most 500
characters. Long rationale and provenance prose is condensed, and
clause-by-clause obligations that were packed into one paragraph are restated as
scenarios. Every scenario in the living text survives in the new block.

152 requirements across 27 capabilities:

| capability                        | requirements |
| --------------------------------- | ------------ |
| archive-integrity                 | 16           |
| artifact-templates                | 2            |
| change-metadata-keys              | 1            |
| change-progress-reporting         | 11           |
| cli-option-contract               | 12           |
| copilot-cloud-agent               | 6            |
| cospec-feedback                   | 1            |
| cospec-shell-completion           | 7            |
| embedded-openspec                 | 3            |
| harness-workflows                 | 20           |
| json-document-parity              | 5            |
| nested-change-detection           | 3            |
| openspec-config-passthrough       | 5            |
| openspec-list-validate-extensions | 9            |
| openspec-read-passthroughs        | 5            |
| openspec-relationship-health      | 1            |
| openspec-store-management         | 2            |
| opsx-migration-detection          | 7            |
| schema-customization              | 1            |
| schema-versioning                 | 1            |
| spec-parsing-and-discovery        | 10           |
| spec-sync                         | 4            |
| store-awareness                   | 2            |
| surface-triggers                  | 3            |
| upstream-command-spellings        | 3            |
| verification-artifact             | 4            |
| workflow-profiles                 | 8            |

The exception is embedded-openspec "Wrapped calls list directories in Node's
order". Main's readdir-order change added it after #100, so pr-100 has no text
for it: the block here is this change's own rewording, not pr-100's. The
description goes from 762 to 412 characters. Its clauses that named the three
`readdir` forms and the import forms, the buffer and `Dirent` results, the
project-copy-or-embedded reach and the Windows exemption moved into scenarios
(three are new: the preload covers a project copy and the embedded bundle, it
reaches every import form the pinned dist uses, and Windows listings are left
unchanged). All three existing scenarios keep their names and meaning.

### Clauses removed

Shortening dropped wording a reviewer may want back. None of it is a behaviour
the code implements or tests, but each is listed so it can be objected to.

Clauses dropped outright (the split plan's decision 3):

- "Wrapped calls list directories in Node's order" no longer says the preload
  runs "ahead of any other" in so many words; "first on the argv" says it, and
  the scenario "Every wrapped spawn carries the preload first" keeps the order
  against the handover preload. The code (`spawnRaw`, `preloadedArgv`) matches.
  The description also stops naming `opendir`, a recursive `readdir` and
  `fs.glob`; the scenario that fails the contract suite on them names all three.

- "Validate relays are spelled through cospec" no longer says the relayed remedy
  is "never inferred from its answer".
- "Config notes name the keys cospec's own behaviour overrides" no longer says
  "rather than upstream's suggested `openspec update`".
- "Deterministic root resolution" no longer carries its rationale clause, "so
  that relayed JSON reports the binary's own provenance" (the description went
  from 5300 to 489 characters).

Condensations the classifiers flagged as lossy or worth a second look. In each,
the obligations moved into scenarios and only rationale or provenance prose was
dropped, checked clause by clause, but these are where a subtle wording shift is
most likely:

- cli-option-contract "Table-parsed commands reject what the table does not
  declare" (5206 to 484 characters, ten scenarios) and "Forwarded commands are
  declared, not re-parsed" (4320 to 490, five scenarios), the two largest
  condensations in this change.
- archive-integrity "Case-only requirement-name collisions are refused at
  pre-flight" (4276 to 494, 21 scenarios; each dropped clause is covered by a
  scenario), "The rebuilt spec is validated as the archive validates it" (2883
  to 481), "Early-synced delta operations are not archive blockers" (1775
  to 482) and "Archive preconditions read what the archive merges" (2151 to
  462).
- spec-parsing-and-discovery "Delegated duplicates are suppressed" (6628 to
  448). The clause that each pairing be covered by a contract test whose
  delegated message is read from the pinned binary, never typed by hand, is
  condensed to "contract-tested with the pinned binary's real message".
- openspec-relationship-health lost its note about what the check replaces.

Judgment calls the classifiers were unsure about, all kept here because the
wording change is editorial and the code does not change:

- surface-triggers "Surface soft-trigger mechanic" gains a scenario saying a
  missing ledger "is reported once", which reads as the old "absent entirely (no
  row to inspect)" clause moved into a scenario.
- spec-parsing-and-discovery "Recursive capability discovery" moves its symlink
  clause into a scenario and keeps main's wording: a link is resolved when it
  stays inside its capability directory and rejected when it resolves outside.
  The parity change's code accepts a link that resolves anywhere inside the
  project and amends this requirement itself.
- change-progress-reporting "Status names the next step on every entry" is
  unchanged in meaning. The parity change's "Completed tasks lead to verify, not
  archive" governs `next` once every task is checked, and that change decides
  whether this requirement needs amending.
- harness-workflows "Every pinned tool id is a harness" and
  opsx-migration-detection "Leftovers are found for every tool" are written
  generically ("every `AI_TOOLS` id", "per harness row"), so their reach grows
  with the parity change's pin bump and new rows without any text change.
- harness-workflows "Legacy .codex/skills installs are migrated
  non-destructively" mentions `update --dry-run`, which the parity change's
  "Update dry run" redefines. This text only restates that dry-run computes
  outcomes without writing, which main already said.

### Not here

Requirements whose wording #100 changed together with behaviour stay with the
change that owns the behaviour: the OpenSpec 1.15.0 parity change, the
standalone install change, the startup-budget change, or the stamp change. They
may well be over 500 characters today; this change leaves them alone and their
owner shortens them with its behaviour.

The `change-stamp-x-prefix` change applies its stamp corrections on top of this
one: its deltas for schema-customization "`cospec new` accepts resolvable legacy
schemas" and upstream-command-spellings "new change is upstream's create
spelling" are written against the text shortened here. Both are carried here
exactly as pr-100 wrote them.

Two requirements are carried here exactly as pr-100 wrote them, though the code
the parity change ships goes beyond them, and the parity change amends both:
harness-workflows "Shared .agents/skills harness root" (it lists the codex,
agents, antigravity and zed rows; the parity code adds `amp` and `gsd` to the
shared root and its writer order) and workflow-profiles "Delivery selects the
surface a workflow is written to" (it names only `codex` as skills-invocable;
the parity code also marks `warp`).

## Capabilities

### New Capabilities

### Modified Capabilities

- `archive-integrity`: 16 requirements reworded
- `artifact-templates`: 2 requirements reworded
- `change-metadata-keys`: 1 requirement reworded
- `change-progress-reporting`: 11 requirements reworded
- `cli-option-contract`: 12 requirements reworded
- `copilot-cloud-agent`: 6 requirements reworded
- `cospec-feedback`: 1 requirement reworded
- `cospec-shell-completion`: 7 requirements reworded
- `embedded-openspec`: 3 requirements reworded
- `harness-workflows`: 20 requirements reworded
- `json-document-parity`: 5 requirements reworded
- `nested-change-detection`: 3 requirements reworded
- `openspec-config-passthrough`: 5 requirements reworded
- `openspec-list-validate-extensions`: 9 requirements reworded
- `openspec-read-passthroughs`: 5 requirements reworded
- `openspec-relationship-health`: 1 requirement reworded
- `openspec-store-management`: 2 requirements reworded
- `opsx-migration-detection`: 7 requirements reworded
- `schema-customization`: 1 requirement reworded
- `schema-versioning`: 1 requirement reworded
- `spec-parsing-and-discovery`: 10 requirements reworded
- `spec-sync`: 4 requirements reworded
- `store-awareness`: 2 requirements reworded
- `surface-triggers`: 3 requirements reworded
- `upstream-command-spellings`: 3 requirements reworded
- `verification-artifact`: 4 requirements reworded
- `workflow-profiles`: 8 requirements reworded

## Impact

- `openspec/specs/**`: 27 living specs get shorter wording after `sync-specs`
  (and after archive, which is the final commit before merge). Spec text only.
- No code, tests, docs site, generated files or CLI behaviour change, and no
  obligation changes. Invariant: every `SHALL` obligation and every scenario
  that the living text carried still holds.
- The stamp and parity changes build on these texts, so their own deltas are
  written against the shortened requirements.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
