# Design

## Context

The proposal lists the gaps and the specs state the behavior. This section
carries only the current state the approach depends on. Every upstream fact was
read from the pinned package's `dist/core/archive.js`,
`dist/core/specs-apply.js` and `dist/core/root-selection.js`, then probed by
running the binary under Bun with HOME, every XDG directory, `CODEX_HOME` and
`ZDOTDIR` redirected into a throwaway sandbox. Facts marked "Linux" were probed
in `oven/bun:1.3.14` as uid 1000, with the worktree mounted read-only at `/w`.

- `commands/archive.ts` runs: resolve → `validateChange` (archive-precondition
  family unless specs are skipped) → tasks gate →
  `archive/verification-incomplete` → self-blocker warning → slot collision
  check → `archive/scenario-preservation` (inline, lines 412–446) →
  `openspec archive <id> -y [--skip-specs]` in human mode → on-disk verification
  → post-merge spot-check → blocker fan-out. Every gate refusal writes stderr
  prose and no JSON document. The only JSON failure document is
  `reportArchiveFailure`'s
  `{change, type, archived: false, reason, openspecExit}`, and it relays the
  binary's output with no respelling.
- `archive --no-validate` is `pending('archive-and-sync-parity')` in
  `core/command-table.ts`, with the matching `parity-pending.yaml` entry.
- `findScenarioDrops` (`core/deltas.ts`) already takes a `ScenarioBaseline`
  branded to the verbatim view, and `archive.ts` passes `parseLivingSpec(…)`
  (whose top level is the verbatim view) and `parseDeltaSpec` deltas (`Delta`,
  fences masked, comments kept). validation-parity left the gate on that view.
- `core/remedies.ts` already carries every `core/archive.js` sentence and
  command (`archive/*`, `validation/purpose-placeholder`). `remedy-sources.ts`
  lists them as relayed, but `archive.ts` never calls `respellRemedies`.
- `findNestedChangesIn`, `describeNestedChange` (`core/change.ts`), `rootOutput`
  and the additive merge (`core/upstream-keys.ts`), and the key oracle
  (`test/contract/support/key-oracle.ts`) all exist from cli-surface-parity.
- The binary's archive claim is
  `openspec/changes/archive/.openspec-archive.lock`, taken just before the first
  spec write or the move and released in a `finally`. Issue #60 was a doubled
  process run, not this code path, and was fixed in 0.8.3 by
  standalone-json-once.

Probed facts, including where the binary contradicts the roadmap row and wins:

1. **The verbatim-view obligation is already met on `main`.** A MODIFIED block
   that keeps a living scenario only inside a comment archives under
   `cospec validate --strict`, `cospec archive` and the binary. A commented
   living scenario the block omits is refused by both archives, and the binary
   names it. A commented requirement header at the end of the living spec blocks
   neither. R7 still moves the gate into the shared helper, and the ledger RUNS
   these three fixtures through `cospec archive` and the binary (verification
   group 3), so a later regression can't pass on a type check.
2. **Row 39 is broader in the binary than in the roadmap's T2 wording.** On a
   capability with no living spec, `buildUpdatedSpec` warns
   `N REMOVED requirement(s) ignored for new spec (nothing to remove)` and
   continues. ADDED + REMOVED archives without `retire_capabilities`.
   REMOVED-only under the marker archives as
   `Specs already in sync; no files changed.` (`decideSpecOutcome` → `skip`).
   REMOVED-only without the marker is refused with
   `Spec must have at least one requirement`: the rebuilt spec has none, so the
   cause is not the REMOVED. The binary's `validate --strict` passes all three.
   So T2 never fires on REMOVED (D9).
3. **The success document also carries `warnings`.** The binary's `archive`
   object is `{change, archivedAs, path, specsUpdated, totals?, warnings?}`.
   `totals` is absent under `--skip-specs`, `warnings` is absent when empty, and
   `path` and `root.path` are canonical (`/private/var/…` on macOS). The roadmap
   row lists the keys without `warnings`, and cospec adds it as the binary does.
4. **An unreadable archive directory gets a runtime-dependent answer.** At mode
   000 the binary answers `archive_path_outside_root`
   (`Refusing to archive through a path outside the OpenSpec root: <archiveDir>`)
   under Bun on macOS. There `FileSystemUtils.assertPathWithin`'s
   `realpathSync.native` fails on the directory. Under Bun on Linux it answers
   `archive_error` (`EACCES: permission denied, statx '<archiveDir>/<slot>'`)
   from `assertArchiveDestinationAvailable`'s `lstat`. Both exit 1, and both
   leave no lock. cospec today prints `cospec: EACCES … scandir` and no
   document.
