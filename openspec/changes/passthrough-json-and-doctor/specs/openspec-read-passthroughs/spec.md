## MODIFIED Requirements

### Requirement: Context passthrough with code-workspace post-condition

`cospec context` SHALL wrap `openspec context`, threading `--store`/`--json`/
`--code-workspace <path>`/`--force`. When `--code-workspace <path>` is given and
the wrapped call exits 0, the command SHALL verify `<path>` exists on disk
before reporting success; without `--force`, an existing file at `<path>` SHALL
cause a refusal rather than a silent overwrite.

The wrapped call SHALL always run with `--json`, and cospec SHALL spell the
binary's reference block through cospec structurally: in the parsed document,
only `members[].fetch` (a whole command, its leading `openspec` token replaced)
and `members[].status[].fix` and `status[].fix` (each an allowlisted sentence of
the pinned binary) are rewritten, through the shared field-map helper; every
other byte — a path, an id, a message, a root label — is the binary's. A
`--json` caller SHALL receive that rewritten document, serialized as the binary
serializes it. A text caller SHALL receive cospec's rendering of the rewritten
document, laid out as the binary's human listing (`Working context for …`,
`OpenSpec root`, `Referenced stores` with `Fetch:` lines, the empty-set line,
`Not available on this machine` with `Fix:` and `Note:` lines); the listing
SHALL never be produced by rewriting the binary's text. With `--code-workspace`
in text mode the listing SHALL come from a read-only call made before the write,
so it prints ahead of the write's summary or refusal as the binary orders them.
A failed call SHALL be relayed through the allowlist, a text caller getting the
binary's `Error:`/`Fix:` lines on stderr.

#### Scenario: JSON brief lists working-set members

- **WHEN** `cospec context --json` runs in a store-backed repo
- **THEN** stdout is exactly one JSON document containing a `members` array

#### Scenario: Code-workspace file is verified on disk

- **WHEN** `cospec context --code-workspace <path>` succeeds
- **THEN** `<path>` exists on disk after the command returns

#### Scenario: Existing code-workspace file is protected

- **WHEN** `cospec context --code-workspace <path>` runs and `<path>` already
  exists, without `--force`
- **THEN** the command refuses to overwrite `<path>` and exits non-zero

#### Scenario: The reference block names cospec

- **WHEN** `cospec context` runs, text and `--json`, on a root that references a
  usable store, a registered store whose checkout is empty, and an unregistered
  id
- **THEN** the `Fetch:` line and `fetch` field read
  `cospec show <spec-id> --type spec --store <id>`, the two fixes read
  `Run: cospec store doctor <id>` and
  `Get a checkout from a teammate and run: cospec store register <path> --id <id>`,
  and every other line and field equals the binary's answer for the same root

#### Scenario: User content that reads like a remedy is untouched

- **WHEN** a referenced store id, a root path or a member path holds text shaped
  like `openspec show …` or `Run: openspec store doctor`
- **THEN** that id or path is printed as the binary printed it, text and
  `--json`

### Requirement: Workset group passthrough with a terminal-handover exec

`cospec workset create|list|remove` SHALL wrap the corresponding
`openspec workset` subcommand, preserving `--member`/`--tool`/`--yes`/`--json`
and the JSON one-document failure mirror. A missing, unknown or option-shaped
subcommand, a subcommand after a `--`, and every failed answer SHALL be the
binary's own, delegated with the user's argv (the `--` kept) and `--json`
threaded when the caller asked for it, and relayed with the binary's sentences
spelled through cospec — one `unknown_workset_subcommand` document under
`--json`. A successful `workset create` or `workset list` SHALL be relayed as
the binary wrote it except the whole lines the binary prints as its next step
(`Open it any time with: …`, `No worksets saved. Create one with: …`), each
spelled through cospec.

