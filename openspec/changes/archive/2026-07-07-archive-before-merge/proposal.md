## Why

Archives used to land post-merge, which repeatedly stranded changes on `main` in
`openspec/changes/` — Imogen caught this twice in one day. The convention needs
to be that archiving happens on the PR branch, before merge.

## What Changes

- `.agents/shared.md` — amend step 6 of "The cospec workflow (we self-host)" to
  require the archive commit on the PR branch as the final commit before merge,
  and state the never-merge-unarchived rule. Regenerate `CLAUDE.md`/`AGENTS.md`
  via `mise run agents:sync`.
- `CONTRIBUTING.md` — same amendment in the "Self-hosting loop" and "The cospec
  change workflow" sections, plus a line in "PR etiquette" stating a PR is
  complete only once it carries its own change's archive commit.
- Clarify, where archive/spec-sync is described, that schemas with no specs
  artifact (`ci`, `chore`, `docs`, …) correctly produce no spec-sync deltas on
  archive.

## Impact

Affects contributor workflow docs only: `.agents/shared.md` (source), its
generated `CLAUDE.md`/`AGENTS.md`, and `CONTRIBUTING.md`. No code or schema
changes.
