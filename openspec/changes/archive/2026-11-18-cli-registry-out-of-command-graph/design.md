# Design

## Context

`src/cli.ts` held four things: the command-context types, the `EXIT` code
contract, the help-screen renderers, and the program's parsing and dispatch,
including `COMMAND_MODULES`, the registry of one literal `import()` per command.
Bun's `bun test --changed` follows literal dynamic imports, so any module that
imports a value from `cli.ts` reaches every command. Before:
`commands/<x>.ts → cli.ts (EXIT) → COMMAND_MODULES → every command`. After:
`commands/<x>.ts → core/exit.ts`, and `help`/`config` →
`core/help-text.ts → core/command-table.ts`; only `index.ts` and tests that run
the dispatcher in process import `cli.ts`.

## Goals / Non-Goals

**Goals**

- No command module's import closure reaches `cli.ts`, so a test of one command
  is selected by changes to that command and what it imports, not by every other
  command.
- A guard that keeps it so.

**Non-Goals**

- Moving the types (`CommandContext`, `CommandModule`, `GlobalFlags`): type-only
  imports are erased and outside the graph.
- Changing the registry, the parser or any output.

## Decisions

- **Two modules, `core/exit.ts` and `core/help-text.ts`, not one
  `core/cli-shared.ts`.** `EXIT` has no dependencies and every command needs it.
  The help renderers need the command table, which only `help`, `config` and the
  dispatcher do. Rejected: one shared module, which would put `command-table.ts`
  in every command's graph for no reason.
- **No re-exports from `cli.ts`.** Every importer is repointed instead.
  Rejected: re-exporting `EXIT` from `cli.ts` for compatibility, which keeps a
  second import path that a new command could take by habit and quietly put the
  registry back in its graph.
- **The guard is a selection test, not a lint rule:** a row in
  `support-test-scope.test.ts` checks every registry module's import closure for
  `cli.ts`, the same closure Bun's selection uses. Rejected: an oxlint
  restricted-import rule, which would see direct imports but not a path through
  an intermediate module.

## Risks / Trade-offs

- [Risk] A moved function silently changes output (a lost constant, a different
  `GLOBAL_LABEL_WIDTH`). → Mitigation: the move is verbatim, and the unit,
  contract and integration suites, which assert every help screen and exit code
  byte for byte against the pinned binary, pass unchanged.
- [Risk] The compiled binary stops bundling a command. → Mitigation: the
  registry is untouched, and `test:pack:standalone` builds and runs it.

## Seam ownership

- `core/exit.ts` owns the exit-code contract; every command and the entry import
  it there.
- `core/help-text.ts` owns help rendering from the command table; the
  dispatcher, `help` and `config` call it.
- `cli.ts` owns parsing, dispatch and the command registry, and is imported only
  by `index.ts` and by tests that drive `run()` in process.
