# Tasks

Each group ends in one commit with `mise run check` green. Groups 1 and 2 are
one track in sequence (both own `apps/cli/src/core/root.ts`); group 3 owns
disjoint files and may run alongside them. No task touches `cli.ts`, a command
parser, the command table or the completion spec.

## 1. Qualifying ancestor walk (track T1: `apps/cli/src/core/root.ts`, `apps/cli/test/unit/core/root.test.ts`)

- [ ] 1.1 Add regression tests to `apps/cli/test/unit/core/root.test.ts` for a
      subdirectory of a planning root, a bare `openspec/` skipped mid-walk, the
      `$HOME/openspec/<id>` store layout, a symlinked cwd, and registered stores
      with no root, and verify each fails against the current `resolveRoot`
- [ ] 1.2 Port the walk and classification into `root.ts`: canonical start,
      planning shape (`specs/` or `changes/` directory without
      `.openspec-store/store.yaml`), config file (`config.yaml`, else
      `config.yml`), bare directories skipped; verify the walk tests from 1.1
      pass
- [ ] 1.3 Add `RootSource`, `ResolvedRoot` and `RootSelectionError` (diagnostic
      `{severity, code, message, target, fix}`, `Error.message` ending in a
      `Fix:` line) to `root.ts`, set `source` on every return path, and verify
      `mise run typecheck` passes with no change outside `root.ts`
- [ ] 1.4 Raise `no_root_with_registered_stores` (registry read only when no
      qualifying root and no `defaultStore` exist) with upstream's message and
      fix text naming `cospec init`, keep the implicit cwd root when no store is
      registered, and give the existing unknown-store failures the
      `unknown_store` / `no_registered_stores` codes; verify the 1.1 registered-
      stores and `$HOME` tests pass
- [ ] 1.5 Rewrite the `root.ts` header comment to describe the ported selection,
      and update the existing `root.test.ts` cases that assumed an
      uncanonicalized temp path or the cwd-only lookup; verify `mise run test`
      passes
- [ ] 1.6 Run `mise run check` and commit the track

## 2. Store pointer shape and errors (track T2: `apps/cli/src/core/root.ts`, `apps/cli/test/unit/core/root.test.ts`, after group 1)

- [ ] 2.1 Add regression tests for an unparseable pointer, a non-string pointer,
      an empty-string pointer, a `config.yml`-only pointer, and a pointer on a
      planning root, and verify each fails against group 1's resolver
- [ ] 2.2 Change `configStorePointer` to return `{filePath, value}`,
      `{filePath}`, `{filePath: null}`, `{filePath, malformed: 'unparseable'}`
      or `{filePath, malformed: 'non_string'}` (empty, comment-only and
      non-mapping documents are `{filePath}`), replacing the unit test that
      asserted a non-string value is ignored; verify the shape tests pass
- [ ] 2.3 In `resolveRoot`, follow a pointer only on a config-only root, warn
      once on stderr when a planning root carries one, fail malformed pointers
      with `invalid_store_pointer` and an empty id with `invalid_store_id`, and
      prefix pointer and `defaultStore` store failures with
      `Declared in <cfg>: ` and `Global defaultStore '<id>': `; verify every 2.1
      test passes and each `fix` names `cospec`, never bare `openspec`
- [ ] 2.4 Verify `resolveRoot` still spawns nothing on a local root (a stubbed
      spawn records zero calls for a planning root, a config-only root and a
      planning root with a pointer)
- [ ] 2.5 Run `mise run check` and commit the track

## 3. `templates` and `schema` spawn in the root (track T3: `apps/cli/src/core/passthrough-command.ts`, `apps/cli/src/core/openspec.ts`, `apps/cli/src/commands/templates.ts`, `apps/cli/src/commands/schema.ts`, `apps/cli/test/unit/core/passthrough.test.ts`)

- [ ] 3.1 Add a stubbed-spawn unit test to
      `apps/cli/test/unit/core/passthrough.test.ts` asserting that
      `spawnInRoot: true` spawns in `root.base` with no `--store`, and verify it
      fails before the option exists
- [ ] 3.2 Add `spawnInRoot` to `PassthroughCommandOptions` and honour it in
      `callPassthrough`; verify 3.1 passes and the existing passthrough tests
      are unchanged
