# Proposal

## Why

`cospec validate` disagrees with the wrapped binary on five validation findings,
so the same change reads differently depending on which tool checks it. Each was
probed against the pinned binary under node in a sandboxed HOME:

- **Header-only SHALL/MUST.** A requirement written
  `### Requirement: The system SHALL frob widgets` with no keyword in its body
  gets cospec's `deltas/requirement-shape` ERROR
  (`ADDED "…" must use SHALL/MUST normative language`) with no hint. The binary
  tells the author what to do: move the SHALL/MUST statement to the line right
  after the header. The binary's own finding then shows up underneath cospec's,
  so one defect is reported twice.
- **Task numbering.** `tasks/*` checks only that `## N.` headings count up
  from 1. A `- [ ] 2.1 …` line under `## 1.` and a second `- [ ] 1.1 …` pass
  clean, although the binary warns about both (`Task "2.1" is under group 1, …`,
  `Task ID "1.1" is duplicated; …`). `TASK_NUM_RE` in `core/tasks.ts` is
  exported and nothing uses it.
- **Cross-section conflicts.** A delta that `## REMOVED`s `Widget rendering` and
  `## ADDED`s `Widget rendering` validates clean in cospec's preview, but
  `openspec archive` refuses it
  (`Requirement present in both ADDED and REMOVED: "Widget rendering"`). An
  `## ADDED` plus `## MODIFIED` pair of one name behaves the same way: on a new
  capability cospec reports only the MODIFIED side, and on a living one whose
  ADDED block matches the living requirement cospec reports nothing, while the
  binary refuses both. The living spec (`archive-integrity`), a unit test and
  two docs pages all say an ADDED may re-use a header a REMOVED vacated, which
  is wrong for the pinned binary.
- **Skipped delta headers.** A non-requirement `### …` line inside an ADDED or
  MODIFIED section is silently ignored by both parsers. The binary reports it as
  an INFO. cospec has no rule id for it, so the INFO reaches the reader only as
  un-deduped passthrough, and not at all for a change cospec never delegates.
- **Empty delta sections.** For a delta file whose sections parse to zero
  entries, the reader sees three findings for one defect: cospec's
  `archive/no-ops`, the binary's
  `Delta sections … were found, but no requirement entries parsed` and its
  `Change must have at least one delta`.

The governing rule stays the same. cospec-typed schemas keep cospec's
severities, and the legacy lane keeps the binary's through the existing
delegation in `validate.ts`. That's why `deltas/requirement-shape` stays an
ERROR for cospec-typed changes and only the binary's hint text is ported.

## What Changes

- `deltas/requirement-shape` keeps its ERROR and its message. When the
  requirement's header holds SHALL or MUST and its body doesn't, the issue gets
  the binary's hint, which says to move the SHALL/MUST statement to the line
  immediately after the `### Requirement: …` header.
- New rule `deltas/skipped-header` (INFO). It reports every non-fenced `### …`
  line inside an ADDED or MODIFIED section that isn't a named `### Requirement:`
  header and that the archive keeps. It reads the same lines the binary reads,
  and has a separate message for a nameless `### Requirement:`. A
  `### Scenario:` line that `deltas/scenario-depth` already reports is left to
  that rule, whose message now quotes the header.
- New rule `archive/split-requirement` (ERROR). A skipped header inside a block
  that leaves a piece of it with no scenario is refused by the binary's archive,
  which re-validates the rebuilt spec with every `###` header read as a
  requirement of its own. The rule reports it instead of the INFO — except under
  `--fast`, where the rule doesn't run and the INFO stays. A blank-titled header
  with a scenario but no text before it is refused too: the rebuilt spec reads
  it as a requirement with no text.