5. **`--no-validate` in the binary also turns off retirement and rebuilt-spec
   validation** (`decideSpecOutcome`: "Under --no-validate … nothing is
   retired"). Under `--json` the binary refuses without `--yes`
   (`archive_confirmation_required`). Human mode with `-y` prints
   `⚠️  WARNING: Skipping validation may archive invalid specs.` and archives.
6. **Root resolution in a scratch directory.** `resolveOpenSpecRoot` walks to
   the nearest `openspec/`. A directory with `specs/` or `changes/` is a real
   root, and it wins over a `store:` pointer in its `config.yaml`, with only a
   stderr warning. A scratch tree that always has both directories therefore
   always resolves to itself.
7. **The binary refuses a symlinked capability alias after taking its claim.**
   With `openspec/specs/alias -> widgets` and deltas for both, the binary throws
   `Spec updates for 'alias' and 'widgets' resolve to the same target …` and
   releases the claim. `cospec validate --strict` passes this tree. This is a
   real binary refusal that cospec's pre-merge checks don't predict, so the
   no-lock row uses it (D11).

## Goals / Non-Goals

**Goals:**

- Every archive answer under `--json` is one document carrying the binary's keys
  and codes, with no cospec key removed or changed.
- `sync-specs` writes nothing the binary's own archive wouldn't, and runs the
  binary nowhere but a scratch tree.
- `archive` makes no more wrapped calls than before. `sync-specs` makes exactly
  one.

**Non-Goals:**

- The binary's interactive archive picker and its confirmation prompts. cospec
  archive never prompts, and that is its documented opinion (`--yes` is a
  declared no-op).
- Narrowing a sync to a subset of a change's delta files, as upstream's agent
  workflow lets `bulk-archive` do. Bulk-archive's collision resolution is R13's
  T6 (`canon-workflow-parity`), which edits delta files and archives every
  change through `cospec archive`.
- Upstream's agent-driven "intelligent merge" in `sync` (an ADDED for an
  existing requirement treated as MODIFIED, unmentioned scenarios preserved).
  cospec's sync is the archive merge itself, which is what keeps the later
  archive a no-op and the hard gates meaningful.

## Decisions

### D1. Tracks and files

| Track | Files (exclusive within this change)                                                                                                                                                                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T5    | `test/contract/archive-no-validate.test.ts` (new), `test/contract/sync-specs.test.ts` (new), shared fixture builders in `test/contract/fixtures.ts` (append only)                                                                                         |
| T2    | `core/rules/archive.ts`, its unit test, `test/unit/rules/views.test.ts` (only if a fixture changes)                                                                                                                                                       |
| T1    | `commands/archive.ts`, `core/scenario-gate.ts` (new), `core/archive-output.ts` (new: the Totals/in-sync line reader and the failure-document builder, shared with T3), the `archive --no-validate` hunk in `core/command-table.ts`, `parity-pending.yaml` |
| T3    | `commands/sync-specs.ts` (new), `core/scratch-root.ts` (new: scratch copy, copy-back, cleanup), the `sync-specs` row in `core/command-table.ts`, the dispatch entry in `cli.ts`                                                                           |
| T4    | `canon/workflows/sync-specs.md`, `canon/workflows/archive.md`, the `sync-specs` description in `canon/workflows/harness.yaml`, and the regenerated harness trees                                                                                          |
| Docs  | the pages in D14, `.agents/shared.md` (then `mise run agents:sync`)                                                                                                                                                                                       |

The roadmap's "`cli.ts` (`COMMANDS` only)" means the command table, per the
standing reading recorded for R1. `command-table.ts` is shared by T1 and T3.
Each touches only its own row, in the task named for it.

### D2. Order: tests first, then T2, T1, T3, T4

T5's contract rows land first as `test.failing`, and each implementing task
flips exactly its own rows in the commit that makes them pass. T2 goes before T1
because T1's early-synced retired-capability row (D10) and T3's
retired-capability sync fixture both need `new-spec-non-added` to stop firing on
REMOVED. T1 goes before T3 because sync-specs calls T1's scenario helper and
failure-document builder. T4's canon goes after T3, because the workflow body
names a command that has to exist.

