# cospec — Claude Code

<!-- begin shared -->

> To update shared content in `CLAUDE.md` and `AGENTS.md`, edit this file then
> run `mise run agents:sync`.

## Project context

cospec (conventional openspec) is a thin, opinionated wrapper around OpenSpec
1.5.0 that sizes the spec-driven workflow to your conventional-commit type.
`feat` gets the full treatment — proposal, blocking-changes, specs,
verification, tasks; `refactor` additionally requires design;
`ci`/`chore`/`docs` and their siblings take two minutes with three short
artifacts. It ships as `@aligned-team/cospec` with one bin, `cospec`.

cospec never replaces OpenSpec — it wraps the real binary (resolved by path,
never `$PATH`, accepting `>=1.0.0 <2.0.0`, pinned to 1.5.0 for dev/CI) and adds:
11 typed schemas that map 1:1 to the conventional-commit types, real change
validation with stable rule IDs, a deterministic `apply` gate, a
filesystem-verified `archive`, a machine-parsed `verification` evidence ledger
with hard archive gates, `## Surfaces` flag triggers that soft-nudge
verification and design sections, versioned schemas with `schemaVersion`
grandfathering, and a blocking-changes ledger with auto-sync. The tool
self-hosts: this repo's own `openspec/` tree is managed by cospec.

## Stack snapshot

| Layer         | Choice                                                           |
| ------------- | ---------------------------------------------------------------- |
| Runtime       | Bun 1.3                                                          |
| Language      | TypeScript 7 via `@typescript/native-preview`; `tsgo --noEmit`   |
| Wrapped tool  | `@fission-ai/openspec` 1.5.0 (pin; `>=1.0.0 <2.0.0` accepted)    |
| CLI           | `cospec` — Bun entry at `apps/cli/src/index.ts`                  |
| Lint + format | oxlint + oxfmt (no ESLint, no Prettier)                          |
| Git hooks     | hk (jdx/hk) via mise                                             |
| Tests         | bun test — unit, contract (real binary), integration, pack smoke |
| Eval          | DeepSeek v4 Flash (native API) — advisory, never gates CI        |

## Repository layout

```
cospec/
├── apps/cli/          @aligned-team/cospec — the cospec CLI
│   ├── src/canon/     single source of truth: schemas + workflows + gate
│   ├── src/core/      openspec wrapper, parsers, validation, managed files
│   ├── src/commands/  one file per cospec subcommand
│   └── test/          unit / contract / integration / fixtures
├── apps/docs/         public docs site — https://cospec.aligned.team
├── docs/              flat topic docs (architecture, schemas, validation, …)
├── e2e/eval/          DeepSeek e2e eval harness (advisory)
├── openspec/          self-hosted: cospec-managed schemas + changes + specs
├── scripts/           hook entrypoints + mise task scripts
└── .agents/shared.md  source for the shared block in CLAUDE.md / AGENTS.md
```

## Build, lint, format, test

All operations run through mise tasks — never raw tool invocations:

| Task                | Command                             |
| ------------------- | ----------------------------------- |
| Run the CLI         | `mise run cospec -- <args>`         |
| Build the binary    | `mise run build`                    |
| Lint                | `mise run lint`                     |
| Lint (fix)          | `mise run lint:fix`                 |
| Format (check)      | `mise run format:check`             |
| Format (fix)        | `mise run format:fix`               |
| Typecheck           | `mise run typecheck`                |
| Unit tests          | `mise run test`                     |
| Contract tests      | `mise run test:contract`            |
| Integration tests   | `mise run test:integration`         |
| Pack smoke          | `mise run test:pack`                |
| Regenerate managed  | `mise run generate`                 |
| Drift check         | `mise run generate:check`           |
| Schema validate     | `mise run openspec:schema:validate` |
| Sync agent docs     | `mise run agents:sync`              |
| Agent-doc drift     | `mise run agents:check`             |
| Docs site (build)   | `mise run docs:build`               |
| Docs site (dev)     | `mise run docs:dev`                 |
| E2E eval (advisory) | `mise run eval:e2e`                 |
| Full CI gate        | `mise run check`                    |

Run `mise run check` before every commit. Never bypass hk with `--no-verify`.

## Docs site

`apps/docs` is the public documentation site at https://cospec.aligned.team —
exact-pinned VitePress plus vitepress-plugin-llms, which emits
`llms.txt`/`llms-full.txt`. Deploys are release-synced: the docs build and
publish only when a release ships, from inside `.github/workflows/release.yml`,
never on pushes to `main` (to redeploy, re-run that workflow's docs jobs on a
release run). A dedicated CI job gates every PR that touches `apps/docs` on a
successful docs build. Each fact (artifact matrix, exit codes, layer and
Surfaces vocabulary, the OpenSpec pin, …) is owned by exactly one page — other
pages link to it, and anything that is OpenSpec's job links out to OpenSpec's
docs.

## The cospec workflow (we self-host)

Every substantive change to this repo is a cospec-typed OpenSpec change. Do not
hand-edit `openspec/changes/` state, and never call bare `openspec` — always go
through `cospec`:

