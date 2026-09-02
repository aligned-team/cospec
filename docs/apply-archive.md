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
