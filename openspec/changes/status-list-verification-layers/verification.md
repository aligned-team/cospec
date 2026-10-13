# Verification

## 1. status and list honour a declared layer, matching validate and archive [critical]

- [ ] 1.1 @regression (agent) run #83's repro script in a sandboxed HOME against this worktree's CLI -> on 24c08e82 `status --json` reports `archiveReady: false` with `verification/layer-unknown (line 7): @uat is not a known layer` and `list --json` `archiveReady: false` while `validate --strict` and `archive` exit 0; after the fix `status` and `list` report `archiveReady: true` with `blockedReasons: []`
- [ ] 1.2 @unit (agent) `readVerificationVerdict` on a `@uat` row with `extraLayers: ['uat']` has no `verification/layer-unknown` reason, and with `[]` still has one -> `unit/commands/archive-ready.test.ts` rows, the declared row red before the fix
- [ ] 1.3 @integration (agent) with `uat` declared, `validate --strict`, `status --json`, text `status`, `list --json` and `archive` agree on `[x]` and `[~] -> defer:` `@uat` rows -> `integration/verification-layers.test.ts` row: validate exit 0, `archiveReady: true` and `blockedReasons: []` in status, `archive-ready: yes` in text, `archiveReady: true` in list, archive exit 0 with the change moved; red before the fix
- [ ] 1.4 @integration (agent) without the declaration, `status --json` and `list --json` still report `archiveReady: false`, naming `verification/layer-unknown` -> `integration/verification-layers.test.ts` control row

## 2. Docs and gate

- [ ] 2.1 @manual (agent) `apps/docs/concepts/verification.md` names `status`'s and `list`'s archive-readiness among the places a declared layer is accepted -> `mise run docs:build` exits 0
- [ ] 2.2 @manual (agent) `mise run check` exits 0 and `cospec validate status-list-verification-layers --strict` is clean -> both exit 0
