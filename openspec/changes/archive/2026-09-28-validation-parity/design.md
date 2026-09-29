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

| Track | Files (exclusive)                                                                                                                                                               | Work                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1    | `apps/cli/src/core/deltas.ts`, `apps/cli/src/core/rules/deltas.ts`, `apps/cli/src/core/rules/index.ts` (the `deltasRules` call only), `apps/cli/test/unit/rules/deltas.test.ts` | parser records `skippedHeaders`; `deltas/skipped-header` INFO; header-only hint on `deltas/requirement-shape`; round 3: `--fast` reaches `deltasRules` |
| T2    | `apps/cli/src/core/tasks.ts`, `apps/cli/src/core/rules/tasks.ts`, `apps/cli/test/unit/rules/tasks.test.ts`                                                                      | `TASK_NUM_RE` widened to the task-id shape; per-item group; `tasks/id-mismatch`, `tasks/id-duplicate`                                                  |
| T3    | `apps/cli/src/core/rules/archive.ts`, `apps/cli/test/unit/rules/archive.test.ts`                                                                                                | the two cross-section shapes through `replayDeltaNames`                                                                                                |
| T4    | `apps/cli/src/commands/validate.ts` (`DUPLICATE_CLASSES` only)                                                                                                                  | the dedupe entries in D5                                                                                                                               |
| T5    | `apps/cli/test/contract/validation-parity.test.ts` (new)                                                                                                                        | legacy severity oracle; one pinned-message test per D5 entry, plus its second-finding-survives case; archive agreement for the cross-section shapes    |
| T6    | `apps/docs/reference/validation-rules.md`, `apps/docs/concepts/apply-and-archive.md`, `apps/docs/concepts/how-it-relates-to-openspec.md`, `docs/validation.md`                  | docs on the page that owns each fact                                                                                                                   |

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

