# Design

## Context

`resolveRoot` was written as a precedence list (`--store`, then pointer, then
`openspec/` at the cwd, then `defaultStore`, then the cwd), and its header
comment claims it mirrors upstream's `root-selection`. It does not. Upstream's
`resolveOpenSpecRoot` (`dist/core/root-selection.js`) is built around a
_qualifying nearest-ancestor walk_:

1. `--store <id>` resolves that registered store (`source: store`).
2. Otherwise `findQualifyingRootSync` walks from the canonical start directory
   (`findRepoPlanningRootSync`, which realpaths the start and every hit) and
   returns the first ancestor whose `openspec/` either has a planning shape or
   has a config file. `classifyOpenSpecDir` (`dist/core/project-config.js`)
   defines planning shape as `openspec/specs/` or `openspec/changes/` being a
   directory _without_ `.openspec-store/store.yaml` inside it, and reads the
   pointer through `readStorePointer`, which probes `config.yaml` then
   `config.yml`.
3. `resolveNearestOrDeclaredRoot` on that ancestor: planning shape wins
   (`source: nearest`) and a pointer there only earns a stderr warning; a
   malformed pointer throws `invalid_store_pointer`; no pointer is
   `source: nearest`; a pointer resolves the store (`source: declared`), with
   errors prefixed `Declared in <config>: `.
4. No qualifying ancestor: `defaultStore` (`source: global_default`, errors
   prefixed `Global defaultStore '<id>': `).
5. Otherwise, registered stores throw `no_root_with_registered_stores`; with
   none, the start directory is an implicit root (`source: implicit`), unless
   the command disabled implicit roots.

Every store selection (steps 1, 3 and 4) then runs `inspectRegisteredStore` on
the registered root before returning it: identity first (the
`.openspec-store/store.yaml` metadata must exist, parse and carry the registered
id), then root health (`inspectOpenSpecRoot`: the root is a directory, holds a
directory `openspec/` and a `config.yaml`/`config.yml` file, and none of
`openspec/specs/`, `openspec/changes/`, `openspec/changes/archive/` exists as a
non-directory). Once a root is selected, `resolveRootForCommand` prints
`Using OpenSpec root: <id> (<path>)` on stderr in human mode for a
store-selected root, and in `--json` mode turns a resolver failure into one JSON
document on stdout.

The root cause of the resolver defects is that cospec never had steps 2 and 3:
it tests `existsSync(openspec/)` at the cwd only, and reads the pointer before
looking at the local tree. The `templates`/`schema` failure is independent: the
passthrough helper appends `--store` unconditionally, and `templates`/`schema`
are the two wrapped commands that do not declare it.

Probed pinned-binary behaviour (throwaway sandbox, isolated XDG and `HOME`) that
the implementation must reproduce:

| Case                                        | `code`                           | message / fix (verbatim, `<cfg>` = config path)                                                                                                                                                                                                |
| ------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unparseable pointer                         | `invalid_store_pointer`          | `Invalid store declaration in <cfg>: the config file could not be read as YAML.` / `Fix the YAML syntax in <cfg>.`                                                                                                                             |
| non-string pointer                          | `invalid_store_pointer`          | `Invalid store declaration in <cfg>: the store key must be a single store id string.` / `Edit <cfg> so the store key is a registered store id, or remove it.`                                                                                  |
| empty-string pointer (config-only)          | `invalid_store_id`               | `Declared in <cfg>: Store id must not be empty` / `Use kebab-case with lowercase letters, numbers, and single hyphen separators.`                                                                                                              |
| unknown pointer id                          | `unknown_store`                  | `Declared in <cfg>: Unknown store '<id>'. Registered stores: <ids>.` / `Register the store (openspec store register <path> --id <id>) or edit <cfg> to name a registered store.`                                                               |
| no root, stores registered                  | `no_root_with_registered_stores` | `No OpenSpec root found in the current directory or its ancestors. Registered stores: <ids>. Pass --store <id> to use one, or run openspec init to create a local root.` / `Rerun with --store <id> (registered: <ids>) or run openspec init.` |
| planning root with pointer (not an error)   | —                                | stderr: `Warning: <cfg> declares store '<id>', but this directory is a real OpenSpec root; the declaration is ignored.`                                                                                                                        |
| malformed pointer on a planning root        | —                                | resolves `nearest`, no warning (a malformed pointer has no value to name)                                                                                                                                                                      |
| empty-string pointer on a planning root     | —                                | resolves `nearest`, warns with `store ''`                                                                                                                                                                                                      |
| `templates` / `schema <sub>` with `--store` | —                                | `error: unknown option '--store'`, exit 1 (every `schema` subcommand; `schemas` accepts `--store`)                                                                                                                                             |
| store metadata missing                      | `store_identity_mismatch`        | `Store '<id>' is missing identity metadata at <root>/.openspec-store/store.yaml. Run openspec store doctor <id> to inspect it.` / `Run openspec store doctor <id> to inspect it.`                                                              |
| store metadata id differs                   | `store_identity_mismatch`        | `Store '<id>' metadata id '<actual>' does not match its registered id. Run openspec store doctor <id> to inspect it.` / same fix                                                                                                               |
| store metadata unparseable                  | `invalid_store_metadata`         | message starts `Invalid store metadata state: ` (the tail is YAML-parser text, not pinned) / `Repair .openspec-store/store.yaml.`                                                                                                              |
| store root unhealthy                        | `unhealthy_store_root`           | `Store '<id>' does not have a healthy OpenSpec root at <root>: <problems> Run openspec store doctor <id> to inspect it.` / same fix; `<problems>` joins the root diagnostics, e.g. `Missing openspec/config.yaml or openspec/config.yml.`      |
| store selected (human mode)                 | —                                | stderr: `Using OpenSpec root: <id> (<canonical root>)` before the command's output; never under `--json`                                                                                                                                       |

