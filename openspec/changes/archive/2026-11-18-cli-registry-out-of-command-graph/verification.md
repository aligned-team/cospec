# Verification

## 1. No behavior change [critical]

- [x] 1.1 @equivalence (agent) the unit, contract and integration suites, unchanged apart from two unit tests' import paths -> pass, with every help screen, exit code and parse refusal asserted byte for byte as before -> `mise run check` (lint, format, typecheck, generate, lock, vendor, agents, validate and schema gates): unit 3222, integration 404, bench 345, release 14 pass. Its contract run surfaced four tests that had reached every command only through the registry (125 guard refusals: `cli-surface`, `relayed-remedies`, `sync-specs`, `upstream-spellings`); with their 20 recorded command imports, the full contract suite: 3235 pass, 0 fail
- [x] 1.2 @equivalence (agent) `mise run test:pack:standalone` -> the compiled binary bundles and runs every command -> `mise run test:pack:standalone`: 3 pass (the compiled binary builds from the untouched registry and runs on Node with bun stripped from PATH)

## 2. The registry stays out of the commands' graph

- [x] 2.1 @unit (agent) `support-test-scope.test.ts`'s registry row -> no command module's import closure reaches `src/cli.ts`, and the row fails if a command imports `EXIT` from `cli.ts` again -> passes; with `commands/feedback.ts` importing `EXIT` from `../cli.ts` again, `no command module reaches src/cli.ts` fails (support-test-scope 46 pass otherwise)
- [x] 2.2 @benchmark (agent) the share of the contract and integration suites' CI time a single `src` file's change selects, over every `src` file -> lower than before the move -> weighted by the last full CI run's per-file durations, over every `src` file: main 84% median / 83% p25 of the contract suite's time, 59% / 59% of integration's; this change 76% / 45% and 50% / 12%; with the sibling `ci` change's `profiles.test.ts` fix as well, contract 55% / 18%
