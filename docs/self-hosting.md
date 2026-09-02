# Self-hosting

cospec manages its own `openspec/` tree. Every substantive change to this repo
is a cospec-typed OpenSpec change, gated by `cospec apply` and shipped by
`cospec archive`. Dogfooding is the point — we feel the managed-file friction,
the gate ergonomics, and the archive verifier before any consumer does.

## Bootstrap principle

cospec runs **from source** (`mise run cospec --` →
`bun run apps/cli/src/index.ts --`), and the schemas are plain checked-in files
that the raw OpenSpec CLI resolves with zero cospec involvement. No compiled
binary, no npm publish, no circularity.

## Bootstrap sequence

Each step leaves the repo green.

1. Land the repo-canon scaffolding and sweep any legacy tool name to the current
   `cospec` name. Hooks temporarily keep only
   `openspec validate --specs --strict` (an honest gap: change validation is off
   until `cospec validate` exists).
2. Land the canon, the composer, and `cospec validate` / `new` /
   `sync-blockers`. Flip the hk hooks to `cospec validate --all --strict` plus
   the sync-blockers steps.
3. Materialize `openspec/{config.yaml, schemas/**, .cospec-manifest.json}`.
   `config.yaml` sets `schema: feat`; `context:` describes cospec itself (wraps
   OpenSpec 1.11.0, is a Bun CLI, treats the wrapped-tool failure modes as
   standing constraints); `rules:` are seeded, e.g. "every command change needs
   a contract or integration test task". Commit.
4. Land apply / archive / init / update / doctor and the harness generator; run
   `cospec init --harness claude,codex,opencode --no-gate` on this repo; commit
   the generated `.claude/`, `.codex/`, `.opencode/` files. Wire
   `generate:check` into pre-commit.
5. From here, every substantive change is a cospec-typed change in
   `openspec/changes/`. The repo's own history becomes the fixture corpus.
6. Harvest the gate templates into `canon/gate/` and retire the bootstrap
   branch.

## Drift discipline

`openspec/schemas/**` and the self-repo harness files are
generated-and-committed. `mise run generate:check` (which is
`cospec update --check` on this repo) runs in pre-commit and CI, so a hand-edit
to a generated file fails the commit — the same pattern as the `agents:sync` /
`agents:check` pair for `CLAUDE.md` / `AGENTS.md`. A cospec version bump
regenerates the `generatedBy` frontmatter lines as part of the version-stamp
task, in the same commit.

## The everyday loop

```bash
mise run cospec -- new feat add-x        # pick the type; read the artifact plan
# author artifacts with `cospec instructions <artifact> --change add-x`
mise run cospec -- validate add-x --strict
mise run cospec -- apply add-x           # the gate — obey the exit code
# implement; check off tasks.md
mise run cospec -- archive add-x         # validate, archive, verify, fan out
```

Never hand-edit `openspec/changes/` state and never call bare `openspec`. If a
hook fails, fix the root cause — never `--no-verify`.
