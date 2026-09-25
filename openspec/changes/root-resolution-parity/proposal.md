# Proposal

## Why

cospec and the wrapped OpenSpec binary disagree about which root a command
targets, so the same invocation reads and writes a different `openspec/` tree
depending on which CLI runs it. `resolveRoot` (`apps/cli/src/core/root.ts`)
checks `openspec/` only at the exact cwd (`root.ts:109`), consults a `store:`
pointer before looking at the local tree at all (`root.ts:107`), and drops a
malformed pointer on the floor (`configStorePointer`, `root.ts:43`). Upstream's
`resolveOpenSpecRoot` (`dist/core/root-selection.js`) walks ancestors for a
_qualifying_ `openspec/`, treats a `store:` pointer as a fallback that only a
config-only directory may follow, hard-errors on a malformed pointer, and
hard-errors when stores are registered but no local root exists.

Probed against the pinned binary and the current cospec in a throwaway sandbox
(isolated `XDG_DATA_HOME`/`XDG_CONFIG_HOME`/`HOME`, two registered stores `demo`
and `other`), comparing `openspec list --json` `.root` with what cospec does for
the same cwd:

| Fixture (cwd)                                                         | Pinned binary                                                             | cospec today                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `<repo>/src/deep` under a planning root                               | `{path: <repo>, source: nearest}`                                         | treats the subdirectory as the root; `list` reports zero changes   |
| `openspec/changes/` plus `config.yaml` `store: demo`                  | `{path: <repo>, source: nearest}` and a stderr warning                    | redirects to store `demo`; the local changes are invisible         |
| config-only `openspec/` with `store: demo`                            | `{path: <demo root>, source: declared, store_id: demo}`                   | same root                                                          |
| config-only `openspec/`, `store:` unparseable YAML                    | `invalid_store_pointer`, exit 1                                           | silently uses the local directory                                  |
| config-only `openspec/`, `store:` a list                              | `invalid_store_pointer`, exit 1                                           | silently uses the local directory                                  |
| bare directory, stores registered, no `defaultStore`                  | `no_root_with_registered_stores` naming `demo, other`, exit 1             | silently uses the cwd; `list` reports zero changes                 |
| `$HOME/work/proj` with stores at `$HOME/openspec/<id>`                | `no_root_with_registered_stores`, exit 1                                  | silently uses the cwd; from `$HOME` itself, `$HOME` becomes a root |
| config-only `openspec/` with `store: demo`, `cospec templates --json` | `openspec templates --store demo` fails `error: unknown option '--store'` | exit 1, "did not emit a single parseable JSON document"            |

The last row is the passthrough half of the bug. `cospec templates` and
`cospec schema which|validate|fork|init` go through `runPassthrough`, which
always appends `root.storeArgs` (`passthrough-command.ts:47`). The pinned binary
rejects `--store` on `templates` and on every `schema` subcommand
(`error: unknown option '--store'`, exit 1), so both commands fail for any root
reached through `--store`, a `store:` pointer or `defaultStore`. `cospec view`
already avoids this by spawning in the store's root instead
(`commands/view.ts`).

The result is not a cosmetic difference. A `store:` pointer inside a real
planning root sends writes to another repository, a command run from a
subdirectory silently sees an empty tree, and a malformed pointer silently flips
where work lands. Anyone replacing `openspec` with `cospec` in an existing
checkout gets different roots than before.

## What Changes

- **Qualifying ancestor walk.** `resolveRoot` walks from the canonical cwd to
  the filesystem root and stops at the first `openspec/` that qualifies, using
  upstream's classification: a _planning_ `openspec/` (a `specs/` or `changes/`
  directory that does not carry `.openspec-store/store.yaml`), a _config-only_
  one (an `openspec/config.yaml` or `openspec/config.yml`), or a _bare_ one,
  which does not qualify and is skipped. Skipping bare directories is what keeps
  the `~/openspec/<id>` store layout from turning `$HOME` into a phantom root.
  The walked root is canonicalized, as upstream's is.
