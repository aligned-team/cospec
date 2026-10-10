# Proposal

## Why

`cospec init` and `cospec update` always write all twelve workflows to every
harness. OpenSpec 1.13.1 lets a machine choose a smaller set (`profile: core` is
six workflows; `profile: custom` plus a `workflows` list is any subset) and a
delivery mode (`skills`, `commands` or `both`), through the machine-global
config that `cospec config` already edits. Today `cospec config profile core`
succeeds and then changes nothing, and `cospec doctor` calls those keys "inert".
Anyone who swaps `openspec` for `cospec` keeps their profile in the config file
and gets the full set anyway.

Three smaller gaps sit in the same files, each probed against the pinned binary
(1.13.1) in a sandboxed HOME:

- **`init --language <lang>` and `init --profile core|custom` are refused as
  pending.** The binary validates both before it writes anything, and writes a
  three-line language directive into `config.yaml`'s `context:`.
- **The generated `config.yaml` has no `operations:`, `store:` or `references:`
  example**, so a user cannot discover three keys the binary reads.
- **Root-level `CLAUDE.md`, `AGENTS.md` and six other files keep their
  `<!-- OPENSPEC:START -->` block forever.** The binary strips the block during
  `init`; cospec's leftover scan only reads harness directories.

Narrowing the set creates a second problem: a body that says "next step
`/cospec:apply`" is a dead reference when `apply` is not installed. The binary
solves it with `[[opsx:if-workflow <id>]] … [[opsx:else]] … [[opsx:end]]`
conditionals resolved at generation time. Without them cospec's own doctor check
would fail on every narrowed install.

## What Changes

- **Profile selection (rows 57, 58).** A profile applies only when it is
  explicitly set: `init --profile core|custom`, or a `profile` key actually
  present in the machine-global config file. The binary's built-in default
  (`profile: core`) does not count, so with nothing set cospec keeps all twelve.
  `core` is `propose`, `explore`, `apply`, `update`, `sync-specs` and `archive`
  (marked `core: true` in `harness.yaml`). `custom` reads the config's
  `workflows` list, spelled as upstream spells it (`sync` is `sync-specs`), and
  adds `sync-specs` ahead of `archive` or `bulk-archive` as the binary's
  `getProfileWorkflows` adds `sync`.
- **Delivery (row 57).** A `delivery` key present in the machine-global config
  chooses where each workflow is written: `skills`, `commands` or `both` (the
  unset default, which is what cospec has always written). Switching it moves a
  workflow to the other surface; the workflow stays installed.
- **Conditional handoffs (row 58).** The renderer ports upstream's
  `[[opsx:if-workflow <id>]]` grammar, its whole-line resolution, its
  malformed-marker failure and its unresolved-marker check, all with upstream's
  wording. Every cross-workflow reference in the twelve canon bodies and in the
  init receipt's hint lines is wrapped, with the raw `cospec` command as the
  fallback. With nothing set, the rendered bodies are byte-identical to today's.
- **`update` never removes an installed workflow (row 57).** The workflow set it
  writes is the profile's plus every cospec workflow the repo already has. A
  repo with `profile: core` set explicitly and twelve workflows installed keeps
  all twelve, and `cospec doctor` names the six outside the profile. This is a
  cospec policy; the binary's `update` removes deselected workflows.
- **`init --language <lang>` (row 59).** Validated as upstream validates it;
  writes upstream's three-line directive into the new `config.yaml`'s
  `context:`; refuses, without writing anything, when `openspec/config.yaml` or
  `config.yml` exists and its `context` does not already hold that directive.
- **`config.yaml` template (row 60).** Gains commented `operations:`, `store:`
  and `references:` examples.
- **Root-level legacy blocks (row 61).** A second pass of the leftover scan
  reads upstream's eight root-level `LEGACY_CONFIG_FILES`. `init --remove-opsx`
  (or `--yes`) strips the `OPENSPEC:START/END` block and always keeps the file:
  one left with nothing else is written empty, as the binary writes it. (The
  roadmap says such a file is deleted; the pinned binary never deletes it.)
- **Doctor (row 57).** `checkGlobalProfile` stops calling the keys inert. It
  reports the explicit profile and delivery and any installed workflow outside
  the profile, and the dangling-reference check also fails on a residual
  `[[opsx:` marker.
- **Reachability.** The two pending entries owned by this change
  (`init --profile`, `init --language`) leave `parity-pending.yaml`, which
  leaves it empty once the other owners have merged.

**BREAKING**

- A machine whose global config explicitly sets `profile: core` now gets six
  workflows from `cospec init` in a fresh repo, where it got twelve. The same
  holds for an explicit `profile: custom`, which installs only its `workflows`.
- A machine whose global config explicitly sets `delivery: skills` or
  `delivery: commands` now gets one surface from `cospec init`, and
  `cospec update` removes the other surface's cospec files in a repo that has
  both. A `delivery` key that is absent or `both` changes nothing.
- `cospec doctor` gains an `opsx-leftover` WARNING for each root-level file that
  still carries an `OPENSPEC` block, on repos that had none before.
- `cospec doctor`'s `openspec-global-profile` finding keeps its id, but its
  message and remedy change: it no longer says the keys are superseded.

## Capabilities

### New Capabilities

- `workflow-profiles`: how the installed workflow set and delivery mode are
  chosen (explicit-only profiles, `core`/`custom`, delivery), the optional
  workflow conditional grammar and its generation-time checks, what `init` and
  `update` write and never remove, `init --language`, the `config.yaml`
  template's examples, and what `doctor` reports about them.

### Modified Capabilities

- `harness-workflows`: the two workflow-parity requirements read "every
  workflow" and now say it is the unrestricted set, and the receipt hint follows
  the propose workflow only when it is installed.
- `opsx-migration-detection`: the leftover scan and `--remove-opsx` also cover
  the eight root-level legacy config files.
- `cli-option-contract`: `init` declares `--profile` and `--language`, and the
  pending list is closed.

## Impact

- `apps/cli/src/canon/workflows/harness.yaml` and `*.md` (T1, T3); regenerated
  `.claude/`, `.agents/` and `.codex/` files change by nothing, because the
  unrestricted render is byte-identical.
- `apps/cli/src/harness/render.ts`, `adapters.ts`, a new
  `apps/cli/src/harness/optional-workflow.ts`, and a new
  `apps/cli/src/core/global-profile.ts` (the one reader of the global config's
  `profile`, `workflows` and `delivery` keys).
- `apps/cli/src/commands/{init,update,doctor}.ts` and `core/command-table.ts`.
- Tests: new `test/contract/profiles.test.ts`; edits to the reachability and
  command-table tests that name `init --language` or `--profile` as fixtures;
  `parity-pending.yaml` loses two entries.
- Docs: `apps/docs/guide/harness-setup.md`,
  `apps/docs/reference/configuration.md`, `apps/docs/reference/commands.md`,
  `apps/docs/concepts/how-it-relates-to-openspec.md`,
  `docs/harness-integration.md`, `docs/architecture.md`, `.agents/shared.md`
  (then `mise run agents:sync`).
- Starts from `main` at v0.9.0. `github-copilot` (R10, on `tool-matrix`, R9) has
  not merged and edits `init.ts`, `update.ts` and `render.ts`; the implement
  stage rebases onto it. design.md states what each provides.
- `agent-behavior` stays unchecked on purpose: with no profile or delivery set
  the twelve rendered bodies are byte-identical, and a narrowed install's text
  is deterministic template output asserted by exact render, so no eval would
  score anything those assertions do not.
- No wrapped-binary call is added; the binary is read in tests only, through the
  pinned dist.

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
