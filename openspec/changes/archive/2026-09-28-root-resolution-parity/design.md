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
- `cospec templates` and `cospec schema <sub>` spawn in every resolved root
  (store-backed, walked or implicit); the store-backed case is the one that was
  broken, not the limit of the goal.
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

_Amended in review:_ `doctor` resolved the root but ran its local checks against
`ctx.cwd`, so from `<repo>/src/deep` it reported only
`no openspec/ directory at <repo>/src/deep` and skipped the `references:`
relationship section, where the binary's `doctor --json` reports the enclosing
root. Its local checks and `hasReferencesConfig` now read `root.base` for a
`nearest` root and keep `ctx.cwd` otherwise, which leaves the explicit-`--store`
bare-workspace case (the reason `doctor` resolves before its `initialized`
check) unchanged. The hunk is minimal because `passthrough-json-and-doctor` owns
`doctor.ts` and rebases onto it; what `doctor` should read for a pointer or
`defaultStore` root is left to that change.

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
`store_identity_mismatch`, `invalid_store_metadata`, `unhealthy_store_root`),
plus one code of cospec's own, `directory_not_found` (target `cwd`), for a
`--cwd` that is not an existing directory: upstream has no `--cwd`, so it has no
code to mirror. `fix` is optional, as upstream's is; `directory_not_found`
carries none, since the message already names the only thing to change.
`Error.message` is the diagnostic message plus a `\nFix: <fix>` line when there
is a fix, so the existing top-level handler in `index.ts` prints
`cospec: <message>` and `Fix: <fix>` with no change to `index.ts` or `cli.ts`
before the rebase (the post-rebase `--json` branch is D12). Both the message and
the fix replace `openspec` with `cospec` in every command they name
(`cospec init`, `cospec store register`, `cospec config unset defaultStore`,
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

_Amended in review:_ `defaultStore` is read the same way, raw. Upstream's
`resolveOpenSpecRoot` takes `getGlobalConfig().defaultStore` — parsed JSON —
tests it for truthiness and hands it to `validateStoreId` and the registry
lookup unchanged. cospec read it through `openspec config get defaultStore` and
trimmed the text, so `" beta "` and `"beta\n"` selected `beta` where the binary
fails with `invalid_store_id`, `["beta"]` (printed as JSON) failed as
`invalid_store_id` where the binary reports `unknown_store 'beta'`, and `false`
looked up a store named `false` (`unknown_store 'false'`) where the binary
treats it as unset. `readDefaultStore` now asks `openspec config path` for the
file (path discovery stays the binary's), parses it as JSON, and returns the raw
value; a missing file, a `SyntaxError` and a non-object root read as unset, as
upstream's defaults do. `validateStoreId` and `resolveStore` take `unknown` and
reproduce upstream's checks as written (`length === 0`, strict `===`, regex
tests on the stringified value, strict lookup).

_Amended in review round 3:_ the read mirrors `getGlobalConfig()` whole. Round
2's read let an EISDIR or EACCES propagate, which crashed every root-selecting
command from a rootless directory where the binary (and `main`, whose
`config get` answered defaults) carried on with no `defaultStore`; upstream's
documented contract is "defaults if the file doesn't exist or is invalid", so
parity wins over cospec's never-swallow rule, which covers cospec's own errors.
`readDefaultStore` now answers undefined when `existsSync` is false and for any
throw from reading or parsing the file, and for a `SyntaxError` prints
upstream's exact `Warning: Invalid JSON in <path>, using defaults` (it names no
command, so nothing is respelled) once per path per process, as upstream's
`warnedInvalidJsonPaths` does, through `printOwnLine`: a wrapped call that
re-reads the file in the same invocation has its copy stripped (D7), so the line
appears once. The binary prints it only where its own selection reads the file
(a rootless directory, not below a root); so does cospec. `templates` and
`schema` are the one place the line is cospec's alone (D8).

_Amended in review round 4:_ `templates` and `schema` do not print it. The
binary never reads the global config for them, so the line was the one byte
their cwd-fallback answer differed by. `readDefaultStore` takes `warn: false`,
which `resolveRoot`'s `globalConfigWarning: false` passes and `callPassthrough`
sets for a `spawnInRoot` call; the file is still read and still reads as unset.
Every other root-selecting command prints the line once, as the binary does.

_Amended in review round 5:_ `globalConfigWarning` is now the general `quiet`
option (D7, D8). A quiet read does not record the path as warned, so a later
non-quiet read in the same process still prints the line once.

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