- New rule `archive/rebuilt-spec-invalid` (ERROR). The binary's archive
  re-validates the whole spec it rebuilds from the living spec and the delta,
  and its validate never does, so living content the delta never touches can
  abort the archive after validate passed: a `### Notes` above the first
  requirement, a surviving requirement with no scenario, a commented-out draft
  requirement, a split surviving requirement, no Purpose text, a delta removing
  the last requirement. The rule rebuilds the spec as the archive does and runs
  a port of the archive's validation over it, naming each defect's living or
  delta line. It replaces the living-side split check, and
  `archive/target-invalid` stops refusing a living spec with no
  `## Requirements`, which the binary archives. Under
  `retire_capabilities: true` it decides as the archive does whether the spec is
  deleted or written — refusing a retirement that content outside what the merge
  can name blocks, or that removes nothing, and quoting the blocking lines — and
  it leaves a delta line to the delta rules only where they reported it, so a
  requirement written inside an HTML comment is refused too.
- `archive/split-requirement` counts a piece's scenarios as the rebuilt spec's
  parser does (a bodied `#####` child counts), and `deltas/requirement-shape`
  refuses an empty statement whose only SHALL/MUST sits in a scenario step,
  which the binary's validate and archive refuse.
- New rule `archive/op-conflict` (ERROR): a MODIFIED or REMOVED written twice in
  one delta file, and a REMOVED of a RENAMED source. The binary's validate
  refuses all three and no other cospec rule did, so a change cospec never
  delegates (no `proposal.md`) passed them.
- One view model. Each delta and living spec is scanned once, code fences first,
  and an HTML comment can't open or close on a fenced line, so a `<!--` inside a
  fenced example no longer hides the scenarios after it. Every `archive/*` rule,
  `archive/scenario-preservation` included, reads the verbatim view (fences
  masked, comments kept) that the binary's archive reads; only the advisory
  `deltas/*` rules keep masking comments. A commented op that collides or misses
  its target is refused, `REMOVED X` beside `ADDED "X <!-- note -->"` is no
  longer a conflict, and a scenario inside a comment counts as the archive
  counts it.
- `archive/target-invalid` also refuses a living spec with a delta header
  (visible, or on its own line in a comment), a `### Requirement:` outside
  `## Requirements`, or a duplicate requirement name, which the binary's archive
  refuses to update. A BOM is kept for this check, as the binary keeps it.
- New rules `tasks/id-mismatch` and `tasks/id-duplicate` (WARNING), ported from
  the binary's `findTaskNumberingIssues`. A task id whose leading group number
  disagrees with its enclosing `## N.` heading (with leading zeros normalised)
  warns, and so does an id declared twice. The ids are read with `TASK_NUM_RE`,
  which widens to the binary's task-id shape (`1.2.3`, `1.3a`). Numbering is
  read only inside `## N.` groups, and any other level-two heading ends a group.
- `archive/added-exists` covers two more shapes through `replayDeltaNames`: an
  `## ADDED` whose exact name the same delta file also `## REMOVED`s, and an
  `## ADDED` whose exact name the same delta file also `## MODIFIED`s, on a new
  or a living capability. Each is reported once, on the ADDED operation. A name
  that differs only in case or spacing is still not a conflict here, matching
  the binary.
