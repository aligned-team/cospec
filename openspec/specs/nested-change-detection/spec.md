# nested-change-detection Specification

## Purpose

Defines how cospec recognizes a namespace folder under `openspec/changes/` — a
directory that wraps one or more real changes rather than being one itself — the
same way the wrapped OpenSpec binary does, so `list`, `status` and `validate`
(and, through `validateChange`, `apply` and `archive`) report it as a namespace
folder instead of treating it as an empty or malformed change. Detection reads
only what the binary reads (change-root markers, `specs/` contents, existing
artifact outputs, the directory's own files, and a bounded search of its
subdirectories) and degrades an unreadable directory to "holds nothing" so the
detector itself never fails the command around it.

## Requirements

### Requirement: A namespace folder is detected as the binary detects it

cospec SHALL decide whether a directory directly under `openspec/changes/` is a
namespace folder by the wrapped binary's rule. The directory SHALL be a
namespace folder only when all of these hold: it looks like no change itself (no
change-root marker file `.openspec.yaml`, `proposal.md`, `tasks.md` or
`design.md`; no file anywhere under its `specs/` directory, dot-entries skipped;
and no existing output of any artifact of the schema the directory resolves to);
it holds no file of its own other than dot-entries; and at least one
subdirectory, searched to at most three levels below it, looks like a change.
The search SHALL not descend into a subdirectory that looks like a change, and
SHALL skip dot-directories. A directory named `archive`, or one whose name
starts with a dot, SHALL never be a namespace folder. A directory that cannot be
read SHALL count as holding nothing, so the detector never fails the command
around it. The nested ids SHALL be reported sorted, as
`<folder>/<child>[/<grandchild>…]`.

#### Scenario: A folder wrapping a change is a namespace folder

- **WHEN** `openspec/changes/mobile/` holds only `refresh-token/` with a
  `.openspec.yaml`
- **THEN** `mobile` is a namespace folder wrapping `mobile/refresh-token`

#### Scenario: A change with a root marker is never a namespace folder

- **WHEN** `openspec/changes/alpha/` holds `proposal.md` and a subdirectory that
  itself holds a `.openspec.yaml`
- **THEN** `alpha` is reported as a change, not a namespace folder

#### Scenario: A file of its own keeps a directory a change

- **WHEN** a directory holds a `README.md` and a subdirectory that looks like a
  change
- **THEN** it is not a namespace folder

#### Scenario: Nesting deeper than three levels is not searched

- **WHEN** the only change-looking directory sits four levels below the folder
- **THEN** the folder is not a namespace folder

#### Scenario: The detector agrees with the binary

- **WHEN** the contract suite lists a fixture covering each signal (root marker,
  a delta file only under `specs/`, a schema output only, a file of its own,
  depths one to four, a dot-directory, `archive`) with `cospec list --json` and
  `openspec list --json`
- **THEN** every row's `nested` value is the same in both documents

### Requirement: Status, list and validate report a namespace folder as one

A namespace folder SHALL be reported with the binary's explanation, verbatim:
`"<name>" is not a change: it is a folder wrapping openspec/changes/<id>/, … . … Rename each nested change to a flat name (for example "<flattened id>").`

- `cospec status --change <folder>` SHALL refuse it, on stderr in text mode and
  as a `{status: [{severity: "error", code: "change_error", message}]}` document
  under `--json`, and exit 1.
- `cospec status --all` SHALL report the folder as a failure entry carrying the
  explanation, keep every other change's entry, and exit 1.
- `cospec list` SHALL keep the folder's row, show `not a change` in place of its
  task count, set the row's `state` to `not-a-change` and `nested` to the nested
  ids, print `Warning: <explanation>` after the table, and add a `warnings`
  entry `{code: "nested_change_directory", name, nested, message}` under
  `--json`.
- `cospec validate` SHALL report the folder, singly or in a bulk scope, as
  exactly one `meta/nested-change` ERROR carrying the explanation, run no other
  rule on it and delegate nothing for it.

`cospec archive` is not covered by this requirement.

#### Scenario: Status refuses a namespace folder

- **WHEN** `cospec status --change mobile --json` runs on a namespace folder
- **THEN** stdout is one document whose `status[0]` has code `change_error` and
  the binary's explanation, and the command exits 1

#### Scenario: The sweep carries the folder as a failure

- **WHEN** `cospec status --all --json` runs in a root with a namespace folder
  and two changes
- **THEN** both changes have full entries, the folder's entry carries the
  explanation, and the command exits 1

#### Scenario: List marks the folder

- **WHEN** `cospec list` runs in that root
- **THEN** the folder's row reads `not a change` and the binary's warning
  follows the table

#### Scenario: Validate reports only the nesting

- **WHEN** `cospec validate mobile --json` runs
- **THEN** the item carries exactly one issue, `meta/nested-change` at ERROR,
  and no `meta/openspec-yaml` issue
