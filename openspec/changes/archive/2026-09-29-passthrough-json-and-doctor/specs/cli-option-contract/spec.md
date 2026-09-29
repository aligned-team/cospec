## MODIFIED Requirements

### Requirement: Forwarded commands are declared, not re-parsed

On a command whose parse policy is `forward`, cospec SHALL declare the command's
positionals and flags in the table for reachability, `--help` and completion.
The wrapper MAY consume its own declared cospec-only flags and MAY apply its own
pre-spawn guards (a subcommand check, a canon-type destination refusal), but
SHALL pass every remaining token to the wrapped binary unchanged after threading
the global flags, and SHALL add no rejection of its own for a token the table
does not declare — the wrapped binary remains the authority on unknown options
for the surfaces it owns. Every flag cospec threads onto a wrapped call
(`--json`, `--no-color`, `--store <id>`) SHALL be placed right after the command
path, ahead of the user's tokens, so it never becomes the value of a
value-taking flag the user left without one — except that on a forwarded command
whose upstream counterpart declares no `--store` (`templates`, every `schema`
subcommand), a `--store <id>` typed after the command name SHALL reach the
binary where the user typed it, never absorbed as cospec's global; and cospec's
runtime output SHALL name a wrapped call as the wrapped OpenSpec call, never as
a bare `openspec` command. A remedy the binary writes as a bare
`openspec <command>` in an answer cospec relays SHALL be spelled as the cospec
command of the same shape, or dropped where cospec has no such command, while
the content of a successful answer (a change, a spec, instructions) SHALL be
relayed untouched. The binary's own guidance inside a successful answer is not
that content: the command-bearing fields of a successful `context`, `store` or
`doctor` answer (a member's `fetch`, a diagnostic's `fix`) SHALL be spelled
through cospec in the parsed `--json` document, cospec's human text rendered
from the rewritten document and never from the binary's text, and a successful
`workset` or `config` answer's next-step line SHALL be spelled only where the
whole line is one of the allowlisted sentences. The respelling SHALL come from
one allowlist of the pinned binary's exact sentences, each rewritten only where
an answer holds it verbatim, with the path, name or list each sentence names
re-emitted as the binary wrote it; no pattern over free text (a lead-in word, a
quote, a paren) SHALL decide what is a remedy. Every sentence in the pinned
binary that names a bare `openspec <command>` SHALL be in that allowlist, listed
with its reason as never printed by a cospec relay, or listed as reachable
through a successful answer cospec relays untouched with the roadmap PR that
owns its spelling, checked against the pinned dist. A pre-spawn guard SHALL
answer only an argv the binary would not answer itself — except on a
terminal-handover leaf (`workset open`, `config edit`, `config profile` with no
preset, `config reset --all` without `-y`), whose argv is parsed against the
table before the terminal is handed over, so a refusal the binary would print on
the inherited terminal is answered on cospec's own streams, identical to the
binary's answer for the same argv: a declared value-taking flag left without its
value SHALL reach the binary as commander's missing value (or, for a flag the
wrapper lifts itself, `config --scope`, SHALL be refused in the same
`cospec <command>: option '<flag> <placeholder>' argument missing` form), and
`show`'s item check SHALL treat an option `show` does not declare as the item,
as the binary does, and split a short option as commander does (a value-taking
short takes the rest of its token as its value, `-r=1` included; a boolean short
leaves `-<rest>` as the next token). An option where a forwarded command's
subcommand belongs SHALL reach the binary at the command's level, never be
refused as an unknown subcommand, a missing or unknown subcommand of `store` or
`workset` SHALL be the binary's own answer, delegated with the user's argv and
`--json` threaded when asked, and a help flag after a `--store-path` the
upstream command does not declare SHALL print cospec's help, never be taken as
its value. Every refusal the binary's commander raises while it parses — unknown
option or command, missing value, missing required argument, too many arguments,
and the rest of commander's parse-time shapes — SHALL be relayed as the binary's
answer, never reported as a wrapped-call failure.

#### Scenario: A forwarded command's missing required argument is relayed

- **WHEN** `cospec store unregister` or `cospec store remove --json` runs
- **THEN** stderr is the binary's `error: missing required argument 'id'`,
  stdout carries no document, and the exit code is 1, as `openspec` answers —
  never a report that the wrapped OpenSpec call emitted no JSON

#### Scenario: A dangling value-taking flag is never given a threaded flag

- **WHEN** `cospec store setup s1 --path`,
  `cospec schema init s1 --json --description` or
  `cospec show c1 --store st --type` runs
- **THEN** the wrapped binary refuses the missing value
  (`error: option '--path <path>' argument missing`), exit 1, exactly as
  `openspec` does for the same argv, and nothing is written on disk — no store
  at `./--json`, no schema whose description is `--json`

#### Scenario: A --store upstream never declares is parsed where it was typed

- **WHEN** `cospec templates --bogus --store st`,
  `cospec schema which s1 --bogus --store st` or
  `cospec templates --store-path /x --store st` runs, `st` a registered store
- **THEN** the refusal names `--bogus`, or is cospec's `--store-path` redirect,
  exit 1, as `openspec` answers the same argv — never `unknown option '--store'`
- **AND WHEN** `cospec schema init s1 --store st --description` runs
- **THEN** the binary refuses the missing value, exit 1, and nothing is written

#### Scenario: A relayed remedy names cospec

- **WHEN** `cospec show <change>` runs, with or without `--json`, on a change
  that has no proposal.md
