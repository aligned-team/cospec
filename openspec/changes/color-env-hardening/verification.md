# Verification

## 1. Wrapped OpenSpec calls are colour-neutral under an exported FORCE_COLOR [critical]

- [ ] 1.1 @regression (agent) with `FORCE_COLOR=3` exported, run `mise run cospec -- instructions proposal --change <any>` and inspect stderr -> no `NO_COLOR' env is ignored` warning and no `warnOnDeactivatedColors` trace; the same command on the pre-fix tree reproduces both
- [ ] 1.2 @unit (agent) call the wrapped-env builder with a `process.env` snapshot containing `FORCE_COLOR`, `COLORTERM`, `CLICOLOR`, `CLICOLOR_FORCE` -> none of the four keys appear in the returned env, and `NO_COLOR`/`BUN_BE_BUN`/`OPENSPEC_TELEMETRY`/`OPENSPEC_NO_COMPLETIONS` are present with their pinned values
- [ ] 1.3 @manual (human) in a real terminal with `FORCE_COLOR=3` exported, run `cospec instructions proposal --change <any>` and read the output as a user would -> clean artifact block, no Node warning banner or stack trace between the sections
- [ ] 1.4 @integration (agent) run a wrapped command that cospec parses (`cospec config get`) under `FORCE_COLOR=3` -> parsed result identical to the clean-shell run, no ANSI escapes in captured stdout

## 2. The test harness no longer inherits the developer's colour environment

- [ ] 2.1 @regression (agent) run `mise run test:contract` (config-surface) and `mise run test:integration` (config) with `FORCE_COLOR=3 COLORTERM=truecolor CLICOLOR=1` exported -> both pass; the same run on the pre-fix tree fails
- [ ] 2.2 @unit (agent) run `mise run test` -> full unit suite green, including the new env-builder coverage

## 3. No regression in a clean shell

- [ ] 3.1 @integration (agent) `env -u FORCE_COLOR -u COLORTERM -u CLICOLOR mise run check` -> full gate green, behaviour unchanged from before the fix
