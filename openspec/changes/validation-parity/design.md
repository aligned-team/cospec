# Design

## Context

`cospec validate` runs one of two lanes per change (`commands/validate.ts`,
`validateChange`):

- **cospec-typed.** `runChangeRules` runs cospec's rule families. A change that
  is spec-bearing, has delta files and has a `proposal.md` is also delegated to
  `openspec validate <id> --strict --json`, and the binary's issues are merged
  in through `mergeDelegated`, minus every `DUPLICATE_CLASSES` twin.
- **legacy.** No cospec rule family runs. The delegated issues are relayed at
  the binary's level, message unchanged, with only the `meta/*` classification
  INFO added.

Root causes, each confirmed against the pinned binary under node in a sandboxed
HOME/XDG/CODEX_HOME/ZDOTDIR:

1. **Header-only SHALL/MUST.** `DeltaOp.hasShallMust` is computed from the body
   only, as the binary does, but `rules/deltas.ts` never reads the header. So
   the ERROR carries no hint, and with no dedupe entry the binary's
   `should contain SHALL or MUST in the requirement body, not only in the header. …`
   (WARNING), `must contain SHALL or MUST in the requirement body …` (ERROR,
   empty body) and `is missing requirement text` all print under it.
2. **Task numbering.** `rules/tasks.ts` checks only the order of the headings.
   `TASK_NUM_RE` (`/^(\d+)\.(\d+)\b/`) is exported and has no consumer, and its
   shape is too narrow for the port: `1.2.3` and `1.2.4` would both read as
   `1.2`, and `1.3a` doesn't match at all. The binary's `TASK_ID` is
   `^(\d+(?:\.\d+)+(?:[A-Za-z]+)?)(?=\s|$)`, and the probe shows it treats
   `1.2.3`/`1.2.4` as distinct and `1.3a` as an id. The binary runs its
   numbering check only for its built-in `spec-driven` schema, and the probe of
   a `feat` fixture shows no numbering issue from it. So nothing on the
   cospec-typed lane needs deduping, and the legacy lane already gets the
   binary's WARNINGs.
