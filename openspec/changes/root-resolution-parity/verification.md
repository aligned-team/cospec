# Verification

Fixture environment for every matrix row: a fresh temp tree with its own
`XDG_DATA_HOME`, `XDG_CONFIG_HOME` and `HOME`, two stores `alpha` and `beta`
registered with the pinned binary's `store setup <id> --path <p> --no-init-git`
(except where a row says no stores are registered), and `OPENSPEC_TELEMETRY=0`.
"Oracle" is the pinned binary's `openspec list --json` run in the row's cwd
with the same environment: its `.root` (`path`, `source`, `store_id`) or, on
failure, its `.status[0].code`. "cospec" is `resolveRoot({cwd, flags})` called
in-process under the same environment, compared as `{path: base, source,
store_id: store}` or as the thrown `RootSelectionError`'s `diagnostic.code`.
Every matrix row lives in `apps/cli/test/contract/root-resolution.test.ts`.

## 1. The resolver picks the binary's root on every fixture [critical]

- [ ] 1.1 @regression (agent) M1 subdirectory: `<repo>/openspec/changes/` exists, cwd `<repo>/src/deep` -> oracle and cospec both `{path: <repo>, source: nearest}`; before the fix cospec returns `<repo>/src/deep`
- [ ] 1.2 @equivalence (agent) M2 config-only `openspec/`: only `openspec/config.yaml` (`schema: spec-driven`, no `store:`), cwd `<repo>` and cwd `<repo>/sub` -> both `{path: <repo>, source: nearest}` from each cwd
- [ ] 1.3 @regression (agent) M3 planning root plus pointer: `openspec/changes/` and `config.yaml` `store: alpha`, cwd `<repo>` -> both `{path: <repo>, source: nearest}`, and cospec's stderr carries `Warning: <cfg> declares store 'alpha', but this directory is a real OpenSpec root; the declaration is ignored.` exactly once; before the fix cospec resolves store `alpha`
- [ ] 1.4 @equivalence (agent) M4 config-only pointer: `openspec/config.yaml` `store: alpha` only, cwd `<repo>` -> both `{path: <alpha root>, source: declared, store_id: alpha}`
- [ ] 1.5 @equivalence (agent) M5 config-only pointer found from a subdirectory: M4's tree, cwd `<repo>/deeper` -> both `{path: <alpha root>, source: declared, store_id: alpha}`
- [ ] 1.6 @regression (agent) M6 unparseable pointer: config-only `config.yaml` body `store: [unclosed` -> both fail with `invalid_store_pointer`; cospec's message is `Invalid store declaration in <cfg>: the config file could not be read as YAML.` and its fix `Fix the YAML syntax in <cfg>.`; before the fix cospec returns the local directory
- [ ] 1.7 @regression (agent) M7 non-string pointer: config-only `config.yaml` with `store:` a two-item list -> both fail with `invalid_store_pointer`; message `Invalid store declaration in <cfg>: the store key must be a single store id string.`, fix `Edit <cfg> so the store key is a registered store id, or remove it.`; before the fix cospec returns the local directory
- [ ] 1.8 @equivalence (agent) M8 empty-string pointer: config-only `store: ""` -> both fail with `invalid_store_id` and message `Declared in <cfg>: Store id must not be empty`; and M8b, the same pointer on a planning root -> both `{path: <repo>, source: nearest}` with the ignored-pointer warning naming `''`
- [ ] 1.9 @equivalence (agent) M9 unknown pointer id: config-only `store: nope` -> both fail with `unknown_store`; cospec's message starts `Declared in <cfg>: ` and names `alpha, beta`
- [ ] 1.10 @equivalence (agent) M10 malformed pointer on a planning root: `openspec/specs/` plus an unparseable `config.yaml` -> both `{path: <repo>, source: nearest}` and cospec prints no warning
- [ ] 1.11 @regression (agent) M11 `config.yml` pointer: config-only `openspec/config.yml` `store: alpha` and no `config.yaml` -> both `{path: <alpha root>, source: declared, store_id: alpha}`; before the fix cospec ignores the `.yml` file
- [ ] 1.12 @equivalence (agent) M12 explicit `--store alpha` from a bare directory, and M12b from inside M1's planning root -> both `{path: <alpha root>, source: store, store_id: alpha}` in each cwd
- [ ] 1.13 @equivalence (agent) M13 `defaultStore`: global config `defaultStore: beta`, cwd a bare directory -> both `{path: <beta root>, source: global_default, store_id: beta}`; and M13b, the same global config with cwd inside M1's planning root -> both `{path: <repo>, source: nearest}`
- [ ] 1.14 @equivalence (agent) M14 stale `defaultStore`: global config `defaultStore: gone`, cwd a bare directory -> both fail with `unknown_store`; cospec's message starts `Global defaultStore 'gone': ` and its fix is `Register the store (cospec store register <path> --id gone) or clear the stale global default (cospec config unset defaultStore).`
- [ ] 1.15 @regression (agent) M15 registered stores with no root: cwd a bare directory, no `defaultStore` -> both fail with `no_root_with_registered_stores`; cospec's message names `alpha, beta` and its fix is `Rerun with --store <id> (registered: alpha, beta) or run cospec init.`; before the fix cospec returns the bare directory
- [ ] 1.16 @regression (agent) M16 `$HOME` store layout: stores `homestore` and `specs` set up at `$HOME/openspec/homestore` and `$HOME/openspec/specs`, cwd `$HOME` and cwd `$HOME/work/proj` -> both fail with `no_root_with_registered_stores` from each cwd; and M16b, a real project at `$HOME/work/real` with `openspec/changes/`, cwd `$HOME/work/real/a` -> both `{path: $HOME/work/real, source: nearest}`; before the fix cospec returns `$HOME` when run from `$HOME`
- [ ] 1.17 @regression (agent) M17 bare `openspec/` skipped mid-walk: `<repo>/openspec/changes/` plus an empty `<repo>/inner/openspec/`, cwd `<repo>/inner/x` -> both `{path: <repo>, source: nearest}`
- [ ] 1.18 @regression (agent) M18 symlinked cwd: `<link>` is a symlink to `<repo>/src`, cwd `<link>/deep` -> both `{path: <canonical repo>, source: nearest}`
- [ ] 1.19 @equivalence (agent) M19 implicit root: no stores registered, no `defaultStore`, cwd a bare directory -> cospec `{path: <cwd>, source: implicit}` matches the oracle `openspec status --json` `.root` (the binary's `list` refuses implicit roots here with `no_openspec_root`, which the row also records)
- [ ] 1.20 @equivalence (agent) M20 pre-config project: no stores registered, `openspec/project.md` only, cwd that directory -> oracle `list --json` `.root` and cospec both `{path: <cwd>, source: implicit}`
- [ ] 1.21 @equivalence (agent) M21 `references:` without `store:`: config-only `config.yaml` declaring `references: [alpha]` -> both `{path: <repo>, source: nearest}`
- [ ] 1.22 @equivalence (agent) the whole matrix M1 through M21 in one run of the named differential test -> `bun test apps/cli/test/contract/root-resolution.test.ts` (through `mise run test:contract`) reports every fixture passing against the pinned binary

## 2. Commands operate on the resolved root [critical]

- [ ] 2.1 @e2e (agent) M1 with one change `demo-change` under `<repo>/openspec/changes/`, `cospec list --json` from `<repo>/src/deep` -> exit 0 and `changes` lists `demo-change`; before the fix it lists nothing
- [ ] 2.2 @e2e (agent) M3, `cospec new ci local-change` from `<repo>` -> `<repo>/openspec/changes/local-change/` exists, nothing is created under `<alpha root>/openspec/changes/`, and stderr carries the ignored-pointer warning exactly once
- [ ] 2.3 @e2e (agent) M15, `cospec list` in human mode -> exit 1; stderr is `cospec: No OpenSpec root found in the current directory or its ancestors. Registered stores: alpha, beta. Pass --store <id> to use one, or run cospec init to create a local root.` followed by `Fix: Rerun with --store <id> (registered: alpha, beta) or run cospec init.`, and stderr contains no bare `openspec init`
- [ ] 2.4 @e2e (agent) M6, `cospec status` in human mode -> exit 1 with the `invalid_store_pointer` message and `Fix:` line naming the config file
- [ ] 2.5 @e2e (agent) M3, `cospec schemas --json` and `cospec view` (relaying passthroughs whose wrapped call prints the same warning) -> each exits 0, `schemas` emits one JSON document on stdout, and the ignored-pointer warning appears on stderr exactly once per command
- [ ] 2.6 @integration (agent) the existing store integration suite (`apps/cli/test/integration/store-aware.test.ts`, `store.test.ts`) and the existing root unit tests after their rewrite -> `mise run test:integration` and `mise run test` pass

## 3. `templates` and `schema` work for store-backed roots [critical]

- [ ] 3.1 @regression (agent) `cospec templates --json --store alpha` from a bare directory -> exit 0 with one parseable JSON document; before the fix exit 1 with `did not emit a single parseable JSON document` because the wrapped call got `--store`
- [ ] 3.2 @integration (agent) `cospec templates --json` from M4 (pointer) and from M13 (`defaultStore`) -> exit 0 with one parseable JSON document in each
- [ ] 3.3 @regression (agent) `cospec schema which feat --json` with `--store alpha`, from M4 and from M13, where `alpha` and `beta` were set up by `cospec store setup` so they carry the typed schemas -> exit 0 in all three, reporting `feat` from the store's `openspec/schemas/feat`; before the fix each fails with `error: unknown option '--store'`
- [ ] 3.4 @integration (agent) `cospec schema validate feat --store alpha` and `cospec schema fork feat alpha-feat --store alpha` -> both exit 0; `<alpha root>/openspec/schemas/alpha-feat/schema.yaml` exists and nothing is written under the invocation directory
- [ ] 3.5 @integration (agent) `cospec schema init feat --store alpha` (a reserved canon destination) -> still refused with exit 1 before any spawn, and nothing is written under `<alpha root>`
- [ ] 3.6 @integration (agent) `cospec templates --json --schema feat` from `<repo>/src` in a cospec-initialized repo -> every template path resolves under `<repo>/openspec/schemas/feat/`
- [ ] 3.7 @unit (agent) `callPassthrough` with `spawnInRoot: true` against a stubbed spawn -> spawn `cwd` is `root.base` and argv contains no `--store`; without it the spawn keeps `root.cwd` plus `root.storeArgs`

## 4. The pointer read and the error shape match the binary

- [ ] 4.1 @unit (agent) `configStorePointer` on: no config; `config.yaml` with `store: alpha`; with no `store:`; empty, comment-only and list-shaped documents; `store: [` ; `store: 3`; `store: ""`; only `config.yml` -> `{filePath: null}`, `{filePath, value: 'alpha'}`, `{filePath}` for the three no-pointer documents, `{filePath, malformed: 'unparseable'}`, `{filePath, malformed: 'non_string'}`, `{filePath, value: ''}`, and the `.yml` path respectively
- [ ] 4.2 @unit (agent) classification: `openspec/specs/` that contains `.openspec-store/store.yaml` -> not a planning shape; `openspec/changes/` as a regular file -> not a planning shape; `openspec/` with only `project.md` -> does not qualify
- [ ] 4.3 @unit (agent) every `RootSelectionError` thrown in the matrix -> `diagnostic.severity` is `error`, `code`, `target` and `fix` are set, `message` ends with a `Fix:` line, and no `fix` names a bare `openspec` command
- [ ] 4.4 @unit (agent) `resolveRoot` on a local root spawns nothing -> a stubbed spawn records zero calls for M1, M2 and M3

## 5. Parity gates

- [ ] 5.1 @equivalence (agent) after rebasing onto `unknown-option-contract`, run its reachability test -> `apps/cli/test/contract/reachability.test.ts` passes and `apps/cli/test/contract/parity-pending.yaml` carries no entry tagged for this change (it owns no registry surface, so there is none to remove)
- [ ] 5.2 @manual (agent) `git diff --name-only main...HEAD` on the PR branch -> lists none of `apps/cli/src/cli.ts`, `apps/cli/src/core/command-table.ts`, `apps/cli/src/core/completions/`, or the command modules `unknown-option-contract` rewrites
- [ ] 5.3 @manual (agent) rollback check: on a scratch branch, revert this change's commits -> `mise run test` passes and `resolveRoot` is back to the cwd-only lookup, so rollback is a plain revert with no migration

## 6. Docs and the full gate

- [ ] 6.1 @manual (agent) `docs/stores.md` "Root resolution order" -> states the qualifying ancestor walk, the planning / config-only / bare classification, the pointer as a config-only fallback with the ignore warning, the malformed-pointer and registered-stores errors, and `defaultStore` as the last fallback, linking to the site page for the user-facing account
- [ ] 6.2 @manual (agent) `apps/docs/concepts/stores.md` "Resolution order" -> the same order in user terms, with the `invalid_store_pointer` and `no_root_with_registered_stores` errors shown verbatim and the `$HOME` store layout explained; this page owns the fact and the others link to it
- [ ] 6.3 @manual (agent) `apps/docs/reference/commands.md` -> the `--store` global-flag row and the read-only-commands section state that `templates` and `schema` reach a store-backed root by working directory, and that every command resolves the enclosing root from a subdirectory
- [ ] 6.4 @manual (agent) `apps/docs/reference/configuration.md` `store:` paragraph -> says the key redirects commands only from an `openspec/` that holds no `specs/` or `changes/`, and links to the Stores page for the rest
- [ ] 6.5 @integration (agent) `mise run docs:build` -> exits 0
- [ ] 6.6 @integration (agent) `mise run check` -> green end to end
