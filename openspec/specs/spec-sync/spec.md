# spec-sync Specification

## Purpose

Defines `cospec sync-specs`, which merges an active change's delta specs into
the main specs under `openspec/specs/` without archiving the change. The merge
is the wrapped binary's own archive merge, run on a scratch copy and copied back
file by file, so the main specs come out byte-for-byte as `cospec archive` would
write them, the real tree is never touched by the binary, and a later archive of
the same change is the binary's early-sync no-op.

## Requirements

### Requirement: Sync-specs merges a change's delta specs without archiving it

`cospec sync-specs <change>` SHALL run these steps in order, and SHALL stop at
the first one that refuses, writing nothing to the real tree:

1. Resolve the root and the change as `cospec archive` does. A namespace folder
   SHALL be refused with the binary's explanation, as archive refuses it.
2. Run archive's pre-merge checks on the change: the archive-precondition
   validation `cospec archive` runs, then the shared scenario-preservation
   helper. A refusal SHALL print the same report or gate message archive prints
   and exit 1.
3. Run the pinned binary's `archive <change> -y` on a scratch copy of the root
   (see "The scratch run never touches the real tree").
4. Copy back into the real `openspec/specs/` only the files that run created,
   changed or deleted, and prune a directory the binary's run left empty there.
5. Verify on disk that every copied file's bytes equal the scratch file's, that
   every deleted file is absent, and that no other file under `openspec/specs/`
   changed.

The change SHALL stay active: its directory, its artifacts, `tasks.md` and
`verification.md` SHALL be byte-identical after the command, and nothing SHALL
be written under `openspec/changes/archive/`. The tasks gate and
`archive/verification-incomplete` SHALL NOT run, because nothing is archived.

#### Scenario: A MODIFIED delta is synced and the change stays active

- **WHEN** `cospec sync-specs add-widget` runs on a change whose delta MODIFIES
  `Widget rendering`, keeping every living scenario
- **THEN** `openspec/specs/widgets/spec.md` carries the modified requirement,
  `openspec/changes/add-widget/` is unchanged, and the command exits 0

#### Scenario: A scenario-dropping MODIFIED is refused before any write

- **WHEN** the delta's MODIFIED block omits a scenario the living requirement
  has
- **THEN** the command prints the `archive/scenario-preservation` refusal, exits
  1, and no file under `openspec/` changes

### Requirement: The synced main specs are byte-identical to archive's

For every delta shape (ADDED on an existing or a new capability, MODIFIED,
REMOVED, RENAMED, and a REMOVED that retires a capability under
`retire_capabilities: true`) the files `cospec sync-specs` leaves under
`openspec/specs/` SHALL be byte-identical to the ones
`openspec archive <change> -y` writes on a copy of the same tree, including a
retired capability's deleted `spec.md` and its pruned directory. Because they
are, a following `cospec archive <change>` SHALL see every operation as the
early-sync no-op the binary performs (an identical ADDED, an absent REMOVED, an
applied RENAMED, an identical MODIFIED, a retired capability) and SHALL archive
the change with both hard gates run and no further change to `openspec/specs/`.

#### Scenario: Each delta shape matches the binary's archive

- **WHEN** `cospec sync-specs` runs on each of the ADDED, MODIFIED, REMOVED,
  RENAMED and retired-capability fixtures, and `openspec archive -y` runs on a
  copy of each
- **THEN** the two `openspec/specs/` trees are byte-identical on every fixture

#### Scenario: A linked living spec is synced as the binary archives it

- **WHEN** a capability's living `spec.md` is a relative symbolic link to a file
  elsewhere under `openspec/specs/`, and `cospec sync-specs` runs on a change
  that MODIFIES it and on one that retires it under `retire_capabilities: true`
- **THEN** each `openspec/specs/` tree — files, directories and links — is the
  one `openspec archive -y` leaves on a copy: the MODIFIED written through the
  link, the retired capability's link deleted and its directory pruned

#### Scenario: Archiving a synced change is a no-op merge

- **WHEN** `cospec archive` runs on each fixture after `cospec sync-specs`, with
  every task done and every verification row resolved
- **THEN** the change archives, exit 0, the `Specs:` line says the specs were
  already in sync, and `openspec/specs/` is unchanged by the archive

#### Scenario: The hard gates still run after a sync

- **WHEN** the same synced fixture carries a bare `[ ]` verification row
- **THEN** `cospec archive` refuses it with `archive/verification-incomplete`
  and exits 1

### Requirement: The scratch run never touches the real tree