The `<problems>` for an unhealthy root are, verbatim and space-joined:
`Store root does not exist.`, `Store root is not a directory.`,
`Missing openspec/ directory.`, `openspec/ exists but is not a directory.`,
`Missing openspec/config.yaml or openspec/config.yml.`,
`OpenSpec config path exists but is not a file.`, and
`openspec/<specs|changes|changes/archive>/ exists but is not a directory.` (the
specs row probed as `openspec/specs/ exists but is not a directory.`). Two
probed facts are easy to "fix" by mistake: a store whose root directory is gone
reports `store_identity_mismatch`, not `unhealthy_store_root`, because the
identity check runs first and finds no metadata; and a store with no `specs/` or
`changes/` at all is healthy. Reached through a pointer or `defaultStore`, every
store-health message carries the same `Declared in <cfg>: ` or
`Global defaultStore '<id>': ` prefix as `unknown_store` (probed for
`store_identity_mismatch` both ways).

Human mode renders a resolver failure as the message followed by a `Fix:` line.
`--json` mode on the pinned binary prints
`{…, root: null, status: [diagnostic]}` on stdout with exit 1. Over a pointer,
`openspec show <item> --json` reports `root.source: declared` (and
`global_default` under `defaultStore`); the same call with an explicit
`--store <id>` reports `source: store`.

## Goals / Non-Goals

**Goals:**

- `resolveRoot` returns the same `{path, source}` the pinned binary's
  `openspec list --json` reports for every fixture in the verification matrix,
  and fails with the same diagnostic code where the binary fails.
- `cospec templates` and `cospec schema <sub>` work for every store-backed root.
- No command module, `cli.ts`, command table or completion file changes before
  the rebase onto `unknown-option-contract`; the fix reaches every command
  through `resolveRoot`. After the rebase, the top-level `--json` error
  rendering that change lands gains one `RootSelectionError` branch (D12).
- Store-selected roots are verified on disk and announced with upstream's
  banner, and relayed JSON reports upstream's `root.source`.

**Non-Goals:**

- Changing any cospec opinion: typed schemas, the apply gate, the hard archive
  gates, the verification ledger and blocking changes are untouched, and every
  command still routes through `cospec`.

## Decisions

**D1. Port the walk, do not call upstream's module.** cospec resolves roots
in-process (the common path spawns nothing) and only spawns for store lookups.
Importing upstream's `root-selection.js` would couple cospec to a private dist
path of the wrapped binary, which the "spawned by resolved path,
version-asserted" rule forbids. The port is about sixty lines and the
differential matrix pins it to the binary. _Rejected:_ asking the binary
(`openspec list --json`) for its root on every command, which would add a spawn
to every local invocation.

**D2. `source` lives on the resolver's return type, not on `Root`.** `root.ts`
exports `RootSource` and `ResolvedRoot = Root & { source: RootSource }`, and
`resolveRoot` returns `ResolvedRoot`. The `Root` interface in `core/openspec.ts`
is unchanged, so every existing consumer compiles as is. A later change that
emits `root` in a JSON document reads `source` from the resolver's result.
_Rejected:_ adding an optional `source` to `Root` in `core/openspec.ts`, which
changes a type every command consumes for no behavioural gain.

