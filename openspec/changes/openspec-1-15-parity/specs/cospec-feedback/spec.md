# Spec Delta

## MODIFIED Requirements

### Requirement: Feedback files against cospec's own tracker by default

`cospec feedback "<message>" [--body <text>]` SHALL file against
`aligned-team/cospec`, never OpenSpec's tracker, titled `Feedback: <message>`
(whitespace collapsed, grapheme-safe truncation at 72). The body SHALL use the
headings of `.github/ISSUE_TEMPLATE/bug_report.yml`, carrying `--body` as
details and stating that reproduction steps are missing, plus a footer naming
cospec version, OpenSpec source and version, platform, and ISO timestamp.
Submission SHALL use `gh issue create` with array argv, `shell: false`, and no
`--label`.

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
