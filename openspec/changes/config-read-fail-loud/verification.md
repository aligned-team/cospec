# Verification

## 1. A broken config fails a validated ledger loud, naming the config [critical]

- [ ] 1.1 @regression (agent) run #98's repro (declared `uat`, resolved `@uat` row) with an unparseable config and with a directory at `openspec/config.yaml`, in a sandboxed HOME against this worktree's CLI -> on f8c23d38 `validate --strict` fails on `verification/layer-unknown`, `status --json` `blockedReasons` names `layer-unknown`, stderr empty; after the fix `validate` fails on `verification/config-unreadable` naming the file, no `layer-unknown`, `status`/`list` `archiveReady: false` with that reason, and stderr carries `Warning: could not parse <path> (<detail>); ignoring it.` once
- [ ] 1.2 @unit (agent) `readProjectConfig`'s readers: a missing config is no layers; an unparseable config and a directory config give `{ layers: [], unreadable }` naming the file and cause; a non-mapping document and a malformed declaration stay lenient -> `unit/core/verification-layers.test.ts` rows
- [ ] 1.3 @unit (agent) `verificationRules` with `unreadable` set emits one `verification/config-unreadable` ERROR and no `verification/layer-unknown`; without it, unchanged -> `unit/rules/verification.test.ts` rows
- [ ] 1.4 @integration (agent) with a broken config, `validate --strict` exits 1 on `verification/config-unreadable`, `archive` refuses and leaves the change, `status --json` and `list --json` report `archiveReady: false` with the reason, each printing the warning line once -> `integration/verification-layers.test.ts` rows (EISDIR and unparseable), red before the fix

## 2. The bare-change schema fallback warns as the binary does

- [ ] 2.1 @integration (agent) `status --change <bare>` and `list` under an unparseable config fall back to `spec-driven`, exit 0, and print the binary's warning line once -> integration row asserting stderr and the reported type, red before the fix

## 3. Doctor names a read failure

- [ ] 3.1 @unit (agent) `cospec doctor` on a directory at `openspec/config.yaml` reports `could not be read (EISDIR)`, and on unparseable YAML still reports `does not parse as YAML` -> `unit/init/doctor.test.ts` rows, the EISDIR row red before the fix

## 4. Docs and gate

- [ ] 4.1 @manual (agent) `concepts/verification.md`, `reference/validation-rules.md` and the `cospec status`/`cospec doctor` rows of `reference/commands.md` state the new behavior -> `mise run docs:build` exits 0
- [ ] 4.2 @manual (agent) the PR's CI checks are green and `cospec validate config-read-fail-loud --strict` is clean -> every check passes and validate exits 0