- `DUPLICATE_CLASSES` in `commands/validate.ts` gets a pairing for each
  delegated finding that restates one of the native findings above. That covers
  empty sections and no-deltas against `archive/no-ops`, the binary's two
  skipped-header INFO shapes against `deltas/skipped-header`, a skipped
  `### Scenario:` header against `deltas/scenario-depth`, the three SHALL/MUST
  and missing-text messages and the missing-scenario message against
  `deltas/requirement-shape`, the two cross-section messages, duplicate ADDED,
  duplicate RENAMED TO and RENAMED-TO-collides-with-ADDED against
  `archive/added-exists`, MODIFIED+REMOVED and duplicate RENAMED FROM against
  `archive/target-missing`, the two skipped-header shapes against
  `archive/split-requirement`, the dry-run's structurally-invalid-target INFO
  against `archive/target-invalid`, MODIFIED-references-old-name against
  `archive/target-missing` (whose message now names the rename's TO), the
  dry-run's target-spec-does-not-exist INFO against
  `archive/new-spec-non-added`, the orphaned-requirement WARNING against
  `deltas/orphaned-requirement`, no-delta-sections and no-deltas against
  `deltas/header-present`, and the three in-file conflicts against
  `archive/op-conflict`. Header keys take a blank header text. Each pairing gets
  a contract test that reads the message from the pinned binary, and a sweep
  over every report in the parity suite checks that no defect is reported twice.
- `apps/cli/test/contract/validation-parity.test.ts` (new) is a severity oracle
  on the legacy lane. For each finding the pinned binary gives a `spec-driven`
  fixture, cospec reports the same message at the same level.
- **BREAKING:** cospec's own workflow gets stricter. The new task-id WARNINGs
  fail `cospec validate --strict`, which the workflow requires, and a REMOVED
  plus ADDED (or ADDED plus MODIFIED) of one requirement name is now an ERROR at
  validate time instead of a refusal inside the delegated archive, as are a
  splitting skipped header (in the delta or in a living requirement the delta
  keeps), a commented op the archive refuses, a living scenario inside a comment
  that a MODIFIED drops, a misplaced or duplicate living requirement or a living
  delta header, visible or commented, every rebuilt-spec defect the archive
  refuses, and a duplicated MODIFIED or REMOVED or a REMOVED of a RENAMED
  source. A living spec with no `## Requirements` is no longer refused.

## Capabilities

### New Capabilities

### Modified Capabilities

- `archive-integrity`: an ADDED can no longer re-use the exact header a REMOVED
  in the same delta vacated, and a same-name ADDED plus MODIFIED is refused on
  every capability, as the pinned binary refuses both. The preconditions read
  what the archive merges, a splitting skipped header is refused, and so are a
  structurally invalid living spec, a rebuilt spec the archive's validation
  refuses, and an in-file operation conflict.
- `spec-parsing-and-discovery`: skipped delta headers get a rule, a header-only
  SHALL/MUST gets the binary's hint, and the delegated-duplicate pairings cover
  the new native findings.
- `change-progress-reporting`: ambiguous task numbering warns.
- `openspec-list-validate-extensions`: a statement of which lane owns a
  finding's severity.

## Impact

- `apps/cli/src/core/deltas.ts` (the parser records skipped headers; round 3:
  the one fence-aware scan and the two-view living reader),
  `apps/cli/src/core/rules/deltas.ts`, `apps/cli/src/core/rules/index.ts` (the
  `deltasRules` call passes `--fast`), `apps/cli/src/core/tasks.ts`,
  `apps/cli/src/core/rules/tasks.ts`, `apps/cli/src/core/rules/archive.ts`,
  `apps/cli/src/core/rebuilt-spec.ts` (new: the archive's rebuild and its
  validation, ported), `apps/cli/src/commands/validate.ts` (`DUPLICATE_CLASSES`
  only).
- Tests: `apps/cli/test/unit/rules/{deltas,tasks,archive}.test.ts`,
  `apps/cli/test/unit/parsers/deltas.test.ts`,
  `apps/cli/test/unit/parsers/rebuilt-spec.test.ts` (new),
  `apps/cli/test/contract/validation-parity.test.ts` (new), and two rows of
  `apps/cli/test/integration/archive-gates.test.ts` re-pointed: at the verbatim
  view (scenarios kept only inside a comment are no drop), and at the rebuilt
  spec (an unmarked retirement is refused before delegating).
- Docs: `apps/docs/reference/validation-rules.md` (owns the rule table and the
  dedupe section), `apps/docs/concepts/apply-and-archive.md` (owns the
  archive-shape prose and retirement), `apps/docs/reference/configuration.md`
  (the `retire_capabilities` key),
  `apps/docs/concepts/how-it-relates-to-openspec.md` (its dedupe summary),
  `docs/validation.md`.
- No command, flag, exit code or JSON key changes. The rule-id set gains six ids
  (`deltas/skipped-header`, `archive/split-requirement`,
  `archive/rebuilt-spec-invalid`, `archive/op-conflict`, `tasks/id-mismatch`,
  `tasks/id-duplicate`).
- `apps/cli/test/contract/parity-pending.yaml` has no `validation-parity` entry
  before or after this change. Validation findings aren't registry surfaces.

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