The binary's run SHALL happen in a fresh directory created under the OS temp
directory, holding `openspec/config.yaml` or `openspec/config.yml` if present,
`openspec/schemas/`, `openspec/specs/`, `openspec/changes/<change>/` and an
empty `openspec/changes/archive/`, with the binary spawned there with that
directory as its working directory. Every other file and directory under the
real `openspec/`, including sibling changes and the real
`openspec/changes/archive/`, SHALL NOT be copied. The binary SHALL be spawned
with no `--store`, so its nearest-root walk resolves the scratch directory. The
command SHALL confirm that resolution from the run's own observable output
before copying anything back. A symbolic link in the copied subtree that leads
outside it SHALL be refused before the run, naming the link, because the binary
would write through it into the real tree. A symbolic link inside it, absolute
or relative, SHALL be copied pointing at the scratch copy of its target, so the
run never writes through a link into the real tree. A file or directory under
the copied subtree that the command cannot read SHALL NOT fail the command: the
binary's archive reads no main spec but a delta's target, so an unrelated
unreadable spec SHALL leave the sync answering as `cospec archive` answers. The
scratch directory SHALL be removed when the command ends, whether the run
succeeded or failed. A failed run SHALL leave the real tree byte-identical, with
no `.openspec-archive.lock` and no other new file anywhere under it, and SHALL
relay the binary's reason with its remedies spelled `cospec`.

#### Scenario: A refused scratch run leaves nothing behind

- **WHEN** the binary refuses the scratch run after taking its archive claim
  (two capability directories resolving to one spec through a symlink inside
  `openspec/specs/`)
- **THEN** `cospec sync-specs` exits 1 with the binary's reason, no
  `.openspec-archive.lock` exists anywhere under the real root, every file under
  the real `openspec/` is byte-identical to before, and the scratch directory is
  gone

#### Scenario: An absolute alias inside the specs never writes the real tree

- **WHEN** `openspec/specs/alias` is an absolute symbolic link to the root's own
  `openspec/specs/widgets/`, and `cospec sync-specs` runs on a change whose
  deltas the binary refuses after its claim (`alias` and `widgets` resolving to
  one spec), and on one whose only delta MODIFIES `alias`
- **THEN** the refused run exits 1 with the binary's reason and leaves every
  file under the real `openspec/` byte-identical, and the other exits 0 with
  `openspec/specs/` byte-identical to `openspec archive -y`'s on a copy

#### Scenario: Sibling changes and the archive are never copied

- **WHEN** `cospec sync-specs` runs in a root with two other active changes and
  an archived change of today's date and the same name
- **THEN** the scratch run succeeds and only `openspec/specs/` files change in
  the real tree

### Requirement: Sync-specs reports what it changed

In text mode, `cospec sync-specs` SHALL print one line per main-spec file it
wrote or deleted, then a summary carrying the binary's own applied totals. When
the binary reported the specs already in sync, it SHALL say so and write
nothing. When the change's schema has no specs artifact, it SHALL print that
there is nothing to sync and why, run nothing, and exit 0. When the change has
no delta specs or declares `skip_specs: true`, it SHALL first run archive's
revalidation and refuse what it refuses, so a delta kept in a file the merge
never reads (a `spec.md` at the root of the change's `specs/`, a
`specs/<capability>.md`, a note beside a capability's `spec.md`) is refused as
archive refuses it; otherwise it SHALL print that there is nothing to sync and
why, run no merge, and exit 0. The binary's merge warnings SHALL be relayed,
respelled. Under `--json` it SHALL print one document:
`{change, type, synced, totals, files: {written, deleted}, warnings, root}` on
success, and on any refusal
`{change, synced: false, status: [{severity, code, message, fix?}]}` with the
binary's diagnostic code for a scratch-run refusal, the code archive's document
uses for a pre-merge refusal, and exit 1. `--store` SHALL be accepted, and the
synced specs are then the selected store's.

#### Scenario: An already-synced change writes nothing

- **WHEN** `cospec sync-specs` runs a second time on the same change
- **THEN** it reports the specs already in sync, writes no file, and exits 0

#### Scenario: A change with no delta specs has nothing to sync

- **WHEN** `cospec sync-specs` runs on a `chore` change
- **THEN** it prints that the `chore` schema has no specs artifact, spawns
  nothing, and exits 0

#### Scenario: A delta in a file the merge never reads is refused

- **WHEN** `cospec sync-specs` runs on a `feat` change whose only
  `## ADDED Requirements` sits in `specs/spec.md`, `specs/widgets.md` or
  `specs/widgets/notes.md`
- **THEN** it prints the revalidation report `cospec archive` prints for the
  same change, exits 1, and writes nothing
