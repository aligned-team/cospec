## 1. Generic disciplined passthrough plumbing (WI-1)

- [x] 1.1 Add `passthroughOpenspec(args, {cwd, storeArgs, expect})` to
      `apps/cli/src/core/openspec.ts`: version-asserted spawn reusing
      `spawnOpenspec`, an exit-code allow-list (default `[0, 1]`), a stdout
      deny-list, and an optional post-condition hook
- [x] 1.2 Guarantee exactly one JSON document on stdout for `--json` callers,
      mirroring openspec's `status:[{severity,code,message,fix?}]` failure
      shape; never throw past a `--json` boundary, set exit 1 instead
- [x] 1.3 Add `apps/cli/src/core/passthrough-command.ts`: a shared helper that
      threads `GlobalFlags` (`--store` via `resolveRoot` → `root.storeArgs`,
      `--json`, `--no-color`) and maps openspec exit codes to cospec `EXIT`
- [x] 1.4 Unit-test the runner directly in
      `apps/cli/test/unit/core/passthrough.test.ts`: exit-code allow-list,
      deny-list trip, JSON-doc-on-failure invariant, and a stubbed-spawn test

## 2. cospec store group — first-class wrapped + auto cospec-init (WI-2)

- [x] 2.1 Add `store` to `COMMANDS` + `COMMAND_MODULES` (static import) in
      `apps/cli/src/cli.ts`
- [x] 2.2 Implement `apps/cli/src/commands/store.ts` with subcommands
      `setup|register|unregister|remove|list|ls|doctor`, wrapping each via
      `passthroughOpenspec` with typed JSON post-conditions (assert `store.root`
      / `registry.registered` / `registry.removed` against disk, never exit code
      alone); preserve `--path`/`--remote`/`--id`/`--yes`/
      `--json`/`--no-init-git`
- [x] 2.3 On successful `store setup`/`store register`, auto-run
      `cospec init     <resolved-store-root> --harness none` unless
      `--no-cospec-init` is given; render openspec's JSON as an ID/Location
      table in human mode
- [x] 2.4 Contract test (real pinned binary) in
      `apps/cli/test/contract/store.test.ts`: `store setup` creates and
      registers a root on disk and the auto-init writes `openspec/schemas/**`;
      `store remove` deletes and unregisters
- [x] 2.5 Integration test in `apps/cli/test/integration/store.test.ts`:
      `cospec store ls` after setup shows the store

## 3. cospec context passthrough (WI-3)

- [x] 3.1 Add `context` to `COMMANDS` + `COMMAND_MODULES` in
      `apps/cli/src/cli.ts`
- [x] 3.2 Implement `apps/cli/src/commands/context.ts` as a disciplined
      passthrough of `openspec context` threading `--store` (`root.storeArgs`),
      `--json`, `--code-workspace <path>`, `--force`; post-condition asserts the
      file exists on disk when `--code-workspace` is given and exit is 0
- [x] 3.3 Integration test in `apps/cli/test/integration/context.test.ts`:
      `context --json` in a store-backed repo returns `members[]`;
      `context     --code-workspace` writes the file and refuses overwrite
      without `--force`

## 4. cospec workset group passthrough (WI-4)

- [x] 4.1 Add `workset` to `COMMANDS` + `COMMAND_MODULES` in
      `apps/cli/src/cli.ts`
- [x] 4.2 Implement `apps/cli/src/commands/workset.ts`: `create`/`list`/
      `remove` as disciplined passthroughs of `openspec workset <sub>` (preserve
      `--member`/`--tool`/`--yes`/`--json`; JSON one-document failure mirror)
- [x] 4.3 Implement `workset open` as a terminal-handover exec: spawn
      `openspec workset open` with inherited stdio, `shell: false`, propagate
      the child's exit code (no `--json`, matching openspec's own rejection)
- [x] 4.4 Integration test in `apps/cli/test/integration/workset.test.ts`:
      `workset create` then `list` shows it; `workset remove` without `--yes` is
      refused in non-interactive/`--json` mode; `open` is smoke-tested for arg
      forwarding only

## 5. cospec read passthroughs: show + view (WI-5)

- [x] 5.1 Add `show` and `view` to `COMMANDS` + `COMMAND_MODULES` in
      `apps/cli/src/cli.ts`
