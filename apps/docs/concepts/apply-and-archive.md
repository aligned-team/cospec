---
title: Apply and archive
description:
  The gate contract — exit codes, what apply checks in order, and the hard gates
  archive enforces before it ships a change.
---

# Apply and archive

`cospec apply` is the gate you clear before writing code. `cospec archive` is
the verified ship step. Both are deterministic, and both are safe to script
against: obey the exit code, and you never have to re-derive what "clear" means
by reading files yourself.

## Exit codes

| code | meaning                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------- |
| `0`  | success (including "nothing to do")                                                             |
| `1`  | failure — validation errors, verification failure, unknown item, parse error, drift/usage error |
| `2`  | blocked (`apply` only) — missing required artifacts **or** unchecked hard blockers              |
| `3`  | soft-blocked (`apply` only) — unconfirmed soft blockers; re-run with `--allow-soft`             |

There is no code that means "probably fine." If `apply` doesn't exit `0`, stop
and resolve what it reported before writing code.

## `cospec apply <change> [--allow-soft] [--json]`

In order:

1. **Resolve the change.** An unknown slug exits `1` with a fuzzy suggestion.
2. **Validate.** Full validation runs in fast mode; errors exit `1` with the
   report.
3. **Required artifacts.** Missing artifacts for the change's type exit `2` with
   `gate.reason: "missing-artifacts"`. See
   [Types and artifacts](/concepts/types-and-artifacts) for which artifacts each
   type requires.
4. **The blocker gate.** `blocking-changes.md` is parsed and checked against the
   archive index (dirs under `openspec/changes/archive/` matching
   `YYYY-MM-DD-<slug>`):
   - **Self-heal first.** Any unchecked entry whose slug is already archived
     gets rewritten to `[x]` with an `*(archived <date>)*` note, recorded under
     `gate.synced` in the JSON output. You never have to hand-edit a stale
     checkbox.
   - Remaining unchecked **Blocked by** entries are hard blockers — exit `2`
     with `gate.reason: "hard-blockers"`.
   - Remaining unchecked **Soft-blocked by** entries exit `3` unless you pass
     `--allow-soft`, in which case they're recorded under
     `gate.softAcknowledged` and apply proceeds.
5. **Delegate.** OpenSpec's own `instructions apply --json` is fetched for
   context.
6. **Emit and exit `0`.**

```json
{
  "change": "add-widget",
  "type": "feat",
  "gate": {
    "state": "clear",
    "hardBlockers": [],
    "softAcknowledged": [],
    "synced": []
  },
  "apply": {
    "state": "...",
    "contextFiles": [],
    "progress": {},
    "tasks": [],
    "instruction": "..."
  }
}
```

`apply.contextFiles` in the `--json` output is the file list an agent should
load before implementing — proposal, design, specs deltas, whatever the type
requires — so you don't have to guess what's relevant.

::: tip `--allow-soft` only waives **soft** blockers. Hard blockers have no
override — the change they name has to actually land first. :::

::: tip `--skip-specs` on `apply` A spec-bearing type can legitimately have no
deltas on a given run — pass `--skip-specs` on `cospec apply` as a one-shot
equivalent of persisting `skip_specs: true` in `.openspec.yaml` (see
[Configuration](/reference/configuration)). Precedence is the CLI flag first,
then the persisted marker, then the structural default that a spec-bearing type
must show deltas. :::

## `cospec archive <change> [--skip-specs] [--force-incomplete] [--json]`

Archive is the step that moves a change out of `openspec/changes/` and merges
its spec deltas into the living specs. Its steps run in a fixed order, and two
of them are hard gates with no `--force` flag:

**Pre-flight**

1. Resolve the change and its schema.
2. Run full validation — errors exit `1`.
3. **Tasks gate.** Any unchecked task in `tasks.md` exits `1` unless you pass
   `--force-incomplete`. Note that `-y` alone does not waive this — an automated
   caller can't skip real work just by auto-confirming prompts.
4. Self-blocker sanity check: unchecked hard blockers pointing at _this_
   change's own file print a warning, not a failure (aborted or superseded work
   still needs to be archivable).
5. Collision pre-check against an existing `archive/YYYY-MM-DD-<slug>` dir dated
   today.
6. Decide whether to pass `--skip-specs` to OpenSpec — forced by the flag, by
   the type having no `specs` artifact, or by the change having no
   `specs/**/spec.md` files.

**The two hard gates**, both run before delegation, both exit `1` with no
override:

- **`archive/verification-incomplete`** — fires whenever `verification` is
  required for this change's type and schema version, regardless of whether the
  change carries specs. Every row in `verification.md` must resolve to `[x]`
  with a recorded result, or `[~] defer: <reason>`. There is no `--force` for
  this gate — deferring on the record _is_ the escape hatch. See
  [Verification](/concepts/verification) for the row grammar.
