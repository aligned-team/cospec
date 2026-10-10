# Spec Delta

## ADDED Requirements

### Requirement: Root-level legacy config files are swept for OpenSpec blocks

The leftover scan behind `cospec init --remove-opsx`, `cospec init --json`'s
`opsx.found` and `cospec doctor`'s `opsx-leftover` finding SHALL also read the
eight root-level files in the pinned OpenSpec's `LEGACY_CONFIG_FILES`:
`CLAUDE.md`, `CLINE.md`, `CODEBUDDY.md`, `COSTRICT.md`, `QODER.md`, `IFLOW.md`,
`AGENTS.md` and `QWEN.md`. A file SHALL be reported when it contains both
`<!-- OPENSPEC:START -->` and `<!-- OPENSPEC:END -->`. With `--remove-opsx` or
`--yes`, cospec SHALL remove the block exactly as the pinned binary's
`removeMarkerBlock` does: only a marker alone on its line counts, the lines from
the start marker's line through the end marker's line are removed, runs of three
or more line breaks become two, trailing whitespace is trimmed and the file's
line-ending style is kept. The file SHALL NOT be deleted: a file with nothing
but the block is written empty. A file's other content SHALL be byte-preserved.
Without consent the files SHALL be listed and left untouched.

#### Scenario: A block is stripped and the rest kept

- **WHEN** `AGENTS.md` holds `keep me`, a blank line and an OpenSpec block, and
  `cospec init --remove-opsx` runs
- **THEN** `AGENTS.md` is `keep me` and one newline, and the receipt says
  `Removed OpenSpec markers from AGENTS.md`

#### Scenario: A file that is only the block is kept, empty

- **WHEN** `CLAUDE.md` holds nothing but an OpenSpec block and
  `cospec init --remove-opsx` runs
- **THEN** `CLAUDE.md` still exists and is zero bytes, matching what
  `openspec init --force` leaves

#### Scenario: Without consent nothing changes

- **WHEN** `cospec init` runs without `--remove-opsx` or `--yes` over a root
  file carrying a block
- **THEN** the file is byte-identical, the receipt lists it, and `cospec doctor`
  reports an `opsx-leftover` WARNING naming it

#### Scenario: An inline mention is not a block

- **WHEN** a root file mentions the start marker inside a sentence, and the end
  marker on a line of its own
- **THEN** removal changes nothing, as the pinned binary's does

#### Scenario: CRLF files keep their line endings

- **WHEN** a root file with `\r\n` line endings carries a block and removal runs
- **THEN** the remaining lines end in `\r\n`

### Requirement: The eight legacy filenames follow the pinned binary

The list of root-level filenames cospec sweeps SHALL equal the pinned OpenSpec's
exported `LEGACY_CONFIG_FILES`, in order, verified by a contract test that
imports the pinned module in tests only. A pin bump that changes the list SHALL
fail that test.

#### Scenario: The list matches the pinned dist

- **WHEN** the contract test compares cospec's list with the pinned
  `core/legacy-cleanup.js`
- **THEN** the two are equal, and the test fails if either gains or loses a name
