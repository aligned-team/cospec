# cospec

**cospec** — conventional openspec: OpenSpec change management, sized to your
commit type. `feat` gets the full treatment; `ci` takes two minutes.

---

## Quick start

Not yet published. From a clone of this repo:

```bash
git clone https://github.com/aligned-team/cospec
cd cospec
mise install && bun install
mise run cospec -- init
```

Once published (npm scope reserved, not yet released):

```bash
bunx @aligned-team/cospec init   # not yet published
```

`cospec init` scaffolds `openspec/`, materializes the eleven typed schemas, and
generates agent skills for your harness. It is idempotent — run it again and a
clean tree stays clean.

---

## What is this

cospec is a thin wrapper around
[OpenSpec](https://github.com/Fission-AI/OpenSpec) `1.5.0` that maps the
spec-driven workflow onto your conventional-commit type. One schema per type;
the heavier the type, the more the workflow asks of you.

| type       | proposal | blocking-changes | specs | design | tasks | what it's for                         |
| ---------- | -------- | ---------------- | ----- | ------ | ----- | ------------------------------------- |
| `feat`     | full     | full             | ✅    | opt    | ✅    | a new feature — the full workflow     |
| `fix`      | full     | full             | opt   | opt    | ✅    | a bug fix                             |
| `perf`     | full     | full             | opt   | opt    | ✅    | performance, behavior unchanged       |
| `refactor` | full     | full             | opt   | ✅     | ✅    | restructure, behavior unchanged       |
| `revert`   | full     | full             | opt   | ✗      | ✅    | roll back a shipped change            |
| `build`    | lite     | lite             | ✗     | ✗      | ✅    | build config, dependencies, lockfiles |
| `ci`       | lite     | lite             | ✗     | ✗      | ✅    | CI workflows and automation           |
| `chore`    | lite     | lite             | ✗     | ✗      | ✅    | maintenance                           |
| `docs`     | lite     | lite             | ✗     | ✗      | ✅    | documentation                         |
| `style`    | lite     | lite             | ✗     | ✗      | ✅    | formatting, no semantic change        |
| `test`     | lite     | lite             | ✗     | ✗      | ✅    | tests for already-specified behavior  |

✅ required · opt optional · ✗ forbidden (`cospec validate` errors if present).
Full matrix and per-type rationale: [docs/schemas.md](docs/schemas.md).

cospec never replaces OpenSpec — it wraps the real, version-pinned binary
(resolved by path, spawned, never `$PATH`) and adds typed schemas, real change
validation with stable rule IDs, a deterministic `apply` gate, a
filesystem-verified `archive`, and a blocking-changes ledger with auto-sync.

---

## Commands

| command                          | what it does                                                    |
| -------------------------------- | --------------------------------------------------------------- |
| `cospec init [path]`             | scaffold `openspec/`, schemas, and harness files (idempotent)   |
| `cospec update [--check]`        | re-generate managed files from canon; `--check` is a drift gate |
| `cospec doctor`                  | read-only health check with a remedy per finding                |
| `cospec new <type> <slug>`       | create a typed change; prints the artifact plan                 |
| `cospec validate [name]`         | validate changes and specs; `--strict` promotes warnings        |
| `cospec status` / `cospec list`  | change status with type, gate, and archive-readiness columns    |
| `cospec instructions <artifact>` | print the authoring instruction for one artifact                |
| `cospec apply <change>`          | the gate — exit 0 clear, 2 blocked, 3 soft-blocked              |
| `cospec archive <change>`        | validate, archive, verify the move, fan out blocker sync        |
| `cospec sync-blockers`           | check off blocker entries whose target has shipped              |

Global flags on every command: `--json`, `--no-color`, `--cwd <path>`. Full
reference: [docs/validation.md](docs/validation.md) (rules) and
[docs/apply-archive.md](docs/apply-archive.md) (gate + archive algorithms).

---

## The workflow

1. **new** — `cospec new feat add-widget` picks the type and writes
   `.openspec.yaml`; cospec prints how heavy the type is.
2. **propose** — author each artifact with
   `cospec instructions <artifact> --change add-widget`, then
   `cospec validate add-widget --strict`.
3. **apply** — `cospec apply add-widget` is the gate. Obey the exit code: `0`
   clear (work the tasks), `2` blocked (stop, report the blockers), `3`
   soft-blocked (confirm with the user, then re-run with `--allow-soft`). The
   gate is deterministic — never re-derive it from files.
4. **implement** — check off `tasks.md` as you go.
5. **archive** — `cospec archive add-widget` validates, gates on unchecked
   tasks, delegates to `openspec archive`, verifies the directory actually moved
   on disk, and checks off this change's slug in every other change's
   blocking-changes ledger.
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
- **Codex** — `.codex/skills/cospec-*/SKILL.md` plus
  `.codex/rules/cospec.rules`, which pre-approves the read-only and gate calls
  (`archive` is intentionally not pre-approved). Skills load per session.
- **OpenCode** — `.opencode/commands/cospec-*.md` (full bodies) and
  `.opencode/skills/cospec-*/SKILL.md`. Reload the project.

Details and a per-harness smoke checklist:
[docs/harness-integration.md](docs/harness-integration.md).

---

## How it relates to OpenSpec

cospec pins `@fission-ai/openspec` `1.5.0` for its own dev/CI and accepts any
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

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). We self-host: every substantive change
to this repo is a cospec-typed OpenSpec change.

## Security

See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 [Aligned](https://aligned.team).
