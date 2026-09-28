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
- **Store health is verified, not trusted.** Whichever way a store is selected
  (`--store`, a pointer, `defaultStore`), `resolveRoot` checks the registered
  root on disk the way upstream's `inspectRegisteredStore` does: missing or
  mismatched `.openspec-store/store.yaml` metadata fails with
  `store_identity_mismatch`, unreadable metadata with `invalid_store_metadata`,
  and a root without a directory `openspec/` and a config file (or with a
  `specs/`, `changes/` or `archive/` that is not a directory) with
  `unhealthy_store_root`, each with upstream's message and a fix naming
  `cospec store doctor <id>`. Today cospec trusts `store ls --json`, which lists
  a broken store with no status, and carries on against it.
- **A missing `--cwd` is a clean cospec error.** `--cwd` is cospec's own global
  flag (upstream has none), and `cospec --cwd <path>` with a `<path>` that is
  not an existing directory used to fail with the runtime's spawn error,
  `cospec: ENOENT: no such file or directory, posix_spawn '<path to bun>'`,
  which names the interpreter instead of the user's path, or, below a planning
  root, silently resolved that root before failing. `resolveRoot` now checks the
  invocation directory first and fails with
  `cospec: directory not found: <path>` and exit 1 (code `directory_not_found`,
  no fix line), before any walk or spawn.
- **The store banner.** In human mode, a store-selected root prints upstream's
  stderr line `Using OpenSpec root: <id> (<path>)` from `resolveRoot`, verbatim:
  it names the product noun, not a command to run. A relayed passthrough whose
  wrapped call prints the same line shows it once, through the same suppression
  hook as the ignored-pointer warning. `--json` runs print no banner.
- **`--store` is threaded only for an explicit `--store`.** For a root reached
  through a pointer (`declared`) or `defaultStore` (`global_default`), wrapped
  calls no longer receive `--store <id>`; spawned in the invocation directory,
  the binary re-derives the same root, which the differential matrix proves
  before this lands. Relayed JSON then reports upstream's `root.source`
  (`declared`/`global_default`) instead of `store`, so `cospec show --json`
  matches `openspec show --json` over a pointer.
- **`templates` and `schema` spawn in every resolved root.** Both spawn the
  wrapped binary with the resolved root's `base` as the working directory and no
  `--store`, following `commands/view.ts`. This applies to every resolved root
  (the store-backed case was the broken one, not a limit), and is a deliberate
  superset of upstream, which reads `process.cwd()` for these two commands: from
  a subdirectory, cospec finds the enclosing root's typed schemas and
  `schema fork`/`init` write into that root instead of creating a stray
  `openspec/` in the subdirectory. Every other passthrough keeps its `--store`
  threading for an explicit `--store`. `cospec schema`'s missing- and
  unknown-subcommand errors name all four upstream subcommands (`which`,
  `validate`, `fork`, `init`), not just the first two.
- **One JSON document for resolver failures under `--json` (after the rebase
  onto `unknown-option-contract`).** A resolver hard-error in a `--json` run
  prints exactly one JSON document, `{"status": [diagnostic]}`, on stdout and
  exits 1, instead of `cospec: <message>` prose on stderr. This is the generic
  top-level envelope; `cli-surface-parity` later adds each command's own keys
  (`changes: []`, `root: null`) to match upstream's per-command payloads. It
  covers every resolver hard-error, `directory_not_found` included.
- **Two more parity fixes after the rebase.** An empty `--store=` fails with
  upstream's `invalid_store_id` (one JSON document under `--json`) instead of
  being dropped and listing the implicit root, and
  `cospec templates --json -- x` relays upstream's
  `error: too many arguments for 'templates'. …` refusal instead of cospec's own
  "did not emit a single parseable JSON document" error.
- **The binary's parse refusal wins on forward commands (after the rebase).**
  `show`, `schemas`, `templates` and `schema` hand their argv to the binary
  unparsed, and upstream parses before it selects a root, so
  `cospec schemas --bogus --store nosuch` now names `--bogus`, as `openspec`
  does, instead of reporting the unknown store. cospec asks the binary in a
  scratch directory, so nothing runs in the user's.
- **`templates` and `schema` read `--store` in either position (after the
  rebase).** `unknown-option-contract`'s `storeInArgv` marker, which left a
  post-command `--store` for the binary to refuse, is removed: `--store` selects
  the root those two spawn in, before or after the command name.
