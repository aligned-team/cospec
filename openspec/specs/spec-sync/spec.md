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

`cospec sync-specs <change>` SHALL, in order, stopping at the first refusal with
nothing written to the real tree: resolve the root and change as archive does;
run archive's pre-merge checks; run the binary's `archive <change> -y` on a
scratch copy of the root; copy back only what that run changed; verify on disk.
The change SHALL stay active and byte-identical, nothing SHALL be written under
`openspec/changes/archive/`, and the tasks gate and
`archive/verification-incomplete` SHALL NOT run.

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

#### Scenario: Resolution and pre-merge checks refuse as archive does

- **WHEN** `cospec sync-specs` targets a namespace folder, or a change that
  fails the archive-precondition validation `cospec archive` runs or the shared
  scenario-preservation helper
- **THEN** it refuses with the binary's namespace-folder explanation, or prints
  the same report or gate message archive prints, and exits 1

#### Scenario: Only the run's own changes are copied back and verified

- **WHEN** the scratch run succeeds
- **THEN** only the files it created, changed or deleted are copied into the
  real `openspec/specs/`, a directory it left empty is pruned there, and the
  command verifies on disk that every copied file's bytes equal the scratch
  file's, every deleted file is absent, and no other file under
  `openspec/specs/` changed

### Requirement: The synced main specs are byte-identical to archive's

For every delta shape (ADDED on an existing or new capability, MODIFIED,
REMOVED, RENAMED, a REMOVED retiring a capability under
`retire_capabilities: true`) the files `cospec sync-specs` leaves in
`openspec/specs/` SHALL be byte-identical to what `openspec archive <change> -y`
writes on a copy of the tree, a retired capability's `spec.md` deleted and
directory pruned. A later `cospec archive` SHALL see only early-sync no-ops and
archive with both hard gates and no further spec change.

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

#### Scenario: Early-sync no-ops are the binary's

- **WHEN** `cospec archive <change>` runs after `cospec sync-specs <change>`
- **THEN** it treats an identical ADDED, an absent REMOVED, an applied RENAMED,
  an identical MODIFIED and a retired capability as the early-sync no-op the
  binary performs

### Requirement: The scratch run never touches the real tree

The binary SHALL run with no `--store` in a fresh OS-temp working directory
holding only `openspec/config.yaml` or `config.yml` if present,
`openspec/schemas/`, `openspec/specs/`, `openspec/changes/<change>/`, and an
empty `openspec/changes/archive/`; the command SHALL confirm from the run's
output that it resolved there before copying back, and remove the directory when
it ends. A failed run SHALL leave the real tree byte-identical and relay the
binary's reason with remedies spelled `cospec`.

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

#### Scenario: Symbolic links never lead the run into the real tree

- **WHEN** the copied subtree holds a symbolic link
- **THEN** one leading outside the subtree is refused before the run, naming the
  link, and one inside it, absolute or relative, is copied pointing at the
  scratch copy of its target

#### Scenario: An unreadable unrelated spec does not fail the sync

- **WHEN** a file or directory under the copied subtree cannot be read
- **THEN** the command does not fail on that account, since the binary's archive
  reads no main spec but a delta's target, and the sync answers as
  `cospec archive` answers

#### Scenario: A failed run leaves no lock or new file

- **WHEN** the scratch run fails
- **THEN** no `.openspec-archive.lock` and no other new file exists anywhere
  under the real tree, and the scratch directory is removed

### Requirement: Sync-specs reports what it changed

In text mode `cospec sync-specs` SHALL print one line per main-spec file it
wrote or deleted, then a summary with the binary's applied totals, saying so and
writing nothing when the binary reported the specs already in sync. The binary's
merge warnings SHALL be relayed, respelled. `--store` SHALL be accepted, syncing
the selected store's specs. Under `--json` it SHALL print one document,
`{change, type, synced, totals, files: {written, deleted}, warnings, root}` on
success.

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

#### Scenario: A schema with no specs artifact has nothing to sync

- **WHEN** the change's schema has no specs artifact
- **THEN** it prints that there is nothing to sync and why, runs nothing, and
  exits 0

#### Scenario: No delta specs are revalidated before nothing is synced

- **WHEN** the change has no delta specs or declares `skip_specs: true`
- **THEN** it first runs archive's revalidation and refuses what it refuses, so
  a delta in a file the merge never reads (a `spec.md` at the root of the
  change's `specs/`, a `specs/<capability>.md`, a note beside a capability's
  `spec.md`) is refused as archive refuses it, and otherwise prints that there
  is nothing to sync and why, runs no merge, and exits 0

#### Scenario: A JSON refusal is one status document

- **WHEN** `cospec sync-specs --json` refuses
- **THEN** stdout is
  `{change, synced: false, status: [{severity, code, message, fix?}]}` with the
  binary's diagnostic code for a scratch-run refusal or the code archive's
  document uses for a pre-merge refusal, and the exit code is 1
