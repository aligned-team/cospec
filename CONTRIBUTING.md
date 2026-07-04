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
   blockers.

If the tool cannot describe and gate a change to this repo, that is a bug in the
tool. See [The cospec change workflow](#the-cospec-change-workflow-we-self-host)
for the detailed mechanics.

## Dev setup

### Prerequisites

- [mise](https://mise.jdx.dev) — manages every tool pin (Bun, OpenSpec, oxlint,
  oxfmt, hk, …). Nothing else needs to be installed globally.

### Clone and install

```bash
git clone https://github.com/aligned-team/cospec
cd cospec
mise install     # installs the pinned toolchain
bun install      # installs workspace dependencies; the postinstall hook wires hk
```

`bun install`'s postinstall runs `hk install --mise`, so the git hooks are live
after the first install. No manual hook step.

Always run tooling through mise (`mise exec -- <tool>` or `mise run <task>`) so
the pinned versions apply — a `bun` already on your `PATH` may be a different
version than the one mise pins, and running it directly bypasses the pin.

## Mise task workflow

Every operation runs through a mise task — never a raw tool invocation.

| task                                | command                             |
| ----------------------------------- | ----------------------------------- |
| Run the CLI                         | `mise run cospec -- <args>`         |
| Build the single-file binary        | `mise run build`                    |
| Lint                                | `mise run lint`                     |
| Lint (autofix)                      | `mise run lint:fix`                 |
| Format (check)                      | `mise run format:check`             |
| Format (fix)                        | `mise run format:fix`               |
| Typecheck                           | `mise run typecheck`                |
| Unit tests                          | `mise run test`                     |
| Contract tests (real binary)        | `mise run test:contract`            |
| Integration tests                   | `mise run test:integration`         |
| Pack smoke                          | `mise run test:pack`                |
| Regenerate managed files from canon | `mise run generate`                 |
| Managed-file drift gate             | `mise run generate:check`           |
| Validate composed schemas           | `mise run openspec:schema:validate` |
| Sync agent docs                     | `mise run agents:sync`              |
| Agent-doc drift gate                | `mise run agents:check`             |
| E2E eval (advisory)                 | `mise run eval:e2e`                 |
| Full CI gate                        | `mise run check`                    |

Run `mise run check` before every commit — it is the same gate CI runs.

## Commit format

Commits follow [Conventional Commits](https://www.conventionalcommits.org),
enforced by commitlint in the `commit-msg` hook. The type IS the change's schema
— pick the eleven-type set deliberately.

- **Types**: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`,
  `revert`, `style`, `test`.
- **Scopes** (optional but linted against an allow-list): `cli`, `canon`,
  `schemas`, `harness`, `validate`, `apply`, `archive`, `eval`, `docs`, `ci`,
  `deps`, `hooks`, `agents`, `chore`.
- **Subject**: imperative mood, no trailing period, at most 72 characters.

```
feat(validate): add archive-precondition parity checks
fix(archive): treat exit-0-with-Aborted as a failure
docs: document the blocking-changes grammar
```

`cospec check-commit` runs alongside commitlint in the same hook. It is
warn-only: if a commit touches exactly one active change directory and the
commit type disagrees with that change's schema, it prints a warning and
exits 0. It never blocks.

## Git hooks (hk)

Hooks are managed by [hk](https://hk.jdx.dev) via mise. **Never bypass them**
with `--no-verify` — if a hook fails, fix the root cause.

| hook         | steps                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pre-commit` | oxfmt · oxlint · taplo · shellcheck · actionlint · `agents:check` · `generate:check` · `cospec validate --all --strict` · `cospec sync-blockers` |
| `commit-msg` | commitlint · `cospec check-commit`                                                                                                               |
| `pre-push`   | the linters (oxfmt · oxlint · taplo · shellcheck · actionlint)                                                                                   |

### The slow pre-push gate (opt-in)

The pre-push hook that `hk install --mise` wires up runs **only the linters** —
the slow steps (typecheck · unit · contract · integration · build) live behind
hk's `slow` profile and are skipped by a plain `hk run pre-push`. Do not assume
your pushes are test-gated after the default setup; `mise run check` before
every commit remains the real gate (see
[Mise task workflow](#mise-task-workflow)), and CI re-runs the full gate
regardless.

If you want the slow gate enforced locally on push, install the branch-aware
wrapper by hand — it is intentionally not wired by `postinstall`:

```bash
install -m 755 scripts/hooks/pre-push-gate \
  "$(git rev-parse --git-dir)/hooks/pre-push"
```

Once installed, the wrapper upgrades to the `slow` profile **only when the push
targets `main`/`master`**; feature-branch pushes still run linters only. Rerun
the `install` line after any `bun install`, since `hk install --mise` reinstalls
the plain pre-push hook and overwrites the wrapper.

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
   verifies the move, and fans out blocker sync.

`openspec/schemas/**` and the harness directories (`.claude/`, `.codex/`,
`.opencode/`) are **generated** from `apps/cli/src/canon/`. Edit the canon and
run `mise run generate`; never hand-edit generated output. `generate:check`
blocks the commit otherwise.

## Code style

oxlint and oxfmt are the enforcers; the pre-commit hook runs both.

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
scoped; surface out-of-scope issues as a follow-up rather than a silent fix.
