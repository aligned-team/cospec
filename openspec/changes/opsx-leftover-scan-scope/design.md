# Design

## Context

**Nested worktree boundary.** `isLeftoverCandidate` matches a `.md` file by
comparing only the file's TOP path segment (`relpath.split('/')[0]`) against a
row's skills-root top segment — not an exact-depth prefix the way
`isHarnessDocument` matches harness documents. That breadth is deliberate
(`DESIGN §6.6`): openspec's own legacy paths (`.claude/commands/opsx/<id>.md`,
deeper skill paths, …) need a wide net, and provenance (frontmatter/body), not
path depth, is what decides removal. But the walk behind it
(`leftoverScanFiles`) has no stop condition at all: it recurses into every
subdirectory under a scan root, including `.claude/worktrees/<name>/`, which
`cospec`'s own multi-worktree workflow (see this repo's own `CLAUDE.md`) creates
routinely. Such a directory is a full, independent checkout of the project — its
own `.git`, its own `openspec/`, potentially its own unmigrated openspec
leftovers. The outer scan has no business reading or deleting inside it.

**OpenCode provenance.** Probed from the pinned 1.13.1 binary's own
`init --tools opencode` output in the harness-mandated sandbox: the OpenCode
command adapter's `formatFile` emits only `description:` in frontmatter
(`core/command-generation/adapters/opencode.js`). Every other markdown command
adapter cospec already detects (Claude's `name: 'OPSX: …'`) carries a `name`
field; OpenCode's does not, by design (OpenCode command files have no display
name). The skill marker (`metadata.author: openspec` + bare-semver
`generatedBy`) doesn't apply either — these are command files, not skills.

## Goals / Non-Goals

**Goals:**

- The leftover scan's walk never reads or deletes inside a nested git working
  tree distinct from the project's own.
- A real OpenCode opsx command leftover (the shape the pinned 1.13.1 adapter
  actually writes) is detected and removed like every other tool's leftover.
- Neither fix changes what the scan finds for a file that isn't one of these two
  cases — every existing passing scenario (shared `.agents/skills`, per-row
  command extensions, provenance-only removal, the Claude/`.prompt` legacy
  command paths) is unaffected.

**Non-Goals:**

- Hardening the scan against every conceivable nested-repo shape (submodules
  with no checked-out `.git`, bind mounts, symlinked worktrees). The boundary is
  "a directory with its own `.git` entry", which covers `git worktree add` and a
  plain nested clone; anything stranger is out of scope.
- Changing `isLeftoverCandidate`'s existing acceptance breadth. Only the walk
  that feeds it, and the provenance check that gates removal, change.

## Decisions

1. **Boundary check: directory has its own `.git` entry, by existence, not
   `isDirectory()`.** `git worktree add` writes `.git` as a _file_ (a gitdir
   pointer); a plain nested clone writes it as a directory. Checking existence
   alone catches both with one test, and needs no git invocation — just
   `existsSync(join(childAbs, '.git'))`, checked right before `walk()` would
   recurse into a child directory. The project's own `.git` at `cwd` is never
   checked (the walk starts at each scan root, e.g. `.claude`, never at `cwd`
   itself), so the project's own tree is never mistaken for a nested boundary.

   _Alternative rejected:_ hard-coding `.claude/worktrees/` as the one path to
   skip. It would miss a worktree created anywhere else, and a plain nested
   clone (no `cospec`-specific convention) entirely. The `.git`-entry check is
   general and needs no knowledge of this repo's own worktree convention.

2. **OpenCode detection needs all three signals together: path, frontmatter
   shape, and a literal body marker.** Path alone
   (`.opencode/commands/opsx-<id>.md`) is exactly the ambiguous case the
   existing provenance-only design forbids matching on — a user could hand-write
   a personal note at that exact path. Frontmatter shape (`{description}` only)
   narrows it further but still isn't provenance: a user's own file at that path
   could easily have only a `description` key, since that's the one field
   OpenCode's own frontmatter convention encourages. The third signal, the
   literal backtick-quoted `` `openspec list --json` `` reference every opsx
   workflow body carries (via the pinned dist's shared `PROJECT_ROOT_GUARD`
   template, interpolated into every opsx workflow but one), is the provenance:
   cospec's own shipped bodies never contain a bare `openspec` command reference
   (the "no bare `openspec` in shipped output" constraint applies to cospec's
   _generated_ files, and a hand-written user file has no reason to contain this
   specific upstream boilerplate sentence). The combination survives this
   change's own negative fixture: `.opencode/commands/opsx-notes.md`, same path
   shape, same frontmatter shape, user's own prose body — no match.

   _Alternative rejected:_ matching on path + frontmatter shape alone. Would
   satisfy the probed bytes but fails the "a user file named `opsx-*` without
   upstream's shape is not a leftover" requirement this change is scoped to — a
   user's hand-written note at that exact path with only a `description` key
   would be falsely swept up.

   _Alternative rejected:_ requiring byte-identical frontmatter/body to one
   pinned 1.13.1 sample. Would break on the next openspec patch release inside
   the accepted `>=1.0.0 <2.0.0` range that rewords the guidance text even
   slightly. The chosen marker is the shortest substring that is both stable
   across the pinned dist's thirteen other workflow templates (checked: eleven
   of thirteen workflow bodies carry the identical `PROJECT_ROOT_GUARD` text;
   the other two are the module's own helper exports, never themselves a
   workflow body) and architecturally meaningful (a bare `openspec` command
   reference), rather than an arbitrary prose sentence.

3. **`isOpsxMarkdown` gains the path parameter; `checkOpsx` stops duplicating
   it.** The function's signature changes from `(text)` to `(relpath, text)` —
   the OpenCode branch needs the path to apply its path+shape rule.
   `doctor.ts`'s `checkOpsx` had its own inline copy of the same provenance
   logic (skill-metadata + command-name checks, pre-dating this change); it now
   imports and calls `isOpsxMarkdown` instead, so init's removal set and
   doctor's finding share one predicate and can never silently drift apart again
   — the same reasoning `opsx-migration-detection`'s existing requirement
   already applies to the _scan_ ("the scan behind `init --remove-opsx` and
   doctor's `opsx-leftover` finding is the same scan") now also holds for the
   _provenance check_ that gates both.

## Operational surface

Nothing changes in how cospec deploys or runs. The fix touches only which local
files a local `cospec init --remove-opsx` deletes and which files a local
`cospec doctor` warns on. There is no bind address, container, network call or
secret. The `bun run` entry, the npm package and the standalone compiled
binaries behave the same. The wrapped OpenSpec binary (pinned 1.13.1, accepted
`>=1.0.0 <2.0.0`) is spawned only to probe its own output in this change's test
suite — never a new runtime dependency.

## Risks / Trade-offs

- [The `` `openspec list --json` `` marker stops appearing in a future openspec
  release inside the accepted range] → OpenCode leftovers from that release
  would stop being detected until this change is revisited; the risk is bounded
  to one tool's detection, not a regression on any other tool or on the
  walk/removal mechanics, and the pinned dev/CI version (1.13.1) is re-probed on
  every version bump per this repo's existing OpenSpec-pin discipline.
- [A project legitimately nests a non-git copy of itself, e.g. a vendored
  snapshot with no `.git`] → Not a worktree by this change's definition, so it
  is still walked exactly as before; this is unchanged behavior, not a new risk
  this change introduces.
- [`.git` as a file inside a directory that isn't actually a git working tree] →
  Vanishingly unlikely (nothing else conventionally names a file `.git`);
  treating it as a boundary is the conservative failure mode (under-scan, not
  over-delete).
