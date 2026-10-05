# Design

## Context

The proposal lists the gaps and the specs state the behavior. This section
carries only the current state the approach depends on. Every upstream fact
below was read from the pinned package's `dist/` and then probed by running the
binary under Bun, with HOME and every XDG directory redirected into a throwaway
sandbox.

- `list`, `status` and `validate` are table rows (`core/command-table.ts`), so
  their argv arrives parsed on `ctx.parsed`. The five new flags and the two
  `__complete` values are declared there as pending, owned by this change, and
  `parity-pending.yaml` holds the seven matching entries. The reachability test
  requires a flag's entry to leave the yaml in the commit that stops the table
  marking it pending.
- `status.ts` computes a cospec-typed change's matrix natively and spawns
  nothing. Its only wrapped call is the text relay for a schema cospec doesn't
  type. That relay is already respelled; its `--json` answer is a
  `{change, type, legacy}` stub. `status --all --json` emits
  `{changes, root: <path string>}`. That envelope was added to mirror the
  binary's keys, and the binary's `root` is `{path, source, store_id?}`.
- `list.ts` computes every row natively from `listChanges` and `archiveMap`,
  sorted by name. The binary's `list --json` rows carry
  `{name, completedTasks, totalTasks, lastModified, status, nested?}`, sorted by
  the newest file mtime under the change, plus top-level `warnings` (nested
  folders only) and `root`.
- `validate.ts` resolves a name change-first, then spec. It lets the name beat
  the bulk flags, runs every change validation at once through `Promise.all`,
  and reads artifacts with an unguarded `readFileSync`. Its `delegate()` parses
  the binary's issues and relays their messages untouched.
- The resolver (`core/root.ts`) throws `RootSelectionError`, and `cli.ts` turns
  it into `{...jsonFailurePayload, status}` under `--json`. A raw failure is a
  `RawSelectionError` with code `store_error`. `jsonFailurePayload` is a static
  export per module.
- `core/remedies.ts` already carries the `status/next-*` commands and sentences,
  the `validate/*` hints, and `validation/no-deltas-tip`. `respellWholeRemedy`
  rewrites a field only when its whole value is one allowlisted remedy.
- `readArchiveIndex` (`core/change.ts`) throws on an unreadable archive. `list`,
  `status` and `apply` reach it through `archiveMap`, and `archive` uses it for
  its collision checks.

Probed facts that change the plan's wording:

- `status --schema` is a **schema override**
  (`Schema override (auto-detected from config.yaml)`), not a filter.
  `status --all --schema fix` renders every change as `fix`. An unknown name is
  refused before enumeration under `--all` and before the report under
  `--change`, but not with neither flag.
- The binary's unknown-item suggestion is its `nearestMatches`: the five nearest
  ids by Levenshtein distance, no cap, duplicates kept
  (`Did you mean: gamma, gamma, beta, alpha, mobile?`). It isn't `closest()`.
- `--type bogus` silently means no override. `--concurrency 0`, `abc`, and
  `OPENSPEC_CONCURRENCY=abc` silently mean the default. `--sort bogus` means
  `recent`.
- `validate <name> --all` runs the bulk scope and ignores the name.
- An unreadable `changes/archive/` doesn't affect the binary's `list` or
  `status`. An unreadable `tasks.md` is answered by the binary's runtime, not
  its code. The binary confines every artifact output through
  `realpathSync.native` (`FileSystemUtils.canonicalizePotentialPath`) before
  reading it, uncaught. Bun on macOS opens the file to resolve it, so at mode
  000 the binary's `list` answers
  `{changes: [], root: null, status: [{code: "list_error"}]}`, exit 1, and its
  `status --change` answers `change_error`, each naming `realpath`. Bun on Linux
  (CI run 36547287646, as a non-root user) and Node anywhere resolve it without
  opening it: the binary lists and reports the change, exit 0, its
  `countTaskFile` counting the unreadable file as 0 tasks, and `status` marks
  the `tasks` artifact done. Task 11.12 matches both through the binary's own
  answer (D4, D6), never a prediction of it.