### D3. `--no-validate` is forwarded

`--no-validate` skips cospec's `validateChange` call and adds `--no-validate` to
the wrapped `archive <id> -y`. Everything else in D-order still runs: the
namespace-folder check (D8), tasks gate, verification gate, slot check, scenario
helper, on-disk verification and spot-check. The banner goes to stderr before
the first gate, in both modes, because stdout under `--json` is the document.

_Rejected: skip cospec's step but let the binary validate._ An `openspec` user
passes the flag precisely to get past the binary's validation, so under `cospec`
it would still refuse. That is a swap-in regression. The cost of forwarding is
fact 5: the binary also writes instead of retiring, and skips rebuilt-spec
validation. The docs say so, and the spot-check already accepts a written-empty
spec (REMOVED names absent).

### D4. The scenario-preservation helper

`core/scenario-gate.ts` exports one function that takes the root base and the
change's per-capability ops (`changeDeltaOps`, moved there from `archive.ts`
unchanged) and returns `{drops, livingCaps}`, plus one renderer for the refusal
lines `archive.ts` prints today, and the binary's sentence for the first drop
(D6). It reads living specs through `parseLivingSpec` and passes the
`LivingSpec` itself (verbatim top level) to `findScenarioDrops`. The input types
stay the branded verbatim ones, so the advisory `AdvisoryDelta`/`advisory` views
cannot reach it, as `views.test.ts` already enforces for the rule. Behavior is
unchanged by the move (fact 1). The helper exists so `sync-specs` refuses
exactly where `archive` does.

### D5. The success document is built from what cospec observed

`archive` is filled in by cospec:

- `change` and `archivedAs` from step 9's verified target.
- `path` as `realpathSync(join(archiveDir, target))`.
- `specsUpdated` and `totals` from the binary's own human-mode lines. Those are
  `Totals: + a, ~ m, - r, → n`, and `Specs updated successfully.` versus
  `Specs already in sync; no files changed.`, read by one line reader in
  `core/archive-output.ts`. Each is fixed text only the binary writes, found by
  its exact shape, never by a pattern over free text.
- `warnings` from the binary's own warning lines, only when non-empty. The
  binary wins over the wording above (probed while implementing): its JSON
  `warnings` holds its spec-merge warnings (each `⚠️  Warning:` line) and one
  note per retired capability, never the proposal warnings or the
  tasks-with-`--yes` line `collectArchiveWarnings` also relays. So the line
  reader rebuilds exactly that list (a retirement's note from its `Retiring`
  line and the recovery line under it), and cospec's own top-level `warnings`
  key keeps `collectArchiveWarnings`' relay unchanged.

`root` is `rootOutput(root)`. Under `--skip-specs` there is no `totals` key and
`specsUpdated` is `false`, as in the binary. If a binary inside the accepted
range prints no `Totals:` line, `totals` is left out rather than invented, and
`specsUpdated` falls back to whether the bytes of any living `spec.md` a delta
targets changed between step 7's snapshot and step 10. That needs the snapshot
hashes, which step 10's spot-check reads anyway. Only those files are read, as
the binary's archive reads no other main spec, so an unrelated spec this process
cannot read never fails an archive the binary completes; a target it cannot read
is fingerprinted by its metadata and left to the binary to answer.

_Rejected: switch the wrapped call to `archive --json`._ The binary prints
proposal warnings only in human mode (`if (!json)`), so `--json` would delete
the shipped "Wrapped archive warnings are relayed" behavior. `archive --json`
also may not exist in every binary inside `>=1.0.0 <2.0.0`.

### D6. One failure document for every refusal

`core/archive-output.ts` builds
`{change, type, archived: false, reason, archive: null, root?, status: [diagnostic]}`.
`reason` keeps its existing values (`aborted`, `half-state`) and gains
`unknown-change`, `invalid-name`, `namespace-folder`, `validation`,
`tasks-incomplete`, `archive/verification-incomplete`, `slot-exists`,
`archive/scenario-preservation` and `archive-unreadable`. `code`/`message`
follow the spec's table, each message ported from the pinned dist's own template
and pinned by a contract row against the binary:

- `Change '<id>' not found. Available changes: <sorted active names>` (or
  `… No active changes exist in this root.`).
