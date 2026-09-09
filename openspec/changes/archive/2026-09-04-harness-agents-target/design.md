## Context

The OpenSpec pin in this lineage is already 1.11.0, and upstream renders its
Codex skills to `.agents/skills/`, with `codex` kept as a tool id whose
`skillsDir` is `.agents` plus `legacySkillsDirs: ['.codex']`. cospec still
writes `.codex/skills/`. See proposal.md for why that gap matters and what
changes; this file records only the choices the implementation turns on.

Two existing constraints shape the approach. `openspec/specs/`
`opsx-migration-detection` states cospec never generates into `.agents/` — a
requirement this change must retire, not amend. And `.prettierignore` currently
exempts `.codex/skills/cospec-*/`; the generated bodies exceed the 80-column
markdown `proseWrap`, so whichever root holds them must stay formatter-exempt or
`format:fix` and `generate:check` become mutually unsatisfiable.

## Goals / Non-Goals

**Goals:**

- One rendering of the shared root, so `codex ≡ agents` is provable rather than
  maintained by hand.
- A migration whose worst realistic outcome is a duplicated file, never a lost
  user edit.
- No new false findings from `doctor`/`init` once `.agents` is both a harness
  dir and a foreign scan root.

**Non-Goals:**

- Any further tool target (`zed`, `antigravity`, `gemini`, `cursor`, …), even
  though they read the same root.
- A `.agents/skills/.openspec-target` ownership marker, in either direction.
- A dual-write compatibility mode that keeps `.codex/skills` populated.
- A slash-command surface for the shared root, global (`~/.codex`, `~/.agents`)
  installs, an OpenSpec pin bump, or any change to Claude/OpenCode output.

## Decisions

**D1 — `codex` stays a distinct harness; it is not renamed or aliased away.**
Only its `skillDir` moves. Rejected: collapsing `codex` into `agents` plus
extras. `.codex/rules/cospec.rules` is codex-only and something must still emit
it; `.codex/` presence is the only signal that a _Codex user_ exists, which the
migration needs; and dropping the selector would break documented
`--harness codex` / `--harness claude,codex` invocations for no gain. Upstream
keeps the id for the same reasons.

**D2 — one body dialect for the shared root, so ownership arbitration is
unnecessary.** Upstream needs target markers and a preference order because
different owners render the same skill file differently. Define a single
`shared` dialect used by both `codex` and `agents` and the two render
byte-identical files, making "both selected" a no-op rather than a conflict.
Dialects are keyed on the dialect, not the harness name, which is what makes the
identity provable. Rejected: rendering `/cospec-<skill>` plus a one-line "Codex
users type `$…`" prelude — cheaper to read, but every inline cross-reference
then tells a Codex user to type something Codex does not register.

The right-hand spelling is the skill directory name (`cospec-apply-change`), not
the workflow id: the shared target emits no command files, so `/cospec-apply`
would dangle there. Only 4 of the 12 workflows spell the two the same. Upstream
maps the same way.

**D3 — detect `agents` by `.agents/skills`, not by `.agents`.** A bare
`.agents/` proves nothing — this repo has `.agents/shared.md` and no skills.
Rejected: the existing `existsSync('.<harness>')` rule, which would auto-select
`agents` in any repo that keeps AGENTS.md sources. The fresh-repo default stays
`claude`, because cospec's richest surface is slash commands and the shared root
cannot have them; `agents` is opt-in.

**D4 — migration is a separate post-generation step, not
`removeOrphanMarkdown`.** That scan only visits skill bases derived from the
_current_ render, so `.codex/skills` left its scope the moment the path template
changed. Running after generation guarantees the replacement exists before a
duplicate is deleted, so the "move" is only ever a delete of a redundant copy.
Legacy roots are compile-time constants rather than manifest keys, and detection
is hash-based, so the migration works even with a missing or stale manifest.

