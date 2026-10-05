# Proposal

## Why

`cli-surface-parity` (#59) closed most of the `list`/`status`/`validate` surface
gaps, but its own later review rounds left a short tail of already-wrong output
that no later feature PR absorbs. Verified fresh against `main`
(`.claude/handoff/reports/list-status-untyped-leftovers-verify.md`):
`cospec list` misclassifies a change on a schema cospec doesn't type as "no
artifacts yet" whenever that schema names its artifacts under filenames cospec
doesn't recognize, even though the change plainly has one — the same class of
bug `status.ts` fixed at task 11.5 for its own `state`/`next` reporting, never
ported to `list.ts`'s row. Separately, `validate --archived --json` against an
OpenSpec binary below the version floor that supports `--archived` prints stderr
text unconditionally, so a `--json` caller gets no parseable document at all on
an old binary — the version guard immediately above it in the same file branches
on `flags.json` correctly; this one does not. A third item,
`upstream-spellings.test.ts` row 3.7, is flagged as a CI flake on overlayfs: two
independent `remedyNamedRoot()` copies are asserted byte-identical, which only
holds when both sides read the same directory.

This proposal also closes out a fourth item the stage's own verify report listed
as unfixed — `status`'s handling of a mode-000 artifact other than `tasks.md` —
on the strength of further, end-to-end differential testing against the pinned
binary on both operating systems: it is not reproducible. `hasUnreadableEntry`
(task 11.12) already walks every non-dot file under a change directory, not just
`tasks.md`, so `status`'s existing `binaryDecides` routing already matches the
pinned binary's observed behaviour for any unreadable artifact, on macOS and on
Linux. This proposal adds a differential contract row that pins that behaviour
down (see Design) rather than changing product code that is already correct.

## What Changes

- `cospec list`'s `state` column no longer forces `in-progress` ("no artifacts
  yet") for a change on a schema cospec doesn't type purely because none of
  cospec's own fixed artifact filenames (`proposal.md`, `tasks.md`, …) are
  present. It additionally checks whether the change's own declared schema's
  `generates` pattern matches a file in the change directory — the same signal
  `core/change.ts`'s `hasSchemaOutput` already uses for namespace detection —
  and reports `building` when it does. A cospec-typed change's classification is
  unchanged.
- `cospec validate --archived --json` against an OpenSpec binary below the
  `--archived` version floor now relays its refusal as one JSON document (the
  same `rootSelectionDocument` shape the sibling no-root guard already uses),
  instead of unconditional stderr text, matching `--json` on every other
  `validate` early-exit path.
- `upstream-spellings.test.ts` row 3.7 shares one `remedyNamedRoot()` directory
  between its `cospec` and `openspec` instructions calls instead of two
  independently-created copies, removing the row's dependency on two separate
  `cpSync` calls landing on the same directory-entry order. Neither side sorts
  the list (the pinned binary's own `getAvailableChanges` is unsorted and cospec
  relays it verbatim), so sharing the root is the fix, not sorting either side.
- A new differential contract row pins `status`'s already-correct handling of a
  mode-000 artifact other than `tasks.md` on both macOS and Linux (no product
  code change for this item — see Design for the evidence superseding the
  stage's verify report).

## Capabilities

### New Capabilities

### Modified Capabilities

<!-- No capability's SPEC was wrong; `list`'s state derivation and
`validate --archived --json`'s guard are implementation bugs against
already-correct spec intent (parity with the binary). -->

## Impact

- `apps/cli/src/commands/list.ts` — `computeRow`'s emptiness check.
- `apps/cli/src/commands/validate.ts` — the `--archived` version guard.
- `apps/cli/test/contract/upstream-spellings.test.ts` — row 3.7's fixture root.
- `apps/cli/test/unit/commands/commands.test.ts`,
  `apps/cli/test/contract/cli-surface.test.ts` — new/updated test rows for all
  four items.
- `apps/docs/reference/commands.md` — `cospec list`'s row documents the new
  schema-output signal.

## Surfaces

<!-- Check every surface this change touches; each drives a verification/design expectation (soft). -->

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