**D3. Canonicalize the walk.** The walk starts from `realpathSync` of the cwd
and returns canonical paths, exactly as `findNearestAncestor` does. A walk over
the logical path picks a different ancestor whenever the cwd is reached through
a symlink, and store roots from `store ls --json` are already canonical (a store
registered through `/var/tmp/...` is listed as `/private/var/tmp/...`, the same
path `list --json --store` reports), so local roots become consistent with them.
`root.cwd` stays the invocation directory as given, so wrapped calls keep
spawning where the user ran the command and re-derive the same root from there.
_Rejected:_ keeping the logical spelling, which diverges from the binary on
symlinked checkouts (and on macOS temp directories, where `/var` is a symlink to
`/private/var`).

**D4. One error type with upstream's diagnostic.** `root.ts` exports
`RootSelectionError` carrying
`diagnostic: {severity: 'error', code, message, target, fix}` with upstream's
codes (`invalid_store_pointer`, `invalid_store_id`,
`no_root_with_registered_stores`, `unknown_store`, `no_registered_stores`,
`store_identity_mismatch`, `invalid_store_metadata`, `unhealthy_store_root`).
`Error.message` is the diagnostic message plus a `\nFix: <fix>` line, so the
existing top-level handler in `index.ts` prints `cospec: <message>` and
`Fix: <fix>` with no change to `index.ts` or `cli.ts` before the rebase (the
post-rebase `--json` branch is D12). Both the message and the fix replace
`openspec` with `cospec` in every command they name (`cospec init`,
`cospec store register`, `cospec config unset defaultStore`,
`cospec store doctor <id>`), because shipped output never tells the user to run
bare `openspec`. The existing unknown-store message for `--store` keeps its
current wording (the Stores page quotes it) and gains the `unknown_store` /
`no_registered_stores` code; pointer and `defaultStore` failures gain upstream's
`Declared in <cfg>: ` and `Global defaultStore '<id>': ` prefixes.

**D5. Pointer read mirrors `readStorePointer`.** `configStorePointer(cwd)`
returns `{filePath, value}`, `{filePath}`, `{filePath: null}`,
`{filePath, malformed: 'unparseable'}` or `{filePath, malformed: 'non_string'}`.
It probes `config.yaml` then `config.yml`; an empty, comment-only or non-mapping
document is `{filePath}` (a config file, no pointer), not malformed. An empty
string is a `value` of `''`, which fails store-id validation when followed and
still produces the ignored-pointer warning on a planning root, as upstream does.

**D6. The implicit root stays shared.** Upstream lets each command decide
whether a rootless cwd is an implicit root (`list` and `validate` refuse with
`no_openspec_root` unless `openspec/project.md` exists at the cwd; `status`
accepts it). cospec's commands each already report a missing `openspec/`
themselves, so `resolveRoot` keeps returning the cwd as an `implicit` root when
no store is registered, and the per-command refusal stays with the command
modules. The matrix row for this case uses the binary's `status --json` `.root`
as its oracle, since `list` refuses there.

**D7. Lines `resolveRoot` prints appear once.** `resolveRoot` writes two kinds
of stderr line itself: the ignored-pointer warning, and the store banner (D10).
It registers each exact line it printed with `core/openspec.ts` (a
`suppressRelayedStderrLine(line)` hook that adds to a set; `root.ts` already
imports that module, so no import cycle). A wrapped call spawned in the same
directory prints the same line again: the binary re-derives the same root and
prints the same warning, and for a store-selected root the same banner, with the
same canonical path (store roots from `store ls --json` are already canonical,
D3). Every command that relays wrapped stderr does so through
`passthroughOpenspec` (`callPassthrough`, `view`, `context`, `workset`,
`list --specs`), so `passthroughOpenspec` removes every registered line from the
stderr it returns. Commands that capture wrapped stderr without relaying it
(`new`, `apply`, `archive` via `runOpenspec`) never show the second copy.
`templates`, `schema` and `view` spawn in `root.base` (D8), where the binary
sees a `nearest` root and prints no banner at all, so there is nothing to strip.
Nothing else in the relayed stream is touched. _Rejected:_ stripping only in
`callPassthrough`, which leaves the duplicate in `view` and `context`.

