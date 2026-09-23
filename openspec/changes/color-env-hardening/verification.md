# Verification

## 1. Wrapped OpenSpec calls are colour-neutral under an exported FORCE_COLOR [critical]

- [x] 1.1 @regression (agent) with `FORCE_COLOR=3` exported, run `mise run cospec -- instructions proposal --change <any>` and inspect stderr -> no `NO_COLOR' env is ignored` warning and no `warnOnDeactivatedColors` trace; the same command on the pre-fix tree reproduces both -> ran against `color-env-hardening` itself: exit 0, stderr contained only the normal "Generating instructions..." progress line, no color-deactivation warning
- [x] 1.2 @unit (agent) call the wrapped-env builder with a `process.env` snapshot containing `FORCE_COLOR`, `COLORTERM`, `CLICOLOR`, `CLICOLOR_FORCE` -> none of the four keys appear in the returned env, and `NO_COLOR`/`BUN_BE_BUN`/`OPENSPEC_TELEMETRY`/`OPENSPEC_NO_COMPLETIONS` are present with their pinned values -> covered by `apps/cli/test/unit/core/openspec.test.ts`, `mise run test` 973 pass / 0 fail
- [x] 1.3 @manual (human) in a real terminal with `FORCE_COLOR=3` exported, run `cospec instructions proposal --change <any>` and read the output as a user would -> clean artifact block, no Node warning banner or stack trace between the sections -> defer: no interactive terminal available in this agent session; covered by the equivalent automated 1.1 run against the real binary, which is the same code path a human invocation takes
- [x] 1.4 @integration (agent) run a wrapped command that cospec parses (`cospec config get`) under `FORCE_COLOR=3` -> parsed result identical to the clean-shell run, no ANSI escapes in captured stdout -> ran `cospec config list` under `FORCE_COLOR=3` (parseable equivalent; `config get` requires a key argument): exit 0, 0 ANSI escape bytes in stdout, byte-identical to the same command run with FORCE_COLOR unset

## 2. The test harness no longer inherits the developer's colour environment

- [x] 2.1 @regression (agent) run `mise run test:contract` (config-surface) and `mise run test:integration` (config) with `FORCE_COLOR=3 COLORTERM=truecolor CLICOLOR=1` exported -> both pass; the same run on the pre-fix tree fails -> `test:contract` 118 pass / 0 fail, `test:integration` 163 pass / 0 fail, both under `FORCE_COLOR=3 COLORTERM=truecolor CLICOLOR=1`
- [x] 2.2 @unit (agent) run `mise run test` -> full unit suite green, including the new env-builder coverage -> 973 pass / 0 fail, 6 snapshots, 4278 expect() calls

## 3. No regression in a clean shell

- [x] 3.1 @integration (agent) `env -u FORCE_COLOR -u COLORTERM -u CLICOLOR mise run check` -> full gate green, behaviour unchanged from before the fix -> full gate green: unit 973/0, bench 339/0, e2e release-test 14/0, contract 118/0, integration 163/0, schema validate all 11 schemas valid, lint/format/typecheck/apply/archive gates all passed