- [x] 5.2 Implement `apps/cli/src/commands/show.ts`: forwards item-name +
      `--type`/`--json`/`--deltas-only`/`--requirements`/`--no-scenarios`/ `-r`
      and `--store`; JSON post-condition validates parseable JSON on `--json`;
      deny-list ambiguous/unknown-item error markers surface as exit 1
- [x] 5.3 Implement `apps/cli/src/commands/view.ts` as a thin dashboard
      passthrough; exit 1 if `openspec/` is missing
- [x] 5.4 Integration test in `apps/cli/test/integration/show.test.ts`:
      `show     <change> --json` returns `{id, deltas, ...}`;
      `show <spec> --json` returns requirements; `view` renders the dashboard
      header

## 6. cospec schema-inspection passthroughs (WI-6)

- [x] 6.1 Add `schemas`, `schema`, `templates` to `COMMANDS` + `COMMAND_MODULES`
      in `apps/cli/src/cli.ts`
- [x] 6.2 Implement `apps/cli/src/commands/schemas.ts` and
      `apps/cli/src/commands/templates.ts` as read-only passthroughs (`--json`)
- [x] 6.3 Implement `apps/cli/src/commands/schema.ts` exposing only read-only
      `which` and `validate` (passthrough with `--json`/`--all`/ `--verbose`);
      explicitly do not wire `fork`/`init` — print not-supported guidance
      pointing at the canon workflow and exit 1
- [x] 6.4 Unit/integration test in
      `apps/cli/test/integration/schema-inspect.test.ts`: `schemas --json` lists
      the 11 cospec types; `schema validate <type>` passes on a generated
      schema; `schema fork` prints the not-supported guidance and exits 1

## 7. Extend cospec list --specs and validate --all/--specs (WI-7)

- [x] 7.1 `apps/cli/src/commands/list.ts`: add `--specs` to list specs (delegate
      to `openspec list --specs --json`, render a spec table)
- [x] 7.2 `apps/cli/src/commands/validate.ts`: add `--all`/`--specs`/
      `--changes` bulk modes and standalone spec validation by delegating those
      paths to `openspec validate`; merge delegated spec issues via the existing
      `mapDelegated` path; preserve current single-change behavior and exit
      codes (bulk failed>0 → 1)
- [x] 7.3 Unit test in `apps/cli/test/unit/commands/commands.test.ts`:
      `list     --specs` renders parsed specs
- [x] 7.4 Unit test coverage for `validate --specs` delegation and
      `validate     --all` aggregation is exercised by the existing
      `cospec-validate-all` gate task against this repo's real tree

## 8. Extend cospec doctor with openspec relationship/store health (WI-8)

- [x] 8.1 In `apps/cli/src/commands/doctor.ts` add a delegated section: when the
      resolved root is store-backed (or `references:` is declared), delegate
      `openspec doctor --json` and fold its `status[]` diagnostics into cospec's
      findings (read-only, never repair)
- [x] 8.2 Add a note-level finding if a stray openspec config
      profile/`workflows` block is detected (superseded by cospec); keep
      exit-1-on-ERROR semantics
- [x] 8.3 Integration test in
      `apps/cli/test/integration/doctor-relationship.test.ts`: doctor on a
      store-backed repo reports store metadata + git facts; doctor on a repo
      with a broken references pointer surfaces the openspec diagnostic

## 9. Docs/canon/agents consolidation + skills generation + final gate (WI-9)

- [x] 9.1 Flip `docs/stores.md`'s ownership table (store/context/workset move
      from OpenSpec-owned to cospec-owned); document `store setup`'s auto
      `cospec init` and `--no-cospec-init`
- [x] 9.2 Update `.agents/shared.md` (the "never call bare openspec"
      discipline + new commands) and run `mise run agents:sync`
- [x] 9.3 Update `docs/architecture.md` (new passthrough-runner wrapped-call
      pattern), `README.md`, and `apps/cli/README.md` command lists
- [x] 9.4 Canon-workflow skill entries for store/show/context were evaluated and
      intentionally not added — these are single-shot passthroughs, not
      multi-step lifecycle workflows, and are surfaced via `cospec --help`, the
      docs, and the shared agent context instead (no canon drift)
- [x] 9.5 `mise run generate:check` reports no drift (canon untouched; only docs
      and agent context changed)
- [x] 9.6 Run the full `mise run check` gate green; this is the
      integration/consolidation step and the self-hosted cospec change's archive
