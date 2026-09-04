## Why

OpenSpec 1.11.0 — the version cospec pins — writes its Codex skills to the
vendor-neutral `.agents/skills/` root, and so do Zed, Antigravity and every
other AGENTS.md-aware assistant. cospec still writes its Codex skills to
`.codex/skills/`, which no longer matches where Codex looks, and it offers no
target at all for the growing set of assistants that read only the shared root.

The gap is compounding: `openspec/specs/opsx-migration-detection/spec.md`
currently promises cospec will never generate into `.agents/`, which locks
cospec out of the one directory the ecosystem has converged on. Fixing this now
— while `.codex/skills` installs are few and a hash-gated migration can move
them safely — costs one change; fixing it later costs a bigger migration and a
longer stretch of Codex users whose skills silently do not load.

## What Changes

- New `agents` harness target rendering the twelve cospec skills to
  `.agents/skills/cospec-<skill>/SKILL.md`. It emits no slash commands, because
  the shared root has no command surface.
- BREAKING (layout): the `codex` target's skills move from `.codex/skills/` to
  `.agents/skills/`. `codex` stays a distinct selectable harness — it keeps its
  own detection path and still emits `.codex/rules/cospec.rules` — but its skill
  files are now byte-identical to the `agents` target's, so selecting both
  writes each file exactly once.
- Body rewriting becomes dialect-keyed rather than harness-keyed. The new
  `shared` dialect respells `/cospec:<id>` as
  `$cospec-<skill> (Codex) or /cospec-<skill> (other agents)`, using the skill
  directory name because no command file resolves under the shared root.
  `canonical` (Claude) and `opencode` behaviour are unchanged.
- Non-destructive migration of existing `.codex/skills/cospec-*` installs: a
  legacy file is deleted only after its replacement was rendered and only when
  it still hashes to its own stamped `contentHash` (or `--force` was passed).
  Hand-edited and foreign files stay put, `.codex/rules/` and `.codex/` are
  never removed, and directories are pruned with `rmdir`-if-empty.
- `cospec doctor` gains a `legacy-layout` WARNING per remaining legacy file, and
  a remaining legacy layout counts as drift, so `cospec update --check` exits 1
  until it clears.
- BREAKING (behaviour): `--harness all` now means four targets and begins
  writing `.agents/skills` in repos that previously passed `all`.
- Auto-detection keys `agents` on `.agents/skills`, not on a bare `.agents/`,
  which commonly holds only shared notes. The fresh-repo default stays `claude`.
- Double-counting fixes in `init`'s opsx scan and `doctor`'s harness walk, now
  that `.agents/` (a harness dir) strictly contains `.agents/skills` (the shared
  opsx root).

## Capabilities

### New Capabilities

<!-- None. The shared-root behaviour extends the existing harness capability. -->

### Modified Capabilities

- `harness-workflows`: the rendered harness set becomes four; the shared
  `.agents/skills` root renders one dialect byte-identically for `codex` and
  `agents`; legacy `.codex/skills` installs are migrated non-destructively.
- `opsx-migration-detection`: `.agents/` stops being scan-only — cospec now
  generates its own `cospec-*` skills into the same root openspec writes its
  `openspec-*` leftovers to, and the shape-gated scan must keep them apart.

## Impact

- Canon: `apps/cli/src/canon/workflows/harness.yaml` — `bodyDialect` per
  harness, new `agents` surface, `legacySkillDirs` for `codex`.
- Engine: `apps/cli/src/harness/adapters.ts` (`HarnessName` union gains
  `agents`; `transformBodyForHarness` becomes
  `transformBody(body, dialect, skillById)` — BREAKING for that internal
  export), `apps/cli/src/harness/render.ts` (path dedupe with a
  differing-content throw), new `apps/cli/src/harness/legacy-skills.ts`.
- Commands: `apps/cli/src/commands/{init,update,doctor}.ts`,
  `apps/cli/src/cli.ts` usage line. `GenerateResult` gains `migration`;
  `cospec init --json` and `cospec update --json` gain a top-level `migration`.
- Self-hosting: this repo's own twelve `.codex/skills/cospec-*/SKILL.md` move to
  `.agents/skills/`, and `.prettierignore` must exempt the new path or
  `format:fix` and `generate:check` become mutually unsatisfiable.
- Docs: `apps/docs/{index.md,guide/harness-setup.md,guide/installation.md,`
  `reference/commands.md,reference/configuration.md}`,
  `docs/{harness-integration.md,self-hosting.md}`, `README.md`,
  `CONTRIBUTING.md`, `.agents/shared.md` (then `mise run agents:sync`).
- Migration for users: automatic on the next `cospec init`/`cospec update`;
  hand-edited legacy copies are reported, not touched.

## Surfaces

- [x] interactive — new `--harness agents` value, migration receipt lines, and a
      new `legacy-layout` doctor finding
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [x] agent-behavior — generated skill bodies change their invocation spelling
      and their on-disk location for Codex and every shared-root assistant
