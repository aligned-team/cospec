## Context

cospec renders 6 of opsx 1.5.0's 11 live workflows to each agent harness
(claude, codex, opencode). The 5 missing workflows (`new`, `ff`, `verify`,
`bulk-archive`, `onboard`) are pure canon-composition: each is a markdown body
that instructs an agent to call already-existing `cospec` subcommands in
sequence. No CLI subcommand, wrapped-binary call, or runtime topology changes.

## Goals / Non-Goals

**Goals:**

- Emit a command+skill for every live opsx 1.5.0 workflow, adapted to cospec's
  typed model.
- Keep the render pipeline single-sourced: canon in
  `apps/cli/src/canon/workflows/`, fanned out by
  `apps/cli/src/harness/render.ts`.

**Non-Goals:**

- No new CLI subcommand, wrapped-binary interaction, or schema surface.
- No per-workflow harness allow/deny (core/custom profile) split — cospec always
  emits its full set to every harness.

## Decisions

- **Emit the full 11-workflow set to every harness, with no profile split.**
  Rejected alternative: mirror opsx's core/custom workflow profiles. Rejected
  because the explicit goal is "a user never types a `/cospec:*` that doesn't
  exist" — a profile split reintroduces exactly that gap.
- **Map opsx `sync` to the existing `sync-specs` id, not a rename.** Rejected
  alternative: rename `sync-specs` to `sync` for a 1:1 opsx name match. Rejected
  because `sync-specs`'s body already tells the true story (sync runs inside
  `archive`, it is not a standalone step); renaming would churn tests, docs, and
  agent muscle-memory for zero behavioral gain. The mapping is documented
  instead.
- **Leave `adapters.ts` (`renderCodexRules`) unchanged.** Rejected alternative:
  add `archive` to the codex pre-approved allowlist so `bulk-archive`/`onboard`
  run smoother. Rejected because the per-archive confirmation prompt is
  intentional (archive is a mutating, gated operation) and already the precedent
  for the existing `archive` workflow; the new workflows must not special-case
  around it.
- **Defer `/opsx:update` and `feedback`.** `/opsx:update` is ahead of the pinned
  1.5.0 release (not in `ALL_WORKFLOWS`, no template); `feedback` is dead code
  in 1.5.0 (unwired). Both are out of scope per the pin discipline — adding
  either would mean building against unreleased or unreachable opsx behavior.

## Risks / Trade-offs

- [Risk] Regenerating `render.test.ts.snap` (≈1900 lines) could mask an
  unintended change to an existing body. → Mitigation: hand-inspect the snapshot
  diff before committing; it must show only the 5 new files added, zero churn to
  existing bodies.
- [Risk] Forgetting `embedded.ts` entries passes local `bun run` dev mode but
  fails packaged builds. → Mitigation: task list runs `mise run generate` +
  `mise run generate:check`; `mise run test:pack` re-checked if any doubt
  remains.
- [Risk] A generated body drifts into opsx prose or references a not-yet-emitted
  workflow id. → Mitigation: the `dangling-refs` unit test enforces every
  in-body slash/skill token names an emitted workflow/skill.

## Operational surface

This change has no runtime service, container, or network topology to describe —
it only adds statically rendered markdown files consumed by local agent CLIs
(claude, codex, opencode) via the existing `cospec init`/`cospec update`
file-write path.

- **Bind address**: not applicable — no server or listener is introduced.
- **Container vs runner**: not applicable — the new workflows run as agent-read
  markdown instructing calls to the already-installed `cospec` binary in the
  user's local worktree; nothing new is containerized or daemonized.
- **Required secrets**: none — the 5 new workflows call only `cospec new`,
  `instructions`, `status`, `validate`, `list`, `apply`, and `archive`, none of
  which require new credentials.
- **Connection limits**: not applicable — no network connections are introduced.
- **Binary versions/arches**: unaffected — the OpenSpec wrapped-binary pin
  (`>=1.0.0 <2.0.0`, dev/CI pinned 1.5.0) is untouched; no new binary or arch
  dependency is added.