| #   | native rule                    | delegated message (probed)                                                                                                                                  | key                                                               |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | `archive/no-ops`               | `Delta sections <list> were found, but no requirement entries parsed.`                                                                                      | path (empty capture)                                              |
| 2   | `archive/no-ops`               | `Change must have at least one delta. No deltas found.`                                                                                                     | none (item-level: raised only when no delta file parsed an entry) |
| 3   | `deltas/skipped-header`        | `Header "### <text>" in <section> is not a "### Requirement:" header and is ignored by validation.`                                                         | path + `<text>`                                                   |
| 4   | `deltas/skipped-header`        | `Header "### Requirement:" in <section> is missing a requirement name and is ignored by validation.`                                                        | path + `<text>`                                                   |
| 5   | `deltas/scenario-depth`        | entry 3's message where `<text>` starts `Scenario:`                                                                                                         | path + `<text>` (the native message quotes the header)            |
| 6   | `deltas/requirement-shape`     | `<OP> "<name>" should contain SHALL or MUST …` / `<OP> "<name>" must contain SHALL or MUST …`                                                               | path + `<OP> "<name>"`                                            |
| 7   | `deltas/requirement-shape`     | `<OP> "<name>" is missing requirement text`                                                                                                                 | path + `<OP> "<name>"`                                            |
| 8   | `archive/added-exists`         | `Requirement present in both ADDED and REMOVED: "<name>"`                                                                                                   | path + `<name>`                                                   |
| 9   | `archive/added-exists`         | `Requirement present in both MODIFIED and ADDED: "<name>"`                                                                                                  | path + `<name>`                                                   |
| 10  | `archive/split-requirement`    | entry 3's message, `Scenario:` headers included                                                                                                             | path + `<text>`                                                   |
| 11  | `archive/split-requirement`    | entry 4's message                                                                                                                                           | path + `<text>`                                                   |
| 12  | `archive/target-invalid`       | `Archive would refuse this delta: <cap>: target spec is structurally invalid …`, every listed defect a delta header, a misplaced or a duplicate requirement | path + `<cap>`                                                    |
| 13  | `deltas/requirement-shape`     | `<OP> "<name>" must include at least one scenario` (the binary's empty-scenario hint may follow)                                                            | path + `<OP> "<name>"`                                            |
| 14  | `archive/added-exists`         | `Duplicate TO in RENAMED: "<name>"`                                                                                                                         | path + `<name>` (native: `collides with an existing requirement`) |
| 15  | `archive/added-exists`         | `RENAMED TO collides with ADDED for "<name>"`                                                                                                               | path + `<name>` (native: `collides with an ADDED requirement`)    |
| 16  | `archive/target-missing`       | `Requirement present in both MODIFIED and REMOVED: "<name>"`                                                                                                | path + `<name>` (native: `no longer exists`)                      |
| 17  | `archive/added-exists`         | `Duplicate requirement in ADDED: "<name>"`                                                                                                                  | path + `<name>` (native: `already exists with different content`) |
| 18  | `archive/target-missing`       | `Duplicate FROM in RENAMED: "<name>"`                                                                                                                       | path + `<name>` (native: `no longer exists`)                      |
| 19  | `archive/target-missing`       | `MODIFIED references old name from RENAMED. Use new header for "<to>"`                                                                                      | path + `<to>` (native: `renamed it to "<to>"`)                    |
| 20  | `archive/new-spec-non-added`   | `Archive would refuse this delta: <cap>: target spec does not exist; only ADDED requirements are allowed for new specs. …`                                  | path + `<cap>`                                                    |
| 21  | `deltas/orphaned-requirement`  | `Requirement "<name>" is under "## <section>" …` / `… is above the first "## " section …`                                                                   | path + `<name>`                                                   |
| 22  | `deltas/header-present`        | `No delta sections found. …`                                                                                                                                | path (empty capture)                                              |
| 23  | `deltas/header-present`        | `Change must have at least one delta. No deltas found.`                                                                                                     | none (item-level)                                                 |
| 24  | `archive/op-conflict`          | `Duplicate requirement in MODIFIED: "<name>"` / `… in REMOVED: "<name>"`                                                                                    | path + `<name>`                                                   |
| 25  | `archive/op-conflict`          | `Requirement present in both RENAMED and REMOVED: "<from>"` (the binary may append `(REMOVED spells it "…")`)                                               | path + `<from>`                                                   |
| 26  | `archive/rebuilt-spec-invalid` | `<OP> "<name>" is missing requirement text`, for a block written inside an HTML comment                                                                     | path + `<name>` (native: `no text under its header`)              |
| 27  | `archive/rebuilt-spec-invalid` | `<OP> "<name>" must contain SHALL or MUST in the requirement body, not only in the header. …`, the same                                                     | path + `<name>` (native: `no text under its header`)              |
| 28  | `archive/rebuilt-spec-invalid` | `<OP> "<name>" must include at least one scenario`, the same                                                                                                | path + `<name>` (native: `no scenario`)                           |

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

Entries 13–18 and entry 12's delta-header alternative came from the round-3
review, which found each shape double-reported on the typed lane; entry 18 was
found by probing the same RENAMED slice. Each rides an existing native finding:
the second of two duplicate operations sees the first's effect in
`replayDeltaNames` (a name already written, or a source already carried away),
MODIFIED+REMOVED sees the REMOVED phase's, and a RENAMED-TO landing on an ADDED
name is the RENAMED-TO arm's. A sweep (verification 19) then checks every report
the parity suite produces: a relayed finding that quotes the same requirement or
header as a cospec finding on the same file fails it.

Entries 19–25 close the doubles the round-3 review found next. Entry 19's two
messages name different headers — the binary the rename's TO, cospec the FROM —
so `archive/target-missing` now says where the rename took its target
(`renamed it to "<to>"`, or `removed it`) and the pair keys on the TO. Entry 21
keys on the requirement name, never the section, which cospec's advisory reader
quotes with a trailing comment masked and the binary quotes whole. Entries 24–25
pair with the new `archive/op-conflict` (D14). The header captures of entries 3,
4, 10 and 11 are `(.*)`, not `(.+)`: both tools quote a blank-titled `###   `
header as `"### "`, which the old captures could not key.

Entries 26–28 come with round 5's keyed suppression (D13): a requirement a delta
writes inside an HTML comment is read by the binary's delta validator and merged
by its archive, but masked from `deltas/requirement-shape`, so its defect is now
`archive/rebuilt-spec-invalid`'s on the commented header's line, and the
binary's three findings for it pair on the name. Entry 7's native key also takes
`deltas/requirement-shape`'s own `is missing requirement text`, the wording
round 5 gives an empty statement whose only SHALL/MUST sits in a scenario step
(the binary reads the statement off the lines above the first header, so it
refuses that shape in validate and archive; cospec's masked parse counted the
step's keyword and was silent). Under `--fast` the rebuilt spec is unchecked, so
entries 26–28 have no twin and the delegated ERRORs stay.

Entries 10–12 and entry 5's key came from the round-2 review. Entry 5 keyed on
the path alone, so a real `### Scenario:` suppressed the binary's INFO for a
commented one elsewhere in the file, which cospec's advisory reader never sees.
It now keys on the header text, which `deltas/scenario-depth`'s message quotes;
keying on the line instead would need a change to `mergeDelegated`, which is
outside this change's slice of `validate.ts`. The key's residual: a commented
and a real `### Scenario:` with identical text in one file both pair with the
real one's finding, so the commented one's INFO is suppressed too. Entry 6's key
is the name as the header is written (D10), so a comment-bearing header pairs.
Entry 12 matches only when every defect the dry-run lists is one D12 reads, so a
listed defect cospec doesn't check still reaches the reader.

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

### D10. One view model: a fence-aware scan, read two ways

Round 3 replaces the per-rule view choices rounds 1 and 2 made with one model.

**One scan.** `scanDocument` reads each delta file and living spec once: CR/CRLF
folded to LF, the code-fence mask built on those raw lines first (exactly as the
binary's `buildCodeFenceMask` builds it), then `maskHtmlComments` walks the
lines with that mask in hand. A comment can neither open nor close on a fenced
line, and one already open when a fence starts stays open across it. The old
whole-file comment regex ran before the fence mask, so a `<!--` shown inside a
fenced example masked every line after it: the scenarios below vanished, and
`archive/scenario-preservation` and the hard archive gate refused a merge the
binary performs (probed: validate clean, `archive -y` exit 0).

**Two views of it.**

- `verbatim` — fences masked, comments kept. It is exactly what the binary's
  `MarkdownParser`, `findMainSpecStructureIssues`, delta reader and archive
  read, so it feeds every `archive/*` rule: `archive/target-invalid`
  (`hasPurpose`, `hasRequirements` and all three structure kinds),
  `archive/added-exists`, `archive/target-missing`,
  `archive/new-spec-non-added`, `archive/no-ops`, `archive/split-requirement` on
  the delta and on the living spec (D11), `archive/scenario-preservation` (its
  op list and its living baseline) and the ops `replayDeltaNames` replays.
- `masked` — comments blanked too. Only the advisory `deltas/*` (and `specs/*`)
  rules read it, so a commented-out draft draws no authoring finding.

`parseDeltaSpec(text, path, cap, view)` picks a view of the scan.
`parseLivingSpec` runs one reader, `readLivingView`, over both views of one
scan: the top-level fields are the masked view (the `specs/*` rules and the hard
gate read them), and `archive` is the verbatim `LivingArchiveView`, which adds
`structureIssues` (`findLivingStructureIssues`) and `splits` (D11).
`findScenarioDrops` takes the `ScenarioBaseline` shape both views satisfy.
`deltas/requirement-shape` quotes `DeltaOp.verbatimName`, the header as written,
so its delegated twin keys on the same name.

**BOM.** The binary strips a UTF-8 BOM in `MarkdownParser`, its delta reader and
`extractRequirementsSection`, but not in `findMainSpecStructureIssues`, which
folds line endings only. So both views strip it, and `findLivingStructureIssues`
alone scans with `keepBom` (probed: a BOM before a first-line `## Requirements`
hides the header from the structure reader, every requirement reads as outside
it, and the archive refuses).

**The hard gate stays on the masked view** (superseded in round 6, D15: the gate
now reads the verbatim view by construction). `commands/archive.ts` is
`archive-and-sync-parity`'s file, and its scenario-preservation gate calls
`parseDeltaSpec` and `parseLivingSpec` with their masked defaults. The shared
scan fixes its fence bug here; its view is that change's to move. Until then the
gate refuses a MODIFIED block that keeps a living scenario only inside a comment
(the rule and the binary accept it), and a living scenario inside a comment that
a MODIFIED drops is refused by the binary's archive instead of the gate. The
integration row in `apps/cli/test/integration/archive-gates.test.ts` that
expected a drop for scenarios kept only inside a comment is re-pointed: the
binary archives that fixture (probed), the rule sees no drop, and
`cospec archive` still refuses it before delegation through
`deltas/requirement-shape` on the masked view.

Rejected alternatives: switching every consumer to `verbatim`, which would raise
authoring findings on commented-out drafts; and keeping the round-2 per-rule
choices (scenario-preservation and the Purpose/Requirements/delta-header checks
on the masked view), which left a commented delta header and a commented living
scenario as false PASSes and a comment-bearing MODIFIED name double-reported.

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
skipped header. `findRequirementSplits` (`rebuilt-spec.ts`, round 5) returns a
header when it is the first one and the head has no scenario, or when its own
part has none — and reads both off the rebuilt spec's own parse
(`validateRebuiltSpec`, D13), never off a count of `#### ` headers in the
isolated block. That parser makes every deeper header under a piece one of its
children, and a child with a body is a scenario, so a `### Notes` whose only
child is a `##### Sub-case` with steps archives (probed: validate INFO, archive
exit 0 — rounds 2–4 refused it). Where the merge refuses before building a spec
(a precondition another rule reports), the block is read inside a spec of its
own, with the same parser. `archiveRules` reads it on the `verbatim` parse and
reports an ERROR on the header's line, and `deltasRules` reads the same verdict
for the INFO it drops. A `### Scenario:` line the advisory reader sees stays
`deltas/scenario-depth`'s: its `#### Scenario:` fix mends both.

**A blank title.** A skipped header whose title is blank (`###   `) takes its
text from the lines before its first scenario, so one with a scenario but no
such line is a requirement with no text in the rebuilt spec
(`Requirement text cannot be empty`). Each part records whether it has a
statement (`RequirementPart.hasText`); the rebuilt parse reports that piece's
empty text, and `findRequirementSplits` reports it as a `text` split.

**The living side** was an arm of this rule until round 4; the same cut inside a
living requirement is now one shape of `archive/rebuilt-spec-invalid` (D13).

**`--fast`.** `deltasRules(change, { fast })` suppresses `deltas/skipped-header`
on a splitting header only when the archive family runs. Under `--fast` nothing
else reports the header, so it keeps its INFO — and the binary's own INFO then
pairs with it through entries 3/4. Round 2 suppressed it unconditionally, so a
change cospec never delegates lost the only report it had.

### D12. Living-spec structure in `archive/target-invalid`

Before merging, the binary's archive runs `findMainSpecStructureIssues` on the
living spec. It refuses a delta header
(`^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$`, case-insensitive),
a `### Requirement:` outside the first `## Requirements` section, and a second
requirement under a normalised name already declared there.
`findLivingStructureIssues` ports all three as upstream reads them: fenced lines
blanked, HTML comments not masked, the BOM kept, and the spec reader's
`^###\s+Requirement:` header. `archive/target-invalid` reads them from
`LivingSpec.archive.structureIssues` and names each one's line. It no longer
reports a missing `## Purpose` or `## Requirements`: probed, the archive appends
an empty `## Requirements` and merges an ADDED into it (a false refusal until
round 4), and a missing Purpose fails only the rebuilt spec (D13). The round-2
rule kept the delta-header check on its own masked flag, so a delta header on
its own line inside a comment passed validate while the archive refused it, and
entry 12 did not recognise the delta-header defect, so a visible one was
reported twice.

### D13. `archive/rebuilt-spec-invalid`

The binary's archive does not stop at the merge preconditions: after
`buildUpdatedSpec` it runs `Validator.validateSpecContent` on the rebuilt spec
and writes nothing on an ERROR. Its validate dry run (`findArchiveBlockers`)
stops before that step, so any living content the delta never touches can pass
validate and abort the archive — a `### Notes` or loose `#### Scenario:` above
the first requirement, the same inside a comment, a surviving requirement with
no scenario (none, bare, fenced-only), a commented-out draft, a split surviving
requirement, a `#` heading taking a requirement's scenarios, a requirement with
no statement, no Purpose text, a `### Requirements` heading the reader takes for
the section, and a delta removing the last requirement. Round 3 chased these one
living check at a time; round 4 ports the step itself.

`core/rebuilt-spec.ts` has two halves. `rebuildSpec` is `buildUpdatedSpec` on
the success path, reading the living text and the delta's verbatim parse (the
ops `replayDeltaNames` replays): the living spec — or, for a new capability, the
skeleton with the delta's readable Purpose — sliced by a port of
`extractRequirementsSection`, the delta applied RENAMED → REMOVED → MODIFIED →
ADDED, recomposed with the living order kept and new blocks appended, blank runs
collapsed outside fences. Wherever the binary throws it returns `undefined`:
each throw is a precondition another rule or the relayed validate reports. Every
line carries its origin (living line, delta line, skeleton), which is what lets
a finding name the line to edit. A contract row (verification 21.5) checks the
port against thirteen specs the pinned binary writes, byte for byte.

`validateRebuiltSpec` ports the ERRORs of `validateSpecContent`: the throws of
`MarkdownParser.parseSpec` (no Purpose content; no section titled
`Requirements`, at any level, found depth-first), the `SpecSchema` minimums (a
requirement's text — body, else its header title — and a scenario with a body,
per child of that section; at least one child), `findMainSpecStructureIssues`,
and a canonical requirement with no statement. WARNINGs are dropped: the
archive's validator is not strict.

`archiveRules` runs it per delta file once no precondition rule refused the
capability (`MERGE_PRECONDITIONS`), because the archive stops there first. A
finding on a line a delta block wrote is the delta rules' — a block with no
scenario is `deltas/requirement-shape`'s (and the binary validate's), a skipped
header's cut is `archive/split-requirement`'s, a block with no statement is both
of theirs — so it is dropped only where one of those reported that very line
(round 5): `requirementShapeIssues`, the one function behind
`deltas/requirement-shape`, is run on the masked parse and its reported lines
are the key, by arm. Round 4 dropped it wherever the verbatim parse had a block
on that line, on the assumption the delta rule had fired — but a block written
inside an HTML comment is merged by the archive and invisible to the masked
reader, so a never-delegated change passed with a commented requirement the
binary refuses. Kept: a `#` heading between a block's text and its scenario, and
every defect of a commented block (entries 26–28, D5).

**Retirement (round 5).** Under `retire_capabilities: true` the archive deletes
the spec instead of writing it only on its own decision (1.13.1
`decideSpecOutcome` and `isRetirementCandidate`): no requirement block survives
(`noRequirementBlocks`), nothing in the living spec sits outside what a
retirement can name (`contentTheMergeCannotName`), every ERROR of the rebuilt
spec is "no requirements" (`isRetirableSpec`) — at whatever level the header
read as the Requirements section sits — and, for a spec on disk, this change
removed a block (`counts.removed`). With no spec on disk a retirable one is
skipped; that shape is today only reachable past `archive/new-spec-non-added`, a
precondition, so it never reaches this rule. `rebuildSpec` returns the three
inputs beside the lines, the audit ported line for line and checked against the
pinned dist's own `buildUpdatedSpec` (verification 26.4). Round 4 skipped the
no-requirements ERROR on the header level alone: 56 probed shapes the archive
refuses passed (prose, comments, fences, headings, tables or a trailing section
above, inside or below the removed blocks; a spec with no `## Requirements` the
change removed nothing from), and 6 it retires were refused (a
`### Requirements` or `#### Requirements` under Purpose). A blocked declared
retirement quotes the blocking lines as the binary's `refusalReason` does
(`describeUnaccountedContent`: three lines, control characters made safe, a
count for the rest); undeclared, the hint names the marker only when it alone is
missing (`retirementHint`) and the lines otherwise (`blockedRetirementHint`), so
cospec never sends an author after a marker it would then refuse.

The rule runs on the typed lane only; the legacy lane relays the binary, whose
validate is silent here.

**`cospec apply` runs fast validation by design.** The apply gate runs the rule
set with `--fast` (DESIGN §2.5/§5.1), which skips the whole `archive/*` family —
this rule, `archive/split-requirement` and the rest — so `apply` exits 0 on a
change whose rebuilt spec the archive would refuse. The family gates at archive
time instead: `cospec validate` reports it, and `cospec archive` refuses before
delegating. That is the gate's contract, not a gap this change closes.

Retired in favour of it: the living split arm of `archive/split-requirement`
(`LivingArchiveView.splits` and the living `parts`) and the missing-section arm
of `archive/target-invalid`. `archive/target-invalid` keeps the three structure
defects, because the binary refuses those before merging.

### D14. `archive/op-conflict`

A change cospec never delegates — no `proposal.md` — gets no relayed finding, so
each conflict the binary's validate reports needs a native one. Enumerated
against `validateChangeDeltaSpecs` (1.13.1) and probed without a proposal: a
duplicate ADDED, duplicate RENAMED FROM or TO, MODIFIED+REMOVED, MODIFIED+ADDED,
ADDED+REMOVED, a MODIFIED of a RENAMED FROM and a RENAMED TO the delta ADDs
already had one (`archive/added-exists`, `archive/target-missing`), as did the
unpaired-rename, orphan, empty-section and headerless shapes. Three did not: a
MODIFIED written twice (the merge would apply the second over the first), a
REMOVED written twice (the second reads as already synced) and a REMOVED folding
onto a RENAMED FROM (the REMOVED reads as already synced after the rename).
`archive/op-conflict` reports those per delta file, as the binary compares them
— exact names for the duplicates, folded for the RENAMED pair — on the later
entry or the REMOVED. Like the rest of the family it is skipped under `--fast`,
where a delegated change keeps the relayed ERROR.

### D15. Gates read what the archive reads (round 6)

The roadmap owner's ruling on the masked view: every rule that can change a gate
outcome reads what the binary reads — fences masked, comments kept — and the
comment-masked view survives only for advisory findings that never change an
outcome. Advisory findings ignore commented content; gates read exactly what
OpenSpec's archive reads.

**Why the opinion was narrowed.** Rounds 1–5 read every `deltas/*` rule and the
hard archive gate on the masked view, as a cospec opinion that a commented-out
draft is not content. The binary reads comments as text everywhere, and the
opinion produced both kinds of disagreement with it. False refusals: a statement
written inside a comment (32.1, 32.3, 34.1), a scenario whose header sits inside
one (34.4), a delta section header inside one (34.5), and a MODIFIED that keeps
a living scenario only inside one at the hard gate (34.9) were all refused where
the binary validates and archives. False clears: a requirement written inside a
comment with no statement or no scenario drew no `deltas/*` finding at all
(27.x) — round 5 had to route it to `archive/rebuilt-spec-invalid`, which
`--fast` (and so `apply`) never runs — and a commented orphan requirement or a
fully commented delta at an unread path drew no finding on a change cospec never
delegates (34.12n, 34.13n).

**A structural type split.** `ParsedDelta<V>`, `DeltaOp<V>` and `LivingView<V>`
carry a type-only brand (`[VIEW]?: V`, a `declare const` unique symbol, absent
at runtime). `Delta = ParsedDelta<'verbatim'>` is what `parseDeltaSpec` returns;
`AdvisoryDelta = ParsedDelta<'masked'>` is what `parseAdvisoryDelta` returns.
Every gate input is typed on the verbatim view — `requirementShapeIssues`,
`findRequirementSplits`, `rebuildSpec`, `findScenarioDrops` and its
`ScenarioBaseline` (which picks the brand) — so the typecheck refuses a masked
parse there. `parseLivingSpec`'s top level is now the verbatim view (and
`archive` the same object); the masked one moved to `advisory`. A consequence by
construction: `commands/archive.ts`'s scenario-preservation gate calls
`parseDeltaSpec` and `parseLivingSpec` and so reads the verbatim view with no
edit to that file (`archive-and-sync-parity`'s) — 34.9 and the re-pointed
`archive-gates` integration row are the evidence. `rules/views.ts` lists the
advisory findings (`ADVISORY_RULES`, typed `AdvisoryIssue`), and
`test/unit/rules/views.test.ts` enumerates every `archive/*`, `deltas/*` and
`specs/*` rule id in `core/rules/`, runs each rule's fixture as written and
wholly inside an HTML comment, requires a verbatim rule to decide both
identically and an advisory one to stay silent on the commented copy, confines
`parseAdvisoryDelta` and `.advisory` to the modules that compute advisory
findings, and asserts with `@ts-expect-error` that no gate input accepts the
masked types. A mutation run (requirement-shape handed the masked parse) fails
it.

Moved to the verbatim view: `deltas/requirement-shape` (all arms),
`deltas/header-present`, `deltas/unpaired-rename`,
`deltas/orphaned-requirement`, `deltas/unread-file` (the binary's
`findOrphanedRequirements` and `findUnreadDeltaFiles` read fence-masked lines
only), and the lines `archive/rebuilt-spec-invalid` leaves to
`deltas/requirement-shape`. Left on the masked view: `deltas/skipped-header`
(INFO), `specs/purpose-tbd` (a living-spec lint neither apply nor archive
reads), and `deltas/scenario-depth`. The last is an ERROR, so it departs from
the ruling's letter, on the binary's evidence: it only INFOs a `### Scenario:`
written inside a comment and archives the change (entries 3 and 5, 34.11), so
reading it verbatim would refuse what the binary archives, while a commented one
that does split a requirement is `archive/split-requirement`'s, verbatim. On the
masked view its findings are a subset of the verbatim ones — a commented line is
blank there — so no comment can make it refuse.

**The statement is the binary's** (`extractRequirementBody`, ported in
`core/deltas.ts`). The lines under the header up to the first header on a
non-fenced line, blank and fenced lines skipped (masked per block, as upstream
masks them), `**Key**: value` metadata the statement only when nothing else is,
an HTML comment kept as text. `hasShallMust` and the first part's `hasText` are
computed from it, and `deltas/requirement-shape` grades in the binary's order:
empty first (`is missing requirement text`, or the header-only wording when the
header holds the keyword), then no keyword
(`must use SHALL/MUST normative language`, cospec's ERROR where the binary
WARNs). Typed-lane consequences, each pinned: a SHALL/MUST only in a scenario
step (5.1 entry 6, re-pointed from 5.2) or only in a fenced example (32.4) is
refused; a metadata-only statement with no keyword is refused (unit); a
statement cut off by a skipped `###` before it says anything has no keyword (the
SKIPPED unit fixture); a statement that is only a comment has no keyword (32.2);
a scenario whose body is only a comment has one (unit); and an empty statement
under a plain header now reads `is missing requirement text` where it read
`must use SHALL/MUST`.