- **`archive/scenario-preservation`** — fires only for specs-bearing changes,
  right before delegating. It re-parses each `## MODIFIED Requirements` delta
  against the current living spec and refuses when the delta no longer covers a
  living scenario — either because a scenario **name** is gone (names are
  compared case-sensitively and counted with multiplicity, so renaming a
  scenario is a drop plus an add even at an unchanged count) or because the
  count shrank. The refusal names every dropped scenario. A requirement retired
  through `## REMOVED Requirements` carries no `MODIFIED` op at all, so this
  gate never applies to it.

  ::: warning The `Scenario removed: <reason>` escape hatch is retired As of
  openspec 1.8.0, any `MODIFIED` block that omits a living scenario is a
  validate ERROR and its archive aborts on one —
  `current spec contains scenario(s) not present in the modified block … Aborted. No files were changed.`,
  exit `1` — with no special handling for cospec's note, so the note can no
  longer excuse a scenario drop; it only used to delay the refusal, and below
  1.8.0 honoring it silently dropped scenarios, the exact regression this gate
  exists to prevent. Two remedies actually work: copy the missing scenario back
  into the `MODIFIED` block, or — if the requirement really is being retired —
  `REMOVED` it in this change and `ADDED` its replacement in a **later** one. A
  `REMOVED` and an `ADDED` of one requirement name in the _same_ delta is not a
  remedy: openspec refuses it with
  `Requirement present in both ADDED and REMOVED`. cospec's own gate still fires
  first, under its own rule id, and stays the sole defence on openspec
  1.0.0–1.7.x inside the accepted `>=1.0.0 <2.0.0` range — 1.8.0+ runs its own
  overlapping check, making cospec's gate defence-in-depth from there on. :::

**Early-synced operations are not blockers**

A delta is sometimes written after its spec change already landed in the living
baseline — the spec was synced early, and the archive is catching up. OpenSpec
treats three such shapes as no-ops and archives them at exit `0`, so cospec's
archive preconditions do too, rather than blocking an archive the wrapped binary
performs cleanly:

| Shape                                                                           | Rule that stays silent                              |
| ------------------------------------------------------------------------------- | --------------------------------------------------- |
| `ADDED` whose block matches the living requirement (CRLF and outer trim folded) | `archive/added-exists`                              |
| `REMOVED` naming a requirement the living spec no longer has                    | `archive/target-missing`                            |
| `RENAMED` whose FROM is gone and whose TO is already present                    | `archive/target-missing` and `archive/added-exists` |

Each exemption is withheld when the living spec still carries a name that folds
equal to the named one — same letters, differing only in case or interior
whitespace — but is not it. That is a mistyped header rather than an early sync,
OpenSpec aborts on it, and cospec keeps refusing it with a hint naming the exact
living header. Everything else stays an ERROR: an `ADDED` collision whose body
differs, a `RENAMED` with FROM and TO both absent, a `RENAMED` applied while
both are present, and a `MODIFIED` whose target is absent.

**Execute and verify**

7. Delegate to `openspec archive <name> -y [--skip-specs]` and capture its
   stdout, stderr, and exit code.
8. **Verify on the filesystem — never trust the exit code alone.** OpenSpec can
   print `Aborted` (or thin a spec's scenarios during merge) and still exit `0`.
   cospec's verifier checks directly: the source change directory is gone, and a
   dated target directory with its `.openspec.yaml` exists. Any mismatch — a
   clean abort, or a half-moved state — exits `1` with an honest message instead
   of a false success.
9. For specs-bearing changes, a post-merge spot-check confirms each delta
   actually landed as expected in the living spec (ADDED present, REMOVED
   absent, RENAMED correctly, MODIFIED applied). Any miss exits `1`.

**Post**

10. Blocker fan-out: `sync-blockers` runs in fix mode across every remaining
    active change, checking off any entries that reference the change just
    archived, and reporting which changes became fully unblocked as a result.
11. Print the flywheel summary and exit `0`:

```
Archived: add-widget (feat) → openspec/changes/archive/2026-07-03-add-widget/
Specs:    +2 ~1 -0 →0 applied and verified
Warning:  Retiring openspec/specs/widgets/spec.md: all requirements removed.
Retired:  widgets (spec files deleted)
Blockers: checked off in 1 change(s): add-dashboard
Now unblocked: add-dashboard → next: cospec apply add-dashboard
```

On the success path, `cospec archive` no longer swallows the wrapped binary's
own non-blocking warnings — a `Warning:` line per relayed warning, and a
`Retired:` line naming any capability whose living spec the merge deleted. Both
also appear in `--json`, as `warnings: string[]` and `retired: string[]` —
always present, `[]` when nothing to report; the rest of the single-change JSON
shape is unchanged.

### Capability retirement

A `REMOVED` operation that takes a capability's last requirement can delete its
living `spec.md` outright, rather than leaving an empty `## Requirements`
section behind — but only when the change's `.openspec.yaml` declares
`retire_capabilities: true` (see [Configuration](/reference/configuration)).
Without the marker, openspec refuses the merge and cospec relays the refusal
untouched — change and spec both left exactly as they were. With it, expect the
`Retired:` line above; if a spec disappears with **no** marker present, that's
an invariant breach, not a legitimate retirement, and cospec reports it as such
rather than accepting it quietly.

::: warning Why filesystem checks, not exit codes The wrapped `openspec` binary
is trusted for its output, never for its exit code alone — it can abort or
silently thin a spec while still reporting success. Every gate above that
touches the filesystem re-checks the actual state on disk before reporting `0`.
:::

## Blocker sync outside archive

`cospec sync-blockers [--check] [--change <id>] [--json]` runs the same fix
logic as archive's final step, standalone. Use `--check` in CI to fail on drift
without mutating anything.

## Related

- [Types and artifacts](/concepts/types-and-artifacts) — which artifacts each
  type requires, and the required-vs-triggered artifact matrix.
- [Verification](/concepts/verification) — the row grammar and layer/owner
  vocabulary `archive/verification-incomplete` enforces.
- [The workflow loop](/guide/workflow) — where `apply` and `archive` sit in the
  end-to-end flow.
- [How it relates to OpenSpec](/concepts/how-it-relates-to-openspec) — the
  pinned OpenSpec version cospec wraps and why exit codes from it aren't trusted
  alone.
