# Proposal

## Why

The opsx leftover scan behind `cospec init --remove-opsx` and `cospec doctor`'s
`opsx-leftover` finding has two defects on `main`, both surfaced while
implementing `harness-receipt-and-doctor-scope` (#63) and ruled out of that
change's scope.

First, `leftoverScanFiles`' walk has no boundary at a nested git working tree.
`init.ts`'s `isLeftoverCandidate` accepts any `.md` file whose relpath's TOP
segment matches a row's skills root (`.claude`, `.codex`, …), checked by string
equality on the first path segment only, not by exact depth. The walk that feeds
it descends every directory under a scan root with no stop condition, so a
nested worktree checkout under, say, `.claude/worktrees/<name>/`, which mirrors
the whole project tree, is walked all the way down into its own
`.claude/commands/opsx/<id>.md`. If that nested checkout holds a genuinely
openspec-authored leftover (because that worktree ran vanilla `openspec init`
before migrating, or hasn't migrated yet), `cospec init --remove-opsx` run from
the OUTER repo lists and deletes a file that belongs to a different project (the
nested worktree), which has its own `cospec init --remove-opsx` to run for
itself.

Second, the provenance check that decides a file IS a leftover (`isOpsxMarkdown`
in `init.ts`, duplicated in `doctor.ts`'s `checkOpsx`) never matches a real
OpenCode leftover. It flags a skill file via `metadata.author: openspec` + a
bare-semver `generatedBy`, and a command file via `name: "OPSX: …"` frontmatter.
The pinned 1.13.1 dist's OpenCode command adapter
(`core/command-generation/adapters/opencode.js`) writes
`.opencode/commands/opsx-<id>.md` with frontmatter that carries `description`
only — no `name`, no `metadata` — confirmed by probing the pinned binary's own
`init --tools opencode` output. Neither marker can ever match that shape, so a
real OpenCode opsx leftover is never reported by doctor and never removed by
`--remove-opsx`, defeating the whole point of the scan for that one tool.

## What Changes

1. `leftoverScanFiles`' walk stops at a nested git working tree: a directory
   holding its own `.git` entry (a worktree checkout writes `.git` there as a
   file; an embedded clone, a directory) is never descended into. Only the
   walk's boundary changes — `isLeftoverCandidate`'s acceptance predicate is
   untouched, so every already-passing scenario (shared `.agents/skills` root,
   per-row command extensions, provenance-only removal) behaves exactly as
   before for files inside the project's own tree.
2. `isOpsxMarkdown` gains a third detection path, used only when the first two
   (skill metadata, command `name`) do not match: a file at
   `.opencode/commands/opsx-<id>.md` whose frontmatter has no key but
   `description`, and whose body contains the literal, backtick-quoted
   `` `openspec list --json` `` every opsx workflow body carries (the pinned
   dist's `PROJECT_ROOT_GUARD`) — a bare `openspec` command reference cospec's
   own shipped bodies never contain, since cospec always respells its own
   commands as `cospec`. The combination (exact path, exact frontmatter shape, a
   literal upstream command reference) is provenance, not a path/name
   convention: a hand-written `.opencode/commands/opsx-notes.md` with its own
   prose body never carries that reference and is left untouched.
3. `doctor.ts`'s `checkOpsx`, which duplicated the provenance predicate inline,
   now calls the exported `isOpsxMarkdown` directly, so init's removal set and
   doctor's finding can never drift apart again.

Neither change widens what the scan accepts outside these two fixes: a file
inside the project's own tree that was already found is still found, and the
only newly-matched shape is the real OpenCode one.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `opsx-migration-detection`: two requirements added — the leftover scan's walk
  stops at a nested git working tree, and a real OpenCode command leftover is
  detected by its own (frontmatter + body) shape.

## Impact

- `apps/cli/src/commands/init.ts`: `leftoverScanFiles` (walk boundary),
  `isOpsxMarkdown` (exported, new signature `(relpath, text)`, new OpenCode
  branch), `findOpsxFiles` (updated call site).
- `apps/cli/src/commands/doctor.ts`: `checkOpsx` now calls the shared
  `isOpsxMarkdown` instead of its own duplicate of the provenance logic.
- No schema, CLI flag, or JSON shape changes. `init --json`'s `opsx.found` and
  doctor's `opsx-leftover` finding keep their existing shape; only which files
  they can name changes (narrower for the worktree case, wider for the OpenCode
  case).
- Docs: `docs/harness-integration.md` (leftover-scan boundary and OpenCode
  detection) and `apps/docs`' harness-setup / commands pages.

## Surfaces

- [x] interactive — `cospec init --remove-opsx` and `cospec doctor`'s output
      (which files are listed/removed/warned on) changes for these two cases.
- [ ] deploy
- [ ] integration
- [ ] agent-behavior
