# cospec

**cospec** — conventional openspec: OpenSpec change management, sized to your
commit type. `feat` gets the full treatment; `ci` takes two minutes.

---

## Quick start

cospec ships as standalone executables — one per platform — so it runs with no
JS runtime required, and installs cleanly on Node, Deno, or Bun.

### mise

```sh
mise use github:aligned-team/cospec
cospec init
```

The binary is fully self-contained: no JS runtime, no `node_modules`, no extra
install step. It embeds the pinned OpenSpec CLI as a single-file bundle and runs
it with its own bun runtime, so every wrapped command (`new`, `validate`,
`apply`, `archive`, …) works out of the box.

> mise's github backend applies a default release-age cooldown
> (`minimum_release_age`) that hides very recent releases from "latest"
> resolution. If you're testing a release cut in the last day or so and it
> doesn't show up, pin the exact version instead:
> `mise use github:aligned-team/cospec@0.5.2` (a full `major.minor.patch`, not
> `@0.5`) — exact pins bypass the cooldown.

### Package managers

Works with Node, Deno, and Bun — the launcher execs the prebuilt binary for your
platform. With a project install, wrapped commands use your project's
`node_modules` `@fission-ai/openspec` (any `>=1.0.0 <2.0.0`) as before; the
embedded copy is the fallback when none is installed:

```sh
npm  i -D @aligned-team/cospec && npx cospec init
pnpm add -D @aligned-team/cospec && pnpm cospec init
bun  add -d @aligned-team/cospec && bun run cospec init
```

### From a clone (development)

```sh
git clone https://github.com/aligned-team/cospec
cd cospec
mise install && bun install
mise run cospec -- init
```

`cospec init` scaffolds `openspec/`, materializes the eleven typed schemas, and
generates agent skills for your harness. It is idempotent — run it again and a
clean tree stays clean.

---

## What is this