- `Validation failed for change '<id>'.`
- `<n> incomplete task(s) found for change '<id>'.`
- `Archive '<slot>' already exists.`
- `Cannot archive '<id>': <explanation>`.
- For scenario preservation, the binary's
  `<cap> MODIFIED failed for header "### Requirement: <name>" - current spec contains scenario(s) not present in the modified block: "<names>". Refresh the change spec before archiving to avoid dropping scenarios.`
  for the first drop in the binary's merge order. Text mode keeps cospec's full
  multi-drop report.

`fix` is the allowlist's cospec spelling where upstream's names a command, or
cospec's own remedy where cospec's gate differs. The tasks gate says
`Complete the tasks or rerun with --force-incomplete.` (a named collision in the
oracle row, because the binary's `--yes` does not lift cospec's stricter gate).
The verification gate's code `archive_verification_incomplete` is cospec-only.
The binary has no such refusal (it archives that change), so no oracle row
compares it, and an integration row pins it instead.

The revalidation document is the existing report object with these keys added,
so no cospec key leaves it. A root-selection failure goes through `cli.ts`'s
`rootSelectionDocument` with
`export const jsonFailurePayload = { archive: null }`, the binary's payload. A
delegated failure (aborted or half-state) carries `archive_error`, its message
set to the binary's last non-blank reason line from the relayed output,
respelled.

_Rejected: classify delegated failures into the binary's specific codes by
matching its human-mode headlines._ That is a pattern over free output, and the
binary's specific failures are already predicted, refused and coded by cospec's
pre-flight family before delegation. `archive_error` is the binary's own code
for an unclassified failure.

### D7. An unreadable archive directory

