# Tasks

Each group ends in one commit with `mise run check` green. Groups run in order:
1 → 2 → 3 → 4 → 5 → 6, then group 7 after `unknown-option-contract` merges.
Groups 1, 2, 3 (task 3.4) and 5 all edit `apps/cli/src/core/root.ts`, so none of
them runs in parallel with another. Group 5 is gated on group 4's matrix. Before
the rebase, no task touches `cli.ts`, `index.ts`, a command parser, the command
table or the completion spec; the one post-rebase exception is task 7.2, marked
POST-REBASE.

## 1. Qualifying ancestor walk (track T1: `apps/cli/src/core/root.ts`, `apps/cli/test/unit/core/root.test.ts`)

- [x] 1.1 Add regression tests to `apps/cli/test/unit/core/root.test.ts` for a
      subdirectory of a planning root, a bare `openspec/` skipped mid-walk, the
      `$HOME/openspec/<id>` store layout, a symlinked cwd, and registered stores
      with no root, and verify each fails against the current `resolveRoot`
- [x] 1.2 Port the walk and classification into `root.ts`: canonical start,
      planning shape (`specs/` or `changes/` directory without
      `.openspec-store/store.yaml`), config file (`config.yaml`, else
      `config.yml`), bare directories skipped; verify the walk tests from 1.1
      pass
- [x] 1.3 Add `RootSource`, `ResolvedRoot` and `RootSelectionError` (diagnostic
      `{severity, code, message, target, fix}`, `Error.message` ending in a
      `Fix:` line) to `root.ts`, set `source` on every return path, and verify
      `mise run typecheck` passes with no change outside `root.ts`
- [x] 1.4 Raise `no_root_with_registered_stores` (registry read only when no
      qualifying root and no `defaultStore` exist) with upstream's message and
      fix text naming `cospec init`, keep the implicit cwd root when no store is
      registered, and give the existing unknown-store failures the
      `unknown_store` / `no_registered_stores` codes; verify the 1.1 registered-
      stores and `$HOME` tests pass
- [x] 1.5 Rewrite the `root.ts` header comment to describe the ported selection,
      and update the existing `root.test.ts` cases that assumed an
      uncanonicalized temp path or the cwd-only lookup; verify `mise run test`
      passes
- [x] 1.6 Run `mise run check` and commit the track

## 2. Store pointer shape and errors (track T2: `apps/cli/src/core/root.ts`, `apps/cli/test/unit/core/root.test.ts`, after group 1)

- [x] 2.1 Add regression tests for an unparseable pointer, a non-string pointer,
      an empty-string pointer, a `config.yml`-only pointer, and a pointer on a
      planning root, and verify each fails against group 1's resolver
- [x] 2.2 Change `configStorePointer` to return `{filePath, value}`,
      `{filePath}`, `{filePath: null}`, `{filePath, malformed: 'unparseable'}`
      or `{filePath, malformed: 'non_string'}` (empty, comment-only and
      non-mapping documents are `{filePath}`), replacing the unit test that
      asserted a non-string value is ignored; verify the shape tests pass
- [x] 2.3 In `resolveRoot`, follow a pointer only on a config-only root, warn
      once on stderr when a planning root carries one, fail malformed pointers
      with `invalid_store_pointer` and an empty id with `invalid_store_id`, and
      prefix pointer and `defaultStore` store failures with
      `Declared in <cfg>: ` and `Global defaultStore '<id>': `; verify every 2.1
      test passes and each `fix` names `cospec`, never bare `openspec`
- [x] 2.4 Add regression tests for store health, each selecting a sandboxed
      store by `--store`: metadata `.openspec-store/store.yaml` missing, its
      `id` changed, its YAML unparseable, `openspec/config.yaml` removed, and
      `openspec/specs` replaced by a file; plus the missing-metadata case
      reached through a config-only pointer and through `defaultStore`; verify
      each fails against the resolver so far (it returns the broken store)
- [x] 2.5 Port `inspectRegisteredStore` inline into `resolveStore` (design D9):
      read the metadata with the `yaml` parser, then stat the root as
      `inspectOpenSpecRoot` does; fail with `store_identity_mismatch`,
      `invalid_store_metadata` or `unhealthy_store_root` using the design's
      verbatim messages and problem strings, with `openspec store doctor`
      respelled `cospec store doctor` in message and fix, and the
      `Declared in <cfg>: ` / `Global defaultStore '<id>': ` prefixes for
      pointer and default selections; verify every 2.4 test passes