cospec is a thin wrapper around
[OpenSpec](https://github.com/Fission-AI/OpenSpec) `1.11.0` that maps the
spec-driven workflow onto your conventional-commit type. One schema per type;
the heavier the type, the more the workflow asks of you.

| type       | proposal | blocking-changes | specs | design | verification | tasks | what it's for                         |
| ---------- | -------- | ---------------- | ----- | ------ | ------------ | ----- | ------------------------------------- |
| `feat`     | full     | full             | ✅    | opt    | ✅           | ✅    | a new feature — the full workflow     |
| `fix`      | full     | full             | opt   | opt    | ✅           | ✅    | a bug fix                             |
| `perf`     | full     | full             | opt   | opt    | ✅           | ✅    | performance, behavior unchanged       |
| `refactor` | full     | full             | opt   | ✅     | ✅           | ✅    | restructure, behavior unchanged       |
| `revert`   | full     | full             | opt   | ✗      | opt          | ✅    | roll back a shipped change            |
| `build`    | lite     | lite             | ✗     | ✗      | opt          | ✅    | build config, dependencies, lockfiles |
| `ci`       | lite     | lite             | ✗     | ✗      | opt          | ✅    | CI workflows and automation           |
| `chore`    | lite     | lite             | ✗     | ✗      | ✗            | ✅    | maintenance                           |
| `docs`     | lite     | lite             | ✗     | ✗      | ✗            | ✅    | documentation                         |
| `style`    | lite     | lite             | ✗     | ✗      | ✗            | ✅    | formatting, no semantic change        |
| `test`     | lite     | lite             | ✗     | ✗      | ✗            | ✅    | tests for already-specified behavior  |

✅ required · opt optional · ✗ forbidden (`cospec validate` errors if present).
For `verification`, opt means trigger-promoted: absent by default, but checking
a `## Surfaces` flag in the proposal soft-nudges it into the `apply` gate. Full
matrix and per-type rationale: [docs/schemas.md](docs/schemas.md).

cospec never replaces OpenSpec — it wraps the real, version-pinned binary
(resolved by path, spawned, never `$PATH`) and adds typed schemas, real change
validation with stable rule IDs, a deterministic `apply` gate, a
filesystem-verified `archive`, a machine-parsed `verification` evidence ledger
enforced by hard archive gates, `## Surfaces` proposal flags that soft-trigger
verification and design sections, versioned schemas with `schemaVersion`
grandfathering, and a blocking-changes ledger with auto-sync.

---

## Commands

| command                          | what it does                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `cospec init [path]`             | scaffold `openspec/`, schemas, and harness files (idempotent)                                     |
| `cospec update [--check]`        | re-generate managed files from canon; `--check` is a drift gate                                   |
| `cospec doctor`                  | read-only health check, incl. changes still on `schemaVersion` 1                                  |
| `cospec new <type> <slug>`       | create a typed change; prints the artifact plan                                                   |
| `cospec migrate <change>`        | stamp a grandfathered change to the current `schemaVersion`, scaffolding deferred verification    |
| `cospec validate [name]`         | validate changes and specs (`--all`/`--changes`/`--specs`); `--strict` promotes warnings          |
| `cospec status` / `cospec list`  | change status with type, gate, and archive-readiness columns (`list --specs` lists living specs)  |
| `cospec instructions <artifact>` | print the authoring instruction for one artifact                                                  |
| `cospec apply <change>`          | the gate — exit 0 clear, 2 blocked, 3 soft-blocked                                                |
| `cospec archive <change>`        | validate, archive, verify the move, fan out blocker sync                                          |
| `cospec sync-blockers`           | check off blocker entries whose target has shipped                                                |
| `cospec show <item>`             | read a change or spec's markdown or JSON                                                          |
| `cospec view`                    | the OpenSpec dashboard                                                                            |
| `cospec store <sub>`             | manage stores: `setup`/`register` (auto-init) / `unregister` / `remove` / `ls` / `doctor`         |
| `cospec context`                 | a store's cross-repo working-set brief (`--json`, `--code-workspace`)                             |
| `cospec workset <sub>`           | personal cross-repo working views: `create` / `list` / `remove` / `open`                          |
| `cospec schemas` / `schema`      | inspect resolvable schemas (`schema which`/`validate`)                                            |
| `cospec templates`               | list per-artifact template paths                                                                  |
| `cospec config <sub>`            | machine-global OpenSpec config: `path`/`list`/`get`/`set`/`unset`/`reset`/`edit`/`profile`        |
| `cospec completion [shell]`      | print a bash/zsh/fish completion script, generated natively (no install step)                     |
| `cospec feedback "<msg>"`        | file a bug report at `aligned-team/cospec` via `gh`; `--upstream` files at OpenSpec's own tracker |

Global flags on every command: `--json`, `--no-color`, `--cwd <path>`,
`--store <id>`. `--store` runs the whole change lifecycle against a registered
OpenSpec store (a standalone planning repo) instead of the local repo — one
source of truth several code repos can plan against. `cospec` wraps every store,
context, and workset operation too, so you never drop out to bare `openspec`.
See [docs/stores.md](docs/stores.md). Full reference:
[docs/validation.md](docs/validation.md) (rules) and
[docs/apply-archive.md](docs/apply-archive.md) (gate + archive algorithms).

---

## The workflow

1. **new** — `cospec new feat add-widget` picks the type and writes
   `.openspec.yaml`; cospec prints how heavy the type is.
2. **propose** — author each artifact with
   `cospec instructions <artifact> --change add-widget`, then
   `cospec validate add-widget --strict`. For `feat`/`fix`/`perf`/`refactor`,
   `cospec instructions verification` plans the acceptance-evidence ledger
   before you write any code.
3. **apply** — `cospec apply add-widget` is the gate. Obey the exit code: `0`
   clear (work the tasks), `2` blocked (stop, report the blockers), `3`
   soft-blocked (confirm with the user, then re-run with `--allow-soft`). The
   gate is deterministic — never re-derive it from files.
4. **implement** — check off `tasks.md` as you go, and record verification
   evidence: mark each row `[x]` with the observed result after `->`, or
   `[~] defer: <reason>` for a row you will not run.
5. **archive** — `cospec archive add-widget` validates, gates on unchecked tasks
   and on the two hard verification gates (`archive/verification-incomplete`,
   `archive/scenario-preservation` — no `--force`), delegates to
   `openspec archive`, verifies the directory actually moved on disk, and checks
   off this change's slug in every other change's blocking-changes ledger.
6. **flywheel** — archiving reports which changes just became unblocked and the
   exact `cospec apply` to run next.

---

## Harness setup

`cospec init --harness <list>` generates agent files by direct project-file
injection — no marketplaces, no plugin packages, no global state. Every workflow
calls only `cospec` commands, so a single permission entry covers the whole
loop.

- **Claude Code** — `.claude/commands/cospec/*.md` (`/cospec:propose …`) and
  `.claude/skills/cospec-*/SKILL.md`. init additively merges `Bash(cospec *)`
  into `.claude/settings.json`. Restart Claude Code to pick up the `/cospec:*`
  commands.
- **Codex** — `.agents/skills/cospec-*/SKILL.md` (the shared root below) plus
  `.codex/rules/cospec.rules`, which pre-approves the read-only and gate calls
  (`archive` is intentionally not pre-approved). Skills load per session and are
  invoked as `$cospec-<skill>`.
- **OpenCode** — `.opencode/commands/cospec-*.md` (full bodies) and
  `.opencode/skills/cospec-*/SKILL.md`. Reload the project.
- **agents** — `.agents/skills/cospec-*/SKILL.md`, the vendor-neutral root read
  by Codex, Zed, Antigravity and other AGENTS.md-aware assistants.
  Byte-identical to what `codex` writes there, minus the rules file; no slash
  commands are generated. Earlier versions wrote Codex's skills to
  `.codex/skills` — `cospec update` migrates them and leaves anything you
  hand-edited alone.

Details and a per-harness smoke checklist:
[docs/harness-integration.md](docs/harness-integration.md).

---

## How it relates to OpenSpec

cospec pins `@fission-ai/openspec` `1.11.0` for its own dev/CI and accepts any
`>=1.0.0 <2.0.0` at runtime (the range is asserted at startup; the pin is the
build the contract suite is probed against) and adds, on top of it:

- **Typed schemas** — eleven schemas, one per conventional-commit type, with a
  required/optional/forbidden artifact matrix instead of one generic workflow.
- **Real validation** — `cospec validate` runs cospec's own rules (stable IDs,
  greppable) as a superset of the satisfiable OpenSpec checks.
