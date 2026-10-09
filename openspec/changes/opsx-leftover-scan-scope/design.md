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
`generatedBy`) doesn't apply either — these are command files, not skills. A
review of this change's first pass found the original path+frontmatter+
bare-substring check still too wide: a user's own
`.opencode/commands/opsx-status.md` with a description-only frontmatter and a
body that happens to mention the same `` `openspec list --json` `` command (to
summarize changes, say) satisfied all three signals without being a leftover at
all. Decision 2 below is revised accordingly.

**Symlinked scan root escape.** A review of this change's first pass also found
that `leftoverScanFiles`' walk, while it now stops at a nested worktree's own
`.git` boundary, never checks whether a scan root itself — `.claude`, `.agents`,
or the explicit `.agents/skills` walk — is a symlink resolving outside the
project. The per-child `Dirent.isDirectory()` skip only protects a symlink
_discovered while walking a real parent directory_; it never runs for the root
segment handed straight to `walk()`, so a project whose `.claude` (or
`.agents/skills`) is a symlink into a shared dotfiles directory or a sibling
project would have that external directory's files listed by `opsx.found` and
deleted by `--remove-opsx` — exactly the kind of cross-project leak this
change's nested-worktree fix was meant to close. Decision 4 below closes the
same class of boundary, by containment rather than by git-ness.

## Goals / Non-Goals

**Goals:**

- The leftover scan's walk never reads or deletes inside a nested git working
  tree distinct from the project's own.
- The leftover scan's walk never reads or deletes through a symlinked scan root
  (or the explicit shared `.agents/skills` walk) that resolves outside the
  project — a project whose `.claude`, `.agents`, or `.agents/skills` is a
  symlink into a shared or sibling directory must never have that directory's
  files listed or removed.
- A real OpenCode opsx command leftover (the shape the pinned 1.13.1 adapter
  actually writes) is detected and removed like every other tool's leftover, and
  only that shape — a user's own file at a lookalike path, or carrying only a
  lookalike command substring, is never misclassified as one.
- Neither fix changes what the scan finds for a file that isn't one of these
  cases — every existing passing scenario (shared `.agents/skills`, per-row
  command extensions, provenance-only removal, the Claude/`.prompt` legacy
  command paths) is unaffected.

**Non-Goals:**

- Hardening the scan against every conceivable nested-repo shape (submodules
  with no checked-out `.git`, bind mounts). The nested-worktree boundary is "a
  directory with its own `.git` entry", which covers `git worktree add` and a
  plain nested clone; anything stranger is out of scope. (A symlinked scan root
  is in scope — see Decision 4 — since it is the mechanism `.agents/skills`
  itself legitimately uses on a real repo, not a stranger shape.)
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

