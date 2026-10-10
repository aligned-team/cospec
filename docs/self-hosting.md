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
   OpenSpec 1.13.1, is a Bun CLI, treats the wrapped-tool failure modes as
   standing constraints); `rules:` are seeded, e.g. "every command change needs
   a contract or integration test task". Commit.
4. Land apply / archive / init / update / doctor and the harness generator; run
   `cospec init --harness claude,codex,opencode --no-gate` on this repo; commit
   the generated `.claude/`, `.agents/skills/`, `.codex/`, `.opencode/` files.
   Wire `generate:check` into pre-commit.
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

`update` honours the `profile`, `workflows` and `delivery` keys of the
machine-global OpenSpec config, and reads and rewrites the home-scoped skills
roots (`~/.minimax/skills`) of the rows it maintains, so `generate` and
`generate:check` run through `scripts/generate-self`, which points `HOME`,
`USERPROFILE`, `CODEX_HOME` and the four XDG directories at one empty directory
for the run, unsets `ZSH` and `ZSH_CUSTOM`, and sets `OPENSPEC_NO_COMPLETIONS=1`
so the first-run completion tip never stats a host shell file. The committed
files are the full twelve workflows, as skills and commands, on every host;
without it, a host whose config says `delivery: commands` would have `generate`
delete the committed skills and `generate:check` fail (`delivery: skills` does
the same to the commands), and a host holding an older cospec's skills under its
real home would see drift there and have them rewritten by `generate`. (A
`profile` or `workflows` key only picks what a row gets by default and never
removes an installed workflow, so it does not move the output.)
`test/integration/generate-self-home.test.ts` guards it two ways: a run over a
scratch HOME of stale skills and a `delivery: commands` config must report no
drift and leave that HOME untouched, and a run around a stand-in `bun` must see
all seven variables name the one empty directory, with the completion tip off
and `ZSH` and `ZSH_CUSTOM` unset.

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