- `list` with no OpenSpec root is refused (`no_openspec_root`, exit 1), so a
  `list` whose rows come from the binary answers that refusal where cospec used
  to print `No active changes.`; `status` with no root answers the
  no-active-changes document on an implicit root, as before.
- `__complete schemas` describes every schema as `schema`; cospec keeps each
  schema's `description` from `schemas --json` (D9), and the ids and order
  match.
- `status --change <namespace folder>` is refused with `change_error`, exit 1.
  `status --all` carries the folder as `{changeName, status: [change_error]}`
  and exits 1.
- A change directory with no `.openspec.yaml` resolves to the root's
  `config.yaml` `schema:` (`feat` in a cospec root).

## Goals / Non-Goals

**Goals:**

- One delegated wrapped call per `status --json` or `list` invocation, never one
  per change.
- Keep every cospec key and value, and prove it in the same oracle that proves
  the upstream keys.
- Text-mode `status` on a cospec-typed change stays spawn-free, unless the
  binary decides whether the change can be reported at all (an entry cospec
  cannot read, a `.openspec.yaml` the binary refuses, a schema the binary cannot
  load).

**Non-Goals:**

- `cospec archive`'s namespace-folder refusal (`archive-and-sync-parity`'s row).
  This change exports the detector it will call.
- The binary's interactive validate selector. cospec never prompts, and with no
  item and no flag it validates everything, which is its documented opinion.
- The noun-form `change validate` / `spec validate` commands. Deprecated
  upstream, never in cospec.

## Decisions

### D1. Tracks and files

| Track | Files (exclusive within this change)                                                                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1    | `core/change.ts`, `core/rules/meta.ts`, plus an export hunk in `core/change-metadata.ts` and an import hunk in `commands/new.ts`                                                                                 |
| T2    | `commands/status.ts`, `core/upstream-keys.ts` (new)                                                                                                                                                              |
| T3    | `commands/list.ts`                                                                                                                                                                                               |
| T4    | `commands/validate.ts`, `core/report.ts`, `test/unit/commands/validate.test.ts`, `test/unit/rules/views.test.ts`, `core/rules/views.ts` (its comment only), `test/contract/validation-parity.test.ts` (two rows) |
| T5    | `commands/complete.ts`, `core/completions/{spec,bash,zsh,fish}.ts`, `test/integration/completion.test.ts`                                                                                                        |
| T6    | `test/contract/cli-surface.test.ts` (new), `test/contract/support/key-oracle.ts` (new)                                                                                                                           |
| T7    | `commands/apply.ts` and its unit test                                                                                                                                                                            |
| Docs  | the five docs pages, `.agents/shared.md` (then `agents:sync`) and the archived `validation-parity/tasks.md`                                                                                                      |

Two files are shared across tracks, which the roadmap's track table doesn't
list. `core/command-table.ts` and `test/contract/parity-pending.yaml` get one
hunk per flag, in the task that implements the flag (T2 `--schema`, T3 `--sort`,
T4 `--type`/`--report`/`--concurrency`, T5 the two `__complete` values). The
reachability test requires the yaml line to go in the same commit. Tasks are
sequential in one worktree, so no two hunks are ever in flight. The T1 additions
to `change-metadata.ts` and `new.ts`, T5's `spec.ts` and T4's two test files are
also outside the roadmap's list. Each is the smallest hunk the track's own fix
needs.

Per-command resolver failure codes are handled inside each command's `run()`, so
`cli.ts` and `root.ts` stay untouched (D10).

### D2. The nested-change detector (T1)

`findNestedChangesIn(changesDir, name)` in `core/change.ts` is a synchronous
port of the binary's `utils/nested-change` module. It returns
`{name, nested: string[]} | undefined`, and `describeNestedChange(finding)`
returns the binary's sentence verbatim. That sentence names
`openspec/changes/<id>/` paths, not commands, so it stays unspelled. The three
`looksLikeChange` signals are ported one-for-one:

1. **Root marker.** Any of `.openspec.yaml`, `proposal.md`, `tasks.md`,
   `design.md` present as a regular file.
2. **Populated `specs/`.** `hasAnyFileUnder(specs/)`: any non-dot file or
   symlink at any depth. ENOENT counts as empty. Any other errno is caught by
   the caller, as the binary's `.catch(() => false)` does.