_Amended in review round 5:_ `templates` and `schema` print none of these lines
at all. The binary never runs root selection for them, so on a planning root
with a `store:` pointer it prints no ignored-pointer warning, and on a
store-selected root no banner; cospec printed both from its own `resolveRoot`,
which the "nothing to strip" reasoning above did not cover. `resolveRoot` takes
one `quiet` option that suppresses every line it would print (the
ignored-pointer warning, the banner, and the invalid-global-config warning of
D5), without registering any of them for relay suppression. `callPassthrough`
sets it for a `spawnInRoot` call only (`templates`, `schema`). `view` also
spawns in `root.base`, but it calls `resolveRoot` without `quiet`, so it keeps
printing these lines once, unchanged, as does every other command.

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
which keeps the subdirectory failure for cospec's own typed schemas. After the
rebase, `unknown-option-contract`'s `storeInArgv` marker on the `templates` and
`schema` rows (which kept a post-command `--store` in the argv for the binary to
refuse) is removed: `--store` is cospec's global there too, in either position,
selecting the root the call spawns in, so `cospec --store <id> templates` and
`cospec templates --store <id> --bogus` read the store (the latter naming
`--bogus`) where `openspec` names `--store` — part of the same superset.

_Amended before review:_ `templates` also relays the binary's text failure under
`--json`. Upstream's `templates` action calls `failWithError(error)` with no
JSON option, so an unknown `--schema` (or any failure after the parse) is
`✖ Error: …` on stderr, nothing on stdout, exit 1, even with `--json`. cospec
reported that as `did not emit a single parseable JSON document`, a cospec
violation. `PassthroughOptions` gains `textFailure`, which `templates.ts` sets:
`enforcePassthroughJson` then returns a non-zero call with empty stdout as it
is, while a success, or a failure that printed anything on stdout, is still held
to one document. `templates.ts` relays through `relayRespelled`, so a failed
answer's remedies go through the allowlist (the probed refusals name no command)
and a success is verbatim.

