## Why

A Copilot PR review flagged that `apps/docs/concepts/verification.md`
misdescribes the `archive/verification-incomplete` gate as scoped to
`[critical]` groups only, and conflates it with `archive/scenario-preservation`
as if both read the verification ledger. Neither matches the source
(`apps/cli/src/core/verification.ts`, `apps/cli/src/commands/archive.ts`):
`verification-incomplete` blocks on **any** unresolved `[ ]` row regardless of
criticality, and `scenario-preservation` is an unrelated spec-delta
scenario-thinning check that never reads `verification.md`.

## What Changes

- `apps/docs/concepts/verification.md` — rewrite the "How archive gates on it"
  section to state the true `archive/verification-incomplete` scope (every row,
  not just `[critical]` groups) and to correctly describe
  `archive/scenario-preservation` as a separate, spec-delta-only gate that does
  not consult this ledger. Point readers to `/concepts/apply-and-archive` as the
  canonical owner of both gates' full mechanics.

## Impact

- Readers of the verification docs page, who would otherwise believe
  non-critical unresolved rows don't block archive, and that scenario
  preservation is a verification-ledger check.
- No other doc page echoed the error — `apply-and-archive.md`,
  `reference/validation-rules.md`, `guide/workflow.md`, and
  `concepts/how-it-relates-to-openspec.md` already describe both gates
  correctly, so only `verification.md` needs a fix.