**D8. `templates` and `schema` spawn in the root.** `PassthroughCommandOptions`
gains `spawnInRoot: true`, under which `callPassthrough` spawns with
`cwd: root.base` and no `storeArgs`. `templates.ts` and `schema.ts` set it. For
a local root at the cwd this is the same directory as before; for a store-backed
root it is the store; for a walked root it is the enclosing repository. That
last case is where cospec deliberately does more than the binary, which reads
`process.cwd()` for these two commands: from a subdirectory,
`openspec templates --schema feat` cannot find the project's `feat` schema,
while `cospec templates --schema feat` resolves it from the enclosing root, and
`schema fork`/`init` write into the enclosing root instead of creating a stray
`openspec/` in the subdirectory. Spawning in `root.base` for every root is a
deliberate superset of upstream, stated as such on the commands reference page
and in the PR description; it never changes the result for a root at the cwd.
The existing reserved-canon-name guard in `schema.ts` runs before the spawn,
unchanged. _Rejected:_ spawning in `root.base` only for store-backed roots,
which keeps the subdirectory failure for cospec's own typed schemas.

**D9. Store health is checked from the filesystem in `resolveStore`.**
`store ls --json` lists a broken store with an empty `status` (probed), so
cospec cannot learn health from the registry spawn. After finding the registry
entry, `resolveStore` ports `inspectRegisteredStore` inline: it reads
`<root>/.openspec-store/store.yaml` with the same `yaml` parser (missing ->
`store_identity_mismatch`; unparseable -> `invalid_store_metadata`; an `id`
other than the registered one -> `store_identity_mismatch`), then stats the root
as `inspectOpenSpecRoot` does and fails `unhealthy_store_root` with the joined
problem messages. It applies to all three store sources, and the `Declared in` /
`Global defaultStore` prefixes wrap it like `unknown_store`. Both message and
fix name `cospec store doctor <id>` (upstream embeds the doctor pointer in the
message too, because human mode prints only the message). The check reads files
only; it adds no spawn. _Rejected:_ spawning `openspec store doctor <id> --json`
on every store selection, which adds a spawn per command and reports a broader
set of findings than the resolver fails on.

**D10. The banner is printed by `resolveRoot`.** `resolveRoot` widens its
parameter to `flags: { store?: string; json?: boolean }`; every caller already
passes the global flags, which carry `json`, so no caller changes. When the
resolved root has a `store` (source `store`, `declared` or `global_default`) and
`json` is not set, it writes `Using OpenSpec root: <id> (<base>)` to stderr,
verbatim from upstream's `emitStoreRootBanner`. The line names the product noun
"OpenSpec root", not a command, so it is not respelled. It is printed at
resolution time, as upstream does, so it survives a command that fails after the
root was selected, and it is registered with the D7 hook. `__complete` resolves
roots too; its generated shell scripts already discard stderr, so Tab completion
shows no banner.

**D11. `--store` is threaded only for an explicit `--store`.** `resolveStore`
sets `storeArgs: ['--store', id]` only for `source: store`; for `declared` and
`global_default` roots `storeArgs` is empty and wrapped calls spawn in
`root.cwd`, where the binary re-derives the same root from the same pointer or
the same global config. Relayed JSON then carries upstream's
`root.source: declared`/`global_default` instead of `store`, and relayed human
hints stop naming a `--store` the user never typed. This is a `root.ts` edit
(that is where `storeArgs` is set). It lands only after the differential matrix
has proved the two resolvers agree on every pointer and default fixture (M4, M5,
M11, M13) and a `show --json` differential row over a pointer passes; if the
matrix ever disagrees, threading stays. `spawnInRoot` commands (D8) and `view`
are unaffected, since they never take `storeArgs`. _Rejected:_ keeping `--store`
for every store-backed root, which pins both sides to one root but makes every
relayed `root.source` read `store`.

**D12. One JSON document for resolver failures under `--json` (post-rebase).**
Once `unknown-option-contract` has merged and this branch is rebased onto it,
the top-level error rendering that change lands for its own `--json` envelope
gains one branch: a `RootSelectionError` in a `--json` run prints exactly one
document, `{"status": [diagnostic]}` (pretty-printed like upstream), on stdout,
no `cospec:` prose on stderr, and exit 1. This is the generic top-level
envelope; `cli-surface-parity` later completes each command's own failure keys
(`changes: []`, `root: null`) so the whole document matches upstream's
per-command payload. It waits for the rebase because the handler it extends is
that change's file. _Rejected:_ building per-command payloads here, which would
edit the command modules that change rewrites.

## Risks / Trade-offs