- **A gated apply** — a deterministic blocker gate with an exit code an agent
  cannot rationalize past, backed by the same rule in schema prose.
- **A verified archive** — filesystem verification that catches OpenSpec's
  exit-0-but-aborted failure mode, plus a spec-merge spot-check.
- **A verification ledger** — a machine-parsed acceptance-evidence artifact
  (`verification.md`) that archive gates on: every `[critical]` behavior needs
  recorded evidence, and unfinished rows block the move (no `--force`).
- **Surface triggers and grandfathering** — closed `## Surfaces` proposal flags
  that soft-promote verification/design without ever hard-requiring them, and
  versioned schemas so pre-verification changes stay unblocked until an explicit
  `cospec migrate`.
- **Blocker sync** — a machine-parsed dependency ledger that checks itself off
  as dependencies ship.

---

## Docs

- [architecture.md](docs/architecture.md) — wrapper boundaries, the wrapped-call
  discipline, the failure modes cospec defends against
- [schemas.md](docs/schemas.md) — the artifact matrix, per-type rationale,
  customization tiers
- [validation.md](docs/validation.md) — every rule ID with an example failure
- [apply-archive.md](docs/apply-archive.md) — the apply gate and archive
  algorithms as a user-facing contract
- [blocking-changes.md](docs/blocking-changes.md) — the ledger grammar and sync
  semantics
- [harness-integration.md](docs/harness-integration.md) — per-harness files, the
  managed-file protocol, coexistence with OpenSpec's own files
- [eval.md](docs/eval.md) — the advisory DeepSeek eval and its redaction
  contract
- [self-hosting.md](docs/self-hosting.md) — how cospec manages its own
  `openspec/` tree
- [release.md](docs/release.md) — the npm + binary release pipeline, required
  secrets, and trusted publishing (OIDC) with provenance

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). We self-host: every substantive change
to this repo is a cospec-typed OpenSpec change.

## Security

See [SECURITY.md](SECURITY.md).

<!-- bench:start -->

## Benchmark: cospec vs openspec

> **WARNING:** published while the working tree had uncommitted changes and the
> current branch was `worktree-bench-cospec-vs-openspec` (not `main`) — treat
> this as a point-in-time snapshot, not a release-verified result.

- commit:
  [`caf32af1414a`](https://github.com/aligned-team/cospec/commit/caf32af1414a77b367d4aa0cd27ef8e8d1941d37)
  on branch `worktree-bench-cospec-vs-openspec`
- published: 2026-07-21T17:20:34.706Z
- claude code: 2.1.211
- arms: cospec, openspec
- models: claude-opus-4-8/medium, claude-sonnet-5/high
- cells: 192 ran, 0 skipped, 192 total (repeats=3)
- judge: deepseek-v4-flash

| arm      | model           | n   | escaped‡ | review§ | plant¶ | cost($) | dur(ms) |
| -------- | --------------- | --- | -------- | ------- | ------ | ------- | ------- |
| cospec   | claude-opus-4-8 | 48  | 0.0/6.1  | 0.3     | 0%     | 1.0201  | 160185  |
| cospec   | claude-sonnet-5 | 48  | 0.0/6.1  | 0.4     | 0%     | 1.1197  | 192095  |
| openspec | claude-opus-4-8 | 48  | 0.0/6.1  | 0.3     | 0%     | 0.8172  | 127700  |
| openspec | claude-sonnet-5 | 48  | 0.0/6.1  | 0.4     | 0%     | 0.8894  | 168573  |

Full per-scenario metrics, statistics, and the metric legend:
[`packages/bench/RESULTS.md`](packages/bench/RESULTS.md).

<!-- bench:end -->

## License

[MIT](LICENSE) © 2026 [Aligned](https://aligned.team).
