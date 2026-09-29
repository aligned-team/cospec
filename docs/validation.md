# Validation

`cospec validate` owns change validation. It runs cospec's own rule families
over every change and delegates to `openspec validate` only for spec-bearing
changes with deltas — and even then, cospec's sharper diagnostics run first so
they win the report.

```
cospec validate [name] [--all|--changes|--specs] [--strict] [--json] [--fast]
```

The full rule registry — every stable rule ID, grouped by family, with its level
and what it checks — is owned by the site:
[Validation rule registry](https://cospec.aligned.team/reference/validation-rules).
Rule IDs are stable public API: script against them, grep for them in CI logs,
ignore them by ID if you need to. This page covers how the rule families are
wired together, which is implementation detail the site doesn't need.

## Composition

For each change, cospec resolves the schema from `.openspec.yaml`, then:

1. If the schema is one of the eleven types, it runs the `meta`, `proposal`,
   `blockers`, and `tasks` families always.
2. If the schema forbids specs and a `specs/` file exists →
   `meta/forbidden-artifact`.
3. If the schema declares `verification`
   (`schema.declared.has('verification')`), it runs the `verification` family —
   wired into `runChangeRules()` the same way `deltas`/`archive` are gated on
   `specs`.
4. If the schema declares specs and delta files exist, it runs the `deltas`
   family, then delegates to
   `openspec validate --strict --no-interactive --json` and merges the issues,
   then (unless `--fast`) runs the archive-precondition family.
5. `openspec validate` is **never** invoked for a change whose schema has no
   specs artifact — its hardcoded `CHANGE_NO_DELTAS` rule would false-error.

Living specs (`--specs`) always delegate to `openspec validate --specs` (sound
and schema-independent), with cospec's `specs/purpose-tbd` on top.

cospec may be strictly more conservative than OpenSpec in the archive-
precondition family. A false PASS (cospec ok, `openspec archive` aborts) is a
release blocker — and the runtime archive verifier still catches it, so the user
is never lied to. Parity is enforced by contract tests, never trusted. See
[apply-archive.md](apply-archive.md) for the runtime verifier that backs these
preconditions.

`archive/added-exists` also checks each delta file's own section names, the way
OpenSpec's validator does before any merge: an ADDED whose exact (normalised,
not folded) name a REMOVED — or failing that, a MODIFIED — in the same file also
names gets one ERROR, and the replay-based arms stay quiet for that op.
`replayDeltaNames` returns the collision alongside each op's replayed view. The
check runs for a living capability too, where an ADDED identical to the living
block would otherwise read as an early-sync no-op beside the MODIFIED.

`archive/target-invalid` refuses exactly the living-spec defects OpenSpec's
archive will not update past, before merging anything
(`target spec is structurally invalid`): a delta header, a `### Requirement:`
outside the first `## Requirements` section, and a second requirement under a
normalised name already declared there. `LivingSpec.structureIssues` holds them,
from `findLivingStructureIssues`, and the rule's message names each one's line.
A missing `## Purpose` or `## Requirements` is not one of them — probed, the
archive appends an empty `## Requirements` and merges an ADDED into it — so the
rule reports neither; what the archive does refuse there (no Purpose text) is
the rebuilt spec's.

`archive/op-conflict` reports the three in-file conflicts OpenSpec's validator
refuses that no other `archive/*` arm sees: a MODIFIED and a REMOVED each
written twice (exact names), and a REMOVED folding onto a RENAMED FROM. Every
other conflict shape its validator reports already has a native finding
(`archive/added-exists`, `archive/target-missing`, `deltas/unpaired-rename`,
`deltas/header-present`, `archive/no-ops`), so a change cospec never delegates —
one with no `proposal.md` — is refused natively on every one of them.

## The rebuilt spec

