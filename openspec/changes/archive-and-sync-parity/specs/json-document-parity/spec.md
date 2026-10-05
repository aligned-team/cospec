# Spec Delta

## ADDED Requirements

### Requirement: Archive's JSON documents carry the binary's keys

`cospec archive <change> --json` SHALL add the binary's keys to its success
document without changing any cospec key:
`archive: {change, archivedAs, path, specsUpdated, totals?, warnings?}` and
`root: {path, source, store_id?}`. `archivedAs` SHALL be the archive directory
verified on disk. `path` SHALL be its canonical absolute path. `specsUpdated`
and `totals` SHALL be the values the wrapped archive reported applying, read
from its own `Totals:` line and its `Specs updated successfully.` or
`Specs already in sync; no files changed.` line. `totals` SHALL be absent when
no spec sync ran, and `warnings` SHALL be absent when the binary reported none.
A key oracle row SHALL compare the document with the binary's own
`archive <change> -y --json` on a copy of the same fixture.

#### Scenario: The success document matches the binary's keys

- **WHEN** `cospec archive c1 --json` archives a MODIFIED change, and
  `openspec archive c1 -y --json` archives a copy
- **THEN** cospec's `archive` and `root` equal the binary's, apart from the
  copy's own path, and every cospec key keeps its native value

### Requirement: Every archive refusal under --json is one document

Under `--json` every refusal of `cospec archive` SHALL be exactly one document
on stdout, with exit 1: `archive: null`, `root` (absent when no root resolved,
as in the binary), `status: [{severity: "error", code, message, fix?}]`, and
cospec's `change`, `type`, `archived: false` and `reason`. `code` and `message`
SHALL be the binary's for every refusal the binary makes on the same input:

| Refusal                           | `code`                               |
| --------------------------------- | ------------------------------------ |
| unknown change                    | `archive_change_not_found`           |
| invalid change name               | `archive_change_name_invalid`        |
| namespace folder                  | `archive_change_is_namespace_folder` |
| revalidation failed               | `archive_validation_failed`          |
| incomplete tasks                  | `archive_tasks_incomplete`           |
| archive slot taken                | `archive_target_exists`              |
| scenario preservation             | `archive_spec_update_failed`         |
| unreadable archive directory      | the binary's code on that runtime    |
| a delegated failure cospec relays | `archive_error`                      |

For scenario preservation the `message` SHALL be the binary's sentence for the
first dropped requirement its merge would abort on. For a delegated failure it
SHALL be the wrapped archive's own last reason line, respelled.
`archive/verification-incomplete` has no upstream counterpart and SHALL carry
the code `archive_verification_incomplete`. `fix` SHALL be cospec's spelling of
the remedy cospec accepts (`--force-incomplete` for the tasks gate, where the
binary names `--yes`). The revalidation refusal SHALL keep the keys of the
report it carried before. A root-selection failure SHALL answer through the
shared resolver document with archive's payload `{archive: null}`.

#### Scenario: A gate refusal prints a document

- **WHEN** `cospec archive c1 --json` runs on a change with an incomplete task
- **THEN** stdout is one document with `archive: null`, `root`, and
  `status[0].code` `archive_tasks_incomplete` with the binary's message, and the
  exit code is 1

#### Scenario: An unreadable archive directory is one document

- **WHEN** `openspec/changes/archive/` is mode 000 and
  `cospec archive c1 --json` runs
- **THEN** stdout is one document whose `status[0].code` equals the binary's on
  the same runtime (`archive_path_outside_root` under Bun on macOS,
  `archive_error` naming the archive path under Bun on Linux), compared by code
  and path, and the exit code is 1
