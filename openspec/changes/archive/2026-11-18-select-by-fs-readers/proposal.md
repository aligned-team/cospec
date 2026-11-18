# Proposal

## Why

Test selection ran a whole suite for any changed file that was not a JS/TS
module, unless a per-suite list said no test of that suite read it. A docs page
ran all 119 unit test files though one test reads the docs; a golden file, a
fixture tree or a canon workflow did the same. Canon files were never outside
the graph at all: `canon/embedded.ts` imports each one. And the per-suite list
was wrong in one place: `generate-self-home` runs `cospec update` over the
repository, which reads `CLAUDE.md` and `AGENTS.md` for a legacy OpenSpec block,
yet both sat on the list as read by no test.

## What Changes

- `apps/cli/test/fixtures/test-scope.ts`: `selectTests(suite, changed)` picks,
  for each changed file, the tests whose import graph reaches it, the tests that
  read it through fs (`FS_READERS`: every file under `test/` that builds a
  repository path, with the globs it reads, a support module's reads reaching
  every test that imports it; and the fixture trees each test names in
  `mkTempRepo({ fixture })` / `copyFixture()`, `fixtureUses`), nothing for a
  path no test reads (`UNREAD`, now one list), or the whole suite for the CLI's
  boot path, the test preload, `GLOBAL_INPUTS` (manifests, lockfiles,
  `mise.toml`, `bunfig.toml`, `tsconfig`s) or a non-code file nothing is known
  to read. It replaces `fullSuiteReason`, `testsReaching`, the per-suite
  `UNREAD` and `RUN_NOT_IMPORTED`; the launcher is the pack tests' declared
  read.
- `apps/cli/test/fixtures/run-changed.ts`: runs `selectTests`.
- `apps/cli/test/unit/support-test-scope.test.ts`: selection rows (a docs page,
  a golden file, a fixture tree, a capture file, `CLAUDE.md`, the launcher,
  canon, a command module, a change record, the boot path, the preload, global
  inputs, an unknown file); a check that `FS_READERS` lists exactly the files
  under `test/` that build a repository path, and that each declared glob
  matches a file; a check that every fixture is named by a literal. It replaces
  `SOURCE_READERS`.
- `CONTRIBUTING.md`, `.agents/shared.md` (synced into `CLAUDE.md` /
  `AGENTS.md`).

## Impact

- A docs-only change runs the docs table test; a golden file runs the tests that
  compare against it; a fixture tree runs the tests that copy it; a canon file
  runs the tests that reach `canon/embedded.ts` or read it, not every suite.
  `CLAUDE.md`/`AGENTS.md` now select `generate-self-home`.
- A file under `test/` that starts building a repository path needs an
  `FS_READERS` entry, or the unit suite fails.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