3. **Cross-section conflicts.** The binary's validator checks each delta file's
   own section name sets: `ADDED ∩ REMOVED` and `MODIFIED ∩ ADDED` are ERRORs,
   and `openspec archive` validates first, so it refuses both (probed: the
   `spec-driven` REMOVED+ADDED and fresh-capability ADDED+MODIFIED fixtures and
   a living ADDED-identical+MODIFIED fixture all abort). `replayDeltaNames`
   models only the merge. Its REMOVED phase frees the name before ADDED runs, so
   REMOVED+ADDED is silent. Its early-sync arm silences an ADDED whose block
   matches the living one, so living ADDED+MODIFIED can be silent, and a
   fresh-capability pair shows only the MODIFIED side's `new-spec-non-added`.
   The living spec, `archive.test.ts` ("an ADDED re-using the exact header an
   earlier REMOVED vacated is applied") and two docs pages record the REMOVED
   case as accepted. That's a false PASS in the preview, and the archive refuses
   the change later, inside the delegated call. The probe shows a fold variant
   (`REMOVED Widget rendering` / `ADDED WIDGET RENDERING`) archives, because the
   binary compares normalised names, not folded ones.
4. **Skipped headers.** cospec's `parseDeltaSpec` treats a non-requirement
   `### …` line as body text or ignores it, and records nothing. The binary's
   `parseRequirementBlocksFromSection` records every non-fenced
   `^###\s+(.+?)\s*$` line in an ADDED/MODIFIED section that doesn't match its
   requirement-header regex, both between blocks and inside them. That includes
   a nameless `### Requirement:` and a `### Scenario: …` line.
5. **Empty sections.** `archive/no-ops` fires on the same state as the binary's
   `emptySectionSpecs` ERROR and its `CHANGE_NO_DELTAS` ERROR. The binary raises
   the latter only when no file parsed an entry, which the probe of a `feat`
   fixture shows reaching the reader alongside cospec's rule.

## Goals / Non-Goals

**Goals:**

- Close roadmap rows 22–26 with the rule the roadmap sets: cospec-typed schemas
  keep cospec's severities, and the legacy lane keeps the binary's through the
  existing delegation.
- One finding per defect in the merged report for every finding this change adds
  or changes.
- Every delegated string a dedupe entry matches is read from the pinned binary
  in a contract test, never typed by hand.

**Non-Goals:**

- `validate --type`, `--report`, `--concurrency`, bulk-flag precedence, the
  `respellRemedies` wiring of `validate.ts` relays, and every other part of
  `validate.ts` outside `DUPLICATE_CLASSES` belong to `cli-surface-parity`.

## Decisions

### D1. Tracks and files

| Track | Files (exclusive)                                                                                                                                              | Work                                                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1    | `apps/cli/src/core/deltas.ts`, `apps/cli/src/core/rules/deltas.ts`, `apps/cli/test/unit/rules/deltas.test.ts`                                                  | parser records `skippedHeaders`; `deltas/skipped-header` INFO; header-only hint on `deltas/requirement-shape`                                       |
| T2    | `apps/cli/src/core/tasks.ts`, `apps/cli/src/core/rules/tasks.ts`, `apps/cli/test/unit/rules/tasks.test.ts`                                                     | `TASK_NUM_RE` widened to the task-id shape; per-item group; `tasks/id-mismatch`, `tasks/id-duplicate`                                               |
| T3    | `apps/cli/src/core/rules/archive.ts`, `apps/cli/test/unit/rules/archive.test.ts`                                                                               | the two cross-section shapes through `replayDeltaNames`                                                                                             |
| T4    | `apps/cli/src/commands/validate.ts` (`DUPLICATE_CLASSES` only)                                                                                                 | the dedupe entries in D5                                                                                                                            |
| T5    | `apps/cli/test/contract/validation-parity.test.ts` (new)                                                                                                       | legacy severity oracle; one pinned-message test per D5 entry, plus its second-finding-survives case; archive agreement for the cross-section shapes |
| T6    | `apps/docs/reference/validation-rules.md`, `apps/docs/concepts/apply-and-archive.md`, `apps/docs/concepts/how-it-relates-to-openspec.md`, `docs/validation.md` | docs on the page that owns each fact                                                                                                                |

`core/deltas.ts` joins T1 and `core/tasks.ts` joins T2 because neither rule can
be written without its parser. Each file has one track, and no other roadmap
change in flight edits either file.

T5's file lands first, with every test that fails before its fix marked
`test.failing`. A regression row that asserts both a native finding and a
suppressed delegated twin is two tests, `<row> native` and `<row> twin`, so the
rule's track (T1–T3) flips one and T4 flips the other. Each track flips only its
own tests in that file, in the commit that makes them pass, and edits nothing
else in it.

### D2. `deltas/skipped-header` (T1)

`parseDeltaSpec` gains
`skippedHeaders: { header: string; section: string; line: number }[]`, filled in
the ADDED/MODIFIED arm on every non-fenced line that matches the binary's
`^###\s+(.+?)\s*$` and doesn't match `REQUIREMENT_RE` with a name. `section` is
the `## ` title as written, and `line` is the file line, which is what the
binary's `bodyStartLine + index` resolves to (probed: line 3 for a header on
file line 3). Nothing else in the parser changes: `ops`, `hasShallMust`,
scenario counting and every archive gate read the same data as before.

This reads cospec's advisory view, which blanks HTML comments for every advisory
parser rule (D10). The binary's own reader doesn't mask comments, so a `###`
header written inside one is invisible to this rule. Above the first requirement
the archive drops it, so the binary's delegated INFO is its only report and
survives unsuppressed (probed and pinned: verification 5.2, entries 3/5). Inside
a block it is D11's to report.

