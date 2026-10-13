# Design

## Context

`verification-layers-config` (#68) fixed the gates by filling
`ValidateContext.verificationLayers` in `readValidateContext`, the one producer
every gate that validates a change goes through. `status` and `list` do not
validate through that context: their archive-readiness verdict is
`readVerificationVerdict` (`core/verification-verdict.ts`), which runs the same
`verificationRules` archive's validation runs, but takes the project's layers as
a fourth argument defaulting to `[]`. `computeStatus` (`commands/status.ts`) and
`computeRow` (`commands/list.ts`) are its only callers, and neither passes it,
so the verdict rejects every declared layer with `verification/layer-unknown`.

## Goals / Non-Goals

**Goals:**

- `status`'s and `list`'s `archiveReady` and `verification.blockedReasons` agree
  with `validate`, `apply` and `archive` for a row naming a declared layer.
- No caller of `readVerificationVerdict`, `verificationRules` or `isKnownLayer`,
  and no `ValidateContext`, can omit the project's layers again without the
  typechecker refusing it.

**Non-Goals:**

- Changing how `verification.layers` is read or validated (the lenient reader
  and doctor's warning stay as `verification-layers-config` left them).
- Any other difference between the verdict and archive's gates (the verdict
  still does not model `archive/scenario-preservation` or non-ledger validation
  errors, as the `cospec status` docs row states).

## Decisions

1. **Read the layers through the same reader as the gates.** Both callers pass
   `projectVerificationLayers(base)` — the function `readValidateContext` calls
   — so the verdict and the gates can never disagree on what a declared layer
   is, including on a malformed declaration, which both read as no extra layers.
2. **Read once per invocation, as `archived` is.** `list` reads the layers once
   beside `readArchive` and passes them through `nativeRow` to `computeRow`;
   `status --all` reads them once and passes them through `buildChangeEntry` to
   `computeStatus`, which, like its `archived`, reads them from `base` itself
   when a caller (one change, a test) does not pass them. That default reads the
   config, never `[]`, so an omission there is still correct.
3. **No "omitted means none" default anywhere in the chain.** The bug was an
   omitted list silently read as `[]`, and #68 was the same omission one level
   down (a `ValidateContext` with no `verificationLayers`). So
   `readVerificationVerdict`'s `extraLayers`, `VerificationRuleOptions`'
   `extraLayers`, `isKnownLayer`'s second parameter and
   `ValidateContext.verificationLayers` are all required: an omission is a type
   error, and a caller that means "no project layers" says `[]`.

## Where the fact is owned in docs

`apps/docs/concepts/verification.md` ("Extending the layer vocabulary") owns
where a declared layer is accepted; its list of commands gains `status`'s and
`list`'s archive-readiness. The `cospec status`/`cospec list` rows of
`reference/commands.md` already describe `archiveReady` as false on "an unknown
layer", which a declared layer no longer is, so they stay as written.

## Operational surface

Nothing changes in how cospec deploys or runs. `status` and `list` read the same
local `openspec/config.yaml` key the gates already read; there is no bind
address, container, network call or secret. The `bun run` entry, the npm package
and the standalone compiled binaries behave the same, and the wrapped OpenSpec
binary (pinned 1.13.1, accepted `>=1.0.0 <2.0.0`) is not involved.

## Risks / Trade-offs

- The change only widens what the verdict accepts, and only for a project that
  declares layers; a change that read archive-ready before still does.
