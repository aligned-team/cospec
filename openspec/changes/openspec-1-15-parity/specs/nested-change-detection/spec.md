# Spec Delta

## MODIFIED Requirements

### Requirement: A namespace folder is detected as the binary detects it

cospec SHALL apply the wrapped binary's rule: a directory under
`openspec/changes/` is a namespace folder only when it looks like no change, has
no file of its own besides dot-entries, and a subdirectory at most three levels
down looks like a change (the search skipping dot-directories and not entering a
change). `archive` and dot-named directories never are; an unreadable one holds
nothing. Nested ids SHALL be reported sorted, as
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

#### Scenario: What looking like a change means

- **WHEN** a directory holds a root marker (`.openspec.yaml`, `proposal.md`,
  `tasks.md` or `design.md`), any file under its `specs/` (dot-entries skipped),
  or an existing output of any artifact of the schema it resolves to
- **THEN** it looks like a change and is never a namespace folder

#### Scenario: Archive and dot directories are never namespace folders

- **WHEN** `openspec/changes/archive/` or a directory whose name starts with a
  dot wraps a change
- **THEN** neither is reported as a namespace folder

#### Scenario: An unreadable directory does not fail the command

- **WHEN** a directory under `openspec/changes/` cannot be read
- **THEN** the detector treats it as holding nothing and the command proceeds

### Requirement: Status, list and validate report a namespace folder as one

A namespace folder SHALL be reported with the binary's explanation, verbatim:
`"<name>" is not a change: it is a folder wrapping openspec/changes/<id>/, … . … Rename each nested change to a flat name (for example "<flattened id>").`
`cospec status`, `cospec list`, and `cospec validate` SHALL each report it as
their own scenarios below describe; `cospec archive` and `cospec sync-specs` are
covered by "Archive refuses a namespace folder as the binary does".

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

#### Scenario: Status shapes for a namespace folder

- **WHEN** `cospec status --change <folder>` runs, with and without `--json`
- **THEN** it refuses on stderr in text mode and as a
  `{status: [{severity: "error", code: "change_error", message}]}` document
  under `--json`, and exits 1

#### Scenario: The status sweep keeps every other change

- **WHEN** `cospec status --all` meets a namespace folder
- **THEN** the folder is a failure entry carrying the explanation, every other
  change keeps its entry, and the command exits 1

#### Scenario: List row and warning shapes

- **WHEN** `cospec list` meets a namespace folder
- **THEN** the folder keeps its row with `not a change` in place of its task
  count, `state` `not-a-change` and `nested` the nested ids,
  `Warning: <explanation>` is printed after the table, and under `--json` a
  `warnings` entry `{code: "nested_change_directory", name, nested, message}` is
  added

#### Scenario: Validate reports the folder alone in any scope

- **WHEN** `cospec validate` covers a namespace folder singly or in bulk
- **THEN** it reports exactly one `meta/nested-change` ERROR carrying the
  explanation, runs no other rule on it, and delegates nothing for it

### Requirement: Archive refuses a namespace folder as the binary does

`cospec archive <folder>` SHALL refuse a namespace folder, via the shared
detector and before revalidation or any gate, with the binary's message
`Cannot archive '<name>': <explanation>` and fix
`Rename openspec/changes/<first nested id>/ to a flat change directory, then archive it.`,
on stderr (`--json`: one `archive_change_is_namespace_folder` failure document),
exit 1, and move, write or delegate nothing.

#### Scenario: Archive refuses the folder with the binary's answer

- **WHEN** `cospec archive mobile --json` and
  `openspec archive mobile -y --json` run on a folder wrapping `mobile/refresh/`
- **THEN** both print one document whose `status[0]` has code
  `archive_change_is_namespace_folder` with equal `message` and `fix`, both exit
  1, and `openspec/changes/mobile/` is unchanged

#### Scenario: Sync-specs refuses the folder alike

- **WHEN** `cospec sync-specs <folder>` names a namespace folder
- **THEN** it refuses exactly as archive does, with `sync` in place of `archive`
  in both sentences, and moves, writes or delegates nothing
