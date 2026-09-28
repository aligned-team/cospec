# Design

## Context

OpenSpec's CLI starts from two places. `bin/openspec.js` imports `runCli` from
`dist/cli/index.js` and calls it. `dist/cli/index.js` ends with a main-module
check that calls `runCli()` again when `process.argv[1]` resolves to its own
`import.meta.url`. In the npm package the check is false because argv[1] is the
bin file. The vendored bundle folds both files into one, so `import.meta.url` is
the bundle, argv[1] is the bundle, and the CLI runs twice. The bundle's
`--version` looks fine only because commander exits inside the first run.

## Goals / Non-Goals

**Goals:**

- The embedded bundle runs the OpenSpec CLI exactly once per invocation.
- The build fails loudly if the upstream entry changes shape.

**Non-Goals:**

- Changing the wrapper, the one-document check, or any command.

## Decisions

- Strip the self-run block at bundle time with a `Bun.build` load transform
  scoped to the pinned package's `dist/cli/index.js`, keeping `bin/openspec.js`
  as the entry. The transform matches the block exactly and requires exactly one
  match. Rejected: bundling `dist/cli/index.js` as the entry and relying on the
  check to run the CLI once, because that makes the only run depend on a path
  comparison, and a mismatch there (symlinked cache dir, realpath differences)
  would run nothing and exit 0 with empty stdout.
- Rejected: de-duplicating stdout in the wrapper. It would hide the second run
  rather than stop it, and side-effecting calls would still run twice.

## Risks / Trade-offs

- [An OpenSpec bump rewrites the self-run block] → the transform finds zero
  matches and the vendor build fails with a message naming the block, so the
  bump cannot ship a double-running or non-running bundle.

## Operational surface

- Affects only the compiled standalone binary for every platform and arch; the
  bundle is platform-independent JS built once and embedded in each binary.
- No bind address, container, runner, or secrets involved.
- Bun version is the one pinned in `mise.toml`; the bundle stays
  byte-deterministic for a given OpenSpec and Bun version.
