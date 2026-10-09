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
- Re-implementing the binary's schema validation inside cospec: the listing the
  binary itself prints is the one source of truth.

## Decisions

- Implement in `checkConfig`, as the issue recommends: the check is cospec's own
  and sits beside the existing config checks, rather than scraping the binary
  (which cannot run it from doctor's call). `foldWrappedStderr` is kept.
- Known ids = the `artifacts` of every entry in the wrapped binary's own
  `schemas --json` listing (function `l5` in the vendored bundle, the set its
  `XC` rules check uses): project, user-global (`$XDG_DATA_HOME`) and package
  schemas, with invalid schemas dropped and shadowed ones hidden. Rejected:
  `ARTIFACT_IDS` alone (false-positives on forked and user-global schemas) and
  parsing `openspec/schemas/*` ourselves (misses user-global schemas and
  over-accepts ids from schemas the binary rejects or shadows).
- If the listing call fails or is malformed, doctor reports one `WARNING`
  (`check: config`) and flags no key, since the known-id set is unknown;
  swallowing the failure or flagging against a guess would both mislead.
- The extra `schemas --json` spawn happens only when `rules:` has keys.
- One finding per unknown key, `WARNING`, `check: config`, so the existing JSON
  shape and exit-code rule (warnings never fail doctor) are untouched.
- The closest-id hint uses Levenshtein distance (case-insensitive) with a
  threshold of 2, a small local helper; no dependency added.
- Docs ownership: the `rules` fact lives in
  `apps/docs/reference/configuration.md` (Tier 2); the `cospec doctor` row in
  `reference/commands.md` links to it rather than restating it.

## Risks / Trade-offs

- The check costs one extra wrapped call, only for configs that declare `rules:`
  keys; a failure of that call degrades to a single WARNING, never an error.