1. `mise run cospec -- new <type> <slug>` — pick the conventional-commit type;
   cospec prints the artifact plan (how heavy the type is).
2. Author artifacts using `cospec instructions <artifact> --change <slug>` —
   including `cospec instructions verification` for `feat`/`fix`/`perf`/
   `refactor`, whose acceptance-evidence ledger is planned before you implement.
3. `mise run cospec -- validate <slug> --strict` — must pass.
4. `mise run cospec -- apply <slug>` — the gate. Obey the exit code: `0` clear,
   `2` blocked (stop, report the blockers), `3` soft-blocked (confirm, then
   `--allow-soft`). Never re-derive the gate from files.
5. Implement, checking off `tasks.md` as you go, and record verification
   evidence: mark each row `[x]` with the observed result after `->`, or
   `[~] defer: <reason>` for a row you will not run.
6. `mise run cospec -- archive <slug>` — validates, gates on tasks, runs the two
   hard gates (`archive/verification-incomplete`,
   `archive/scenario-preservation` — no `--force`), delegates to
   `openspec archive`, verifies the move on disk, and fans out blocker sync.
   Schemas with no specs artifact (`ci`, `chore`, `docs`, …) correctly produce
   no spec-sync deltas here. Run this as the final commit on the PR branch,
   before merge — never post-merge. A PR must never merge leaving its change
   unarchived in `openspec/changes/` on `main`.

In-flight v1 changes are grandfathered until `cospec migrate <slug>` stamps them
to the current `schemaVersion`; `cospec doctor` lists changes still on v1.

## Style rules (oxlint + oxfmt enforced)

- No semicolons; single quotes; `printWidth` 100 (80 for JSON/Markdown).
- Trailing commas everywhere; arrow parens always; LF endings.
- Sorted imports (`internalPattern` scoped to `@aligned-team`).
- TypeScript strict; `noUncheckedIndexedAccess`; `consistent-type-imports`.
- Comments explain non-obvious constraints only — not what the code plainly
  says.

## Engineering discipline

**Route through cospec** — all agent-facing OpenSpec access goes through the
`cospec` CLI. Generated skills and this repo's docs never call bare `openspec`.
The wrapped binary is spawned by resolved path and version-asserted to the
accepted range `>=1.0.0 <2.0.0` (dev/CI pins 1.5.0).

**Wrapped-call discipline** — every call into the wrapped binary declares its
expected exit codes, a stdout deny-list, and an observable post-condition. Trust
filesystem/JSON post-conditions, never exit codes alone (OpenSpec aborts with
exit 0). See docs/architecture.md.

**Never bypass hk** — hooks are managed by hk (jdx/hk) via mise. If a hook
fails, fix the root cause; never use `--no-verify`, `pre-commit`, or raw
`.git/hooks/` scripts.

**Managed files are generated** — `openspec/schemas/**` and the harness dirs
(`.claude/`, `.codex/`, `.opencode/`) are composed from `apps/cli/src/canon/`.
Edit the canon, run `mise run generate`; never hand-edit generated output. The
`generate:check` drift gate blocks the commit otherwise.

**Error handling** — never silently swallow errors. Catch only specific expected
cases; let unexpected exceptions propagate. Fixes must change observable
behavior, not relabel exceptions.

**Scope discipline** — touch only files related to the current change. Surface
out-of-scope issues as a proposed follow-up, not a silent fix.

**Dependencies** — pin exact versions in `package.json`; regenerate the lockfile
after editing the manifest. The OpenSpec pin is load-bearing: bumping it means
running the contract suite and re-probing before updating
`EXPECTED_OPENSPEC_VERSION`.

**Tests** — every command change lands with a contract or integration test.
Contract tests run the real pinned binary; a false archive PASS is a release
blocker.

**Docs never drift** — zero drift between the published docs site and released
behavior is non-negotiable. Any change that alters user-facing behavior —
commands, flags, schemas, validation rules, workflow semantics, exit codes —
updates `apps/docs` in the same change, on the page that owns the fact, and
records the docs update in the change's verification ledger (or `tasks.md` where
the type has none).

**Keep shared.md current** — any change that alters how work gets done here (new
apps, workflows, tasks, conventions, disciplines) updates `.agents/shared.md` in
the same change — unprompted — then `mise run agents:sync`. `agents:check`
enforces propagation only; stale guidance is a defect no tool catches.

**Secrets** — never read or print `.env.local`; the eval reads its key from the
process environment only. Reports contain counts and rule IDs, never keys, raw
prompts, or completions.

**Decisiveness** — research before asking; if the answer is in the codebase or
DESIGN, find it. Lead with a recommendation when presenting options.

<!-- end shared -->

## Claude Code notes

Generated cospec skills and commands live in `.claude/skills/cospec-*/` and
`.claude/commands/cospec/`. They are managed files — regenerate with
`mise run generate`, never hand-edit. `.claude/settings.json` carries an
additive `permissions.allow` entry for `Bash(cospec *)`; because every agent
call routes through `cospec`, no `openspec *` allowance is needed.

Restart Claude Code after `cospec init`/`cospec update` to pick up `/cospec:*`
commands.