3. **Schema output.** The directory's schema resolves as the binary resolves it
   (its `.openspec.yaml` `schema:`, else `config.yaml` `schema:`, else
   `spec-driven`), across the project, user (D8) and package tiers. The signal
   is set when any artifact's `generates` glob matches a file. A schema that
   can't be resolved gives no signal. The match is the binary's own
   `artifactOutputExists`, ported line for line in `core/glob.ts` (its
   confinement checks and linked-cycle refusal included, each a throw that gives
   no signal), over the binary's matcher: cospec pins `fast-glob` to the version
   the pinned openspec resolves, so braces, numeric ranges, extglobs and
   negation read as the binary reads them. `glob.test.ts` holds the version, the
   brace expansions, the compiled regexes and the answers to the binary's
   modules.

   **Rejected:** loading fast-glob from the wrapped package's tree at run time
   (a standalone install runs the embedded single-file bundle, with no tree to
   load from), and re-implementing picomatch and braces by hand (a second
   matcher to keep in step with the binary's).

The guards follow the binary too: `hasOwnFile` means any non-dot, non-directory
entry. Candidates skip `archive` and dot-names. The collect never descends into
a directory that looks like a change. Depth is bounded at 3 below the folder,
the binary's `MAX_NESTING_DEPTH`. Every unreadable directory reads as empty. The
results are sorted.

**Rejected:** a cheaper detector with only the root-marker signal. The binary's
own reasoning holds for cospec too: a hand-made change that starts from delta
specs, or a custom schema generating into a subdirectory, would read as a
namespace folder and be refused.

`listChanges` drops dot-directories, as the binary's `getAvailableChanges` does,
so status and validate enumerate what the binary enumerates. `list` follows the
binary's own enumeration (D6), which keeps them.

`meta/nested-change` (ERROR, `core/rules/meta.ts`) has path `.` and the
explanation as its message. Its hint is the binary's two next-step bullets,
joined. Two more rules land in the same file for T4:

- `meta/unreadable-artifact`: `could not read <file> (<errno code>)`.
- `meta/item-missing`: `no change directory at openspec/changes/<id>/` or
  `no living spec at openspec/specs/<id>/spec.md`.

### D3. Additive merge (T2, reused by T3)

`core/upstream-keys.ts` exports `mergeUpstream(cospec, upstream, identity)`. It
copies every upstream key absent from cospec's object. It recurses into keys
both documents carry when both values are plain objects. It merges arrays entry
by entry by the identity function (`name`/`change`, `changeName`/`change`,
artifact `id`). An upstream entry with no cospec counterpart is appended, except
into the in-progress status entry's `artifacts: []`: that empty array is
cospec's own pre-existing value, so the binary's artifacts are left out of its
entry before the merge and the key oracle compares it as `kept`. It never
overwrites a cospec value: a key present on both sides whose values differ keeps
cospec's, and the key is returned in a `collisions` list that the oracle's unit
test inspects. The `root` of the status documents is the one planned exception.
`status.ts` sets it to the resolver's `{path, source, store_id?}` (the same
object the binary prints) before merging, so no collision arises.

**Rejected:** porting `planningHome`, `artifactPaths`, `actionContext` and the
rest natively. They're the binary's facts, they differ across the accepted
version range, and a port would drift. Delegation lets a newer in-range binary's
keys flow through, and the oracle pins them against the pinned one.

### D4. Status: next step, delegation, --schema (T2)

