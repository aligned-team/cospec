# Design

## Context

OpenSpec validates `rules:` keys in its instruction generator (function `XC` in
`apps/cli/src/vendor/openspec.bundle.js.tpl`, "Unknown artifact ID in rules"),
not in its config reader, and only warns on stderr. Doctor's wrapped call
(`checkOpenspecRelationship`) never generates instructions, so nothing reaches
`foldWrappedStderr`. `checkConfig` parses the YAML itself but only checks that
it parses and whether `schema:` is a cospec type.

## Goals / Non-Goals

**Goals:**

- Doctor flags a `rules:` key that matches no artifact id in any available
  schema, with the known ids and a closest-id hint.
- Custom or forked project schemas' artifact ids are never flagged.

**Non-Goals:**

- Surfacing the same warning from `cospec instructions --json` (the issue marks
  it out of scope).
- Flagging against user-global or package schemas outside the project: the
  built-in package schema's ids are a subset of the six built-in ids already.

## Decisions

- Implement in `checkConfig`, as the issue recommends: the check is cospec's own
  and sits beside the existing config checks, rather than scraping the binary
  (which cannot run it from doctor's call). `foldWrappedStderr` is kept.
- Known ids = `ARTIFACT_IDS` plus artifact ids from each
  `openspec/schemas/*/schema.yaml` (`artifacts[].id`), mirroring OpenSpec's "any
  available schema" wording. Rejected: `ARTIFACT_IDS` alone, which would
  false-positive on forked schemas.
- An unreadable or unparseable project schema is reported as one `WARNING`
  (`check: config`) and suppresses key flagging for that run, since the known-id
  set is incomplete; swallowing the failure or flagging against a partial set
  would both mislead.
- One finding per unknown key, `WARNING`, `check: config`, so the existing JSON
  shape and exit-code rule (warnings never fail doctor) are untouched.
- The closest-id hint uses Levenshtein distance (case-insensitive) with a
  threshold of 2, a small local helper; no dependency added.
- Docs ownership: the `rules` fact lives in
  `apps/docs/reference/configuration.md` (Tier 2); the `cospec doctor` row in
  `reference/commands.md` links to it rather than restating it.

## Risks / Trade-offs

- A user-global schema with its own artifact ids is not consulted, so a rule key
  for it would be flagged → the warning says rules for it are ignored by the
  project schemas only; acceptable since project config rules key
  project-resolvable schemas.
