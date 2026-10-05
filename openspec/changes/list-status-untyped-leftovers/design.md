# Design

## Context

Four items, verified against `main` first
(`.claude/handoff/reports/list-status-untyped-leftovers-verify.md`):

1. `list.ts`'s `computeRow` derives `empty` — and so `state` — from
   `hasAnyArtifact(dir)`, which checks only cospec's own fixed artifact
   filenames (`proposal.md`, `tasks.md`, `design.md`, `verification.md`,
   `blocking-changes.md`, `specs/*.md`). It never branches on
   `isCospecType(schema)` for this computation (the `cospec` bool it does
   compute is used only for `archiveReady`). A change on a schema cospec doesn't
   type — whose own `schema.yaml` names its artifacts under other filenames
   (`doc.md`, `requirements.md`, …) — is therefore always "empty" to this check,
   even with a written artifact on disk, the same misclassification `status.ts`
   fixed at task 11.5 for `state`/`next` (`status.ts` now answers every
   untyped-schema change from the binary's own status, never from
   `hasAnyArtifact`).

2. `validate.ts:1553-1561`'s `--archived` version-floor guard writes
   unconditionally to `process.stderr`, never branching on `flags.json` — unlike
   the no-root guard immediately above it (1541-1548), which does.
   `validate --archived --json` against a binary below `ARCHIVED_SINCE`
   therefore prints no JSON document at all.

3. `upstream-spellings.test.ts` row 3.7 asserts byte-identical stdout/stderr
   between a `cospec` and an `openspec` instructions call, each over its own
   `remedyNamedRoot()` copy (two independent `mkdtemp` + `cpSync` calls). The
   pinned binary's own `getAvailableChanges`
   (`dist/commands/workflow/shared.js:77-90`) returns
   `readdir(...).filter(...).map(e => e.name)` with no `.sort()` anywhere on
   this path — it is unsorted by design, and `instructions.ts` never re-sorts or
   re-derives the list cospec relays (grep confirms: no `sort` call in
   `instructions.ts`/`instructions-render.ts`). The row's byte-identity
   assertion is therefore only valid when both calls observe the same on-disk
   entry order, which two independently-created copies don't guarantee on every
   filesystem (overlayfs in particular).