A skipped header the archive refuses — one that splits its block into a piece
with no scenario (D11) — is `archive/split-requirement`'s ERROR, not this INFO,
so a line never carries both. The INFO stays for a header the archive keeps:
above the first requirement, or followed by a scenario of its own.

The rule is an INFO on the header's line. For a nameless header
(`/^requirement:?$/i`): message
`header "### Requirement:" in <section> is missing a requirement name and is ignored by validation`,
hint `add a name, e.g. "### Requirement: <name>"`. For anything else: message
`header "### <text>" in <section> is not a "### Requirement:" header and is ignored by validation`,
hint `use "### Requirement: <text>" if it should be validated as a requirement`.
These are the binary's sentences in cospec's message+hint split. A line that
also matches `SCENARIO_DEPTH_RE` is left to `deltas/scenario-depth`, so a line
never gets two cospec findings. Rejected alternative: reporting it under both
rules, which would contradict the scenario-depth fix (the INFO suggests
`### Requirement: Scenario: …`).

### D3. Header-only hint (T1)

In the `deltas/requirement-shape` SHALL/MUST arm, when `!op.hasShallMust` and
`SHALL_MUST_RE` matches `op.name`, set
`hint: 'move the SHALL/MUST statement to the line immediately after the "### Requirement: ..." header'`.
The level, rule id and message stay as they are. The roadmap rules out the
alternative of splitting the rule into a WARNING tier like the binary's
(cospec-typed schemas keep cospec's severities).

### D4. Task-id rules (T2)

`TASK_NUM_RE` becomes `/^(\d+(?:\.\d+)+(?:[A-Za-z]+)?)(?=\s|$)/`, which is still
the exported name and now has a consumer. `parseTasks` records, for each item,
the enclosing numbered group as written (`'01'`, `'1'`), or `undefined`. It
tracks every level-two heading the way the binary's `LEVEL_TWO_HEADING`
(`^ {0,3}##(?!#)(?:[ \t]+|[ \t]*$)`) does, and takes the number from
`^ {0,3}##[ \t]+(\d+)\.(?:[ \t]|$)`. `TaskGroup`, `groupsOutOfSequence` and
`tasks/group-numbering` keep their current inputs. `tasksRules` then emits:

- `tasks/id-mismatch` (WARNING, item line): message
  `task "<id>" is under group <g>, but its leading number points to group <n>`,
  hint `move it to group <n> or renumber it`. The comparison strips leading
  zeros.
- `tasks/id-duplicate` (WARNING, later line): message
  `task id "<id>" is duplicated; it was first declared on line <l>`.

A file with no numbered group is skipped. Fenced lines stay unread, as they are
for every other `tasks/*` rule. Rejected alternative: keeping `TASK_NUM_RE` as
`N.M`. It would raise a duplicate WARNING on `1.2.3`/`1.2.4`, which fails
`--strict` on a change the binary accepts, and it would miss `1.3a`.

### D5. `DUPLICATE_CLASSES` entries (T4)

Every entry uses the existing `{rule, delegated, nativeKey?}` shape and needs no
change to `mergeDelegated`. A key on path alone is written as an empty capture
group, `()`, on both regexes, so `match[1] === ''` on each side and the existing
path comparison does the rest.

| #   | native rule                 | delegated message (probed)                                                                                                                | key                                                               |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | `archive/no-ops`            | `Delta sections <list> were found, but no requirement entries parsed.`                                                                    | path (empty capture)                                              |
| 2   | `archive/no-ops`            | `Change must have at least one delta. No deltas found.`                                                                                   | none (item-level: raised only when no delta file parsed an entry) |
| 3   | `deltas/skipped-header`     | `Header "### <text>" in <section> is not a "### Requirement:" header and is ignored by validation.`                                       | path + `<text>`                                                   |
| 4   | `deltas/skipped-header`     | `Header "### Requirement:" in <section> is missing a requirement name and is ignored by validation.`                                      | path + `<text>`                                                   |
| 5   | `deltas/scenario-depth`     | entry 3's message where `<text>` starts `Scenario:`                                                                                       | path + `<text>` (the native message quotes the header)            |
| 6   | `deltas/requirement-shape`  | `<OP> "<name>" should contain SHALL or MUST …` / `<OP> "<name>" must contain SHALL or MUST …`                                             | path + `<OP> "<name>"`                                            |
| 7   | `deltas/requirement-shape`  | `<OP> "<name>" is missing requirement text`                                                                                               | path + `<OP> "<name>"`                                            |
| 8   | `archive/added-exists`      | `Requirement present in both ADDED and REMOVED: "<name>"`                                                                                 | path + `<name>`                                                   |
| 9   | `archive/added-exists`      | `Requirement present in both MODIFIED and ADDED: "<name>"`                                                                                | path + `<name>`                                                   |
| 10  | `archive/split-requirement` | entry 3's message, `Scenario:` headers included                                                                                           | path + `<text>`                                                   |
| 11  | `archive/split-requirement` | entry 4's message                                                                                                                         | path + `<text>`                                                   |
| 12  | `archive/target-invalid`    | `Archive would refuse this delta: <cap>: target spec is structurally invalid …`, every listed defect a misplaced or duplicate requirement | path + `<cap>`                                                    |

Each regex is anchored through a clause that tells it apart from its siblings
(entry 3 through `is not a "### Requirement:" header`, entry 4 through
`is missing a requirement name`, entry 5 through `### Scenario:`), as the
existing requirement demands. Entry 3 excludes a `Scenario:` header, so entries
3 and 5 never both match. Entries 6–9 go beyond the two entries the roadmap's T4
names (`archive/no-ops` against `emptySections`, and `deltas/skipped-header`).
They're in because the roadmap's acceptance line "Nothing double-reports" fails
without them on the very fixtures this change adds. They stay inside
`DUPLICATE_CLASSES`, so the file boundary with `cli-surface-parity` holds. Entry
2 goes beyond it for the same reason: the probe's empty-section fixture reports
it as a third finding.

Every `archive/*` twin is skipped under `--fast`. A delegated issue then has no
twin and is kept, which is the existing safety-net behaviour.

Entries 10–12 and entry 5's key came from the round-2 review. Entry 5 keyed on
the path alone, so a real `### Scenario:` suppressed the binary's INFO for a
commented one elsewhere in the file, which cospec's advisory reader never sees.
It now keys on the header text, which `deltas/scenario-depth`'s message quotes;
keying on the line instead would need a change to `mergeDelegated`, which is
outside this change's slice of `validate.ts`. Entry 6's key is the name as the
header is written (D10), so a comment-bearing header pairs. Entry 12 matches
only when every defect the dry-run lists is one D12 reads, so a listed defect
cospec doesn't check still reaches the reader.

### D6. Cross-section conflicts (T3)

`replayDeltaNames` also returns, per ADDED op, the section its exact name
collides with in the same delta file: `REMOVED` if a REMOVED op in the same file
carries that name, otherwise `MODIFIED` if a MODIFIED op does. The names are the
parser's normalised names, not folded ones, and the check doesn't depend on the
replayed set. `archiveRules` reports the collision on the ADDED op as
`archive/added-exists` (ERROR):
`ADDED "<name>" is also <REMOVED|MODIFIED> in this delta`, hint
`OpenSpec refuses a requirement that one delta both adds and <removes|modifies> — keep one operation`.
Once it fires, the exact and fold `archive/added-exists` arms are skipped for
that op, so the op gets one finding. This follows the precedent of the
RENAMED-target/ADDED collision being "reported once".

The rule id is `archive/added-exists`, not a new id. The roadmap names no new id
for this track, and the family's doc row already covers collisions a delta makes
with itself. The fresh-capability roadmap wording is kept, and the check also
runs on living capabilities, because the living ADDED-identical+MODIFIED probe
is a false PASS without it. On a living capability where the ADDED body differs,
the op used to get the content-collision message and now gets the cross-section
one. It's the same rule and the same count.

The unit test "an ADDED re-using the exact header an earlier REMOVED vacated is
applied" is inverted: it now expects the conflict. The fold-variant and
RENAMED-vacated tests stay as they are.

### D7. Upstream strings are probed, never hand-typed

The T5 contract tests build each fixture in a temp repo, run the pinned binary
(`openspec(['validate', name, '--strict', '--json'], root)` from
`test/fixtures/support.ts`) and take the delegated message from its JSON. They
then assert three things:

- the binary emitted it at the expected level;
- cospec's merged report doesn't contain that exact message;
- cospec's native twin is present exactly once.

The keying cases (a different header, requirement name or file survives) run in
the same contract file against the binary's real output, so no test holds a
hand-typed copy of a delegated message. The design's quoted sentences are there
for the reader only.

### D8. parity-pending.yaml

This change removes none of its entries. The file carries no `validation-parity`
entry before or after, because validation findings aren't registry surfaces. The
verification ledger records the observed empty set. `validation-parity` stays in
`KNOWN_OWNERS` (`reachability.test.ts`) and `PendingOwner` (`command-table.ts`).
Removing it would edit files that `upstream-spellings` and
`passthrough-json-and-doctor` are changing in parallel.

### D9. Docs

`apps/docs/reference/validation-rules.md` owns the rule table and the dedupe
section. It gets rows for the three new ids, the hint on
`deltas/requirement-shape`, the cross-section sentence on `archive/added-exists`
with the REMOVED re-use clause corrected, and the new dedupe pairings.
`apps/docs/concepts/apply-and-archive.md` owns the archive-shape prose and drops
"an ADDED may re-use the exact header a REMOVED … vacated".
`apps/docs/concepts/how-it-relates-to-openspec.md` updates its dedupe summary,
and `docs/validation.md` its rule list and dedupe paragraph. No
`.agents/shared.md` change: the workflow steps are the same, and the rules are
documented on the reference page.

### D10. Two read views: advisory masked, archive verbatim

The binary's delta reader (`requirement-blocks.ts`) and spec readers
(`extractRequirementsSection`, `spec-structure.ts`, `MarkdownParser`) mask
fenced code only. HTML comments are read as written, so the archive merges an op
written inside `<!-- … -->`, and a header's trailing comment is part of its
name. cospec's parser masked comments for every rule, so four shapes went wrong
(probed under node in a sandboxed HOME): a commented ADDED that collides and a
commented MODIFIED with a missing target passed while the archive refused them
(a false PASS), `REMOVED X` beside `ADDED "X <!-- note -->"` was refused while
the archive applies the two names, and a comment-bearing header missing
SHALL/MUST was reported twice because the dedupe key named two requirements.

`scanMarkdown` and `parseDeltaSpec` take a `ReadView` (`masked`, the default, or
`verbatim`), and `parseLivingSpec` also carries the living names and blocks
under `verbatim` in `archive`. Every `archive/*` rule, the op list
`replayDeltaNames` replays and its cross-section names read `verbatim`. The
advisory `deltas/*` rules keep `masked`, so a commented-out header draws no
authoring finding. `archive/scenario-preservation` keeps `masked` too: it
mirrors the hard gate in `commands/archive.ts`, which reads that view, and the
two must never disagree on one change. `deltas/requirement-shape` quotes
`DeltaOp.verbatimName`, the header's name as written, so its delegated twin keys
on the same name.

Rejected alternative: switching every parser consumer to `verbatim`. That would
raise authoring findings on commented-out drafts, and move the scenario gate's
count arm, which reads masked bodies on purpose.

### D11. `archive/split-requirement`

The binary's archive appends each ADDED/MODIFIED block verbatim, then
re-validates the rebuilt spec (`validateSpecContent`). Its `MarkdownParser`
takes every `###` header under `## Requirements` as a requirement of its own, so
a skipped header inside a block cuts it in two. A piece with no bodied scenario
fails `Requirement must have at least one scenario`, and the archive aborts.
D2's INFO was a false clear for that shape.

Probed against 1.13.1, validate and archive: a header between the requirement's
text and its only scenario, a nameless `### Requirement:` after the scenario, a
header inside an HTML comment in the block, and the same in a MODIFIED block are
refused. A header above the first requirement belongs to no block and archives,
and so does one after the block's scenario that carries a scenario of its own
(SHALL/MUST in it or not). The rule therefore doesn't fire on every in-block
header, only on one that leaves a piece empty.

The parser records each ADDED/MODIFIED op's `parts`: its own head, then one per
skipped header, each with a count of bodied scenarios, from the same scenario
reader as the op's own count. `findRequirementSplits` returns a header when it
is the first one and the head has no scenario, or when its own part has none.
`archiveRules` reads it on the `verbatim` parse and reports an ERROR on the
header's line; `deltasRules` skips those lines for `deltas/skipped-header`. A
`### Scenario:` line the advisory reader sees stays `deltas/scenario-depth`'s:
its `#### Scenario:` fix mends both. Under `--fast` the rule doesn't run and the
binary's INFO is relayed.

### D12. Living-spec structure in `archive/target-invalid`

Before merging, the binary's archive runs `findMainSpecStructureIssues` on the
living spec. It refuses a `### Requirement:` outside the first `## Requirements`
section and a second requirement under a normalised name already declared there.
`archive/target-invalid` read neither, so `validate --strict` passed a change
the archive refuses. `findLivingStructureIssues` ports those two kinds as
upstream reads them: fenced lines blanked, HTML comments not masked, and the
spec reader's `^###\s+Requirement:` header. `LivingSpec.structureIssues` carries
them, and `archive/target-invalid` names each one's line after the reason it
already gave. The function's third kind, a delta header, stays on the rule's
existing masked check, which this change doesn't alter: a delta header written
inside an HTML comment is still refused by the archive and reported only through
the binary's dry-run INFO (entry 12 doesn't match it, so the INFO is kept).