- [x] 2.6 Add a failing test, then print the banner (design D10): widen
      `resolveRoot`'s flags to `{ store?: string; json?: boolean }` with no
      caller change, and write `Using OpenSpec root: <id> (<base>)` verbatim to
      stderr once when the resolved root has a `store` and `json` is not set;
      verify it prints for `--store`, pointer and `defaultStore` roots, never
      for a local or implicit root, and never under `json: true`
- [x] 2.7 Verify `resolveRoot` still spawns nothing on a local root (a stubbed
      spawn records zero calls for a planning root, a config-only root and a
      planning root with a pointer), and that the store-health check adds no
      spawn to a store selection
- [x] 2.8 Run `mise run check` and commit the track

## 3. `templates` and `schema` spawn in the root (track T3: `apps/cli/src/core/passthrough-command.ts`, `apps/cli/src/core/openspec.ts`, `apps/cli/src/commands/templates.ts`, `apps/cli/src/commands/schema.ts`, `apps/cli/test/unit/core/passthrough.test.ts`)

- [x] 3.1 Add a stubbed-spawn unit test to
      `apps/cli/test/unit/core/passthrough.test.ts` asserting that
      `spawnInRoot: true` spawns in `root.base` with no `--store`, and verify it
      fails before the option exists
- [x] 3.2 Add `spawnInRoot` to `PassthroughCommandOptions` and honour it in
      `callPassthrough`; verify 3.1 passes and the existing passthrough tests
      are unchanged
- [x] 3.3 Set `spawnInRoot: true` in `commands/templates.ts` and
      `commands/schema.ts`, leaving the reserved-canon-name guard ahead of the
      spawn; verify `cospec templates --json --store <id>` and
      `cospec schema which feat --json --store <id>` exit 0 against a sandboxed
      store
- [x] 3.4 Add `suppressRelayedStderrLine` to `apps/cli/src/core/openspec.ts` (it
      adds to a set of registered lines), call it from `resolveRoot` with the
      exact ignored-pointer warning line and the exact banner line it printed,
      and have `passthroughOpenspec` drop every registered line from the stderr
      it returns; verify `cospec schemas --json` and `cospec view` on a planning
      root with a pointer show the warning once, and
      `cospec schemas --store <id>` and `cospec show <item> --store <id>` in
      human mode show the banner once
- [x] 3.5 Run `mise run check` and commit the track

## 4. Differential matrix against the pinned binary (track T4: `apps/cli/test/contract/root-resolution.test.ts`)