**`next` is single-sourced.** `resolveNext(statuses, required, id)` takes the
artifact states in build order as `done | ready | blocked | skipped` and the set
of artifacts the change requires. It returns the first ready required artifact,
else `cospec apply <id>` once every required one is done, else the first ready
artifact of any kind, else nothing — so an unwritten optional artifact never
holds a change back from its gate (the spec's "Required artifacts done points at
the gate" scenario). For a cospec type the states come from cospec's matrix:
`done` is the file present, and `ready` is not done with every requirement done,
where a `skip_specs`-skipped `specs` counts as done. The declared order is the
build order, and a contract row checks that per type against the binary's
`artifacts[]` order. For any other schema the states come from the delegated
document's `artifacts[].status`, with `applyRequires`: every change on such a
schema is answered from the binary's status, whether or not any artifact is
written, since only its own schema names its artifacts (task 11.5; before, a
change with none of cospec's file names read as an empty change pointing at
`proposal`). Only a cospec-typed change is an empty-change entry, and its `next`
is `resolveNext` over its own matrix with nothing done, which is
`cospec instructions proposal` for every type. The JSON `next` and the human
`Next:` line both print its return value. `nextSteps` isn't recomputed: it's the
binary's value from the delegated document, each element passed through
`respellWholeRemedy` (the `status/next-*-sentence` entries).

**Why `next` doesn't copy `nextSteps`:** the binary's decision never finishes
while an optional artifact such as `feat`'s `design` is unwritten. cospec knows
which artifacts are optional and points at its gate instead. Both keys are in
the document, and each says what its own tool would do.

**One delegated call.** `--json` runs `openspec status --change <id> --json` (or
`--all --json`), with `--schema` forwarded when given, threaded with
`root.storeArgs`, in `root.cwd`. Its expected exit codes are {0, 1}. The stdout
deny-list is the existing one. The post-condition is exactly one JSON document
that either carries `changeName === id` (or `changes[]` for `--all`) or carries
a `status` array.

The merge follows D3. A cospec-typed entry keeps cospec's verdict. If the binary
fails for it, the binary's `status` diagnostic is merged in and the exit code is
cospec's. For a schema cospec doesn't type, the exit code is the binary's.

**An unreadable `tasks.md` (task 11.12).** It is the one read cospec and the
binary both make whose outcome is the runtime's: whether the binary reports the
change depends on its `realpath`. So when cospec's own read of a change's
`tasks.md` fails (an observed read, never a `stat`/`access` prediction), the
binary decides whether the change can be reported, through the same one
delegated call, made in text mode only then or for a schema the binary cannot
load (below), so text-mode `status` stays spawn-free otherwise. Where the binary
refuses it (Bun on macOS), its failure is the answer: its document under
`--json`, `cospec status: <message>` in text, and under `--all` a failure entry
carrying its message, into which its `{changeName, status}` merges, exit 1 —
before, cospec's own read refused first and named `open` where the binary names
`realpath`. Where the binary reports it (Linux), so does cospec, the file
counted as no tasks with a `tasks_unreadable` warning.

**A schema the binary cannot load (task 13.1).** cospec grades a cospec-typed
change from its own type matrix, but the binary loads the change's schema before
it reports anything, and refuses the change when the schema is missing from
every tier, unreadable, unparsable or invalid. So when `loadSchema` (the port of
the binary's `resolveSchema`) fails for the change's schema, text mode makes the
same one delegated call, singly and for the sweep, and the binary's refusal is
the answer as above: `cospec status: <message>` in text, a failure entry under
`--all`, exit 1. Before, text mode rendered cospec's own table with
`gate: clear` and exited 0 where `--json` and the binary both refused.

**Metadata the binary refuses (task 13.2).** Before it loads the schema, the
binary reads the change's `.openspec.yaml` through `readChangeMetadata`, which
refuses a file it cannot read, one that is not YAML, one that fails
`ChangeMetadataSchema` (a `created` not `YYYY-MM-DD`, an empty `goal`, a
non-boolean `skip_specs` or `retire_capabilities`, an `affected_areas` not a
list of non-empty strings, an `initiative` not exactly a kebab-case
`{store, id}`), and one naming a schema `listSchemas` does not list. cospec's
own reader keeps only `schema:` and drops the rest, so such a change graded
clean. `changeMetadataRefused` (in `core/change-metadata.ts`, beside the ported
`ChangeMetadataSchema`) mirrors that read, and when it refuses, text mode makes
the same one delegated call and relays the refusal as above. Before, text mode
exited 0 with cospec's table where `--json` and the binary exited 1 with
`Invalid metadata`.

**Rendering a schema cospec doesn't type.** Text mode renders the delegated
document with a port of the binary's `printStatusText`: `Change:`, `Schema:`,
`Change root:`, `Progress:`, the `[x]/[ ]/[-]/[~]` lines, and
`All planning artifacts complete!`. The `Next:` line comes from `resolveNext`.
This replaces the free-text relay, so nothing is regex-respelled.

The same path answers:

- a name that resolves nowhere, where the binary refuses with `Unknown schema`,
  exit 1;
- a change directory with no `.openspec.yaml`. Its schema comes from
  `config.yaml`/`spec-driven` as in D2 signal 3. A cospec type gets cospec's
  matrix at `schemaVersion` 1, and any other name goes this path. The same
  resolution is used by `status` only: `validate`, `apply` and `archive` keep
  their `meta/openspec-yaml` ERROR for a missing file.

**`--schema`** is forwarded to the delegated call. It also replaces the change's
type for cospec's matrix when it names a cospec type, and otherwise sends the
entry down the delegation path. Text mode with `--schema` checks the name
exactly as the binary does (`validateSchemaExists`: project, user and package
tiers). When the name is unknown, it prints the binary's
`Schema '<name>' not found. Available schemas:\n  …` from a delegated `--json`
call, so the list of available schemas is the binary's.

**Namespace folder.** `--change` is refused with the explanation
(`change_error`). `--all` gets a `{change, error}` entry, into which the
binary's `{changeName, status}` merges.

**Unreadable archive.** An errno other than ENOENT from the archive index read
is caught in `status.ts`, `list.ts` and, for `validate` and `apply` (task 11.7),
`readValidateContext` in `validate.ts`, never inside `readArchiveIndex`. The
binary's `validate` and `instructions apply` never read the archive either.
`archive` keeps `buildValidateContext` and `archiveMap`, so its collision check
and its on-disk verification still refuse. The gate is computed from an empty
index. That can only err toward `blocked`, never a false `clear`. The same holds
for the validate rules the archive feeds: a blocker or a revert citation naming
an archived change reads as dangling, an issue added, never one removed.
`apply`'s blocker self-heal only checks boxes for archived changes, so with an
empty index it writes nothing it would not write otherwise. A `warnings` entry
`{code: "archive_unreadable", message}` (`--json`, on every document `validate`
and `apply` print past the read) or a stderr line (text) names the directory. An
unreadable `tasks.md` the binary reports past counts as no tasks, as the
binary's `countTaskFile` counts it, with a `{code: "tasks_unreadable", message}`
warning naming the file the same way, so the read is never silently dropped
(`readChangeTasks`, shared with `list`). Any other read failure while computing
an entry becomes the `change_error` document (`--change`) or a failure entry
(`--all`), as the binary answers.

### D5. The key oracle (T6)

`test/contract/support/key-oracle.ts` walks the binary's document and cospec's
document together. Arrays of objects are matched by an identity per path, and
each shared path falls into one class:

| Class             | Paths                                                                                   | Check                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| exempt            | `version`                                                                               | skipped                                                                                       |
| timing            | `durationMs`, `lastModified`                                                            | present, same JSON type                                                                       |
| verdict           | validate `items[].valid`, `items[].issues[*]`, `summary.totals.*`, `summary.byType.*.*` | present, same JSON type                                                                       |
| collision (named) | validate `items[].type`                                                                 | cospec's value is the schema (change) or absent (spec), and `kind` equals the binary's `type` |
| respelled         | status `nextSteps[*]`                                                                   | equals `respellWholeRemedy(binary value)`                                                     |
| equal             | everything else                                                                         | deep-equal                                                                                    |

A second check snapshots cospec's pre-existing key set per command. The snapshot
is written into the test from the shapes documented before this change, and
every one of those keys must still be present with the value cospec computes
natively.

| Row               | cospec argv                               | Binary argv                               | Fixture                                                                                |
| ----------------- | ----------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| list              | `list --json`                             | `list --json`                             | three changes with staged mtimes (`utimes`), a namespace folder, one change with tasks |
| list --specs      | `list --specs --json`                     | same                                      | two living specs                                                                       |
| status --change   | `status --change alpha --json`            | same                                      | `feat` with only `proposal.md`                                                         |
| status --all      | `status --all --json`                     | same                                      | the list fixture                                                                       |
| validate single   | `validate alpha --json`                   | same                                      | a `feat` change with one delta                                                         |
| validate bulk     | `validate --all --json`                   | same                                      | the list fixture plus a spec                                                           |
| validate findings | `validate --all --report findings --json` | same                                      | same                                                                                   |
| apply unknown     | `apply nope --json`                       | `instructions apply --change nope --json` | any root                                                                               |

The oracle's unit test hands it a document whose `root` is a string and one
missing an upstream key, and expects both to fail.

### D6. List (T3)

`list` always makes one delegated `openspec list --json` call, with
`--sort name` forwarded when the flag's value is `name`, threaded and spawned
like `--specs`. The binary's rows set the order and the membership. Each gets
cospec's native columns by name, computed as today, and D3 merges the rest. Text
mode renders cospec's table in the binary's order. A namespace row shows
`not a change` in the tasks column and has `state: 'not-a-change'`. That
replaces a value that was wrong (it called the folder an empty change), rather
than letting an upstream key overwrite a cospec one. Each of the binary's nested
warnings is printed after the table as `Warning: <message>`.

A delegated failure document (`status` present, exit 1) is relayed as one
document under `--json` and as its messages on stderr otherwise, exit 1. That
covers every read the binary refuses, such as an unreadable change directory or
a `tasks.md` its runtime's `realpath` refuses (Bun on macOS). Where the binary
lists the change instead (Linux), an unreadable `tasks.md` counts as no tasks
with D4's `tasks_unreadable` warning. An unreadable archive is caught as in D4.
A failure reading a cospec-only file, `blocking-changes.md`, becomes
`error: <message>` on that row, and the command exits 1, the same rule
`status --all` applies to a per-change failure. `list --specs --json` copies the
delegated `root` into cospec's `{version: 1, specs}` document.

**Rejected:** porting `getLastModified` and task counting natively to keep text
mode spawn-free. `completedTasks`/`totalTasks` are the binary's own count,
schema-aware through `apply.tracks`, and a native copy would be a second count
under the binary's key.

### D7. Validate (T4)

**Precedence**, in the binary's order:

1. `--report` request validation, before the root is resolved.
2. `--archived`.
3. Any bulk flag, with the name ignored.
4. A name: a forced `--type`, else membership.
5. No name and no flag: everything, cospec's opinion.

**Item resolution** ports `validateDirectItem`: `normalizeType`, a membership
check over `listChanges` ids and living spec ids, the ambiguity refusal and
`nearestMatches` (a port of the binary's `utils/match`). With a forced type, the
`folderStyleNameProblem` guard runs per segment for a spec, then the item is
validated. A change dir or spec file that doesn't exist becomes one
`meta/item-missing` ERROR. Text refusals keep cospec's `cospec: ` prefix before
the binary's message. The ambiguity fix is `Pass --type change|spec.` on every
root, which is the `validate/ambiguous-noun-form` remedy's cospec spelling.

**`--report`** refusals are the binary's four messages and fix, verbatim.
`core/report.ts` gains `toFindings(items, scope)`. It builds
`{version: 1, report: {kind, version: "1.0", scope, returnedItems, totalItems}, itemFindings, summary, root}`.
`report.version` is upstream's nested key, so cospec's own top-level `version`
stays 1. Text `findings` prints cospec's human report with issue-free items
folded into the counts line, which already happens for valid specs. The exit
code is `exitCode(items, strict)` over every item, `full`'s.

**`--concurrency`**: a small promise pool with bound
`normalize(--concurrency) ?? normalize(OPENSPEC_CONCURRENCY) ?? 6`, where
`normalize` is the binary's `parseInt`-positive rule. Reports are collected by
index, so the order is independent of completion. The pool bounds change
validations, each of which may spawn one wrapped `validate <id>`. The single
`--specs` delegation stays one call.

**Keys**: `root` from the resolver's `{path, source, store_id?}`,
`items[].durationMs` measured around each item, and `summary.totals`
(`{items, passed, failed}`) and `summary.byType` for the kinds in scope,
computed in `toJson` beside cospec's `errors`/`warnings`/`byRule`.
`items[].type` stays the schema (D5 collision).

**Unreadable artifacts**: `loadChange` reads through one helper that records
`{path, code}` for any errno. `validateChange` short-circuits to the
`meta/unreadable-artifact` ERRORs, the same way the `.openspec.yaml`
precondition does, and delegates nothing. A namespace folder short-circuits the
same way, to `meta/nested-change`.

**Relays**: `mapDelegated` passes each message through `respellRemedies`.

**`--archived`** (task 11.6) is one wrapped `validate --archived --json` call
with expected exit codes {0, 1} and a post-condition of one JSON document that
is either a report (`items[]`) or the binary's failure document (`status[]` with
an error). A report renders through cospec's renderer as before. A failure
document (an unreadable `openspec/changes/archive/` is `validate_error`
`EACCES … scandir`) is the answer: under `--json` that document, each `message`
and `fix` through `respellRemedies`, with the binary's exit code; in text
`cospec: <message>` (and `Fix: <fix>`) on stderr. Whether the binary is too old
for the flag is read from its `--version` (`openspecBelow(version, "1.9.0")`,
one memoized read shared with the version assertion), never inferred from its
output: before, any answer without `items` was reported as "it needs OpenSpec

> =1.9.0", misattributing a delegated failure.

**Dedupe**: the `archive/target-invalid` entry becomes a function matcher. It
checks the fixed head with an anchored regex, splits the rest on `\n`, and tests
each line against a per-line regex with no repeated group. The header span is
`.*` before a fixed suffix, so a `"` inside the header matches. The ReDoS unit
test uses quote-heavy lines and a non-matching tail, and a bound the pre-fix
pattern provably exceeds. A contract row runs a living spec with a duplicated
`Widget "quoted" name` header.

**The scenario-depth exception.** `views.ts` and `views.test.ts` name the
contract row that proves it. In that row the binary's `archive -y` moves a
change whose delta holds a commented-out `### Scenario:`. `docs/validation.md`
states the standing rule verbatim.

### D8. Schema classification (T1)

`resolveSchema`'s user tier reads `userSchemasDir()`: `XDG_DATA_HOME`, then
`LOCALAPPDATA` on win32, then `~/.local/share`, each with `openspec/schemas`.
That's the binary's `getGlobalDataDir`. The helper already exists privately in
`change-metadata.ts`, and a copy of it exists in `new.ts`. T1 exports the
`change-metadata.ts` one, and `change.ts` and `new.ts` import it, so one place
computes the directory.

### D9. Completion (T5)

`COMPLETE_SOURCES` gains `schemas` and `archived-changes`, and the source is
lowercased before matching. `schemas` calls `openspec schemas --json` and emits
each `name`, described by its `description` or else `schema`. The order is the
binary's.

`archived-changes` reads `openspec/changes/archive/` under the resolved root,
non-dot directories, sorted, each described `archived change`. It makes no
wrapped call. The binary's scripts don't consume this source either, but it's
reachable. The binary reads the archive under `process.cwd()` rather than the
selected root. cospec reads it under the resolved root, a deliberate superset:
the answers agree in a local root, and under `--store` or a store pointer cospec
completes the store's archive, which is the one every other command there
operates on.

`spec.ts` gains `DynamicSource` `schemas`, `FLAG_VALUES` for every row that
declares `--schema`, and subcommand positionals for `schema which`,
`schema validate` and `schema fork`. The three generators render both.

### D10. --json failure documents (T2, T3, T4, T7)

Each of `status`, `list`, `validate` and `apply` wraps its `resolveRoot` call
and catches every `RootSelectionError` under `--json`. It prints
`rootSelectionDocument(error, payload)` and returns 1. The payload is the
binary's per-command null-shape: `{changes: [], root: null}` for `list` and
`status --all`, `{specs: [], root: null}` for `list --specs`, none for
`status --change`, `validate` and `apply`. The payload applies to every
selection diagnostic (an unknown store, a malformed pointer, …), whose code
stays the binary's. For a `RawSelectionError` only, the generic `store_error`
code is replaced by the command's own: `list_error`, `change_error` (`status`,
`apply`) or `validate_error`. Nothing reaches `cli.ts`'s generic handler from
these four commands under `--json`, so `cli.ts` and `root.ts` are untouched and
no module needs a flag-dependent `jsonFailurePayload` export. Text mode is
unchanged, and the error propagates as today.

**`apply`**: its four early exits (no root, unknown change with the
`Did you mean` suggestion folded into the message as `status` does, a failed
legacy delegation, a failed step-5 call) each print one
`{status: [{severity: "error", code: "change_error", message, fix?}]}` under
`--json`. `change_error` is the code the binary's `instructions apply` uses for
the same lookups. A unit test drives every path.

### D11. Every upstream string is probed, never hand-typed

Each string below is read from the pinned binary's output in a contract row, not
copied into a test:

- the nested-change explanation and its `nested_change_directory` warning;
- `list_error` and `change_error` on an unreadable `tasks.md`;
- `ambiguous_item`, `unknown_item` (with the suggestion list) and
  `invalid_item`;
- the four `invalid_validation_report_request` messages and their fix;
- `Schema '<name>' not found. Available schemas:`;
- `Unknown schema '<name>'. Available:`;
- the `nextSteps` sentences;
- the `__complete` `schema` and `archived change` descriptions and the schema
  order.

Where cospec prints one of these in its own text, the unit test imports the same
constant the command uses.

### D12. Docs

The page that owns each fact is updated:

- `reference/commands.md`: the list/status/validate/`__complete` rows, the
  flags, the JSON keys and the BREAKING items.
- `reference/validation-rules.md`: the three `meta/*` ids and the
  `--json`/findings shapes.
- `concepts/how-it-relates-to-openspec.md`: namespace folders are now detected,
  not relayed, and `--schema` is an override.
- `docs/architecture.md`: the additive-merge and one-delegated-call pattern, and
  the detector's home.
- `docs/validation.md`: the standing rule.

`.agents/shared.md` gains one Engineering-discipline paragraph, since this
change sets a convention every later JSON change follows (`archive --json`
next). The paragraph: upstream keys are added to cospec's JSON documents from
one delegated call, merged by identity through `core/upstream-keys.ts`; no
cospec key or value is removed or changed; `version` stays 1; and the key oracle
(`test/contract/support/key-oracle.ts`) with its named collision list is the
gate. `mise run agents:sync` propagates it to `CLAUDE.md` and `AGENTS.md`.

`test/contract/support/remedy-sources.ts` holds no entry owned by this change.
Every upstream sentence the new relays print (the `status/next-*` commands and
sentences, `validate/*`, `validation/no-deltas-tip`) is already an allowlist
entry, and `remedy-enumeration.test.ts` stays green unchanged.

## Operational surface

The interactive surface is the human and `--json` output of `list`, `status`,
`validate`, `apply`'s failure paths and `__complete`.

- Five flags become accepted.
- JSON documents gain keys. The one value change is `status`'s `root`.
- Three rule ids are new.
- The `list` default order changes, and exit codes change only as BREAKING
  lists.

`status --json` and every `list` now make one wrapped spawn each, where before
they made none (human `status` on a cospec-typed change still makes none). That
adds the pinned binary's start-up time to those commands. There's no bind
address, container, secret or connection limit. The wrapped binary is still
resolved by path at the pinned version, inside the accepted range. Every
contract row spawns it the way the suite does, under Bun with the product env
and a sandboxed HOME.

## Risks / Trade-offs

- [`list` and `status --json` depend on the wrapped call succeeding] → The
  binary's own failure is relayed as its document, the exact parity answer.
  cospec-only reads fail per row.
- [The named `items[].type` collision contradicts the roadmap's single-exemption
  wording] → Kept because the value is documented cospec contract
  (`validation-rules.md`), and `kind` already carries upstream's meaning. The
  oracle pins the collision, so any second collision fails.
- [Changing `status`'s `root` from a string to an object breaks a caller reading
  it as a path] → BREAKING in the proposal. The key was added to mirror the
  binary's key, and an object `root` is what the binary's callers expect.
- [A newer in-range binary adds status keys] → They flow through D3 unchanged.
  The oracle pins the pinned binary's set.
- [An unreadable archive makes the gate read `blocked`] → Conservative by
  construction, with a warning naming the cause. It never reads `clear` falsely.
- [The detector's schema-output signal resolves a schema per candidate] →
  Bounded to directories with no marker and no `specs/` file, which is the
  binary's own cost profile.