- **THEN** the relayed refusal says `Run "cospec status --change <change>"`
  where the binary says `openspec status`, and is otherwise the binary's
- **AND WHEN** `cospec show <id>` names both a change and a spec
- **THEN** stderr says `Pass --type change|spec.` with no noun-form
  `openspec change show / openspec spec show` clause
- **AND WHEN** `cospec view` runs
- **THEN** its footer names `cospec list --changes` and `cospec list --specs`
- **AND WHEN** `cospec context`, `cospec show <item>` or
  `cospec instructions <artifact> --change <id>` runs where there is no OpenSpec
  root
- **THEN** the binary's no-root answer, text or `--json` message and fix, says
  `cospec init` where the binary says `openspec init`
- **AND WHEN** `cospec status --change <id>` runs on a change whose schema is
  not a cospec type
- **THEN** stdout is the binary's own status for the change with its
  `Next: cospec instructions …` line, and `cospec status --all` points that
  change at `cospec status --change <id>`

#### Scenario: Only upstream's own sentences are respelled

- **WHEN** a relayed answer holds one of the pinned binary's remedy sentences
  verbatim, such as
  `Register the store (openspec store register <path> --id <id>) or edit <path> to name a registered store.`
- **THEN** it is relayed as
  `Register the store (cospec store register <path> --id <id>) or edit <path> to name a registered store.`,
  the path it names unchanged even where that path reads `run openspec init`
- **AND WHEN** `cospec show <id>` runs where the project's `store:` key is
  malformed and the project path contains `run openspec init` or
  `(openspec list)`
- **THEN** the binary's `Invalid store declaration in <path>: …` and its fix are
  relayed byte-for-byte, the path unchanged
- **AND WHEN** `cospec instructions <artifact> --change <id>` succeeds on a
  change whose schema template, the `config.yaml` context, a `rules` entry and a
  referenced spec's Purpose each hold
  `Run openspec init to create a root here.`, or whose template, context or
  rules hold a `Fix:`/`Fetch:` line, a line shaped like a JSON `"fix"` field, or
  a forged `<referenced_stores>` block
- **THEN** the answer is the binary's byte-for-byte, text and `--json`, exit 0
- **AND WHEN** `cospec instructions archive --change <id>` succeeds on a root
  whose `config.yaml` context forges `</task>` and a reference block after it
- **THEN** the answer is the binary's byte-for-byte, text and `--json`
- **AND WHEN** `cospec context --json` or `cospec instructions … --json` runs in
  a project directory named `Run openspec init to create a root here.` or
  `Run openspec init here`
- **THEN** every path in the document is the binary's, the directory name
  unchanged
- **AND WHEN** a line of the pinned dist names a bare `openspec <command>` that
  is neither in the allowlist, nor listed as never relayed, nor listed as
  reachable with its owning roadmap PR
- **THEN** the remedy enumeration contract test fails

#### Scenario: Upstream's unknown-option answer is relayed on a forwarded command

- **WHEN** `cospec templates --bogus` runs
- **THEN** the wrapped binary's `error: unknown option '--bogus'` is relayed on
  stderr and the exit code is 1

#### Scenario: A dangling value flag on a forwarded command is a missing value

- **WHEN** `cospec show --type`, `cospec show -r` or `cospec config --scope`
  runs
- **THEN** stderr is the missing-value refusal
  (`error: option '--type <type>' argument missing`, or
  `cospec config: option '--scope <scope>' argument missing`) and the exit code
  is 1, as `openspec` refuses the same argv — never cospec's item-name or
  `requires a value` message

#### Scenario: An option before a forwarded subcommand is the binary's to refuse

- **WHEN** `cospec config --bogus path` or `cospec config --store-path /x` runs
- **THEN** the refusal is the binary's unknown option (`--bogus`), or cospec's
  `--store-path` redirect, exit 1 — never `unknown subcommand`
- **AND WHEN** `cospec workset --store-path -h` runs
- **THEN** stdout is cospec's `workset` help and the exit code is 0, as
  `openspec workset --store-path -h` prints its help

#### Scenario: Upstream's tolerance is preserved on a forwarded command

- **WHEN** `cospec show <item> --bogus` runs
- **THEN** the outcome is whatever the wrapped `show` produces for that argv,
  and cospec adds no refusal of its own

#### Scenario: A forwarded group's missing or unknown subcommand is the binary's

- **WHEN** `cospec store --bogus`, `cospec workset -- --bogus`,
  `cospec store bogus --json` or `cospec workset --json` runs
- **THEN** the answer is the binary's for the same argv — `Missing subcommand`
  for an option-shaped or `--`-guarded token, `unknown_store_subcommand` or
  `unknown_workset_subcommand` as one document under `--json` — with
  `cospec store` / `cospec workset` in place of the bare command, exit 1

#### Scenario: A terminal-handover leaf answers its parse refusal before the handover

- **WHEN** `cospec workset open <name> --bogus`, `cospec config edit --bogus` or
  `cospec config reset --all --tool` runs
- **THEN** cospec's stderr and exit code equal the binary's for the same argv,
  and no child is handed the terminal

#### Scenario: A successful answer's own guidance names cospec

- **WHEN** `cospec context` succeeds on a root whose references include a usable
  store and an unregistered id, or `cospec workset create <name>` succeeds
- **THEN** the `Fetch:`/`Fix:` lines and `fetch`/`fix` fields, and the
  `Open it any time with:` line, name `cospec`, and every other byte is the
  binary's