OpenSpec's archive does not stop at the merge preconditions: it rebuilds the
main spec (`buildUpdatedSpec`, `specs-apply.ts`) and re-validates the whole
result (`Validator.validateSpecContent`) before writing anything, and its
`validate` dry run stops before that step. `core/rebuilt-spec.ts` ports both.
`rebuildSpec` applies the delta's verbatim ops to the living spec — or to the
skeleton the archive writes for a new capability, carrying the delta's own
`## Purpose` when it is readable — exactly as the archive merges: its
`extractRequirementsSection` slices, RENAMED → REMOVED → MODIFIED → ADDED, the
living order kept and new blocks appended, the preamble and every other section
as written, blank runs collapsed outside fences. It answers `undefined` wherever
the merge throws instead, because each of those refusals is a precondition
another rule reports. Every line it returns carries its origin — a living-spec
line, a delta line, or the skeleton — and a contract row checks the port against
the binary's own writes byte for byte.

`validateRebuiltSpec` ports the ERRORs of that validation (the archive's
validator is not strict, so a WARNING never stops it): `MarkdownParser`'s
section tree, where every header under the first section titled `Requirements` —
at any level — is a requirement needing text and a scenario with a body; the
Purpose check; the structure check; and a canonical requirement with no
statement. `archive/rebuilt-spec-invalid` runs it once no precondition refused
the capability, names each finding by its origin line, and leaves a block the
delta writes to the delta rules: a finding on a delta line is dropped only when
`deltas/requirement-shape` (a block with no scenario or statement, on the
verbatim parse — `requirementShapeIssues`, shared with that rule) or
`archive/split-requirement` (a header that cuts it) reported that very line.
Both read a block written inside an HTML comment as OpenSpec does, so such a
block is `deltas/requirement-shape`'s, exactly as a visible one is. Under
`retire_capabilities: true` the no-requirements ERROR is skipped only on the
archive's own decision (`decideSpecOutcome`): `rebuildSpec` also returns the
count of REMOVED ops that deleted a block, whether any block survives, and the
living lines a retirement cannot name (`contentTheMergeCannotName`, ported line
for line and checked against the pinned dist's `buildUpdatedSpec`); the rebuilt
spec's only ERRORs must be no-requirements ones, at any header level; and the
change must have removed a requirement. A blocked retirement quotes the blocking
lines as the archive's refusal does (`describeUnaccountedContent`). The marker
itself counts only where the archive honours it (`readBooleanMarker`, ported in
`core/change-metadata.ts` and checked against the pinned dist's own read): the
whole `.openspec.yaml` must pass OpenSpec's `ChangeMetadataSchema` — `created`
as `YYYY-MM-DD`, a non-empty `goal`, `affected_areas` a list of non-empty
strings, an `initiative` of exactly a kebab-case `store` and `id` — and its
`schema:` must be one OpenSpec lists (project, user or package schemas) and
loads. A marker it cannot honour counts as none, as upstream counts it, and the
refusal of an emptied spec names the reason OpenSpec's archive quotes
(`retire_capabilities is set but cannot be honored (<reason>)`). This replaced
the piecemeal living checks — the living split arm of
`archive/split-requirement` and the missing-section arm of
`archive/target-invalid` — with the archive's own validation.

## Capability identity and discovery

A capability is identified by its **full path** under `specs/`
(`<area>/<capability>` for a nested layout, or just `<capability>` at the top
level) — not by its outermost directory segment, which previously made both hard
archive gates silent no-ops for a nested `specs/<area>/<capability>/spec.md`
layout. `core/spec-paths.ts` is the one shared discovery util behind this: it
skips dot-directories and symlinked capability directories, follows an
in-capability symlinked `spec.md` while rejecting one that resolves outside its
capability and ignoring a dangling link, fails loudly (rather than silently
dropping the capability) on any readdir error other than `ENOENT`, and sorts
results by id. A `spec.md` sitting directly in `specs/` (no capability
directory) is not a capability at all — it contributes no delta ops and is
ignored, matching OpenSpec 1.7.0's own hard block on that layout — and
`cospec validate --specs` lists nested capabilities by their full id.

Only a file literally named `spec.md` is a change-side delta. Companion markdown
an author keeps alongside it under a change's `specs/` tree (`README.md`,
`notes.md`, `spec-old.md`) is invisible to both
`openspec validate`/`openspec archive` and to `cospec validate` and the two hard
archive gates — parsing it as delta content previously risked a false
`archive/scenario-preservation` refusal or a false post-merge invariant breach.

## Parser tolerances

cospec's delta and living-spec parsers tolerate a leading UTF-8 BOM and CRLF/CR
line endings (both normalized before parsing; reported line numbers are
unaffected), and mask code fences using the same rule OpenSpec's own shared
fence-masking uses: `~~~` fences are recognized alongside ` ``` `, and a fence
only closes on a matching marker at least as long as the one that opened it.

### One scan, two views

Every document is scanned once (`scanDocument` in `core/deltas.ts`), and both
views are read off that one scan, so they can never disagree about where a fence
starts or which line is which:

1. **Fences first.** The code-fence mask is built on the raw lines, before
   anything else — exactly as OpenSpec's readers build it.
2. **Comments second, fence-aware.** `maskHtmlComments` blanks `<!-- … -->` line
   by line (a `--!>` terminator counts, and an unterminated `<!--` runs to end
   of file), and a comment can neither open nor close on a fenced line. A `<!--`
   shown inside a fenced example is code: masking the text after it — as the old
   whole-file regex did — hid every scenario below the example, and the
   scenario-preservation gate refused a merge OpenSpec performs. A comment open
   when a fence starts stays open across it.

Advisory findings ignore commented content; gates read exactly what OpenSpec's
archive reads. The two `ReadView`s of that scan:

- **`verbatim`** — fences masked, comments kept. It is exactly what OpenSpec
  1.13.1's `MarkdownParser`, `findMainSpecStructureIssues`, delta reader,
  `extractRequirementBody` and archive read, so it feeds **every** check that
  can change an outcome: every `archive/*` rule (`archive/target-invalid`'s
  three structure kinds, `archive/added-exists`, `archive/target-missing`,
  `archive/new-spec-non-added`, `archive/no-ops`, `archive/op-conflict`,
  `archive/split-requirement`, `archive/rebuilt-spec-invalid`,
  `archive/scenario-preservation` and the ops `replayDeltaNames` replays), every
  `deltas/*` finding at ERROR or WARNING that reads spec text
  (`deltas/requirement-shape`, `deltas/header-present`,
  `deltas/unpaired-rename`, `deltas/orphaned-requirement`, `deltas/unread-file`)
  and the hard scenario-preservation gate in `commands/archive.ts`. An operation
  written inside `<!-- … -->` is parsed and applied upstream, so it is checked
  here too; a statement written inside one is a statement, and a scenario inside
  one counts, on both sides of the scenario-loss check; a header's trailing
  comment is part of its name, so `REMOVED Foo` beside `ADDED Foo <!-- note -->`
  is two names and is accepted. `parseDeltaSpec` returns this view (`Delta`),
  and `parseLivingSpec`'s top level and its `archive` carry it
  (`LivingArchiveView` adds `structureIssues` and the living `text` the rebuild
  reads).
- **`masked`** — comments blanked too. It survives only for the advisory
  findings `rules/views.ts` lists (`ADVISORY_RULES`), none of which a commented
  line can trigger: `deltas/skipped-header` (INFO), `specs/purpose-tbd` (a
  living-spec lint neither apply nor archive reads) and `deltas/scenario-depth`.
  The last is an ERROR, and stays on this view on the binary's evidence:
  OpenSpec only INFOs a `### Scenario:` inside a comment and archives the
  change, so reading it verbatim would refuse what the binary archives, while a
  commented one that does split a requirement is `archive/split-requirement`'s,
  on the verbatim view. `parseAdvisoryDelta` returns this view
  (`AdvisoryDelta`), and `LivingSpec.advisory` carries it.

The two parses are distinct types, branded by the view they were read under, so
no gate can be handed the masked one: `Delta` and `AdvisoryDelta`, and
`LivingView` against `LivingView<'masked'>`. `test/unit/rules/views.test.ts`
enforces the split three ways: it enumerates every `archive/*`, `deltas/*` and
`specs/*` rule id in `core/rules/`, so a new rule fails until it has a fixture;
it runs each fixture as written and wholly inside an HTML comment — which
OpenSpec reads the same — and requires a verbatim rule to decide both
identically and an advisory one to stay silent on the commented copy; and it
confines `parseAdvisoryDelta` and `.advisory` to the modules that compute the
advisory findings, with `@ts-expect-error` checks that no gate input accepts the
masked types.

Until round 6 the masked view fed every `deltas/*` rule and the hard gate, as a
cospec opinion that a commented-out draft is not content. It produced false
refusals in both directions from the binary: a statement written inside a
comment, a scenario whose header sits inside one, a delta section header inside
one, and a MODIFIED keeping a living scenario only inside one were all refused
where OpenSpec validates and archives; and a requirement written inside a
comment, with no statement or no scenario, was reported by no `deltas/*` rule at
all — only the rebuilt spec caught it, and not under `--fast`. The opinion was
narrowed to the findings that can never refuse on a commented line.

The BOM is stripped in both views, as OpenSpec's `MarkdownParser`, delta reader
and `extractRequirementsSection` strip it. `findLivingStructureIssues` alone
scans with `keepBom`, because upstream's `findMainSpecStructureIssues` folds
line endings only: a BOM before a first-line `## Requirements` hides that header
from it, every requirement reads as outside the section, and the archive
refuses.

`## REMOVED Requirements` and `## RENAMED Requirements` bullets accept
CommonMark's full marker set (`-`, `*`, `+`) with any leading whitespace, and a
`RENAMED` pair's `FROM:`/`TO:` marker is optional — matching OpenSpec 1.13.1's
delta reader, the pin cospec's own dev and CI run against. A `FROM:` or `TO:`
line that forms no pair (a second `FROM:` displacing the first, a `TO:` with no
pending `FROM:`, or a `FROM:` still open when its section ends) is
`deltas/unpaired-rename` (E) rather than a silently dropped or cross-paired
rename.

The canonical requirement header's keyword is folded before matching, mirroring
OpenSpec 1.13.1's `REQUIREMENT_HEADER_REGEX` and `REQUIREMENT_HEADER`; the
authoring-facing statement of that tolerance and its limits is owned by the site
([`deltas/` rules](https://cospec.aligned.team/reference/validation-rules)).
What it buys cospec is gate parity: a case-variant header used to parse to no
operation at all, so `archive/target-missing` and
`archive/scenario-preservation` stayed silent on a delta the binary parsed and
applied — a false archive PASS.

A requirement name is normalized by stripping a trailing CommonMark closing ATX
run (`### Requirement: Foo ###` reads as `Foo`) before trim, so
`### Requirement: Foo ###` in a delta resolves against a living `Foo` header
without a false `archive/target-missing`, and two headers differing only in that
trailing run collide as one requirement, not two — matching OpenSpec 1.13.1's
own requirement-name normalizer, so cospec's precondition and the delegated
merge agree on both cases.

Both parsers count a `#### ` header as a scenario only when its body carries at
least one non-blank line before the next level-1-to-4 header or end of input —
OpenSpec's own `hasScenarioBody` rule, and the reason `deltas/requirement-shape`
can report a requirement as having no scenario while a `#### Scenario:` line is
plainly visible in it. Scenario _names_ are still read from every header,
bodyless ones included, matching the reader OpenSpec's scenario-loss check uses.

A `### Requirement:` block written outside all four delta sections — above the
first `## ` header, or under a prose section such as `## Notes` — is ignored by
the delta reader, so cospec reports it as `deltas/orphaned-requirement` (W)
naming the section it sits under. It is a warning, not an error, because
pre-format archived changes still carry the shape; the fix is to move the block
under a delta section.

Inside an ADDED/MODIFIED section, the delta parser records every non-fenced
`###` header that is not a named `### Requirement:` header in `skippedHeaders` —
the same lines, with the same `^###\s+(.+?)\s*$` pattern, OpenSpec 1.13.1's
reader skips — and changes nothing else it reports: the header stays part of the
block it sits in, and cuts that block into `parts`. OpenSpec's archive appends
the block verbatim and then re-validates the rebuilt spec, whose reader takes
every `###` header as a requirement of its own, so a piece left with no scenario
aborts the archive (`Requirement must have at least one scenario`).
`findRequirementSplits` (`rebuilt-spec.ts`) names those headers, reading each
piece's verdict off `validateRebuiltSpec` on the rebuilt spec — so a scenario is
any deeper header with a body, a `#####` included, as `MarkdownParser` counts it
— or, where the merge refuses before building one, on the block inside a spec of
its own. They are the first one inside a block whose own text has no scenario
above it, any whose part has none, and a blank-titled one (`###   `) whose part
has no line of text before its first scenario, which the rebuilt spec reads as a
requirement with no text. `archive/split-requirement` (E) reports each, and
`deltasRules` reads the same verdict to drop the INFO. `deltas/skipped-header`
(I) reports every other one — above the first requirement, or followed by a
scenario of its own — except a `### Scenario:` line, which is
`deltas/scenario-depth`'s (its message quotes the header). The INFO yields to
the ERROR only when the archive family runs: under `--fast`
(`deltasRules(change, { fast })`) a splitting header keeps its INFO, so a change
cospec never delegates still reports it.

The same split inside a living requirement the delta keeps is one shape of
`archive/rebuilt-spec-invalid` (see "The rebuilt spec"), which names the
requirement left with no scenario and the header that took them. A SHALL/MUST
counts in the body only; when it appears only in the requirement header,
`deltas/requirement-shape` (E) carries a hint saying to move it to the line
after the header. A statement is the lines above the first header under the
requirement, read as OpenSpec's `extractRequirementBody` reads it (ported in
`core/deltas.ts`): blank lines and fenced lines skipped, an HTML comment kept as
text, and `**Key**: value` metadata lines counted only when nothing else is
there. SHALL/MUST counts in that statement alone — never in a scenario step, a
fenced example or the header. The two are graded in OpenSpec's order: an empty
statement is `is missing requirement text` (E; with a keyword header, the
header-only SHALL/MUST wording), and a statement with no keyword is
`must use SHALL/MUST normative language` (E, where OpenSpec warns). So a
statement written inside a comment is a statement, and one that is only a
comment has no keyword.

## Checkbox grammar

`tasks.md`, `verification.md` and `blocking-changes.md` share one checkbox
detector (`CHECKBOX_LIKE` in `core/tasks.ts`). It recognizes every CommonMark
list marker OpenSpec's own task counter reads at 1.13.1 — `-`, `*`, `+`, and the
ordered `1.` / `1)` up to nine digits — with leading whitespace allowed and the
box holding any content. A closing `]` followed by `(` or `[` is not a checkbox
(`- [Some doc](./doc.md)` and `- [1](./one)` are link bullets), except when the
box is whitespace-only, which could still hide open work.

Recognition is wider than acceptance, deliberately. The canonical cospec forms
stay narrow — `- [ ] N.M …` for a task, `- [<state>] N.M @<layer> …` for a
ledger row — so a recognized line that is not canonical is a loud
`tasks/checkbox-grammar` / `verification/row-grammar` ERROR (the tasks rule
prints the corrected line), never a second accepted grammar. That is strictly
stricter than OpenSpec, which counts such a line as an ordinary not-done task.
What both refuse to do is drop it: before the detector covered the full marker
set, a `+ [ ]` or `1. [ ]` line counted toward neither the numerator nor the
denominator, so `cospec archive`'s tasks gate and its
`archive/verification-incomplete` gate both reported clean over unfinished work.

`blocking-changes.md` reads its gated-section entries through the same detector
(and lints slug-carrying bullets under the same marker set), for the same
reason: `computeGate` reads parsed entries only, so a
`+ [ ] \`dep\``line no detector saw made`cospec
apply`'s hard-blocker gate report `clear`over an unshipped dependency. It now fails`blockers/entry-grammar`,
which apply's fast validation (step 2) refuses before the gate is computed.

The `## Surfaces` block in `proposal.md` reads the same marker set, but through
its own reader and for the opposite reason: it has no malformed-line path, so an
unrecognized item is skipped outright rather than reported. Reading a flag can
only add consequences — the verification and design soft nudges, and
`proposal/surfaces-vocab`'s closed-vocabulary check — so widening the reader is
the fail-closed direction there. Only the marker set is shared; the canonical
form stays `- [x] <token>`.

## Task ids

`TASK_NUM_RE` in `core/tasks.ts` is OpenSpec 1.13.1's `TASK_ID` (`1.2`, `1.2.3`,
`1.3a`, `01.1`), and `parseTasks` records each item's enclosing `## N.` group as
written, resetting on every level-two heading the way OpenSpec's
`LEVEL_TWO_HEADING` does. `tasks/id-mismatch` (W) and `tasks/id-duplicate` (W)
read ids only inside numbered groups, compare group numbers without leading
zeros, and skip fenced lines. OpenSpec runs its own numbering check only for its
built-in `spec-driven` schema, so there is no delegated twin on the cospec-typed
lane, and a legacy `spec-driven` change gets OpenSpec's WARNINGs through the
delegation instead.

## Duplicate diagnostics

Once cospec started delegating to openspec 1.6+'s own overlapping rules (purpose
placeholders, a root-level `specs/spec.md`, a `skip_specs` conflict, scenario
loss on the same requirement in the same file), the merged report de-duplicates:
where cospec's own rule and a delegated rule report the same defect on the same
file, the delegated twin is suppressed and cospec's rule id wins the report. A
delegated issue with no cospec twin is always kept.

From OpenSpec 1.12.0, `openspec validate` also dry-runs the archive merge and
relays each precondition it would refuse on as an **INFO**-level
`openspec/validate` issue — never blocking on its own, but the same defect said
twice inflates the issue count if left unsuppressed. This joined the
duplicate-class list one entry per distinct precondition shape (`rule` pairs
one-to-one, so a shared message prefix isn't enough — see
[Validation rules](/reference/validation-rules) for the full pairing table),
plus three more from OpenSpec 1.13.1: its case-only RENAMED-TO/ADDED collision
refusal against the widened `archive/added-exists`, its
`This change counts as 0 tasks` WARNING against cospec's own `tasks/has-tasks`
ERROR for the same state, and its new unpaired `FROM:`/`TO:` ERROR against
cospec's `deltas/unpaired-rename` — the one pairing where the pin caught up to a
rule cospec already had.

1.13.1's change validator adds five more classes, nine entries: its
empty-section and no-deltas ERRORs against `archive/no-ops` (path-keyed, and
unkeyed for the change-level one); its two skipped-header INFOs against
`deltas/skipped-header` (keyed on the header text) and the `### Scenario:` one
against `deltas/scenario-depth` (keyed on the header text, which its message
quotes, so a commented `### Scenario:`, which `deltas/scenario-depth` reads on
the advisory view and so never reports, keeps its INFO beside a real one with
different text in the same file — when the two read the same, the real one's
finding pairs with both INFOs and the commented one's is suppressed too); its
three SHALL/MUST wordings and `is missing requirement text` against
`deltas/requirement-shape` (keyed on `<OP> "<name>"`); and
`Requirement present in both ADDED and REMOVED` / `… MODIFIED and ADDED` against
the cross-section arm of `archive/added-exists` (keyed on the name, each native
key naming its own section). A path-only key is written as an empty capture
group, `()`, on both regexes. Each entry has a contract test in
`validation-parity.test.ts` that takes the delegated message from the pinned
binary's own output, plus a case where the delegated finding survives because
cospec's rule is silent.

Three more pair the checks that read the archive's view: both skipped-header
INFOs, `### Scenario:` included, against `archive/split-requirement` (keyed on
the header text), and the dry-run's `target spec is structurally invalid` INFO
against `archive/target-invalid` (keyed on the capability) — only when every
defect it lists is a delta header, a misplaced or a duplicate requirement, the
three kinds `findLivingStructureIssues` ports from OpenSpec's
`findMainSpecStructureIssues` (fenced lines excluded, comments not masked, BOM
kept).

Six more close the typed-lane double reports a sweep over the parity suite
found: `must include at least one scenario` (with or without OpenSpec's
empty-scenario hint, so the regex is not anchored at its end) against the
scenario arm of `deltas/requirement-shape` (keyed on `<OP> "<name>"`);
`Duplicate requirement in ADDED`, `Duplicate TO in RENAMED` and
`RENAMED TO collides with ADDED` against `archive/added-exists` (keyed on the
name); and `Requirement present in both MODIFIED and REMOVED` and
`Duplicate FROM in RENAMED` against `archive/target-missing`'s "no longer
exists" wording (keyed on the name, so a MODIFIED whose target was never there
stays its own finding). Under `--fast` the `archive/*` twins do not run and the
delegated ERRORs are kept.

Eight more close the double reports the sweep found next.
`MODIFIED references old name from RENAMED` against `archive/target-missing`,
whose message now names the header an earlier RENAMED took the target to — the
TO the binary quotes — so the two pair on it. The dry-run's
`target spec does not exist; only ADDED requirements are allowed` INFO against
`archive/new-spec-non-added` (keyed on the capability). The orphaned-requirement
WARNING against `deltas/orphaned-requirement` (keyed on the requirement name,
never the section text). `No delta sections found` (path-keyed) and
CHANGE_NO_DELTAS (unkeyed) against `deltas/header-present`. The three in-file
conflicts against `archive/op-conflict` (keyed on the name; for RENAMED+REMOVED,
the RENAMED FROM the binary quotes). And the skipped-header, scenario-depth and
split captures take an empty header text, since both tools quote a blank-titled
`###   ` header as `"### "`.

Round 5 adds three, for a requirement a delta writes inside an HTML comment: the
binary's `is missing requirement text`,
`must contain SHALL or MUST in the requirement body, not only in the header` and
`must include at least one scenario` against `archive/rebuilt-spec-invalid`'s
"no text under its header" and "no scenario" findings on that delta line (keyed
on the requirement name). The `is missing requirement text` entry against
`deltas/requirement-shape` also takes that rule's own
`is missing requirement text` wording. Since round 6 `deltas/requirement-shape`
reads the verbatim view and reports such a block itself — under `--fast` too —
so its own entries pair those findings and the rebuilt spec leaves the line to
it; the three round-5 entries stay, for a rebuilt-spec finding on a delta line
that rule did not report.

Section 19 of `validation-parity.test.ts` sweeps every report the suite
produces: a relayed finding that quotes the same requirement or header as a
cospec finding on the same file fails it, and a second test re-injects every
suppressed twin to show the sweep would catch it.

## `.openspec.yaml` metadata keys

Two boolean keys, recognized on `LoadedChange.openspecYaml`:

- **`skip_specs`** — an alternative to
  `cospec apply --skip-specs`/`cospec archive --skip-specs` for satisfying the
  `specs` artifact requirement on a spec-bearing type with no deltas this run.
  Precedence: the CLI flag wins over a persisted `skip_specs: true` marker,
  which wins over the structural default (spec-bearing types must show deltas).
  Declaring the marker while real files exist under `specs/` is
  `deltas/skip-specs-conflict` (E) — the marker never makes `specs/` forbidden,
  only optional.
- **`retire_capabilities`** — authorizes openspec 1.8.0+ to delete a
  capability's living `spec.md` when a `REMOVED` operation takes its last
  requirement. Without it, a retiring merge is refused — cospec reports it
  first, as `archive/rebuilt-spec-invalid` (`has no requirement left`). With it,
  a retirement the archive refuses — content it cannot name, or a spec this
  change did not empty — is reported the same way, with the blocking lines. See
  [Apply and archive](/reference/commands) and
  [Configuration](https://cospec.aligned.team/reference/configuration) for the
  archive-time behavior this key unlocks.

A key present but not a boolean is `meta/skip-specs-type` /
`meta/retire-capabilities-type` (E). A delta at `specs/spec.md` (no capability
directory) is `deltas/spec-at-specs-root` (E).