- **`schema`'s relayed remedies name cospec, and a structural respell helper for
  relayed JSON.** A failed `schema` call's `"openspec schema fork"` remedy reads
  `"cospec schema fork"` (text and `--json`), and a successful `schema init`'s
  last next step reads `3. Use with: cospec new <name> <slug>`.
  `passthrough-command.ts` gains `respellCommandFields`, which spells only the
  leading `openspec` token of named command-bearing fields in a parsed `--json`
  document; `upstream-spellings` and `passthrough-json-and-doctor` wire it into
  `instructions` and `context`.
- **BREAKING:** a `store:` pointer inside a directory that is itself a planning
  root no longer redirects writes. cospec warns and uses the local root, as
  `openspec` does.
- **BREAKING:** a command run from a subdirectory now resolves the enclosing
  root instead of treating the subdirectory as the root.
- **BREAKING:** stderr changes on every store-resolved invocation. Every
  human-mode command whose root is selected by `--store`, a `store:` pointer or
  `defaultStore` now prints `Using OpenSpec root: <id> (<path>)` on stderr once,
  before its own output (the same line bare `openspec` prints). Scripts that
  compare or parse cospec's stderr for those roots see one new line; `--json`
  runs are unchanged.
- A malformed `store:` pointer, a rootless directory on a machine with
  registered stores, and a registered store whose metadata or tree is broken now
  fail with exit 1 where cospec used to carry on against the wrong directory. A
  `--cwd` naming a missing directory still exits 1, now with
  `directory not found: <path>` instead of a spawn error.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `store-awareness`: the "Deterministic root resolution" requirement states the
  wrong precedence (pointer before the local repository, local repository only
  at the cwd). It is corrected to upstream's qualifying walk, pointer fallback,
  malformed-pointer, registered-stores and store-health errors, root provenance,
  the store banner and the `--json` failure document. A new requirement states
  that `templates` and `schema` spawn in every resolved root, never by
  `--store`.

## Impact

- `apps/cli/src/core/root.ts`: the walk, the classification, the pointer read,
  the resolver errors, the store-health check, the banner, `storeArgs` only for
  an explicit `--store`, and the `source` field. `resolveRoot` returns the
  existing `Root` shape plus `source`, and reads `json` from the global flags
  its callers already pass, so every current caller keeps compiling unchanged.
- `apps/cli/src/core/passthrough-command.ts`,
  `apps/cli/src/commands/templates.ts`, `apps/cli/src/commands/schema.ts`: a
  spawn-in-root mode with no `--store`; after the rebase, the forward rows'
  parse-refusal probe, the `respellCommandFields` helper, and `schema`'s
  respelled relays.
- `apps/cli/src/core/openspec.ts`: `passthroughOpenspec` drops, from the stderr
  it relays, the exact lines `resolveRoot` already printed (the ignored-pointer
  warning and the store banner), so each appears once. The `Root` interface is
  unchanged.
- `apps/cli/test/unit/core/root.test.ts`: tests that asserted the old behaviour
  (a non-string pointer is ignored, a rootless cwd falls through with stores
  registered) are rewritten to the corrected behaviour.
- `apps/cli/test/contract/root-resolution.test.ts` (new): the differential
  matrix against the pinned binary's `openspec list --json` `.root`.
- Docs: `docs/stores.md`, `apps/docs/concepts/stores.md`,
  `apps/docs/reference/commands.md` (including the `templates`/`schema`
  superset), and the `store:` paragraph in
  `apps/docs/reference/configuration.md`.
- No new flags, commands, exit codes or dependencies. The new failures exit `1`,
  like the existing unknown-store failure.
- Before the rebase, no file owned by `unknown-option-contract` is touched: no
  command parser, `cli.ts`, the command table or the completion spec. The
  resolver change reaches every command through `resolveRoot`, which they
  already call. After that change merged and this branch rebased onto it, its
  files are edited only as the post-rebase tasks require: `cli.ts` gains the
  `RootSelectionError` branch for the `--json` failure document and hands an
  empty `--store` to the resolver; `core/command-table.ts` loses the
  `storeInArgv` marker and marks the forward rows that select a root
  `store: 'accepted'`; its tests that pinned the superseded behaviour
  (precedence matrix, dispatcher unit tests, the no-root relays, the
  `remedy-sources.ts` entry for `schema init`) are re-pinned to this change's,
  and `upstream-oracle.ts` gains an optional `cwd`.
- Rollback is reverting this change.

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
