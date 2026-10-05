# Apply & archive

These two commands are the enforcement surface. `apply` is the gate an agent
must clear before writing code; `archive` is the verified ship step. Both are
deterministic — the generated skills only ever tell the agent to run the command
and obey its exit code.

The full user-facing contract — the exit-code table, the step-by-step order
`apply` and `archive` run in, the `--json` shapes, and the two hard archive
gates — is owned by the site:
[Apply and archive](https://cospec.aligned.team/concepts/apply-and-archive).
Read that page for "what happens when I run this command"; this page covers what
isn't there.

## Why the gate is enforced twice

The `apply` gate is enforced in two places that never get out of sync by
construction: as an exit code an agent cannot rationalize past, and in the
schema instruction prose, which says only "run this command and obey its exit
code" — never a paraphrase of the gate logic an agent could talk itself past.
Dangling blocker slugs cannot false-pass either: `blockers/dangling-ref` fails
validation before the gate is even evaluated (see
[validation.md](validation.md)).

## Archive's step order around the binary's own checks

`commands/archive.ts` runs the binary's two directory checks at the binary's two
points, through the same runtime calls, so an unreadable
`openspec/changes/archive/` gets the binary's answer on each OS:

1. Before the change resolves, the binary's `assertPathWithin` over `changes/`,
   `changes/archive/` and `specs/` (`core/glob.ts`'s port, through
   `realpathSync.native`) — `archive_path_outside_root` where `realpath` refuses
   a mode-000 directory (macOS).
2. The name check, the change lookup, and the namespace-folder refusal
   (`findNestedChangesIn`), before revalidation.
3. Revalidation (skipped under `--no-validate`), reading the archive directory
   the degraded way: an empty index plus a warning naming it, never a throw.
4. The tasks gate, `archive/verification-incomplete`, the self-blocker warning.
5. The slot check as an `lstat`, as the binary's
   `assertArchiveDestinationAvailable` does — any errno but `ENOENT` is
   `archive_error` in the runtime's own words (Linux's `EACCES … statx`).
6. `archive/scenario-preservation` (`core/scenario-gate.ts`, shared with
   `sync-specs`), then the wrapped `archive -y`, the on-disk verification and
   the spot-check.

Every refusal goes through one `refuse` that prints the failure document under
`--json` (`core/archive-output.ts`);
`test/unit/commands/archive-refusals.test.ts` fails when a new refusal returns
without it.

## `sync-specs` runs the binary's archive on a scratch tree

`cospec sync-specs` never ports the merge: byte-identity with `archive` is only
provable by running archive's own merge. `core/scratch-root.ts` copies what the
binary's archive reads — `config.yaml`/`config.yml`, `schemas/`, `specs/`, the
one change and an empty `changes/archive/` (sibling changes and the real archive
are never read by it, and copying the archive could collide on today's slot) —
into `mkdtemp` under the OS temp directory, links copied as links. A link that
leads outside the copied paths is refused first, because the binary would write
through it into the real tree. The binary is spawned there with no `--store`: a
directory holding `specs/` and `changes/` is a real root and wins the
nearest-root walk. The run must leave the scratch change archived (exit 0, no
abort, one archive entry with its `.openspec.yaml`); then the scratch `specs/`
is diffed against its pre-run copy, the real `specs/` is re-fingerprinted (a
change while the binary ran refuses, writing nothing), and only the written,
deleted and pruned paths are applied and re-read. The scratch directory is
removed in a `finally`, so the binary's `.openspec-archive.lock` — or any
partial write of a failed run — can only ever exist there.

## Blocker sync

`cospec sync-blockers [--check] [--change <id>] [--json]` is the standalone form
of `archive`'s final step, and is wired into the pre-commit hook as a fix/check
pair. The single parser both `apply`'s blocker gate and `sync-blockers` share
lives in `core/blockers.ts` — see [blocking-changes.md](blocking-changes.md) for
its grammar. `fix` is the default mode; fix idempotence
(`fix(fix(x)) == fix(x)`) is a tested property.

## The `Scenario removed: <reason>` escape hatch is retired

As of openspec 1.8.0, `archive/scenario-preservation`'s upstream twin refuses
any `MODIFIED` block that drops a living scenario regardless of a
`Scenario removed: <reason>` note — the note can no longer excuse the drop.
cospec's own gate still fires first with its own rule id (the sole defence on
openspec 1.0.0–1.7.x; defence-in-depth from 1.8.0 on). The user-facing remedy
and the full `warnings`/`retired[]` archive-JSON fields are owned by the site:
[Apply and archive](https://cospec.aligned.team/concepts/apply-and-archive).