- [Canonical `base` changes printed paths on symlinked checkouts] → paths now
  match what the binary prints; tests that compared `base` to an uncanonicalized
  temp path are updated in the same task that introduces the walk, and
  `mise run check` runs before each commit.
- [New hard errors break scripts that relied on the silent fall-through] → both
  are listed as BREAKING in the proposal and in the PR description; each error
  carries a fix line naming the exact `cospec` command to run.
- [The port drifts from a future pin] → the differential matrix runs the pinned
  binary on every fixture; a pin bump that changes the walk fails it.
- [Warning deduplication hides a genuinely different warning] → only the exact
  line `resolveRoot` computed is removed.
- [Dropping `--store` for declared/default roots lets the two resolvers diverge
  silently] → gated on the matrix rows (D11) and re-proved by them on every
  contract run; the binary still receives the same cwd, pointer and global
  config cospec read.
- [The health check flags a store `openspec` would still use] → the check is a
  line-for-line port of `inspectRegisteredStore`, pinned by ledger rows for each
  variant against the binary's `.status[0].code`.
- [Shell completion in a rootless directory with registered stores] → the
  resolver now throws there; `__complete` already catches and its generated
  scripts discard stderr, so Tab offers nothing instead of wrong ids.

## Operational surface

- **Where it runs.** On the user's machine inside the `cospec` process; no
  service, container, bind address or secret is involved.
- **User-visible output.** New stderr outcomes in human mode: the
  ignored-pointer warning and the store banner (exit unaffected), and the
  `invalid_store_pointer`, `no_root_with_registered_stores`,
  `store_identity_mismatch`, `invalid_store_metadata` and `unhealthy_store_root`
  failures, each rendered as `cospec: <message>` plus a `Fix:` line and exit
  `1`. The failures replace a silent run against the wrong directory or a broken
  store. After the rebase, a `--json` run turns any of these failures into one
  `{"status": [diagnostic]}` document on stdout (D12). Relayed JSON over a
  pointer or `defaultStore` reports `declared` or `global_default` as its
  `root.source` (D11).
- **Filesystem reads.** The walk stats `openspec/`, `openspec/specs/`,
  `openspec/changes/`, their `.openspec-store/store.yaml`, and
  `openspec/config.yaml`/`config.yml` at each ancestor up to the first
  qualifying one. For a store-selected root it also reads the store's
  `.openspec-store/store.yaml` and stats its root, `openspec/`, config file,
  `specs/`, `changes/` and `changes/archive/`. It writes nothing.
- **Wrapped-binary spawns.** Unchanged on the local path (none). A store lookup
  still spawns `openspec store ls --json`; `defaultStore` is still read with
  `openspec config get defaultStore`; the registry listing for the
  registered-stores error is the one added spawn, and only on a path that used
  to succeed silently. The store-health check adds no spawn.
- **Binary versions.** The walk and its error codes are pinned to the pinned
  binary by the differential matrix. An older binary in the accepted range may
  select roots differently for its own wrapped calls; cospec's own reads and
  writes follow cospec's resolver either way. Wrapped calls carry `--store` only
  for an explicit `--store`; pointer and `defaultStore` roots rely on the binary
  re-deriving the same root, which the matrix proves for the pinned binary
  (D11).

## Integration contract

- **Oracle.** The pinned binary's `openspec list --json` `.root`
  (`{path, source, store_id?}`) for every fixture, and its `.status[0].code`
  where it fails; `openspec status --json` `.root` for the implicit-root fixture
  only. Both run with the same isolated `XDG_DATA_HOME`, `XDG_CONFIG_HOME` and
  `HOME` as the in-process `resolveRoot` call.
- **Store identity.** Store roots still come from `openspec store ls --json` and
  `defaultStore` from `openspec config get defaultStore`; this change adds no
  new wrapped call on the local path. The registry listing is spawned only when
  no qualifying root and no `defaultStore` exist. A listed store's identity is
  then verified against its own `.openspec-store/store.yaml` rather than trusted
  from the listing (D9).
- **Root provenance in relayed JSON.** For `declared` and `global_default` roots
  the wrapped call re-derives the root itself (D11), so relayed `root.source` is
  the binary's own; oracle: `openspec show <item> --json` `.root` over the
  pointer and default fixtures.
- **Flags the binary rejects.** `--store` is never sent to `templates` or any
  `schema` subcommand. `view` already follows the same rule.
- **Failure document.** After the rebase, oracle `.status[0]` (`code`, `target`,
  `fix` with `cospec` for `openspec`) for the `--json` failure rows.
