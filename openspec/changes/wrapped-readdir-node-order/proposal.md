# Proposal

## Why

cospec runs the wrapped OpenSpec binary under its own Bun, but OpenSpec's output
is defined by how it behaves under Node. On macOS and Linux Node's `fs.readdir`
returns a directory's entries sorted by name — libuv's `scandir` sorts them with
`strcmp` — while Bun returns them in the filesystem's own order. Every list
OpenSpec builds straight from a directory listing (`Available changes` in an
`instructions` refusal, spec and schema discovery, `list`) therefore comes out
of cospec in a different order than OpenSpec prints it, whenever the filesystem
does not happen to keep the names sorted. It shows on CI: the
`upstream-spellings.test.ts` rows 3.2 and 3.7 compare cospec with the binary
under Node and fail on Linux runners whose ext4 hash order is not sorted — every
run of PR #101, and `feat/openspec-1-15-parity` on Bun 1.3.14 too. cospec's
drop-in guarantee (the same output as OpenSpec) does not hold for those lists.

## What Changes

- Every wrapped call — piped (`spawnRaw`) and terminal handover
  (`preloadedArgv`), against a project copy or the embedded bundle — runs behind
  a new preload (`core/readdir-preload.ts`), first on the argv. It sorts the
  results of `fs.readdirSync`, callback `fs.readdir` and `fs.promises.readdir`
  by the bytes of each name, as Node does, on every platform but Windows, where
  Node does not sort either. Recursive reads pass through untouched; the pinned
  dist makes none.
- The preload patches `fs` through `require()` before anything imports `node:fs`
  as an ES module: Bun builds a builtin's ES-module namespace from its CommonJS
  exports on first import, has no working `syncBuiltinESMExports`, and its
  runtime plugins cannot intercept builtins.
- The preload file is written content-addressed to cospec's cache, beside the
  handover preload, through one shared writer with the same temp-dir fallback.
- A contract row fails a pinned dist that lists a directory through an API the
  preload does not cover (`opendir`, a recursive `readdir`, `fs.glob`).

## Capabilities

### Modified Capabilities

- `embedded-openspec`: adds "Wrapped calls list directories in Node's order".
  The spec named how the wrapped binary is resolved and spawned, but not that it
  must answer as it does under Node where Bun's runtime differs.

## Impact

- `apps/cli/src/core/readdir-preload.ts` (new), `core/handover-preload.ts` (the
  shared preload writer and `preloadedArgv`), `core/openspec.ts` (`spawnRaw`).
- Tests: a contract differential and a dist-API guard, a unit test of the
  preload against Node, and `json-envelope.test.ts`'s spawn stub.
- Docs: `apps/docs/concepts/how-it-relates-to-openspec.md`,
  `apps/docs/reference/configuration.md`, `docs/architecture.md`.
- Behavior: on macOS and Linux, lists OpenSpec prints through cospec come out in
  upstream's order; cospec's cache holds one more small file.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
