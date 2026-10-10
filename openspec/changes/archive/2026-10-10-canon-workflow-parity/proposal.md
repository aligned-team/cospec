# Proposal

## Why

cospec's twelve workflow bodies were written from scratch, and six passages in
the pinned OpenSpec 1.13.1 templates never made it across. `propose` and `ff`
never tell the agent to read the code, tests, configuration and documentation a
change is about before it drafts artifacts, so scope and tasks are written from
the request alone. The root-grounding prose is copied into each body in a
different shape, and none of the copies carry upstream's split between a
workflow the agent picked on its own and one the user asked for, its carve-out
for a project that declares a store this machine cannot resolve, or its
recency-ranked change picker. `apply` and `archive` never consult the
`operations.<id>.guidance` a project's `config.yaml` declares, and
`bulk-archive` hands every cross-change collision to hand editing.

The fix is cheap now and gets dearer later: the reachability test proves every
command and flag is reached, but nothing proves a workflow body says what
upstream's says, so the gap only widens with each OpenSpec pin. This change
ports the six passages through cospec's own commands, records the upstream file
and pin each one came from so a pin bump can list what to re-diff, and fixes the
one canon defect the self-hosted flow keeps hitting: an agent-authored "archive
this change" task that can never be ticked honestly before the archive.

## What Changes

- **A shared root-grounding fragment.** `canon/workflows/_shared/root-guard.md`
  holds the three parts, and `render.ts` interpolates it into all twelve bodies:
  the auto-selected-versus-explicit branch, the carve-out for store-declaration
  errors, and a change picker that lists the 3-4 most recently modified changes
  with a `(Recommended)` marker. The ad hoc grounding prose in each body is
  replaced by it.
- **`propose` and `ff` inspect before drafting.** Both tell the agent to inspect
  the implementation, tests, configuration and documentation outside
  `openspec/`, in proportion to the change, and to ask when the target is
  unclear.
- **`explore` draws ASCII only.** Diagram guidance is added, with upstream's
  reason (Unicode glyphs render at different widths).
- **`cospec apply` shows the project's own inputs.** `ApplyInstructionsJson`
  declares `context?`, `operationGuidance?` and `references?`, the human
  transcript prints them, the `references` command fields are spelled
  `cospec ...`, and `apply.md` gains upstream's precedence paragraph.
- **`archive` and `bulk-archive` consult `operations.archive.guidance`.** Step 1
  runs `cospec instructions archive --change "<slug>" --json` as an advisory,
  non-blocking lookup, with the same precedence paragraph.
- **`bulk-archive` resolves cross-change collisions.** The agent inspects the
  codebase, orders the colliding changes chronologically, decides per delta
  whether to include or exclude it, and edits only the conflicting change's
  delta files, with the user's confirmation. Each change then goes through
  `cospec archive` in the resolved order, with both hard gates.
- **Provenance is recorded.** Each workflow in `harness.yaml` carries a
  `ported:` list naming the upstream template file and the pin every ported
  passage came from, and a contract test checks each file exists in the pinned
  dist.
- **The tasks guidance stops producing an archive row.** The tasks artifact's
  instruction, which every type's schema carries, states that archiving is not a
  task and how to word a final task when the archive commit follows it.
- Every managed skill and command file regenerates: all twelve bodies change, so
  every `contentHash` moves and `cospec update` rewrites the files of a repo
  that has them.
- **BREAKING (narrow).** `cospec apply --json` and `cospec apply` on a legacy
  schema carry `apply.references[].fetch` and `apply.references[].status[].fix`
  spelled `cospec ...`, where they carried the binary's `openspec ...`. Only a
  project whose `config.yaml` declares `references` is affected.

## Capabilities

### New Capabilities

### Modified Capabilities

- `harness-workflows`: the shared root-grounding fragment and its three parts,
  the `propose`/`ff` inspection step, `explore`'s ASCII-only diagrams, `apply`'s
  and `archive`'s precedence paragraph and advisory lookup, `bulk-archive`'s
  collision resolution, the `ported:` provenance list, and the amended
  root-resolution-failure behaviour of `propose`.
- `change-progress-reporting`: `cospec apply` declares, prints and relays the
  binary's `context`, `operationGuidance` and `references`.
- `artifact-templates`: the tasks guidance never produces an archive task.

## Impact

- `apps/cli/src/canon/workflows/` (all twelve bodies, `harness.yaml`, the new
  `_shared/root-guard.md`), `apps/cli/src/canon/embedded.ts` (the fragment is a
  canon file), `apps/cli/src/harness/render.ts` (interpolation),
  `apps/cli/src/harness/adapters.ts` (`WorkflowDef.ported`).
- `apps/cli/src/core/openspec.ts`, `apps/cli/src/commands/apply.ts`,
  `apps/cli/src/core/instructions-render.ts` and a new
  `apps/cli/src/core/operation-inputs.ts` (apply's inputs and references).
- `apps/cli/src/canon/artifacts/tasks/meta.yaml` and the schemas generated from
  it under `openspec/schemas/**`.
- Tests: `test/unit/canon-render.test.ts` (new), the harness render goldens,
  `test/contract/operation-guidance.test.ts` (new), a bulk-archive collision
  fixture, and a `ported:` provenance contract row.
- Docs: `apps/docs/concepts/apply-and-archive.md`, `docs/apply-archive.md`,
  `apps/docs/reference/configuration.md` (the `operations:` keys),
  `docs/harness-integration.md` and `.agents/shared.md`.
- Built on `workflow-profiles` (R12): the fragment interpolates ahead of its
  conditional resolution. See `design.md` D1 and `blocking-changes.md`.

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