- [x] 4.1 Create `apps/cli/test/contract/root-resolution.test.ts` with the
      sandboxed fixture builder (own `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, `HOME`,
      stores registered through the pinned binary's
      `store setup --path     --no-init-git`) and an oracle helper returning the
      pinned binary's `list --json` `.root` or `.status[0].code`; use
      `apps/cli/test/contract/support/upstream-oracle.ts` if it is on `main`,
      otherwise a local helper,
      `apps/cli/test/contract/support/root-sandbox.ts`, built on the existing
      `openspec()` helper in `apps/cli/test/fixtures/support.ts`
      (`upstream-oracle.ts` was not on `main`, so the local helper is in use
      until task 7.3)
- [x] 4.2 Add fixtures M1–M27 exactly as the verification ledger's group 1
      defines them, each asserting that in-process `resolveRoot` and the oracle
      agree on `{path, source, store_id}` or on the diagnostic code, and verify
      the matrix passes (the fixtures are in; each `cospec:` row the current
      resolver fails is a `test.todo` tagged `[until T1]` or `[until T2]`, and
      the track that makes a row pass under `bun test --todo` turns it into a
      plain `test`; tick this once no todo row remains) (groups 1 and 2 turned
      every `[until T1]`/`[until T2]` row into a plain `test`; only the two
      `[until group 5]` `show --json` rows remain todo)
- [ ] 4.3 Add the command-level rows (ledger groups 2 and 3): `cospec list`,
      `cospec new`, `cospec status`, `cospec schemas`, `cospec templates` and
      `cospec schema which|validate|fork|init` driven from the fixtures, with
      stores set up by `cospec store setup` where typed schemas are needed;
      verify every row passes
- [ ] 4.4 Confirm the regression rows (ledger 1.1, 1.3, 1.6, 1.7, 1.11,
      1.15–1.18, 1.23–1.26, 2.1, 2.7, 3.1, 3.3) fail with this change's code
      reverted and pass with it applied, and record the observed before/after in
      the ledger
- [ ] 4.5 Run `mise run check` and commit the track

## 5. Stop threading `--store` for declared and default roots (track T3 follow-on: `apps/cli/src/core/root.ts`, `apps/cli/test/contract/root-resolution.test.ts`, `apps/cli/test/unit/core/root.test.ts`; after group 4)

- [x] 5.1 Add the `show --json` differential rows (ledger 2.8): the same change
      in stores `alpha` and `beta`, `cospec show <change> --json` and
      `openspec show <change> --json` from M4's pointer directory, from M13's
      `defaultStore` directory, and with an explicit `--store alpha`, comparing
      `.root`; verify the pointer and default rows fail (cospec relays
      `source: store`) while the explicit row passes
- [x] 5.2 Only with group 4's matrix green on M4, M5, M11 and M13, set
      `storeArgs` to `['--store', id]` in `root.ts` for `source: store` alone
      and to `[]` for `declared` and `global_default` (design D11), updating the
      unit tests that asserted `storeArgs` for pointer and default roots; verify
      5.1 passes, the whole matrix still passes, and `view`, `templates` and
      `schema` are unaffected
- [x] 5.3 Run `mise run check` and commit the track

## 6. Docs

- [x] 6.1 Rewrite "Root resolution order" in `docs/stores.md` to the ported
      selection and link to the site page for the user-facing account
- [x] 6.2 Rewrite "Resolution order" in `apps/docs/concepts/stores.md` (the page
      that owns the fact): the walk, the classification, the `$HOME` layout, the
      pointer fallback and its warning, the store-health check, the
      `Using OpenSpec root:` banner, and the `invalid_store_pointer`,
      `no_root_with_registered_stores`, `store_identity_mismatch` and
      `unhealthy_store_root` errors verbatim
- [x] 6.3 Update `apps/docs/reference/commands.md`: the `--store` global-flag
      row and the read-only-commands section say `templates` and `schema` reach
      every root (store-backed or walked) by working directory, stated as a
      deliberate superset of `openspec`, which reads its own working directory
      there; that every command resolves the enclosing root from a subdirectory;
      and that wrapped calls receive `--store` only for an explicit `--store`
- [x] 6.4 Update the `store:` paragraph in
      `apps/docs/reference/configuration.md` to say the key redirects only from
      an `openspec/` with no `specs/` or `changes/`, linking to the Stores page
- [x] 6.5 Run `mise run docs:build` and `mise run check`, record the docs rows
      in the ledger, and commit

## 7. POST-REBASE: rebase, `--json` failure document and parity gates (after `unknown-option-contract` merges)

- [ ] 7.1 POST-REBASE: once `unknown-option-contract` has merged, rebase onto
      `main` with `--force-with-lease`, resolving any
      `apps/docs/reference/commands.md` overlap by keeping both changes' facts
- [ ] 7.2 POST-REBASE (design D12): add failing `--json` rows (ledger 5.4), then
      add one `RootSelectionError` branch to the top-level error rendering where
      `unknown-option-contract` emits its own `--json` envelope, so a resolver
      hard-error under `--json` prints exactly one JSON document
      `{"status": [diagnostic]}` on stdout, no `cospec:` prose on stderr, and
      exits 1 (the generic envelope; `cli-surface-parity` later adds each
      command's `changes: []`/`root: null`); verify the rows pass and human mode
      is unchanged
- [ ] 7.3 POST-REBASE: switch the oracle calls in `root-resolution.test.ts` from
      the interim `apps/cli/test/contract/support/root-sandbox.ts` helper to
      `upstream-oracle.ts` (keeping the sandbox builder only where
      `upstream-oracle.ts` has no equivalent), and verify the matrix still
      passes
- [ ] 7.4 POST-REBASE: run `reachability.test.ts` and verify
      `parity-pending.yaml` carries no entry tagged for this change
- [ ] 7.5 POST-REBASE: verify `git diff --name-only main...HEAD` touches none of
      `unknown-option-contract`'s files except the one handler file 7.2 edits,
      and that reverting this change's commits on a scratch branch leaves
      `mise run test` green
- [ ] 7.6 POST-REBASE: run `mise run check`, mark every verification row with
      its observed result, and commit