**The marker is the binary's** (`readBooleanMarker`, ported in
`core/change-metadata.ts`). `retire_capabilities: true` counts only when the
whole `.openspec.yaml` passes `ChangeMetadataSchema` — zod 4's issue wording and
order ported, the first issue the reason — and its `schema:` is one
`listSchemas` lists (package, user and project schema dirs) and `resolveSchema`
loads (`SchemaYamlSchema` and `parseSchema`'s graph checks ported). An
unhonourable marker counts as none, as the archive counts it, so an emptied spec
is refused and the finding appends
`retire_capabilities is set but cannot be honored (<reason>)`, the reason the
archive's `fix` quotes (33.1–33.5); a reason that names a remedy is spelled
through `respellRemedies`. 33.50 compares the port with the pinned dist's own
read over 125 metadata × schema shapes. The read needs the change directory,
which only `loadChange` has, so `commands/validate.ts` gains one field there
(`retireMarker`) beside its `DUPLICATE_CLASSES` — the one hunk outside that
table; no entry changed. Entries 26–28 (round 5) are now reached only where
`deltas/requirement-shape` did not report a commented block, and stay.

**The differential table** (34) runs one fixture per comment-divergence class —
a statement inside a comment, a commented `### Requirement:` header (with and
without a scenario), a commented `#### Scenario:` header, a commented section
header and a comment across a section boundary, a commented MODIFIED section, a
commented delta header in a living spec, a scenario kept only inside a comment,
an unterminated comment, commented `###` headers, a commented orphan and a fully
commented unread file — through `cospec validate --strict`, `cospec archive` and
the binary's `validate --strict` and `archive -y`, on a delegated change and on
one never delegated (whose relayed findings cannot cover for cospec's own
reading). `cospec archive` accepts exactly what the binary's archive accepts,
and `cospec validate --strict` exactly what both of the binary's commands
accept.

## Operational surface

The interactive surface is `cospec validate`'s report: six new rule ids appear
in human and `--json` output (`archive/rebuilt-spec-invalid` and
`archive/op-conflict` among them), one hint gains text, `deltas/scenario-depth`
quotes its header, `deltas/requirement-shape` names a requirement as its header
is written, `archive/target-invalid` names three more defects (a delta header
now by its line) and no longer refuses a missing `## Purpose` or
`## Requirements`, `archive/target-missing` names the header a rename took its
target to, `archive/scenario-preservation` reads HTML comments as the archive
does, every gate-feeding `deltas/*` rule and the hard archive gate read them too
(round 6), `deltas/requirement-shape` reads the statement as the binary does,
`retire_capabilities` counts only where the binary honours it, and delegated
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