`cospec workset open` SHALL be a terminal-handover exec, the founding member of
cospec's **terminal-handover class**: a wrapped call whose child owns the
terminal because it spawns an editor or drives an interactive prompt. Every
member of that class SHALL version-assert the wrapped binary first, spawn it
with inherited stdio and `shell: false` (array argv, no shell interpolation),
propagate the child process's exit code unchanged — including `130`, which the
wrapped binary sets when a prompt is cancelled — emit no JSON of its own, and
declare no `RunExpectation`, which is the documented exception to wrapped-call
discipline because inherited stdio leaves no captured stdout for a deny-list to
inspect. `cospec workset open` SHALL NOT thread `--json` or `--no-color`, and
SHALL spawn with `OPENSPEC_TELEMETRY=0` and `OPENSPEC_NO_COMPLETIONS=1`. The
class's other members are the interactive `cospec config` subcommands, whose
obligations are specified by the config passthrough capability.

Before handing the terminal over, every member of the class SHALL pre-validate:
its argv is parsed against the command table, and a refusal commander would
raise is answered on cospec's own streams exactly as the binary answers it;
under `--json` the call is never handed over (`workset open` relays the binary's
`workset_open_json_unsupported` document from a piped call); when the child
could not be interactive by the binary's own test (for `workset open`, no TTY on
stdin, `CI` set, or `OPEN_SPEC_INTERACTIVE=0`) the call runs piped and its
answer is relayed through the allowlist; and `workset open` reads the saved
worksets with a read-only `workset list --json` and, for a name that is not
saved or a workset none of whose member folders exists, answers through the
piped call, which the binary refuses before launching anything. A `--cwd` that
is not a directory SHALL be answered with the resolver's `directory not found`
refusal before anything is spawned.

#### Scenario: Create then list shows the workset

- **WHEN** `cospec workset create <name>` succeeds and is followed by
  `cospec workset list --json`
- **THEN** the JSON list includes an entry for `<name>`

#### Scenario: Remove without confirmation is refused

- **WHEN** `cospec workset remove <name>` runs non-interactively without `--yes`
- **THEN** the command refuses and exits non-zero without deleting the workset

#### Scenario: Open propagates the child's exit code

- **WHEN** `cospec workset open <name>` is invoked on an interactive terminal
  for a saved workset
- **THEN** the command spawns `openspec workset open <name>` with inherited
  stdio and exits with exactly the child process's exit code

#### Scenario: A handover call declares no run expectation

- **WHEN** any terminal-handover member hands the terminal over
- **THEN** it asserts the wrapped binary's version, spawns with inherited stdio
  and `shell: false`, declares no `RunExpectation`, and emits no JSON document
  of its own

#### Scenario: A missing or unknown workset subcommand is one document

- **WHEN** `cospec workset --json`, `cospec workset bogus --json` or
  `cospec workset -- --bogus --json` runs
- **THEN** stdout is exactly one JSON document whose `status[0].code` is
  `unknown_workset_subcommand` and whose message names `cospec workset`, exit 1,
  as the binary answers the same argv
- **AND WHEN** the same argv runs without `--json`
- **THEN** stderr is the binary's `Error: …` line with `cospec workset` in place
  of `openspec workset`, exit 1

#### Scenario: Open refuses JSON without opening anything

- **WHEN** `cospec workset open <name> --json` runs
- **THEN** stdout is exactly one document whose `status[0].code` is
  `workset_open_json_unsupported` and whose fix reads
  `Inspect worksets with: cospec workset list --json`, exit 1, and no tool is
  launched

#### Scenario: A non-interactive or unsaved open is answered piped

- **WHEN** `cospec workset open <name>` runs with no TTY on stdin, or names a
  workset that is not saved
- **THEN** the binary's refusal is printed with its remedy spelled
  `cospec workset …`, its exit code propagated, and no
  `Tip: Run 'openspec completion install'` line is printed
- **AND WHEN** the saved workset names an installed workspace-file tool and
  stdin has no TTY
- **THEN** the piped call opens it as the binary does and cospec exits 0

#### Scenario: A next-step line names cospec

- **WHEN** `cospec workset create <name> --member <path>` succeeds, and
  `cospec workset list` runs with no workset saved
- **THEN** the lines read `Open it any time with: cospec workset open <name>`
  and `No worksets saved. Create one with: cospec workset create`, and every
  other line is the binary's