## Operational surface

The interactive surface is `cospec validate`'s report: four new rule ids appear
in human and `--json` output, one hint gains text, `deltas/scenario-depth`
quotes its header, `deltas/requirement-shape` names a requirement as its header
is written, `archive/target-invalid` names two more defects, and delegated
duplicates disappear. No command, flag, exit-code meaning, JSON key or process
topology changes. There's no bind address, container, secret or connection
limit. The wrapped binary is still resolved by path at the pinned version, and
its accepted range doesn't change. Every contract test spawns it the way the
suite already does, with `NO_COLOR` set.

## Risks / Trade-offs

- [The new task-id WARNINGs fail `--strict` on existing cospec-typed changes
  with sloppy numbering] → BREAKING in the proposal. A ledger row runs
  `cospec validate --all --strict` on this repo, and this change's own
  `tasks.md` is numbered to pass.
- [A REMOVED+ADDED of one name used to validate clean] → the pinned binary's
  archive refused it all along. The change moves the refusal earlier, into
  validate. It doesn't add one.
- [A dedupe regex drifts from the binary's text on a pin bump] → each entry has
  a pinned-binary contract test, so a changed message fails the suite instead of
  silently double-reporting.
- [A path-only key suppresses a second delegated finding in the same file] →
  entries 1 and 5 are raised at most once per file (one empty-sections list per
  file) or per scenario-depth line. Entry 5 could hide a second skipped
  `### Scenario:` line in a file where cospec's rule fired on the first. cospec
  reports every such line as its own `deltas/scenario-depth` ERROR, so nothing
  is lost.