- [ ] 3.3 Set `spawnInRoot: true` in `commands/templates.ts` and
      `commands/schema.ts`, leaving the reserved-canon-name guard ahead of the
      spawn; verify `cospec templates --json --store <id>` and
      `cospec schema which feat --json --store <id>` exit 0 against a sandboxed
      store
- [ ] 3.4 Add `suppressRelayedStderrLine` to `apps/cli/src/core/openspec.ts`,
      call it from `resolveRoot` with the exact ignored-pointer warning line it
      printed, and have `passthroughOpenspec` drop that line from the stderr it
      returns; verify `cospec schemas --json` and `cospec view` on a planning
      root with a pointer show the warning once
- [ ] 3.5 Run `mise run check` and commit the track

## 4. Differential matrix against the pinned binary (track T4: `apps/cli/test/contract/root-resolution.test.ts`)

- [ ] 4.1 Create `apps/cli/test/contract/root-resolution.test.ts` with the
      sandboxed fixture builder (own `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, `HOME`,
      stores registered through the pinned binary's
      `store setup --path     --no-init-git`) and an oracle helper returning the
      pinned binary's `list --json` `.root` or `.status[0].code`; use
      `apps/cli/test/contract/support/upstream-oracle.ts` if it is on `main`,
      otherwise the existing `openspec()` helper in
      `apps/cli/test/fixtures/support.ts`
- [ ] 4.2 Add fixtures M1–M21 exactly as the verification ledger's group 1
      defines them, each asserting that in-process `resolveRoot` and the oracle
      agree on `{path, source, store_id}` or on the diagnostic code, and verify
      the matrix passes
- [ ] 4.3 Add the command-level rows (ledger groups 2 and 3): `cospec list`,
      `cospec new`, `cospec status`, `cospec schemas`, `cospec templates` and
      `cospec schema which|validate|fork|init` driven from the fixtures, with
      stores set up by `cospec store setup` where typed schemas are needed;
      verify every row passes
- [ ] 4.4 Confirm the regression rows (ledger 1.1, 1.3, 1.6, 1.7, 1.11,
      1.15–1.18, 2.1, 3.1, 3.3) fail with this change's code reverted and pass
      with it applied, and record the observed before/after in the ledger
- [ ] 4.5 Run `mise run check` and commit the track

## 5. Docs

- [ ] 5.1 Rewrite "Root resolution order" in `docs/stores.md` to the ported
      selection and link to the site page for the user-facing account
- [ ] 5.2 Rewrite "Resolution order" in `apps/docs/concepts/stores.md` (the page
      that owns the fact): the walk, the classification, the `$HOME` layout, the
      pointer fallback and its warning, and the `invalid_store_pointer` and
      `no_root_with_registered_stores` errors verbatim
- [ ] 5.3 Update `apps/docs/reference/commands.md`: the `--store` global-flag
      row and the read-only-commands section say `templates` and `schema` reach
      a store-backed root by working directory, and every command resolves the
      enclosing root from a subdirectory
- [ ] 5.4 Update the `store:` paragraph in
      `apps/docs/reference/configuration.md` to say the key redirects only from
      an `openspec/` with no `specs/` or `changes/`, linking to the Stores page
- [ ] 5.5 Run `mise run docs:build` and `mise run check`, record the docs rows
      in the ledger, and commit

## 6. Rebase and parity gates

- [ ] 6.1 Once `unknown-option-contract` has merged, rebase onto `main` with
      `--force-with-lease`, resolving any `apps/docs/reference/commands.md`
      overlap by keeping both changes' facts
- [ ] 6.2 Switch the oracle helper in `root-resolution.test.ts` to
      `upstream-oracle.ts` if 4.1 used the fallback, and verify the matrix still
      passes
- [ ] 6.3 Run `reachability.test.ts` and verify `parity-pending.yaml` carries no
      entry tagged for this change
- [ ] 6.4 Verify `git diff --name-only main...HEAD` touches none of
      `unknown-option-contract`'s files, and that reverting this change's
      commits on a scratch branch leaves `mise run test` green
- [ ] 6.5 Run `mise run check`, mark every verification row with its observed
      result, and commit