4. The stage's own verify report lists a fourth item — `status`'s handling of a
   mode-000 artifact other than `tasks.md` — as unfixed, reasoning from a
   primitive-level probe (`existsSync` true, `accessSync(R_OK)` throws EACCES)
   and a read of `artifactDone` (`apply.ts:148-152`) in isolation. It did not
   run `cospec status` end to end. `hasUnreadableEntry` (`status.ts:481-510`,
   task 11.12) already walks every non-dot entry under the whole change
   directory — not just `tasks.md` — `openSync`-ing every regular file;
   `binaryDecides` (`status.ts:451-472`) routes a change to the binary's own
   answer whenever `hasUnreadableEntry` finds one, in text mode as under
   `--json`, for both `--change` and `--all`. End-to-end differential runs
   against the pinned binary, both single-change and `--all`, both `--json` and
   text, confirm it already matches:

   - **macOS** (host, this change's author environment): both the pinned binary
     (spawned under Bun, as cospec's production wrapped calls run —
     `BUN_BE_BUN=1`) and `cospec status` refuse a mode-000 `proposal.md` with
     `EACCES: permission denied, realpath '…/proposal.md'`, exit 1, in every
     mode tried.
   - **Linux** (`oven/bun:1.3.14`, non-root UID 1000, bind-mounted tree): both
     the pinned binary and `cospec status` read past the same mode-000
     `proposal.md` — Linux's `realpath` doesn't require read permission on the
     target, only search permission on its parent directories — reporting
     `proposal` done, exit 0, in every mode tried.

   `hasUnreadableEntry`'s own check (`openSync(path, 'r')`) _does_ throw EACCES
   on Linux too (unlike the binary's `realpath`), which is why `binaryDecides`
   still routes the change to a delegated upstream call on Linux — but since
   that delegated call itself succeeds there, `status` falls through to its own
   `computeStatus`/`artifactDone` (`existsSync`), which agrees with the binary's
   own exit-0/done answer. Both platforms' two independent checks (cospec's own
   routing signal, and the delegated or local answer it falls back to) land on
   the binary's actual answer by different paths, not by coincidence:
   `binaryDecides` only ever _widens_ when to ask the binary, never narrows
   cospec's own fallback below what the binary would say when asked.

## Goals / Non-Goals

**Goals:**

- Fix items 1–3 with the smallest change that makes cospec's answer match the
  binary's, reusing an existing pattern each time rather than inventing a new
  one.
- Lock item 4's current, already-correct cross-platform behavior down with a
  differential contract row, and record why the verify report's finding doesn't
  hold up — no product change.

**Non-Goals:**

- Re-deriving or sorting the binary's `getAvailableChanges` list (item 3): the
  binary itself gives no ordering guarantee here, so cospec has none to provide
  either; the fix is the test sharing one root, not a new cospec behavior.
- Touching `hasUnreadableEntry`, `binaryDecides`, or `artifactDone` (item 4): no
  divergence was found to fix.

## Decisions

**Item 1 — reuse `hasSchemaOutput`'s signal, scoped to the change's own declared
schema.** `core/change.ts`'s `hasSchemaOutput` already answers almost this
question — "does `dir` hold a file the resolved schema's `generates` names" —
for namespace-folder detection, resolving the schema from the _project's_ config
when the candidate has no `.openspec.yaml` of its own. `list.ts`'s case is
narrower and simpler: the change already declares its own schema in
`.openspec.yaml`, so no project-config fallback is needed. A new
`hasDeclaredArtifact(dir, schema, base)` in `list.ts` loads that schema
(`loadSchema`, already used by `status.ts`) and checks `artifactOutputExists`
(`core/glob.ts`, the binary's own `generates` glob semantics, task 11.3) over
each of its artifacts' `generates` patterns, mirroring `hasSchemaOutput`'s
two-`catch`-blocks structure (a schema that cannot be loaded, or an output
pattern that cannot be resolved, gives no signal — the binary's own `list` never
loads a schema at all, so it has no opinion either; confirmed by grep of
`dist/core/list.js`, which reads only `tasks.md`-derived progress counts, never
a schema file).

`empty` becomes
`!hasAnyArtifact(dir) && (cospec || !hasDeclaredArtifact(dir, schema, base))` —
additive over today's check: a cospec-typed change's classification is
bit-for-bit unchanged (the `cospec ||` short-circuits), and an untyped-schema
change is "empty" only when _neither_ signal finds anything, so there is no
regression path for a change `hasAnyArtifact` already caught by cospec's fixed
names.

**Rejected:** delegating to `openspec status --change <id> --json` per
untyped-schema row to ask the binary directly, which `status.ts`'s own
`legacyChangeEntry` does for its richer, single-change answer. `list.ts`'s own
discipline (its file header, D6) is one delegated `openspec list --json` call
per invocation, never one per change; the binary's `list --json` row carries no
artifact-presence signal at all (`dist/core/list.js`: `name`, `completedTasks`,
`totalTasks`, `lastModified`, `status` — `status` is task-count-only:
`no-tasks | in-progress | complete`, not "has artifacts"), so there is nothing
there to merge in instead.

**Bare directories unaffected.** A change directory with no `.openspec.yaml`
reports `schema: ''` (`readOpenspecYaml(dir)?.schema ?? ''`); `isCospecType('')`
is `false`, so it takes the new branch, but `loadSchema('', base)` throws
immediately (`schemaDir`'s empty-name guard) before any output check runs, so
`hasDeclaredArtifact` returns `false` and `empty` reduces to exactly today's
`!hasAnyArtifact(dir)` — unchanged, matching the proposal's scope (a change
whose `.openspec.yaml` _declares_ an untyped schema, not a bare directory with
none).

**Item 2 — mirror the sibling guard's branch exactly.** The no-root guard four
lines above already shows the right shape
(`rootSelectionDocument`/`respellRemedies` under `--json`, stderr text
otherwise); the `--archived` version-floor guard gets the same `flags.json`
branch, reusing `rootSelectionDocument` with the same null payload shape
`validate --json` uses elsewhere for a resolver-stage refusal.

**Item 3 — share one root, don't sort either side.** `copyOf(upstreamTemplate)`
currently runs twice independently in row 3.7. Calling it once and passing the
same directory to both the `runCospec` and `runUpstream` invocations removes the
two-independent-`cpSync` ordering dependency entirely, with `cospec`'s own relay
still exercised as a true passthrough (it does not write into the shared root;
confirmed by reading `instructions.ts`, which never writes files for an
instructions call).

## Risks / Trade-offs

- [Item 1: a schema whose `generates` pattern is broad (e.g. `**/*.md`) could
  flag a change "building" from an incidental file, such as a stray README
  someone dropped in the change directory] → Same risk the binary itself accepts
  for its own `hasSchemaOutput`/`artifactOutputExists` (`looksLikeChange`):
  cospec is matching the binary's own generosity here, not inventing a new one,
  and a schema author controls their own `generates` precision.
- [Item 4: a future binary version could change `realpath`'s Linux behavior,
  reopening a real divergence] → The new contract row is differential (compares
  live against the pinned binary on both OSes it runs in CI on), not a hardcoded
  assertion of "exit 0"/"exit 1" per OS, so a future binary regression would
  fail the row rather than passing silently.
