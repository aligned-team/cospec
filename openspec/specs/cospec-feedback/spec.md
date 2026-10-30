# cospec-feedback Specification

## Purpose

cospec routes bug reports to whoever can act on them. `cospec feedback` files
natively against `aligned-team/cospec` through the user's own `gh` — array argv,
never a shell, no `--label` — with grapheme-aware title truncation and a
provenance footer naming the cospec version and the resolved wrapped-OpenSpec
source and version. An absent or unauthenticated `gh` is a supported path, not
an error: cospec prints the formatted issue plus a prefilled issue URL and
exits 0. `--upstream` is the one explicit escape, relaying the wrapped
`openspec feedback` to `Fission-AI/OpenSpec` with the destination named on
stderr and the child's exit code propagated verbatim.

## Requirements

### Requirement: Feedback files against cospec's own tracker by default

`cospec feedback "<message>" [--body <text>]` SHALL file at
`aligned-team/cospec`, not OpenSpec's tracker, titled `Feedback: <message>`
(whitespace collapsed, grapheme-safe cut at 72). The body SHALL use the
`.github/ISSUE_TEMPLATE/bug_report.yml` headings, carry `--body` as details, say
reproduction steps are missing, and end with an environment footer. Submission
SHALL use `gh issue create`, array argv, `shell: false`, no `--label`.

#### Scenario: Title truncation is grapheme-safe

- **WHEN** a feedback message longer than 72 graphemes, containing
  multi-code-unit characters, is formatted
- **THEN** the title is truncated at 72 graphemes with an ellipsis and no
  character is split

#### Scenario: The message reaches gh as argv, never as shell text

- **WHEN** a feedback message containing shell metacharacters is submitted
- **THEN** the `gh issue create` argv is an array containing the raw message and
  body as separate elements, no shell is invoked, and the argv names
  `aligned-team/cospec` and contains no `--label`

#### Scenario: The body records how OpenSpec resolved

- **WHEN** an issue body is generated
- **THEN** it names the cospec version, the wrapped OpenSpec resolution source
  (project or embedded) and version, the platform, and an ISO timestamp

#### Scenario: The body follows the bug form

- **WHEN** an issue body is generated without reproduction steps
- **THEN** its sections are the bug form's headings in order and the
  reproduction section says the steps are missing

#### Scenario: The footer names the environment

- **WHEN** an issue body is generated
- **THEN** its footer names the cospec version, the OpenSpec source and version,
  the platform, and an ISO timestamp

### Requirement: Missing or unauthenticated gh is a supported path, not a failure

`cospec feedback` SHALL gate submission on `gh` being on `PATH` and
`gh auth status` reporting a user. When either fails, it SHALL print the title
and body plus a link to
`https://github.com/aligned-team/cospec/issues/new?template=bug_report.yml` with
the form's message, version, and environment fields prefilled, and SHALL exit 0.
Any other `gh` failure SHALL relay gh's stderr, print the same block, and exit
with gh's status, or 1 when gh reports none.

#### Scenario: No gh on PATH still gives the user a way to file

- **WHEN** `cospec feedback "<message>"` runs with no `gh` on `PATH`
- **THEN** the formatted issue and a bug-form link with message, version, and
  environment prefilled are printed and the command exits 0

#### Scenario: A successful submission reports the issue URL

- **WHEN** `cospec feedback "<message>"` runs against an authenticated `gh`
- **THEN** the created issue URL reported by gh is printed and the command exits
  0

#### Scenario: JSON reports submission state in one document

- **WHEN** `cospec feedback "<message>" --json` runs
- **THEN** stdout is exactly one JSON document carrying `version`, `command`, a
  `submitted` boolean, a `url` that is a string or null, the `title`, and a
  `repo` of `aligned-team/cospec`

### Requirement: Upstream feedback is an explicit, version-asserted verbatim relay

`cospec feedback --upstream` SHALL relay the invocation to the wrapped
`openspec feedback`, which files at `Fission-AI/OpenSpec`, after one stderr note
naming that destination. The relay SHALL assert the wrapped binary's version,
spawn it piped, and relay stdout, stderr, and exit code verbatim. It SHALL
declare no `expect.exitCodes` allow-list — the documented exception, since
upstream propagates gh's arbitrary exit status.

#### Scenario: The destination is named before relaying

- **WHEN** `cospec feedback --upstream "<message>"` runs
- **THEN** a stderr note states that the issue is being filed at
  `Fission-AI/OpenSpec` rather than `aligned-team/cospec`, and the wrapped
  `openspec feedback` is invoked

#### Scenario: The child's exit code survives the relay

- **WHEN** the wrapped `openspec feedback` exits with a code the shared
  passthrough allow-list would reject
- **THEN** `cospec feedback --upstream` exits with exactly that code and relays
  the wrapped stdout and stderr unchanged

#### Scenario: The upstream relay needs no terminal

- **WHEN** `cospec feedback --upstream "<message>"` runs with no TTY attached
- **THEN** the wrapped `openspec feedback` is spawned piped, prompts for
  nothing, and its `gh auth status` check still runs
