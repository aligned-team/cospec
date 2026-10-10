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
into `mkdtemp` under the OS temp directory, each read at its real path. A link
inside the copied paths is copied re-pointed at the scratch copy of its target,
so an absolute in-tree alias aliases the scratch tree, never the real one; a
link that leads outside them is refused first, because the binary would write
through it into the real tree. A file this process cannot read is copied as an
empty file of the same mode (a directory it cannot list, empty), so an unrelated
unreadable spec — which the binary's archive never reads — fails nothing. The
binary is spawned there with no `--store`: a directory holding `specs/` and
`changes/` is a real root and wins the nearest-root walk. The run must leave the
scratch change archived (exit 0, no abort, one archive entry with its
`.openspec.yaml`); then the scratch `specs/` is diffed against its pre-run copy,
every entry kind included (a linked `spec.md` the run removed is deleted, one it
replaced with a file is written), the real `specs/` is re-fingerprinted (a
change while the binary ran refuses, writing nothing), and only the written,
deleted and pruned paths are applied and re-read. The scratch directory is
removed in a `finally`, so the binary's `.openspec-archive.lock` — or any
partial write of a failed run — can only ever exist there.

## The project's inputs: relay, respell and transcript order

`context`, `operations.<id>.guidance` and `references` come from
`openspec/config.yaml`. The wrapped `instructions apply --json` document carries
them, so `apply` keeps them as its own: `ApplyInstructionsJson`
(`core/openspec.ts`) declares `context?`, `operationGuidance?` and `references?`
(`ReferenceEntry`, exported from `core/instructions-render.ts`). Before that
declaration they rode along untyped on the `...instr` spread.

`relayApplyInstructions` spells only the references' command fields, through
`respellInstructionsDocument` (`references[].fetch` and
`references[].status[].fix`, each only when the whole value is an allowlisted
remedy). `context` and `operationGuidance` are the project's own text and pass
byte for byte, an entry that starts `openspec ` included. This is the one narrow
break: a `references` fetch command that printed `openspec show …` in
`apply --json` now prints `cospec show …`.

The human transcript is printed by `core/operation-inputs.ts`:
`renderReferencesSection` and `renderOperationInputs` are ports of the binary's
`renderReferencedStoresSection` and `printOperationInputsText` over the relayed
document, sharing `renderReferencedStoresSection` and `sanitizeInline` from
`instructions-render.ts`. One deliberate difference: when nothing is configured
the binary prints `No project context or operation guidance configured.` and
cospec prints nothing, so an unconfigured project's output is unchanged.

Both `apply` output paths print in the same order, around the instruction:

1. Clear gate (`apply.ts`, after the `N of M task(s) remaining.` line and the
   `Warning:` lines): the `### Referenced Stores` section, the instruction, then
   `### Project Context (required instruction input)` and
   `### Operation Guidance (advisory)`.
2. `applyLegacy` (after its warnings): the same three parts in the same order,
   minus the progress line.

`archive` reads the same inputs in `commands/archive.ts` (`archiveInputs` →
`readConfigOperationInputs`, through the same config reader the binary uses),
once the change resolves; refusals before that point print none of them. It does
not go through a wrapped `instructions archive` call, because a refusal that
comes before the delegated archive spawns nothing, and once the delegated
archive has run the change is no longer under `openspec/changes/`. The text
summary prints the sections after its last line; a text-mode refusal prints them
after the refusal; the `--json` success document spreads them at the top level;
failure documents carry none of them.

The workflow bodies look the inputs up with
`cospec instructions archive --change <slug> --json`, a forwarded read-only call
with no code of its own (the contract test runs the very line the body prints).
The archive workflow runs it once per change, and the bulk-archive workflow runs
it once for the batch.

## Bulk archive's lookup and collision edits

`bulk-archive` is a workflow body, not a command, so its collision handling is
prompt procedure over cospec primitives. The body detects a collision by
capability path, not only by `ADDED` name:
`cospec status --change <slug> --json` names each change's
`artifactPaths.specs`, and the requirement names are the `### Requirement:`
lines. Two `MODIFIED` deltas on one capability overwrite each other as silently
as two `ADDED` ones, so the body treats both as collisions; only an `ADDED`
requirement that already exists is what `cospec archive` refuses
(`archive/added-exists`).

The resolution edits only the conflicting change's delta files. "Newer" is the
change that archives later (dependency first, then `created:`), so a provider is
never the newer one however recent its date. A newer `ADDED` that the older
change also adds moves to `MODIFIED` with the full requirement text and every
scenario, because `archive/scenario-preservation` refuses a `MODIFIED` that
drops one. Where both changes `MODIFIED` the same requirement, the newer block
carries the older block's scenarios along with its own, for the same reason. An
excluded change loses its colliding requirement blocks, and its delta file is
deleted only when nothing is left in it and the change keeps another delta. A
change left with no delta where its type requires specs is shown `Blocked`,
never edited into invalidity. Main specs are never written by hand, and no
`--force*` flag is passed.

Each edited change runs `cospec validate <slug> --strict` only once every change
ahead of it has archived, because validation reads the living specs as they
stand. An unresolved collision needs no special handling: the later
`cospec archive` refuses with `archive/added-exists` and moves nothing
(`test/integration/bulk-archive-collision.test.ts` pins both the refusal and the
delta-edit cases).

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
