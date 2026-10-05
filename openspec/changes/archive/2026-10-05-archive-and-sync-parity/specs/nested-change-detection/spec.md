# Spec Delta

## MODIFIED Requirements

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

`cospec archive` and `cospec sync-specs` are covered by "Archive refuses a
namespace folder as the binary does".

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

## ADDED Requirements

### Requirement: Archive refuses a namespace folder as the binary does

`cospec archive <folder>` SHALL refuse a namespace folder before revalidation or
any gate runs, using the shared detector, with the binary's message
`Cannot archive '<name>': <explanation>` and its fix
`Rename openspec/changes/<first nested id>/ to a flat change directory, then archive it.`,
on stderr in text mode and as one failure document with code
`archive_change_is_namespace_folder` under `--json`, and exit 1.
`cospec sync-specs <folder>` SHALL refuse it the same way, with `sync` in place
of `archive` in both sentences. Nothing SHALL be moved, written or delegated.

#### Scenario: Archive refuses the folder with the binary's answer

- **WHEN** `cospec archive mobile --json` and
  `openspec archive mobile -y --json` run on a folder wrapping `mobile/refresh/`
- **THEN** both print one document whose `status[0]` has code
  `archive_change_is_namespace_folder` with equal `message` and `fix`, both exit
  1, and `openspec/changes/mobile/` is unchanged
