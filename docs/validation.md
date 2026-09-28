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
unaffected), ignore markdown structure inside HTML comments (including a `--!>`
terminator and an unterminated `<!--` that runs to end of file — an author's own
comment inside `## Purpose` still counts as Purpose prose), and mask code fences
using the same rule OpenSpec's own shared fence-masking uses: `~~~` fences are
recognized alongside ` ``` `, and a fence only closes on a matching marker at
least as long as the one that opened it.

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
block it sits in. `deltas/skipped-header` (I) reports each one, except a
`### Scenario:` line, which is `deltas/scenario-depth`'s. A SHALL/MUST counts in
the body only; when it appears only in the requirement header,
`deltas/requirement-shape` (E) carries a hint saying to move it to the line
after the header.

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
against `deltas/scenario-depth` (path-keyed); its three SHALL/MUST wordings and
`is missing requirement text` against `deltas/requirement-shape` (keyed on
`<OP> "<name>"`); and `Requirement present in both ADDED and REMOVED` /
`… MODIFIED and ADDED` against the cross-section arm of `archive/added-exists`
(keyed on the name, each native key naming its own section). A path-only key is
written as an empty capture group, `()`, on both regexes. Each entry has a
contract test in `validation-parity.test.ts` that takes the delegated message
from the pinned binary's own output, plus a case where the delegated finding
survives because cospec's rule is silent.

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
  requirement. Without it, a retiring merge is refused and cospec relays the
  refusal untouched. See [Apply and archive](/reference/commands) and
  [Configuration](https://cospec.aligned.team/reference/configuration) for the
  archive-time behavior this key unlocks.

A key present but not a boolean is `meta/skip-specs-type` /
`meta/retire-capabilities-type` (E). A delta at `specs/spec.md` (no capability
directory) is `deltas/spec-at-specs-root` (E).
