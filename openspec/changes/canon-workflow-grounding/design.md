## Context

cospec's canon is an independently authored editorial surface, not a vendored
copy of OpenSpec's workflow prose. Upstream's 1.12/1.13 workflow-template work
fixed several real agent-behaviour defects that cospec's own bodies share, but
the fixes cannot be ported literally: cospec's model is typed schemas, a gated
CLI, and a routing discipline in which every project fact reaches the agent
through a `cospec` command. This change ports intent, adapted, and records the
places where the adaptation deliberately diverges.

Root cause of the defects being fixed: the canon bodies were written
incrementally against a moving surface, and three of them drifted out of
agreement with rules that were later made explicit elsewhere. `explore.md`'s
direct `config.yaml` read predates the routing discipline `propose.md` now
states. `update.md`'s step 4/5 split was written before the workflow gained its
per-edit confirmation step, so the verb in step 4 was never restaged.
`harness.yaml`'s descriptions were written as a table of contents for a human
reader, before it was understood that the description is what the harness skill
matcher keys on.

## Decisions

**Template heading wording — `# <Artifact name>` in Title Case matching the
artifact id.** Open question 7 is settled in favour of the artifact's own name
(`# Proposal`, `# Blocking Changes`, `# Specs`, `# Design`, `# Tasks`,
`# Verification`) rather than upstream's generic titles or a per-type
substitution (`# <Type>: <slug>`). Rejected alternatives: upstream's titles
because cospec's artifact ids are the vocabulary the whole CLI already speaks —
`cospec instructions <artifact>`, `apply.requires`, the status table — and a
heading that disagrees with that vocabulary teaches a second name for one thing;
and the per-type title because the composer performs no slug substitution today
and adding one buys nothing a reader of the change directory does not already
know. `blocking-changes`' existing `# Dependencies` is restated as
`# Blocking Changes` under the same rule, so the contract is exceptionless.

**Do not port upstream's "inspect the project before drafting" block.** cospec's
authoring workflows trust the `cospec instructions … --json` envelope for
artifact shape; an instruction to reverse-engineer shape from neighbouring files
would compete with it and reintroduce exactly the drift the typed schemas exist
to prevent. What is ported instead is questioning discipline (Track E1), which
is orthogonal to artifact shape and does not collide.

**Do not port upstream's `PROJECT_ROOT_GUARD` prose.** cospec enforces the same
invariant structurally: `core/root.ts:resolveRoot()` errors rather than
materialising an `openspec/` directory under an unrelated cwd. A code-level
invariant beats prose an agent can skip, so `propose.md` gets only the
report-the-failure half — the behaviour the agent is responsible for.

**Scenario-loss and archive-preflight suppression is not this change's
business.** Noted only so the next reader does not re-derive it: a store
initialised by upstream `openspec init` at 1.12+ carries `.gitkeep` files under
`openspec/specs`, `openspec/changes`, and `openspec/changes/archive`. cospec's
readers are directory-filtered (`core/change.ts` `withFileTypes` +
`isDirectory()`, `core/spec-paths.ts`), so those anchors produce no stray-entry
bug and need no guard here.

**One generator per change.** This change owns `mise run generate` and runs it
in every commit so `generate:check` is green per commit. `.agents/shared.md` —
driven by the separate `mise run agents:sync` generator — is deliberately
untouched, so the two generators never contend in one review window.

## Risks / Trade-offs

- **[Risk] A leading `# ` line changes a parse result.** → The readers at risk
  are all line-anchored regexes (`tasks.ts` and `verification.ts` `GROUP_RE`,
  `deltas.ts` `SECTION_RE`) plus the composer's `Surfaces` append path. The
  verification ledger carries an explicit unit row and an untouched-scaffold
  equivalence row rather than an assertion that they "should be" inert.
- **[Risk] Longer skill descriptions degrade matching instead of improving it.**
  → The trigger sentence is appended, never substituted for the functional
  sentence, and the `cospec-update-change`/`cospec update` collision is stated
  explicitly rather than left to the matcher. The `@eval` row exercises real
  agent selection, not a string assertion.
- **[Risk] Regenerating the whole managed tree buries the canon edit in a large
  diff.** → Accepted. The alternative (regenerate once at the end) breaks
  `generate:check` on intermediate commits, which is the gate this repo relies
  on. Reviewers read the canon files; the regenerated tree is mechanical.
- **[Trade-off] More prose in every workflow body.** → Each added block earns
  its place by naming a defect observed today; nothing is added for symmetry
  with upstream alone, and `archive.md`/`sync-specs.md` are
  confirmed-and-left-alone rather than edited for parity's sake.