`archive` runs the binary's two checks at the binary's two points, on the same
runtime. First, before the change resolves (the binary's first step), it runs a
port of `assertPathWithin` for `changesDir`, `archiveDir` and `specsDir` through
`realpathSync.native`. Its failure is `archive_path_outside_root` with the
binary's message. Second, at cospec's existing slot check, it runs an `lstat` of
the slot path, where a non-ENOENT errno is `archive_error` with the runtime's
errno message. Running the same calls as the binary on the same runtime is what
makes cospec diverge per OS exactly as the binary does (fact 4). Between the two
checks, every read of the archive directory (the archive index behind
revalidation and the self-blocker warning, and step 7's snapshot) uses
cli-surface-parity's degraded read: an empty index plus a warning naming the
directory, never a throw. That way the answer on a runtime where the path check
passes comes from the slot check, as the binary's does. It also replaces the
unguarded `readdirSync` in `basenames` that crashes today. Text mode prints the
message on stderr and exits 1. Rows compare by code and path through
`test/fixtures/errno.ts`, never the sentence. The macOS row runs in the suite.
The Linux row runs in CI's `ubuntu-latest` job and once in the container recipe
above.

### D8. Namespace folder before revalidation

`findNestedChangesIn(changesDir, id)` runs right after the change resolves and
before `validateChange`, as in the binary. Its refusal uses the binary's message
and fix (spec). `sync-specs` calls the same check with its own two sentences.
The validate-time `meta/nested-change` report stays for `validate`.

### D9. `archive/new-spec-non-added` (T2)

In the `living === undefined` arm of `core/rules/archive.ts`, REMOVED is skipped
along with ADDED. MODIFIED and RENAMED stay ERRORs with today's message.

The REMOVED-only no-marker case is not refused by `archive/rebuilt-spec-invalid`
on `main` today. That rule runs only when no `MERGE_PRECONDITIONS` ERROR fired
for the capability, and `new-spec-non-added` is one of them. The probe shows a
single `new-spec-non-added` ERROR for that fixture. `rebuildSpec` already builds
the binary's skeleton for a new capability whose ops are ADDED/REMOVED only, and
the ported retirement decision skips a spec with nothing on disk. So once T2
lifts the precondition, the rebuilt check is what must refuse the no-marker case
(`Spec must have at least one requirement`) and clear the marked case. T2 owns
making that true: task 2.1 flips row 6.3 from failing, and extends the rebuilt
check to the skeleton in the same commit if it does not fire there. Without
that, validate would pass a delta the binary's archive refuses, which is a false
PASS (verification 6.3).

The delegated-duplicate pairing that names `new-spec-non-added`
(spec-parsing-and-discovery's dry-run message) stays, since that message is only
raised for MODIFIED/RENAMED.

### D10. Early-synced operations and the Specs line

The spot-check already judges an identical ADDED, an absent REMOVED, an applied
RENAMED and an identical MODIFIED as landed, against the net effect. The
remaining early-sync shape is a capability retired before archive. Its living
spec is absent at step 7, so `livingCaps` doesn't hold it and its REMOVED names
read as absent, which already passes once T2 lets it validate. The `Specs:` line
prints `already in sync` whenever D5's reader saw the binary's in-sync line, and
`+a ~m -r →n applied and verified` otherwise. The skip reasons print as
`skipped (--skip-specs)`, `none (the <type> schema has no specs artifact)` and
`none (no delta specs, so no spec sync)`, and `specsSkipReason` is `flag`,
`schema` or `no-deltas`.

### D11. `sync-specs` (T3)

Steps follow the spec. Mechanics:

- **Scratch layout.** `mkdtempSync(join(tmpdir(), 'cospec-sync-'))` holds
  `openspec/`. Into it go `config.yaml`/`config.yml` (if present), `schemas/`,
  `specs/` and `changes/<id>/`, plus an empty `changes/archive/`. Each copied
  path is read at its real path (a symlinked `specs/` is copied, not linked). A
  file this process cannot read is copied as an empty file of the same mode, and
  a directory it cannot list as an empty directory, so the binary meets the
  refusal it meets in the real tree only if it reads one — and the binary's
  archive reads no main spec but a delta's target, so an unrelated unreadable
  spec fails neither. Copying the real archive would let today's slot collide (a
  cospec archive of a same-named change earlier today), and sibling changes are
  never read by the binary's archive. That is why this departs from the
  roadmap's "copy of the root's `openspec/` tree": the binary reads only this
  subset, and anything more is a way to fail that `archive` wouldn't.
- **Symlinks.** Before copying, every symlink under the copied paths is
  resolved. One that leads outside the copied subtree is refused, naming it,
  because the binary would write through it into the real tree. One inside is
  copied as a relative link to the scratch copy of its target, so the binary
  sees the same aliasing (fact 7) — and an absolute link, or one that climbs out
  of the root and back in, aliases the scratch tree, never the real one.
- **Spawn.** `spawnOpenspec(['archive', id, '-y'], scratchRoot)` with no store
  args (fact 6). Wrapped-call discipline: expected exits `{0, 1}`. The stdout
  deny-list is the existing archive one (`Aborted`, `Archive cancelled`). The
  observed post-condition is `<scratch>/openspec/changes/<id>` gone and exactly
  one `<scratch>/openspec/changes/archive/<slot>` holding `.openspec.yaml`. That
  proves the run resolved the scratch root and completed, and the real
  `openspec/changes/<id>` is still present, which proves it did not run in the
  real tree.
- **Copy-back.** Before the copy, a fingerprint (sha256 per file, the target
  each link holds, metadata for an entry this process cannot read, plus the
  entry list) is taken of the real `openspec/specs/`. After a verified run, the
  scratch `specs/` is diffed against the scratch's pre-run copy, every entry
  kind included, to get the written and deleted sets: a file created or changed
  (a link the binary replaced with a file too) is written, and a file or link it
  removed (a retired capability's linked `spec.md`) is deleted. The binary never
  creates or re-points a link nor touches what it cannot read, so such a change
  is an invariant breach thrown before any write. Then the real `specs/` is
  fingerprinted again. If it changed while the binary ran, the command refuses
  and writes nothing. Otherwise each written file is applied with `atomicWrite`
  (mode preserved for existing files), each deleted file or link is unlinked,
  and directories the binary pruned are removed up to `specs/`. Step 5 re-reads
  each written file and compares bytes, checks each deleted path is absent, and
  re-fingerprints everything else.
- **Cleanup.** `rmSync(scratch, {recursive: true, force: true})` in a `finally`.
  The claim file can only ever exist inside the scratch tree, which is removed
  with it. The real tree is written only in the copy-back, after a verified run.
- **Output.** Text prints a `Synced:` line per file and a `Totals:` summary from
  D5's reader, plus relayed warnings. JSON follows the spec. A pre-merge refusal
  reuses archive's failure-document builder (with `synced: false` in place of
  `archived`), and a scratch-run refusal carries `archive_error` and the
  relayed, respelled reason, as D6.

_Rejected: run `openspec archive` in the real tree and move the change back._
That creates the claim and the move in the real tree, so a crash leaves exactly
the state #60 described, and undoing a move is not atomic. _Rejected: port the
merge._ Byte-identity with archive is only provable by running archive's own
merge.

### D12. Relays respelled

`reportArchiveFailure`'s captured block, `collectArchiveWarnings`' messages
(both modes) and the failure document's `message`/`fix` go through
`respellRemedies`, whose allowlist rewrites only exact upstream sentences, so
paths and spec text pass through byte-for-byte. `sync-specs` relays through the
same calls. Every `core/archive.js` line in `remedy-sources.ts` that is now
really relayed keeps its relayed classification. The enumeration test needs no
new entries, and a contract row asserts no relayed line names a bare allowlisted
`openspec` command.

### D13. Canon (T4)

`sync-specs.md` is rewritten: select the change, preview
(`cospec validate <slug>`, read the deltas, name what will be created, changed
or deleted, and note any retirement and its marker), run
`cospec sync-specs <slug>`, report. The retirement section stays. `archive.md`
gains one sentence on the early-sync no-op. The `harness.yaml` description
becomes "Merge a change's delta specs into the main specs without archiving it,
exactly as archive would", and keeps the existing trigger phrases.
`mise run generate` regenerates every harness, and `generate:check` is the drift
gate.

### D14. Docs

| Page                                               | Fact it owns                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/docs/reference/commands.md`                  | `archive --no-validate`, archive's JSON documents and codes, the `Specs:` line, `sync-specs` (new row) |
| `apps/docs/concepts/apply-and-archive.md`          | early sync, the no-op archive, `--no-validate`'s gates                                                 |
| `docs/apply-archive.md`                            | the archive step order (namespace check, D7 checks), the scratch design                                |
| `apps/docs/guide/harness-setup.md`                 | the `sync`↔`sync-specs` sentence                                                                       |
| `apps/docs/reference/validation-rules.md`          | `archive/new-spec-non-added`'s trigger                                                                 |
| `docs/validation.md`                               | the same rule in the archive family list                                                               |
| `apps/docs/concepts/how-it-relates-to-openspec.md` | any sentence naming archive's pending flag, the JSON gap or sync                                       |

A grep for `no-validate`, `sync-specs`, `mid-flight` and `new-spec-non-added`
across `apps/docs` and `docs` is the completeness check. `.agents/shared.md`
step 6 gains `cospec sync-specs` as the way to land main specs early. Its "JSON
documents are additive" paragraph stops calling `archive --json` "next" and
names the tasks-gate `fix` in `NAMED_COLLISIONS` with why cospec's value wins.
Then `mise run agents:sync`.

## Operational surface

The interactive surface is `cospec archive`'s human and `--json` output, the new
`cospec sync-specs` command, and the `/cospec:sync-specs` and `/cospec:archive`
workflow bodies in every harness.

- One flag (`archive --no-validate`) becomes accepted, and one command is new.
- Archive's JSON gains keys, and every refusal now prints a document. Exit codes
  change only as BREAKING lists.
- `sync-specs` spawns the wrapped binary once. It runs in a scratch directory
  under the OS temp directory (`$TMPDIR` on macOS, `/tmp` on Linux), whose size
  is the change plus the root's `specs/` and `schemas/`, and it is deleted
  before the command exits.

There's no bind address, container, secret or connection limit. The wrapped
binary is still resolved by path at the pinned version, inside the accepted
range. Every contract row spawns it the way the suite does, under Bun with the
product env and a sandboxed HOME. The Linux row also runs in the
`oven/bun:1.3.14` container as a non-root user.

## Risks / Trade-offs

- [The binary's human-mode `Totals:` or in-sync line changes in a later in-range
  version] → The reader matches the 1.13.1 text exactly and degrades to "no
  `totals`, disk-observed `specsUpdated`". A contract row pins the text against
  the pinned dist, so a pin bump fails loudly.
- [A user's spec tree is large, so the scratch copy is slow] → Only `specs/`,
  `schemas/`, the config and one change are copied. That is what the binary
  reads anyway.
- [The real `specs/` changes while the binary runs] → The pre/post fingerprint
  refuses, and nothing is written.
- [`--no-validate` lets the binary write an empty-requirement spec where it
  would have retired one] → That is the binary's documented behavior under the
  flag, and the docs say so. Both hard gates still run.
- [The per-OS unreadable-archive answer differs between developer machines and
  CI] → Rows compare against the binary's answer on the runtime they run on,
  never a fixed prediction, as cli-surface-parity's mode-000 rows do.
