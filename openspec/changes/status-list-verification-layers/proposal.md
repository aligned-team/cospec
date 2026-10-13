# Proposal

## Why

`cospec validate`, `apply`, `sync-specs` and `archive` accept a verification row
tagged with a layer the project declares under `verification.layers` (fixed by
`verification-layers-config`, #68), but `cospec status` and `cospec list` still
reject it. Their archive-readiness verdict comes from `readVerificationVerdict`,
whose `extraLayers` argument defaults to `[]`, and neither caller passes the
project's declared layers. A `@uat` row therefore adds
`verification/layer-unknown` to `verification.blockedReasons`, and
`archiveReady` reads `false` in both commands while `validate --strict` passes
and `archive` moves the change. Automation that trusts `archiveReady` (added by
`status-archive-ready-gate`, #67) is wrong for every project that declares an
extra layer (reported as #83).

Reproduced on `main` @ 24c08e82 with the issue's script in a sandboxed HOME:
`validate my-fix --strict` exits 0, `status my-fix --json` reports
`archiveReady: false` with
`verification/layer-unknown (line 7): @uat is not a known layer`, `list --json`
reports `archiveReady: false`, text `status` prints `archive-ready: no`, and
`archive my-fix -y` exits 0.

## What Changes

1. `cospec status` (`computeStatus`, for one change and under `--all`) and
   `cospec list` (`computeRow`) pass the project's declared layers
   (`projectVerificationLayers(base)`, the reader `readValidateContext` uses) to
   `readVerificationVerdict`, so a declared layer is known to the verdict and
   `archiveReady` agrees with `validate`, `apply` and `archive`.
2. `readVerificationVerdict`'s `extraLayers` parameter becomes required (no `[]`
   default), so a future caller cannot silently omit the project's layers.
3. An undeclared layer still fails closed: with no declaration, the same row
   keeps `archiveReady` false with a `verification/layer-unknown` reason.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `verification-artifact`: the requirement "Project-declared layers are read
  from the config and checked by doctor" names the gates that honour a declared
  layer — `validate`, `apply`, `archive` and `sync-specs` — but not the
  archive-readiness verdict `status` and `list` report, which is what this bug
  broke. It now names that verdict too and gains a scenario pinning that the
  four commands agree on a declared-layer row.

## Impact

- `apps/cli/src/core/verification-verdict.ts`: `extraLayers` is required.
- `apps/cli/src/commands/status.ts` (`computeStatus`) and
  `apps/cli/src/commands/list.ts` (`computeRow`): pass
  `projectVerificationLayers(base)`.
- No flag, schema, exit-code or JSON-key change. For a project that declares
  layers, a change whose only blocker was a declared-layer row now reports
  `archiveReady: true` (text `archive-ready: yes`) with an empty
  `verification.blockedReasons`; nothing changes for a project that declares
  none.
- Docs: `apps/docs/concepts/verification.md` (owns the layer vocabulary and its
  extension) names `status`'s and `list`'s archive-readiness among the places a
  declared layer is accepted.

## Surfaces

- [x] interactive — `cospec status`'s and `cospec list`'s `archiveReady` (and
      `archive-ready:` text) change for a project that declares layers.
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
