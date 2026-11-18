# Proposal

## Why

The hooks and PR CI run the tests a change reaches through Bun's import graph
(`mise run test:changed`), but 22 of the 28 command modules imported `EXIT` from
`src/cli.ts`, and `help` and `config` imported its help-text functions. `cli.ts`
holds the command registry, whose literal `import()`s reach every command, so
any test that imported one command reached all of them, and a change to one
command selected the tests of every other. Weighted by CI time, a typical `src`
change selected about 84% of the contract suite's time and 59% of the
integration suite's.

## What Changes

- `src/core/exit.ts` (new): `EXIT`, moved verbatim from `cli.ts`.
- `src/core/help-text.ts` (new): the help screens: `GLOBAL_OPTIONS`,
  `programHelpText`, `commandHelpText`, `subcommandHelpText`,
  `offeredSubcommands` and their private helpers, moved verbatim from `cli.ts`.
  `cli.ts` keeps parsing and dispatch and imports both modules.
- Every importer repointed: `index.ts`, 21 command modules,
  `core/forward-relay.ts`, `core/passthrough-command.ts`, and two unit tests
  (`command-table`, `completions`). The command-context types stay in `cli.ts`;
  type-only imports are outside the graph.
- `test/unit/support-test-scope.test.ts`: a row requiring that no command
  module's import closure reach `src/cli.ts`.
- Four contract tests (`cli-surface`, `relayed-remedies`, `sync-specs`,
  `upstream-spellings`) import the commands they run. They reached every command
  only through the registry before, and the spawn guard refused them once that
  path was gone.

**Invariant:** no observable behavior changes: every exit code, help screen,
parse refusal and dispatch stays byte-identical, and the compiled binary still
bundles every command (the registry's literal `import()`s are untouched).

## Impact

- `apps/cli/src` internal module layout only; no CLI, schema, spec or docs
  change. A typical `src` change now selects about 76% of the contract suite's
  time at the median (45% at the 25th percentile), and 55% (18%) once the
  sibling `ci` change drops `profiles.test.ts`'s `cli.ts` import; the
  integration suite's falls to 50% (12%).

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
