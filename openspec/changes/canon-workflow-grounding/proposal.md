## Why

cospec's canon workflow bodies and artifact templates carry guidance that is
wrong today, independent of which OpenSpec release is pinned. `explore.md` tells
the agent to read `openspec/config.yaml` by hand, contradicting `propose.md` and
the repo-wide routing discipline that every read goes through a `cospec`
command; it also gives no guidance on _how_ to conduct discovery, so an agent
batches questions, asks for facts it could verify in the repo, and treats an
answered design question as a mandate. `update.md` step 4 says "Apply the
requested edit" while step 5 is the step that says "write only after the user
confirms it" — step 4 licenses a write before confirmation, defeating the
workflow's own consent gate.

Two more defects sit alongside them. All twelve skill descriptions in
`harness.yaml` are a single functional sentence with no trigger clause, so skill
matching — which keys off the description — misses users who type the phrases
they actually type, including the OpenSpec vocabulary cospec users arrive from;
`cospec-update-change` additionally collides with the unrelated `cospec update`
CLI subcommand, a warning that lives in the workflow body but not in the text
the matcher reads. And only the `blocking-changes` template opens with a
top-level heading: `proposal` (both variants), `specs`, `design`, `tasks`, and
`verification` all open at `##`, so every scaffolded artifact starts life
violating MD041 and reads as a fragment rather than a document.

## What Changes

- `explore.md` gains an adapted planning-discipline section (dependency-ordered
  discovery, one focused question at a time named with the decision it unlocks,
  grounded recommendations with tradeoffs, decisions tracked in the conversation
  rather than in files, silence is not acceptance), a capability-inventory step
  built on `cospec list --specs` and
  `cospec show "<id>" --type spec [--no-scenarios]`, and a narrowly scoped rule
  that an explicit capture request is its own write confirmation. Its
  `openspec/config.yaml` read is rerouted through `cospec context --json`.
- `propose.md` gains the intent of upstream's project-grounding step, adapted:
  run `cospec context --json` before choosing a type and slug, treat the result
  as constraint and not authority, and report a root-resolution failure rather
  than proceeding.
- `update.md` step 4 becomes an explicit draft-then-write staging step, and step
  5 gains a sentence declaring it the only artifact-writing step in the
  workflow.
- Every workflow description in `harness.yaml` gains a natural-phrasing trigger
  sentence covering both the `cospec …` and `openspec …` vocabularies, with
  `cospec-update-change` disambiguated from the `cospec update` CLI subcommand.
- Each artifact template body opens with a top-level `# <Artifact name>` heading
  in Title Case matching the artifact id.
- `bulk-archive.md` records that each `cospec archive` call runs its own
  archive-slot collision pre-check before any spec sync; `archive.md` and
  `sync-specs.md` are confirmed to cover the new-capability sync nuance.

No CLI surface, flag, exit code, schema, or validation rule changes. The managed
harness tree and `openspec/schemas/**` are regenerated from the edited canon.

## Capabilities

### New Capabilities

- `artifact-templates`: the shape scaffolded artifact bodies are born with — the
  top-level heading contract and the readers that must stay inert across it.

### Modified Capabilities

- `harness-workflows`: the grounding, questioning, staging, and discoverability
  contracts the generated workflow bodies and skill descriptions must satisfy.

## Impact

- `apps/cli/src/canon/workflows/{explore,propose,update,bulk-archive,archive,sync-specs}.md`
- `apps/cli/src/canon/workflows/harness.yaml`
- `apps/cli/src/canon/artifacts/{proposal,specs,design,tasks,verification,blocking-changes}/meta.yaml`
- everything `mise run generate` rewrites: `.claude/`, `.codex/`, `.opencode/`,
  `.agents/skills/`, `openspec/schemas/**`
- canon-content unit tests; `apps/docs` and `docs/` pages that quote a skill
  description or a template body verbatim

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [x] agent-behavior — prompts, tools, model routing, or agent output shape
