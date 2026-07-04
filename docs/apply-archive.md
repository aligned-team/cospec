# Apply & archive

These two commands are the enforcement surface. `apply` is the gate an agent
must clear before writing code; `archive` is the verified ship step. Both are
deterministic and both are documented here as a user-facing contract — the
generated skills only ever tell the agent to run the command and obey its exit
code.

## Exit codes

| code | meaning                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------- |
| `0`  | success (including "nothing to do")                                                             |
| `1`  | failure — validation errors, verification failure, unknown item, parse error, drift/usage error |
| `2`  | blocked (`apply` only) — missing required artifacts **or** unchecked hard blockers              |
| `3`  | soft-blocked (`apply` only) — unconfirmed soft blockers; re-run with `--allow-soft`             |

## `cospec apply <change> [--allow-soft] [--json]`

1. Resolve the change (unknown → exit 1 with a fuzzy suggestion) and its schema.
   A legacy schema delegates `openspec instructions apply --json` verbatim with
   no gate and an INFO note.
2. Run full validation in fast mode. Errors → exit 1 with the report.
3. Compute missing artifacts from `schema.apply.requires`. If any are missing →
   print them, set JSON `gate.reason: "missing-artifacts"`, exit 2.
4. **The blocker gate** (deterministic):
   - Parse `blocking-changes.md` (a parse error → exit 1).
   - Build the archive index from `openspec/changes/archive/` dirs matching
     `^(\d{4}-\d{2}-\d{2})-(.+)$` (duplicate slug → keep the latest date, warn).
   - **Self-heal**: for each unchecked entry whose slug is in the archive index,
     rewrite `[ ]` → `[x]`, append `*(archived <date>)*` if absent, normalize
     the separator to an em-dash, and record it in `gate.synced`. Atomic write.
   - Remaining unchecked **Blocked by** entries are hard blockers → print each
     (noting whether the slug is an active change), set
     `gate.reason: "hard-blockers"`, exit 2.
   - Remaining unchecked **Soft-blocked by** entries: without `--allow-soft`,
     print each and exit 3; with `--allow-soft`, record `gate.softAcknowledged`.
5. Fetch `openspec instructions apply --json` (exit and JSON shape checked).
6. Emit merged output and exit 0:

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

The gate is enforced twice: here as an exit code an agent cannot rationalize
past, and in schema prose that says only "run this command and obey its exit
code." Dangling slugs cannot false-pass — `blockers/dangling-ref` fails
validation in step 2.

## `cospec archive <change> [-y] [--skip-specs] [--force-incomplete] [--json]`

### Pre-flight

1. Resolve the change and schema (a legacy schema still runs steps 5–11; step 2
   delegates validation).
2. Run **full** validation, including the archive-precondition family unless
   `--skip-specs`. Errors → exit 1. This makes step 9's abort detection a
   should-never-fire invariant, not the primary defense.
3. **Tasks gate**: parse `tasks.md`. Unchecked tasks and no `--force-incomplete`
   → exit 1 listing them. This is stricter than OpenSpec by design: `-y` alone
   does not waive incomplete tasks, so automation passing `-y` cannot skip work.
4. **Self-blocker sanity**: unchecked hard blockers in this change's own file →
   a WARNING (not fatal — aborted or superseded work gets archived too).
5. **Collision pre-check**: an existing `archive/` dir matching
   `^\d{4}-\d{2}-\d{2}-<name>$` with today's date → exit 1 before delegating.
6. **Skip-specs decision**: pass `--skip-specs` to OpenSpec when the user passed
   it, the schema declares no specs artifact, or no `specs/**/spec.md` files
   exist. Light types therefore never enter the delta-merge path.
7. **Snapshot**: the archive dir basenames and, if merging, the parsed delta ops
   per capability.

### Execute

8. Spawn `openspec archive <name> -y [--skip-specs] --no-color`; capture stdout,
   stderr, and exit code.

### Verify (the archive verifier)

9. Compute the new archive dirs. The target is the unique new dir matching
   `/^\d{4}-\d{2}-\d{2}-<name>$/` — **date-agnostic**, so it survives a midnight
   rollover. Success requires all of: exit code 0; stdout matching neither
   `Aborted` nor `Archive cancelled`; the source change directory gone; and the
   target plus its `.openspec.yaml` present. On failure:
   - clean abort (source not moved, no new dirs) → print the honest message plus
     OpenSpec's captured output verbatim, indented, and the `--skip-specs`
     remedy;
   - half-state (moved without target, or target without moved) → print exactly
     which invariant broke and instruct manual inspection.
   - exit 1.
10. **Post-merge spot-check** (skipped when `--skip-specs` / no deltas): for
    each snapshotted op, verify the living spec — ADDED present, REMOVED absent,
    RENAMED to-name present and from-name absent, MODIFIED present. Any miss →
    exit 1 with a "spec merge verification failed" message naming the misses.

### Post

11. Run `sync-blockers` in fix mode across all remaining active changes,
    collecting which entries were checked and which changes became fully
    unblocked.
12. Print the flywheel summary and exit 0:

```
Archived: add-widget (feat) → openspec/changes/archive/2026-07-03-add-widget/
Specs:    +2 ~1 -0 →0 applied and verified
Blockers: checked off in 1 change(s): add-dashboard
Now unblocked: add-dashboard → next: cospec apply add-dashboard
```

## Blocker sync

`cospec sync-blockers [--check] [--change <id>] [--json]` is the standalone form
of archive step 11 and is wired into the pre-commit hook (a fix/check pair). See
[blocking-changes.md](blocking-changes.md) for the STALE / DANGLING /
MANUAL-CHECK / FORMAT classes and the exit rules. `fix` is the default mode; fix
idempotence (`fix(fix(x)) == fix(x)`) is a tested property.