2. **OpenCode detection needs all four signals together: an id the pinned dist
   actually generates, frontmatter shape, and the `PROJECT_ROOT_GUARD`'s full
   lead sentence plus its body command reference.** Path shape alone
   (`.opencode/commands/opsx-<id>.md` for an arbitrary `<id>`) is exactly the
   ambiguous case the existing provenance-only design forbids matching on — a
   user could hand-write a personal note at a lookalike path, including an
   `<id>` the pinned dist never generates (e.g. `opsx-status`). The id is
   therefore restricted to the 12 the pinned 1.13.1 dist's command-generation
   module ever writes (`propose`, `explore`, `new`, `continue`, `apply`,
   `update`, `ff`, `sync`, `archive`, `bulk-archive`, `verify`, `onboard` —
   confirmed against the vendored bundle, `OPENCODE_OPSX_IDS`), closing off
   every id a user's own command could plausibly choose instead. Frontmatter
   shape (`{description}` only) narrows it further but still isn't provenance: a
   user's own file at that path could easily have only a `description` key,
   since that's the one field OpenCode's own frontmatter convention encourages.
   The remaining signal was originally the bare backtick-quoted
   `` `openspec list --json` `` reference alone; a later review found that too
   weak on its own — a user's own command whose body happens to document or
   invoke that same command (not copy the upstream boilerplate) would still
   match. The check now also requires the `PROJECT_ROOT_GUARD` template's
   distinctive lead sentence,
   `**Project check:** These steps expect a project that already uses OpenSpec.`
   (interpolated into every opsx workflow but one), verbatim, alongside the
   command reference: cospec's own shipped bodies never contain a bare
   `openspec` command reference at all (the "no bare `openspec` in shipped
   output" constraint applies to cospec's _generated_ files), and a hand-written
   user file — even one that mentions the same command for its own reasons — has
   no reason to also contain this exact upstream sentence. The combination
   survives this change's negative fixtures: `.opencode/commands/opsx-notes.md`
   (same path shape, same frontmatter shape, user's own prose body),
   `opsx-status.md` (a lookalike id outside the 12), and a real-id lookalike
   that quotes the command but not the lead sentence — none match.

   _Alternative rejected:_ matching on path + frontmatter shape alone, or on a
   bare `opsx-[^/]+` id wildcard plus the bare command substring. Both satisfy
   the probed bytes but fail the "a user file that isn't upstream's own shape is
   not a leftover" requirement this change is scoped to — a user's hand-written
   note at a lookalike path, or one that legitimately discusses the same
   command, would be falsely swept up.

   _Alternative rejected:_ requiring byte-identical frontmatter/body to one
   pinned 1.13.1 sample. Would break on the next openspec patch release inside
   the accepted `>=1.0.0 <2.0.0` range that rewords the guidance text even
   slightly. The chosen marker is the shortest substring combination that is
   both stable across the pinned dist's thirteen other workflow templates
   (checked: eleven of thirteen workflow bodies carry the identical
   `PROJECT_ROOT_GUARD` text; the other two are the module's own helper exports,
   never themselves a workflow body) and architecturally meaningful (a whole
   boilerplate sentence plus a bare `openspec` command reference), rather than
   an arbitrary prose fragment or the command reference alone.

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

4. **Scan-root containment: realpath, not `lstat`.** Before `leftoverScanFiles`'
   `walk()` reads a root's directory (every `scanRoots` entry, and the explicit
   `.agents/skills` walk), it resolves that path with `realpathSync` and skips
   it unless the result stays inside `cwd`'s own `realpathSync` — i.e. unless
   `path.relative(cwdReal, real)` neither is `..` nor starts with `../`.
   `removeOpsxFiles` re-checks the same containment immediately before every
   `rmSync`, as defense in depth independent of the walk. Containment is checked
   by realpath rather than `lstatSync` on the root segment for two reasons: it
   needs no per-ancestor-segment walk to catch a multi-segment path like
   `.agents/skills` regardless of which segment is the symlink, and it does not
   needlessly skip a symlink that happens to resolve back inside the project (a
   legitimate, harmless layout) the way a blanket "skip every symlink" rule
   would.

   _Alternative rejected:_ `lstatSync` the root segment and skip if it is a
   symlink. Simpler, but checks only the final path segment — `.agents/skills`
   with `.agents` itself as the symlink (rather than `skills`) would pass an
   `lstat` on `.agents/skills` (which resolves through the intermediate symlink
   before statting) without ever flagging the escape, and it would also skip an
   in-project symlink that poses no risk at all.

5. **One bounded walker for every project scan.** `leftoverScanFiles`' two
   guards (the nested-`.git` prune and the realpath containment) move,
   unchanged, into `harness/scan-walk.ts`'s
   `walkProjectFiles(cwd, roots, visit, skipDir?)`, and the three scans that
   descend the scan roots all call it: the opsx leftover scan, doctor's
   `harnessMarkdownFiles` (the read behind `stale-harness`, `mixed-versions`,
   `dangling-ref`) and doctor's `checkStaleSidecars` (which also walks
   `openspec/` and prunes `archive` through `skipDir`). Before this, the latter
   two kept their own unbounded walk, so a nested worktree's `.cospec-new`
   sidecar was reported as the outer project's and a symlinked `.claude` was
   read from outside the project, contradicting the docs' claim that a nested
   worktree's copy "is never checked". A fix to one guard now reaches every scan
   by construction.

   _Alternative rejected:_ narrow the docs claim and test each walk separately.
   It leaves two copies of the boundary to drift and the warning, whose remedy
   tells the user to apply or discard another checkout's file, still wrong.

## Operational surface

Nothing changes in how cospec deploys or runs. The fix touches only which local
files a local `cospec init --remove-opsx` deletes and which files a local
`cospec doctor` warns on. There is no bind address, container, network call or
secret. The `bun run` entry, the npm package and the standalone compiled
binaries behave the same. The wrapped OpenSpec binary (pinned 1.13.1, accepted
`>=1.0.0 <2.0.0`) is spawned only to probe its own output in this change's test
suite — never a new runtime dependency.

## Risks / Trade-offs

- [The `PROJECT_ROOT_GUARD` lead sentence or the `` `openspec list --json` ``
  reference stops appearing in a future openspec release inside the accepted
  range, or a release adds/renames a workflow id beyond the 12 in
  `OPENCODE_OPSX_IDS`] → OpenCode leftovers from that release would stop being
  detected until this change is revisited; the risk is bounded to one tool's
  detection, not a regression on any other tool or on the walk/removal
  mechanics, and the pinned dev/CI version (1.13.1) is re-probed on every
  version bump per this repo's existing OpenSpec-pin discipline.
- [A legitimate symlinked scan root resolves to a location that itself drifts
  outside the project between the containment check and the read/delete (a
  TOCTOU race: something re-points the symlink mid-run)] → Vanishingly unlikely
  for a local, synchronous CLI scan with no concurrent writers to the same
  symlink in its own run; the conservative failure mode if it somehow happened
  is under-scan (skipping a path the check now treats as outside), never
  over-delete.
- [A project legitimately nests a non-git copy of itself, e.g. a vendored
  snapshot with no `.git`] → Not a worktree by this change's definition, so it
  is still walked exactly as before; this is unchanged behavior, not a new risk
  this change introduces.
- [`.git` as a file inside a directory that isn't actually a git working tree] →
  Vanishingly unlikely (nothing else conventionally names a file `.git`);
  treating it as a boundary is the conservative failure mode (under-scan, not
  over-delete).
