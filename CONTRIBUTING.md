# Contributing to cospec

## Self-hosting

cospec (conventional openspec) develops itself through its own cospec workflow:
every substantive change to this repo is a cospec-typed OpenSpec change, driven
by the same CLI we ship. The loop is:

1. **new** — `mise run cospec -- new <type> <slug>` scaffolds the change.
2. **author** — write each artifact the type requires, guided by
   `cospec instructions`.
3. **validate** — `cospec validate <slug> --strict` must pass.
4. **apply** — `cospec apply <slug>` gates the work; obey its exit code.
5. **implement** — do the work, checking off `tasks.md`.
6. **archive** — `cospec archive <slug>` merges specs, verifies, and syncs
   blockers. Run this as the final commit on the PR branch, before merge — never
   post-merge. A PR must never merge leaving its change unarchived in
   `openspec/changes/` on `main`.

If the tool cannot describe and gate a change to this repo, that is a bug in the
tool. See [The cospec change workflow](#the-cospec-change-workflow-we-self-host)
for the detailed mechanics.

## Dev setup

### Prerequisites

- [mise](https://mise.jdx.dev) — manages every tool pin (Bun, OpenSpec, oxlint,
  hk, …). Nothing else needs to be installed globally. Bun also provides the
  type checker (`bun check`) and the formatter (`bun fmt`).
- Git 2.54 or newer, for config-based hooks (older Git still works: hk falls
  back to script shims in `.git/hooks/`).

### Clone and install

```bash
git clone https://github.com/aligned-team/cospec
cd cospec
mise install     # installs the pinned toolchain and wires the git hooks
bun install      # installs workspace dependencies
```

`mise install` runs the `postinstall` hook in `mise.toml`, `hk install --mise`,
every time, even when every tool is already installed, so the git hooks are live
after the first install. No manual hook step. hk writes them into this clone's
own `.git/config` as config-based hooks (`hook.hk-*`), shared by every worktree
of the clone. Nothing in your global git config is needed, and a global git
template's hooks are not used. Each hook runs hk through `mise x`, so `mise`
must be on the `PATH` git sees when it runs one.

Always run tooling through mise (`mise exec -- <tool>` or `mise run <task>`) so
the pinned versions apply — a `bun` already on your `PATH` may be a different
version than the one mise pins, and running it directly bypasses the pin.

## Mise task workflow

Every operation runs through a mise task — never a raw tool invocation.

| task                                    | command                                                          |
| --------------------------------------- | ---------------------------------------------------------------- |
| Run the CLI                             | `mise run cospec -- <args>`                                      |
| Build the single-file binary            | `mise run build`                                                 |
| Lint                                    | `mise run lint`                                                  |
| Lint (autofix)                          | `mise run lint:fix`                                              |
| Format (check)                          | `mise run format:check`                                          |
| Format (fix)                            | `mise run format:fix`                                            |
| Typecheck                               | `mise run typecheck`                                             |
| Unit tests                              | `mise run test`                                                  |
| Contract tests (real binary)            | `mise run test:contract`                                         |
| Integration tests                       | `mise run test:integration`                                      |
| Tests a change reaches                  | `mise run test:changed -- [--base <ref> \| --staged] <suite>...` |
| Bench unit tests                        | `mise run test:bench`                                            |
| Pack smoke                              | `mise run test:pack`                                             |
| Regenerate managed files from canon     | `mise run generate`                                              |
| Managed-file drift gate                 | `mise run generate:check`                                        |
| Regenerate mise.lock (min_version mise) | `mise run lock`                                                  |
| mise.lock drift gate                    | `mise run lock:check`                                            |
| Validate composed schemas               | `mise run openspec:schema:validate`                              |
| Sync agent docs                         | `mise run agents:sync`                                           |
| Agent-doc drift gate                    | `mise run agents:check`                                          |
| E2E eval (advisory)                     | `mise run eval:e2e`                                              |
| Bench: cospec vs openspec (advisory)    | `mise run bench`                                                 |
| Bench smoke (advisory)                  | `mise run bench:smoke`                                           |
| Full CI gate                            | `mise run check`                                                 |

You don't need to run `mise run check` before committing: the git hooks check
what each commit and push touches (see [Git hooks](#git-hooks-hk)), and CI is
the full gate. `mise run check` runs everything locally when you want it.

## Commit format

Commits follow [Conventional Commits](https://www.conventionalcommits.org),
enforced by commitlint in the `commit-msg` hook. The type IS the change's schema
— pick the eleven-type set deliberately.

- **Types**: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`,
  `revert`, `style`, `test`.
- **Scopes** (optional but linted against an allow-list): `cli`, `canon`,
  `schemas`, `harness`, `validate`, `apply`, `archive`, `eval`, `bench`, `docs`,
  `ci`, `deps`, `hooks`, `agents`. A scope names an AREA the commit touches —
  omit it when there's no meaningful area, and never repeat the type as the
  scope (`chore(chore):` is rejected; use `chore: ...` instead). Archive commits
  are `chore: archive <slug>`.
- **Subject**: imperative mood, no trailing period, at most 72 characters.

```
feat(validate): add archive-precondition parity checks
fix(archive): treat exit-0-with-Aborted as a failure
docs: document the blocking-changes grammar
chore: archive scope-not-type
```

`cospec check-commit` runs alongside commitlint in the same hook. It is
warn-only: if a commit touches exactly one active change directory and the
commit type disagrees with that change's schema, it prints a warning and
exits 0. It never blocks.

## Git hooks (hk)

Hooks are managed by [hk](https://hk.jdx.dev) via mise. **Never bypass them**
with `--no-verify` — if a hook fails, fix the root cause.

| hook         | steps                                                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pre-commit` | bun fmt · oxlint · taplo · shellcheck · actionlint · `agents:check` · `generate:check` · `cospec validate --all --strict` · `cospec sync-blockers` · typecheck · the unit tests the staged changes reach |
| `commit-msg` | commitlint · `cospec check-commit`                                                                                                                                                                       |
| `pre-push`   | the linters (bun fmt · oxlint · taplo · shellcheck · actionlint) · typecheck · the unit, integration and contract tests the push's changes reach                                                         |

The linters run on the files the commit or push touches. Typecheck runs when a
TypeScript file or a `tsconfig` changes, over every workspace — type errors
cross files.

### Which tests run

The hooks and pull-request CI run `mise run test:changed`
(`apps/cli/test/fixtures/test-scope.ts`) over a change — a list of files:

- a commit: the staged changes;
- a push: for each pushed ref, its diff from the sha the remote has for it, or,
  for a new branch, from the newest commits the remote already has (on a branch
  stacked on another, that one). git hands the pre-push hook the remote and the
  refs, and hk passes them on to the step (`hook_args`, `hook_stdin`); hk's own
  file list leaves deletions out;
- a pull request: its diff from its base.

Per suite, each changed file selects:

- **the tests whose import graph reaches it** (static imports and literal
  `import()`s, never type-only ones — the rules `bun test --changed` follows).
  Canon files are in the graph: `canon/embedded.ts` imports each one;
- **the tests that read it through `fs`**: those `FS_READERS` lists (directly,
  or through a support module they import), and those that copy the fixture tree
  it is in;
- **nothing**, for a path no test reads (`UNREAD`: change records, workflows,
  hook scripts, root docs, the bench and e2e packages); or
- **the whole suite**, for an input every test depends on — the CLI's boot path
  (`src/index.ts` and what it loads before choosing a command module), the test
  preload, `package.json`, the lockfiles, `mise.toml`, `bunfig.toml`, the
  `tsconfig`s (`GLOBAL_INPUTS`) — or a non-code file nothing is known to read.

So a change to a docs page runs the docs table test and nothing else, and a
change to a golden file runs the tests that compare against it.

A test that spawns the CLI runs it in a child process, so its own imports would
not reach the command it runs. It imports that command's module instead
(`import '../../src/commands/validate.ts'`); the test preload refuses a CLI
spawn from a test file whose imports never reach the dispatched command. A file
under `test/` that builds a path into the repository (from `import.meta.dir`,
`REPO_ROOT` and the like) says what it reads in `FS_READERS`
(`test/fixtures/test-scope.ts`), and `support-test-scope.test.ts` fails on one
that does not. A fixture is named by a literal in `mkTempRepo({ fixture })` or
`copyFixture()`, so the tests that copy each tree are known.

A push runs the contract tests its changes reach too. The contract suite runs
the real pinned OpenSpec binary and takes about 20 minutes whole locally, so a
push that changes canon or the CLI's boot path takes that long. Pull-request CI
runs the same contract and integration selection (and the whole unit suite, for
its coverage gate); pushes to `main` and the merge queue run every suite whole,
and a release bumps only a `main` commit whose own CI passed.

## The cospec change workflow (we self-host)

Every substantive change to this repo is a cospec-typed OpenSpec change. Do not
hand-edit `openspec/changes/` state, and never call bare `openspec` — always go
through `cospec`.

1. `mise run cospec -- new <type> <slug>` — pick the type; read the artifact
   plan cospec prints.
2. Author each artifact with `cospec instructions <artifact> --change <slug>`.
3. `mise run cospec -- validate <slug> --strict` — must pass.
4. `mise run cospec -- apply <slug>` — the gate. Obey the exit code.
5. Implement, checking off `tasks.md`.
6. `mise run cospec -- archive <slug>` — validates, gates on tasks, archives,
   verifies the move, and fans out blocker sync. Schemas with no specs artifact
   (`ci`, `chore`, `docs`, …) correctly produce no spec-sync deltas here. Run
   this as the final commit on the PR branch, before merge — never post-merge. A
   PR must never merge leaving its change unarchived in `openspec/changes/` on
   `main`.

`openspec/schemas/**` and the harness directories (`.claude/`,
`.agents/skills/cospec-*/`, `.codex/`, `.opencode/`) are **generated** from
`apps/cli/src/canon/`. Edit the canon and run `mise run generate`; never
hand-edit generated output. `generate:check` blocks the commit otherwise.

## Code style

oxlint (`.oxlintrc.json`) and `bun fmt` (bunfig.toml's `[fmt]`) are the
enforcers; the pre-commit hook runs both.

- No semicolons; single quotes; `printWidth` 100 (80 for JSON and Markdown).
- Trailing commas everywhere; arrow parens always; LF line endings.
- Sorted imports; TypeScript strict; `noUncheckedIndexedAccess`.
- Comments explain non-obvious constraints only — not what the code plainly
  says.

## Running tests

- **Unit** (`bun test apps/cli/test/unit`) — parsers, rules, composer goldens,
  render snapshots, managed-file outcomes. Coverage gate applies.
- **Contract** (`test:contract`) — runs against the real pinned OpenSpec binary.
  These are the drift canary; a false archive PASS is a release blocker.
- **Integration** (`test:integration`) — the three repo states, full lifecycles,
  idempotence, the update matrix, and the pack smoke.

Every command change lands with a contract or integration test.

## PR etiquette

PRs land via **squash merge**, so the PR title becomes the landing commit — it
must be a valid Conventional Commit (linted by `pr-title.yml`). Keep changes
scoped; surface out-of-scope issues as a follow-up rather than a silent fix. A
PR is complete only once it carries its own change's archive commit
(`chore: archive <slug>`) — never merge leaving a change unarchived in
`openspec/changes/` on `main`.