**D5 — `codex` detection needs two clauses.** Sentinel under the legacy base
alone (a pre-migration install, otherwise it would stop being regenerated and
never be cleaned up), or sentinel under the shared base _and_
`.codex/rules/cospec.rules` present (a migrated install). Without the marker
clause an `agents`-only user would start acquiring a spurious `.codex/` dir.
After migrating, a Codex user honestly detects as both `codex` and `agents`.

**D6 — `legacy-layout` is its own doctor check, not a `drift` finding.**
`checkDrift`'s `drift`/`hand-edited` vocabulary would tell the user their file
diverged from canon, which is not what happened. It still counts as drift for
`update --check`, so CI blocks until it clears.

**D7 — `HARNESS_NAMES` appends `agents` last** rather than sorting
alphabetically. The order shows up in receipts and detection output; appending
keeps the existing three stable and minimises snapshot churn. Sorting is a
one-line change if the receipt order ever matters more.

## Operational surface

cospec is a repo-local CLI: no bind address, no container-vs-runner split, no
network calls, and no secrets — this change introduces none of those.

- **Filesystem writes.** New generation root `.agents/skills/cospec-*/SKILL.md`
  (twelve files). `.codex/skills/cospec-*/SKILL.md` is deleted under the rules
  in the specs delta; nothing else under `.codex/` is touched, and
  `.codex/rules/cospec.rules` is unchanged in path and content. Directory
  pruning is `rmdir`-if-empty only, never recursive.
- **Deletion containment.** `MANAGED_REMOVAL_ROOTS` now includes `.agents`;
  `resolveContainedPath` is unchanged and still rejects absolute and traversing
  manifest keys, including an `.agents/../…` key.
- **Exit codes.** `cospec update --check` (and therefore
  `mise run generate:check` and CI) exits 1 while a legacy layout remains;
  `cospec doctor` gains a WARNING-level `legacy-layout` check, which does not
  change its exit code by itself.
- **Binary versions.** No OpenSpec pin change — 1.11.0 throughout; no new
  runtime dependency, no new arch or platform requirement.
- **Repo tooling.** `.prettierignore` must exempt `.agents/skills/cospec-*/` in
  the same commit as the generated move, or `format:check` fails on the reflowed
  shared bodies.

## Risks / Trade-offs

- [Migration deletes a user's customised Codex skill] → hash-gated: only a file
  still matching its own stamped `contentHash` is removed. Negative tests for
  edited, foreign, extra-file and no-replacement cases are mandatory.
- [Migration deletes a directory holding user files] → only the exact `SKILL.md`
  is removed; parents go via `rmdir`-if-empty. Tested with a sibling file.
- [Duplicate `doctor`/`init` findings from the `.agents ⊃ .agents/skills`
  double-walk] → explicit dedupe by relpath plus a test asserting exactly one
  finding.
- [False `dangling-ref` ERRORs from the new `/cospec-<skill>` spelling] → ref
  resolution accepts the workflow id or the skill suffix; an unknown token still
  errors, and is tested.
- [`--harness all` silently widens to four targets] → release-note worthy and
  documented in the commands reference; `all` has always meant every target.
- [Self-repo regeneration is itself a destructive move that must land in the
  same PR] → `generate:check` runs in hk pre-commit and in CI, so an incomplete
  move cannot merge.
- [OpenSpec also writes into `.agents/skills`] → different prefixes
  (`openspec-*` vs `cospec-*`); the leftover scan is shape-gated and excludes
  `author: cospec`; cospec neither reads nor writes the ownership marker.
- [Snapshot churn in `test/unit/harness/__snapshots__`] → review the diff rather
  than blanket-updating; claude and opencode blocks must be provably unchanged.
- [`.codex/rules/cospec.rules` format is cospec's own invention, not
  upstream-verified] → out of scope: path and content are unchanged, so
  behaviour cannot regress. Follow-up if Codex's rules format is ever confirmed
  to have moved.