_Amended in review:_ spawning in the root must not make a selection failure
fatal where the binary never selects one. Upstream's `templates` and `schema`
actions read their own working directory, so a rootless directory with stores
registered, a malformed or dangling pointer, or a stale or broken `defaultStore`
all succeed there, and `main` (which spawned them in the cwd) succeeded too for
the first two; this change made every one of them exit 1. `callPassthrough` now
catches a `RootSelectionError` on a `spawnInRoot` call with no explicit
`--store` (`isCwdFallback`) and spawns in `ctx.cwd` with the threaded flags and
no `--store`, so the answer, including a parse refusal and any file
`schema fork`/`init` writes, is the binary's in that directory. The catch
excludes `directory_not_found` (cospec's own; there is no directory to run in)
and any explicit `--store`, empty or not, which keeps its diagnostic: the binary
takes no `--store` on these commands, so there is no upstream answer to fall
back to. _Rejected:_ falling back for a store-backed root that resolves, which
would undo the superset for the working case.

_Amended in review round 3:_ the fallback answers as the binary does except for
one stderr line. Upstream's `templates` and `schema` never read the global
config, while cospec reads `defaultStore` to select a root for them; a config
file that is not JSON therefore prints upstream's `Warning: Invalid JSON …` line
(D5) on cospec's stderr ahead of the binary's answer, which is otherwise
byte-for-byte the binary's (stdout, the rest of stderr, exit code). It is the
same class of line as the store banner these commands print on a store-selected
root, and it names the file cospec acted on. _Rejected:_ muting it for these two
commands, which would hide why a broken config left the user in the cwd rather
than the `defaultStore` root.

_Amended in review round 4:_ that rejection is reversed, and the fallback is now
byte-for-byte the binary's. Parity wins: the binary never reads the global
config for `templates` or `schema`, so it never warns there, and the warning was
the only difference left. `callPassthrough` resolves a `spawnInRoot` call with
`globalConfigWarning: false` (D5); a broken config still reads as no
`defaultStore`, silently, as the binary's own unread config would.

_Amended in review round 5:_ the same holds for every line root selection
prints, not only the global-config warning. `templates` and `schema` print no
resolver line on any route: not the ignored-pointer warning on a planning root
with a `store:` pointer (from the root or a subdirectory), and not the store
banner on a root selected by a pointer, `defaultStore` or `--store`. Their
stderr is the binary's alone (its own `Note:` and spinner lines).
`callPassthrough` resolves a `spawnInRoot` call with `quiet: true` (D7), which
replaces round 4's `globalConfigWarning: false`. The root selected, and so the
directory the call spawns in, is unchanged.

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

_Amended in review:_ the registry read itself fails the way upstream's does.
With a registry file the binary cannot parse, `openspec store ls --json` exits 1
with
`{stores: [], status: [{code: invalid_store_registry, target: store.registry, fix: "Repair or remove <registry path>."}]}`,
and upstream's resolver raises the same diagnostic from its own registry read
(`fromStoreError`), behind the `Declared in <file>: ` or
`Global defaultStore '<id>': ` prefix for a pointer or `defaultStore` selection.
cospec declared exit 0 only, so every such selection reported a wrapped-call
violation. `openspecStoreList` now accepts exit 1 and throws
`StoreRegistryError` (an `OpenspecCallError` carrying the diagnostic) when
`status` has an `error` entry, and still throws a plain `OpenspecCallError` for
exit 1 without one; `root.ts`'s `registeredStores` turns it into a
`RootSelectionError` with the message and fix spelled through
`core/remedies.ts`, so `withOrigin` adds the prefixes and the `--json` document
and text failure are the binary's. The class lives in `openspec.ts` because
`root.ts` imports that module (`import/no-cycle`); `store.ts`'s post-condition,
which only lists, still sees an `OpenspecCallError`. `RootDiagnostic.target`
becomes optional, as upstream's is, so a relayed diagnostic without one is never
given an invented value.

_Amended in review round 3:_ only a `StoreError` becomes a selection diagnostic.
Upstream's `fromStoreError` converts a `StoreError` and rethrows anything else
raw, so a registry file the user may not read (`EACCES`) fails `openspec list`
with `✖ Error: EACCES: permission denied, open '<path>'`, no origin prefix and
no fix, exit 1, and under `--json` a per-command code (`list_error`,
`change_error`, `show_error`, `context_failed`); `store ls` reports the same
errno under its fallback code `store_error`. Round 2 converted every `store ls`
error, so a pointer or `defaultStore` selection printed the errno behind
`Declared in <file>: ` or `Global defaultStore '<id>': `. `openspec.ts` now
exports `STORE_ERROR_CODES`, the 31 codes the pinned `dist/core/store/*.js`
raises as `StoreError` (a contract row re-enumerates them from the dist, so a
pin bump that adds one fails until it is listed), and
`StoreRegistryError.storeError` says whether the diagnostic's code is one.
`registeredStores` converts a `StoreError` diagnostic as before and throws any
other as a `RawRegistryError`, a `RootSelectionError` subclass carrying the
binary's message verbatim with no target or fix, which `withOrigin` rethrows
unprefixed; `templates` and `schema` still fall back to the cwd for it (D8), as
the binary never reads the registry there. The raw case's `--json` `code` is
`store ls`'s `store_error`, not the binary's per-command code: that code field
is owned by `cli-surface-parity` (roadmap row 37); this change pins the message
and the exit code.

_Amended in review round 4:_ one read helper owns every read the resolver makes.
Round 3 closed the raw-errno class for the registry only: a selected store's
`.openspec-store/store.yaml` that is a directory or unreadable, or an
`openspec/` it may not search, still escaped `resolveRoot` as a bare errno, so
`--json` printed no document and `templates`/`schema` lost their cwd fallback,
where the binary exits 1 with the errno's message (store routes) and answers
those two in the cwd. `root.ts` now reads the filesystem only through
`resolverRead(path, read)`: `ENOENT` is `null` (absent), any other errno is a
`RawSelectionError` (the general subclass that replaces `RawRegistryError`:
`code` `store_error`, the binary's message, no target, no fix, rethrown
unprefixed by `withOrigin`), and any other throw propagates. Its message is
`error.message` verbatim, with no reformatting: probed directly against
`node:{20,22,24,25}` (22 is what `ci-bun` pins) and current `bun`, on both Linux
and macOS, a failed `read` (`EISDIR: illegal operation on a directory, read`)
carries no path on either runtime — a real difference from `stat`/`open` errnos,
which do — so there is no gap to paper over by re-appending a path neither
side's message has. (An earlier round of this file assumed Node always names the
path and Bun never does, based on a probe against a Node line newer than any
this project targets; reappending the path there produced a message the pinned
binary, run under a supported Node, does not print — a real divergence CI's own
Node 22 run caught, not a flaky comparison.) `stat`'s own errno carries a
second, narrower runtime difference that is not a case with nothing to
reconcile: libuv names the failing syscall `stat` under Node always (so that is
what the binary prints), but `statx` under Bun on a Linux kernel new enough for
libuv to use that syscall there, and `stat` elsewhere (macOS locally, some CI
kernels) — the project's own unit tests capture Bun's own message rather than
assert a literal, for exactly this reason (`root.test.ts`, "raw read failures").
Byte- for-byte parity with the binary, this class's own contract, means the
syscall name must read `stat` regardless of what this runtime calls it, so
`statPath` (the resolver's one `stat` call site) rewrites a bare `, statx '`
segment to `, stat '` after `resolverRead` returns the raw error; `readText`'s
message for a failed `read` is untouched, since Node and Bun already agree
there. Found by CI's own Linux runner on a kernel where Bun's `statSync` does
name it `statx` (ledger 5.22's mode-000 `openspec/` rows, not reproducible on
this project's macOS dev machines, where Bun already says `stat`); ledger 5.23's
matching unit row now applies the same rewrite to its dynamically captured
expected message, so it stays exact under either kernel rather than
tautologically comparing cospec to itself. Each caller then applies upstream's
own semantics for that file: the store metadata read
(`readOptionalStoreMetadataState`) and the root-health stats
(`inspectOpenSpecRoot`'s `pathKind`) let the raw error stand; the pointer read
(`readStorePointer`) treats any read failure as `unparseable`; the global config
(`getGlobalConfig`) as defaults; the ancestor walk and the pointer's existence
probe (`existsSync`, a catch-all `statSync`) as absent. A registry `store ls`
reports with a non-`StoreError` code becomes the same `RawSelectionError`.
`assertInvocationDirectory` stays outside the helper: `--cwd` is cospec's own,
and a directory the user may not stat must not become a selection failure
`templates` and `schema` would run in. A fault-injection sweep (ledger 5.22)
makes each file a directory and mode 000 on every route and compares cospec with
the binary under Node.

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
edit the command modules that change rewrites. `unknown-option-contract` landed
no top-level `--json` renderer (`index.ts` still prints prose and never sees
`--json`), so the branch sits in its `cli.ts` dispatcher, around the command
module's `run`: a `RootSelectionError` in a `--json` run is written by
`rootSelectionDocument` (keys `severity`, `code`, `message`, `target`, then
`fix` when there is one) and returns exit 1; everything else is rethrown to
`index.ts`. Where the binary's own failure document is that envelope alone
(`show`, `instructions`, `status`, `validate`), cospec's is byte-for-byte the
same; where the binary adds its command's empty payload (`context`'s
`root`/`members`, `schemas`'s `schemas`/`root`, `list`'s `changes`/`root`,
`list --specs`'s `specs`/`root`), those keys are `cli-surface-parity`'s.
_Amended before review:_ `context` and `schemas` already relayed the binary's
whole failure document on `main`, so the generic envelope alone was a regression
there. A command module may export `jsonFailurePayload`, which the dispatcher
passes to `rootSelectionDocument(error, payload)`; the document is
`{...payload, status}`, upstream's `w4` order. `context` exports
`{root: null, members: []}` and `schemas` `{schemas: [], root: null}`, for every
resolver failure (the binary prints them for `no_root_with_registered_stores`,
`unknown_store` and `invalid_store_id` alike). `list`'s and `list --specs`'s
keys stay `cli-surface-parity`'s.

**D13. An empty `--store=` reaches the resolver (post-rebase).**
`unknown-option-contract` refused an empty `--store` at parse time with
`… argument must not be empty`. Upstream accepts it while it parses and fails in
its action with `invalid_store_id`, so on every row that selects its root
through `--store` (a table row marked `store: 'accepted'`, and the forward rows
`show`, `schemas`, `templates` and `schema`, which now carry the same marker)
`cli.ts` hands the empty value to `flags.store`, where `validateStoreId` raises
it: `cospec: Store id must not be empty` and upstream's `Fix:` line, or the D12
document. It keeps its place in the order (after help and every parse refusal).
An empty `--cwd` (cospec's own flag) and an empty `--store` on `store`,
`workset` and `config`, which take no root, keep the parse-time refusal. As in
upstream, the last `--store` wins (`--store= --store alpha` selects `alpha`).

**D14. On a forward row the binary's parse refusal comes first (post-rebase).**
Upstream parses a command's argv before its action selects a root, so
`openspec schemas --bogus --store nosuch` names `--bogus`. A forward row hands
its argv to the binary unparsed, so when `resolveRoot` throws for one
(`ctx.parsed` unset), `callPassthrough` asks the binary about the same argv with
cospec's threaded flags and no `--store`, in a fresh `mkdtemp` directory that is
removed afterwards — never the user's directory, since an argv that parses runs,
and `schema init`/`fork` write. A commander refusal or the `--store-path`
redirect is relayed as the answer; any other result is discarded and the
selection failure stands. One extra spawn, on the failure path only. A table
row's argv was already parsed by the table, so its refusal already comes first.
_Rejected:_ spawning the probe in the invocation directory (a parsing
`schema init` would write there), and re-deriving the binary's parse from the
table's declared flags (the binary is the parse authority on forward rows).

**D15. A structural respell helper for relayed JSON, and `schema`'s relays
(post-rebase).** `passthrough-command.ts` exports
`respellCommandFields(doc, fields)`: each `CommandField` names a path of keys
into a parsed `--json` document (`'[]'` steps into every array element) and the
fixed lead upstream prints before the command in that field (`Run: `); a value
that starts with the lead and `openspec ` has that one token spelled `cospec `,
and nothing else changes, so a store id such as `openspec-team` survives.
`renderJsonDocument` renders the result as the binary renders its own.
`upstream-spellings` (instructions' reference block) and
`passthrough-json-and-doctor` (context's) render their text from the rewritten
structure. The "Create one with: openspec new change <name>" sentence it was
first asked for is not reachable through `templates`: the pinned
`dist/commands/workflow/templates.js` calls only `validateSchemaExists`, and the
sentence lives in `validateChangeExists`
(`dist/commands/workflow/shared.js:129`, `:144`), which only `instructions` and
`status` reach. Every such caller passes its own `newChangeHint` (allowlisted on
its own line and respelled by those relays), so `validateChangeExists`'s
fallback `hints.newChangeHint ?? 'openspec new change <name>'` is never printed:
`support/remedy-sources.ts` classifies that line `notRelayed` with the probed
reason rather than as the `workflow/new-change-hint` entry, and no relay of
`templates` is claimed to reach any `Create one with` sentence. `schema.ts` now
relays through `relayRespelled`, so a failed call's `"openspec schema fork"`
remedy is spelled through the allowlist in text and in the `--json`
`suggestion`; `schema init`'s `--json` success document names no command. Its
human success output ends with `  3. Use with: openspec new --schema <name>`,
the last line the binary writes (the lines before it carry the schema's path,
where a user's directory name could read like the sentence), so only that final
line is spelled, and only when it is exactly that shape with the kebab-case name
the binary validated; the `REACHABLE_OWNED` entry for it is removed.

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
  `{"status": [diagnostic]}` document on stdout (D12), an empty `--store=` is
  one of them (D13), and a forward row's parse refusal is relayed ahead of them
  (D14). Relayed JSON over a pointer or `defaultStore` reports `declared` or
  `global_default` as its `root.source` (D11).
- **Filesystem reads.** The walk stats `openspec/`, `openspec/specs/`,
  `openspec/changes/`, their `.openspec-store/store.yaml`, and
  `openspec/config.yaml`/`config.yml` at each ancestor up to the first
  qualifying one. For a store-selected root it also reads the store's
  `.openspec-store/store.yaml` and stats its root, `openspec/`, config file,
  `specs/`, `changes/` and `changes/archive/`. It writes nothing.
- **Wrapped-binary spawns.** Unchanged on the local path (none). A store lookup
  still spawns `openspec store ls --json`; `defaultStore`'s file path comes from
  `openspec config path` (it was `openspec config get defaultStore` until the
  review, D5); the registry listing for the registered-stores error is the one
  added spawn, and only on a path that used to succeed silently. The
  store-health check adds no spawn. A forward row whose selection fails spawns
  the binary once more, in a scratch directory it removes (D14).
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
  `defaultStore` from the global config file at the path `openspec config path`
  prints; this change adds no new wrapped call on the local path. The registry
  listing is spawned only when no qualifying root and no `defaultStore` exist. A
  listed store's identity is then verified against its own
  `.openspec-store/store.yaml` rather than trusted from the listing (D9).
- **Root provenance in relayed JSON.** For `declared` and `global_default` roots
  the wrapped call re-derives the root itself (D11), so relayed `root.source` is
  the binary's own; oracle: `openspec show <item> --json` `.root` over the
  pointer and default fixtures.
- **Flags the binary rejects.** `--store` is never sent to `templates` or any
  `schema` subcommand. `view` already follows the same rule.
- **Parse refusals.** For a forward row whose selection fails, the binary's
  answer to the same argv in a scratch directory; oracle: the same argv run
  through the pinned binary in the invocation directory (D14).
- **Failure document.** After the rebase, oracle `.status[0]` (`code`, `target`,
  `fix` with `cospec` for `openspec`) for the `--json` failure rows.