- **Pointer as fallback.** A `store:` pointer is consulted only when the
  qualifying `openspec/` has no planning shape. A planning root that carries a
  pointer resolves locally and prints upstream's warning on stderr, once:
  `Warning: <config> declares store '<id>', but this directory is a real OpenSpec root; the declaration is ignored.`
- **Malformed pointers hard-error.** `configStorePointer` reports what it read:
  `{value}`, `{}`, `{malformed: 'unparseable'}` or `{malformed: 'non_string'}`,
  together with the config path it read. `resolveRoot` fails the malformed cases
  with `invalid_store_pointer` and upstream's message and fix text. An
  empty-string pointer fails with `invalid_store_id`, as upstream's store-id
  validation does.
- **Registered stores with no root hard-error.** With no qualifying root and no
  `defaultStore`, but at least one registered store, `resolveRoot` fails with
  `no_root_with_registered_stores` and names every registered id. With no stores
  registered it keeps today's fall-through to the cwd as an implicit root.
- **Root provenance.** `resolveRoot` reports where its root came from, using
  upstream's `source` vocabulary: `store`, `declared`, `nearest`,
  `global_default`, `implicit`. Every resolver failure carries upstream's
  diagnostic code and fix text, with `cospec` in place of `openspec` in any
  command it tells the user to run.
- **`templates` and `schema` never receive `--store`.** Both spawn the wrapped
  binary with the resolved root's `base` as the working directory and no
  `--store`, following `commands/view.ts`. Every other passthrough keeps its
  current `--store` threading.
- **BREAKING:** a `store:` pointer inside a directory that is itself a planning
  root no longer redirects writes. cospec warns and uses the local root, as
  `openspec` does.
- **BREAKING:** a command run from a subdirectory now resolves the enclosing
  root instead of treating the subdirectory as the root.
- A malformed `store:` pointer, and a rootless directory on a machine with
  registered stores, now fail with exit 1 where cospec used to carry on against
  the wrong directory.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `store-awareness`: the "Deterministic root resolution" requirement states the
  wrong precedence (pointer before the local repository, local repository only
  at the cwd). It is corrected to upstream's qualifying walk, pointer fallback,
  malformed-pointer and registered-stores errors, and root provenance. A new
  requirement states that `templates` and `schema` reach a store-backed root by
  working directory, never by `--store`.

## Impact

- `apps/cli/src/core/root.ts`: the walk, the classification, the pointer read,
  the resolver errors and the `source` field. `resolveRoot` returns the existing
  `Root` shape plus `source`, so every current caller keeps compiling unchanged.
- `apps/cli/src/core/passthrough-command.ts`,
  `apps/cli/src/commands/templates.ts`, `apps/cli/src/commands/schema.ts`: a
  spawn-in-root mode with no `--store`.
- `apps/cli/src/core/openspec.ts`: `passthroughOpenspec` drops, from the stderr
  it relays, the one ignored-pointer warning line `resolveRoot` already printed,
  so the warning appears once. The `Root` interface is unchanged.
- `apps/cli/test/unit/core/root.test.ts`: tests that asserted the old behaviour
  (a non-string pointer is ignored, a rootless cwd falls through with stores
  registered) are rewritten to the corrected behaviour.
- `apps/cli/test/contract/root-resolution.test.ts` (new): the differential
  matrix against the pinned binary's `openspec list --json` `.root`.
- Docs: `docs/stores.md`, `apps/docs/concepts/stores.md`,
  `apps/docs/reference/commands.md`, and the `store:` paragraph in
  `apps/docs/reference/configuration.md`.
- No new flags, commands, exit codes or dependencies. The new failures exit `1`,
  like the existing unknown-store failure.
- No file owned by `unknown-option-contract` is touched: no command parser,
  `cli.ts`, the command table or the completion spec. The resolver change
  reaches every command through `resolveRoot`, which they already call.
- Rollback is reverting this change.

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
