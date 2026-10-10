## Context

Two paths reach the host's machine-global OpenSpec config
(`openspec config path`: `$XDG_CONFIG_HOME/openspec/config.json`, else
`$HOME/.config/openspec/config.json`): the tests, and `mise run generate`.

Tests. `test/fixtures/no-completion-tip.ts` already pointed `XDG_CONFIG_HOME` at
an empty directory, but only the mise tasks passed it with `--preload`. A direct
`bun test <file>` (and ci.yml's root-level unit run) skipped it and read the
real config; with `profile: core` the init suites then saw 6 of 12 workflows.
Reproduced: the three failing tests pass with the flag and fail without it,
under the same profile-core HOME. A second hole is separate: Bun's
`os.homedir()` returns the home the process started with and ignores a later
`process.env.HOME` assignment (checked by assigning and reading back), so the
in-process readers that default to `homedir()` (`cli.ts`'s completion tip,
`userSchemasDir`, `legacy-skills.ts`'s prompts fallback) would still reach the
real home after an environment-only sandbox.

Generate. `cospec update` reads `profile`/`workflows`/`delivery` from that same
file (`readGlobalProfile`), and never removes an installed workflow. On a
profile-core host, deleting the non-core `verify` files made `update --check`
report no drift (a clean host reports both files `created`), and deleting
`explore` made it re-create it while an `updated` row appeared on the
`update-change` skill, whose body depends on the installed set.

## Decisions

- Isolation is a bunfig preload, not a flag. Bun reads only the bunfig in its
  working directory, so the root one (CI runs from the root), `apps/cli`'s,
  `packages/bench`'s and `e2e`'s (the mise tasks run `bun test` from each) all
  name it; the guard test runs a bare `bun test` from each of the four. A second
  load, from a `--preload` beside the bunfig, is a no-op through a `globalThis`
  symbol, so the sandbox is never sandboxed twice.
- The preload sandboxes HOME and USERPROFILE as well as `XDG_CONFIG_HOME`, so a
  test that deletes the XDG variable to exercise the `HOME` fallback still lands
  in the sandbox. `os.homedir()` is replaced by `mock.module('node:os')` (ESM
  named and namespace imports) plus the patched default export (`require`),
  because neither alone covers both. `XDG_CACHE_HOME` stays real: the embedded
  openspec bundle is cached there and a fresh cache costs every run an
  extraction; it holds no config.
- A child process gets the sandbox too. Bun starts a `Bun.spawn`/`Bun.spawnSync`
  child with the environment the process started with, not the mutated
  `process.env` (probed: `printf $HOME` after assigning `process.env.HOME`
  prints the started one), so the preload wraps both and defaults an omitted
  `env` to `{ ...process.env }`; a call that passes `env` keeps it. Without it
  `bun add`, `bun build --compile`, `npm pack`, `git init` and the shell syntax
  checks read the real `~/.npmrc`, `~/.bunfig.toml` and `~/.gitconfig` and
  filled the real `~/.bun/install/cache` and `~/.npm`. No test file uses
  `node:child_process`.
- The sandbox is removed by a preload-level `afterAll`, not
  `process.on('exit')`: `bun test` 1.3.14 never fires the handler (a probe
  preload wrote nothing from it), so every run left a `cospec-test-machine-*`
  directory behind.
- The guard is two layers. A `beforeEach` registered in the preload fails the
  next test of any suite that leaves a global-config path under the real home
  (the suites that assign and delete these variables restore them). The
  dedicated unit test checks the environment, `os.homedir()`, the path the
  binary prints through `runOpenspec` (the product's own in-process call), and
  the guard's refusals. The real homes are the account's passwd home and the
  HOME the run started with, minus any that contains the temporary directory.
- Generate stays host-independent by the task, not the product. `update`
  honouring a user's profile is documented behaviour (`profile` is
  explicit-only), so changing it for this repo would change it for everyone; a
  flag or an `openspec/config.yaml` key would add command-table, reachability
  and `apps/docs` surface for one self-hosted repo. `scripts/generate-self` runs
  `update` with `XDG_CONFIG_HOME` at an empty temporary directory, removed on
  exit; `generate` and `generate:check` (CI, hk and the release workflow all
  call them by task name) use it.

## Risks / Trade-offs

- A test that needs the account's real git identity or Bun's transpiler cache
  under HOME now sees the sandbox; the suites ran green under both a clean and a
  profile-core HOME, and the test helpers already set `GIT_*` for their
  children. The pack tests' `bun add` starts from a cold package cache under the
  sandbox HOME on every run.
- Another tool that runs `bun test` with a different working directory (an IDE
  runner at the repo root) is covered by the root bunfig; one that passes
  `--config` is not, and fails the guard test by name rather than a
  profile-dependent init test.
- Someone running `bun run apps/cli/src/index.ts update` by hand, outside the
  task, still reads their own profile. That is the product working as
  documented.
