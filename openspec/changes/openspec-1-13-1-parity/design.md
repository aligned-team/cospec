# Design

## Context

cospec wraps a pinned `@fission-ai/openspec` binary and re-emits parts of its
output. Three upstream releases (1.12.0, 1.13.0, 1.13.1) landed between the
current pin and this bump. The proposal covers what moves and why; this record
covers the two decisions whose alternatives are not obvious from the
requirements, plus the constraints the approach has to respect.

Three constraints shape everything below.

`cospec apply` spreads the wrapped `openspec instructions apply --json` document
into its own `--json` output (`commands/apply.ts`, both the legacy and the main
path) and echoes `instr.instruction` into the human transcript. Nothing between
the wrapped binary and the user inspects that text today, so any string upstream
changes reaches users verbatim.

`cospec validate` delegates with `--strict --json` and merges the delegated
issues into its own report through `mergeDelegated`, suppressing a delegated
issue only when a `DUPLICATE_CLASSES` entry names both the native `rule` and a
regex the delegated message matches. `DuplicateClass` carries a **single**
`rule` field, which bounds how the new INFO family can be paired.

`normalizeLevel` accepts `INFO`, and `summarize`/`exitCode` count only ERROR and
WARNING toward the verdict. The archive-preflight INFO stream therefore arrives
at the bump without moving a single exit code — the work is entirely about not
reporting the same defect twice.

## Goals / Non-Goals

**Goals:**

- Keep cospec's own gates and the wrapped binary in agreement in **both**
  directions. A false refusal is a lesser failure than a false PASS, but neither
  is acceptable at a hard gate.
- Keep the relay guard's blast radius to text cospec did not author, and keep it
  from corrupting the non-command text in the same string.
- Leave the delegated report lossless: suppress only where a native cospec rule
  actually fired for the same file and the same defect.

**Non-Goals:**

- Reimplementing anything inside `specs-apply.ts`. Its effects are re-verified
  against the real binary; its implementation stays delegated.
- Rewriting upstream prose that is not a command instruction. The guard rewrites
  command spans, not sentences.
- Any behaviour that would need the version floor raised. The accepted range
  stays `>=1.0.0 <2.0.0`.

## Decisions

### ADR-1: The relay guard rewrites backtick-delimited command spans, not a bare `openspec ` token

Every piece of wrapped guidance cospec re-emits passes through one rewrite that
finds backtick-delimited spans whose first word is `openspec` and replaces that
word with `cospec`, for the three verbs the 1.13.x strings actually emit —
`instructions`, `status`, `validate`. A span naming any other verb is left alone
rather than rewritten into a command cospec may not have.

_Alternative rejected — a global `openspec ` → `cospec ` substitution on the
whole string._ `collectApplyWarnings` embeds an absolute `metadataPath` ending
`.../.openspec.yaml` in the same warning text, and upstream prose refers to
"openspec" as a product name as well as a command. A token-level substitution
corrupts the path and mangles the prose, and it would silently invent
`cospec <verb>` for verbs cospec does not wrap. Anchoring on the backtick span
and on a closed verb set makes both failure modes structurally impossible.

_Alternative rejected — relay the text unchanged and document the discrepancy._
The whole point of routing every agent-facing OpenSpec access through `cospec`
is that an agent that runs bare `openspec` bypasses the gate. A remedy string
that tells the agent to do exactly that is not a documentation problem.

_Consequence accepted — the guard runs on paths whose reachability differs._ The
main apply path returns `EXIT.blocked` from its own `missingArtifacts` check
before the wrapped instructions call is made, so the blocked remedy is normally
not printed there. The guard is still applied on every relay path, because three
of them **are** reachable: `applyLegacy`, which has no cospec gate at all; a
v1-grandfathered change, whose narrower enforced `apply.requires` clears
cospec's gate while upstream still returns `blocked` naming `verification`; and
an empty `tasks.md`, which cospec's file-exists check passes and upstream's
`tasks.length === 0` branch blocks. Acceptance evidence asserts on those three,
not on the unreachable one.

_Consequence accepted — `warnings[]` starts printing in the human transcript._
Today it reaches users only through the `--json` spread. An agent-facing warning
invisible to the human reviewing the same run is a reporting gap, and printing
it also means one code path carries the guard rather than two.

### ADR-2: Nested-change namespace detection is deferred, bounded by two evidence rows rather than by a promise

Upstream 1.13.1 detects a folder under `openspec/changes/` that wraps other
changes instead of being one. cospec's `core/change.ts` has no shape check. This
change does **not** add one.

The reason it is safe to defer is that the two surfaces where being wrong is
harmful — `validate` and `archive` — both inherit the authoritative refusal from
the wrapped binary at the pin, and `mergeDelegated` passes an unmatched
delegated issue through unchanged. So the refusal reaches the user at both gates
the moment the pin moves. What is _not_ inherited is reporting quality in
`status` and `list`, which are cospec-native and will keep listing a namespace
folder as a change until the detector exists.

_Alternative rejected — build the detector here._ It is a new module plus wiring
into four call sites, with its own tests, and it is entirely pin-independent.
Folding it in would hold a pin bump hostage to a self-contained feature.

_Alternative rejected — defer it silently._ A deferral whose correctness rests
on "the binary will refuse it anyway" is only trustworthy if that claim is
tested. The two acceptance-evidence rows for the namespace folder — refused at
`cospec validate` with upstream's message intact, refused at `cospec archive`
with upstream's `archive_change_is_namespace_folder` message reaching the user —
are what convert the deferral from an assumption into a bounded gap. If either
row fails, the detector stops being deferrable.

### ADR-3: One `DUPLICATE_CLASSES` entry per upstream precondition shape, and none for scenario preservation

`DuplicateClass` has a single `rule` field, so a delegated regex can be paired
with exactly one native rule. Upstream's archive-preflight blockers span two
cospec rules — `archive/target-missing` and `archive/added-exists` — so they are
enumerated one shape at a time rather than collapsed into a single catch-all
regex. Each `nativeKey` capture stops before the `, but "…" exists` and
`and differs only in case or spacing` tails, which upstream appends
conditionally; a capture that ran to end-of-string would never match.

Upstream's `MODIFIED … header mismatch in content` has no cospec twin and is
deliberately **not** suppressed.

No entry is added for scenario preservation. `findArchiveBlockers` skips a spec
whose `entryPath` is already in `alreadyReportedPaths`, that set is keyed by
path rather than by requirement, and upstream's own `findScenarioLossIssues`
already emits an ERROR on that same path — so the scenario blocker is suppressed
upstream before it can become an INFO. The existing
`/^MODIFIED "(.*)" omits scenario\(s\)/` entry keeps working unchanged. The same
path-keying gives the contract test a bound worth asserting: at most one
archive-preflight INFO per delta file per run.

### ADR-4: The case-fold arms exclude the rename's own target, and do not override early sync

Extending the `RENAMED`-target and `ADDED` pre-flight arms with a fold-equality
near-miss check mirrors what the `archive/target-missing` arm already does, but
two exclusions are load-bearing and are stated here because getting either wrong
converts a false PASS into a false refusal.

The `RENAMED`-target fold must exclude the operation's own source. A case-only
rename (`Foo` → `foo`) lands its source on a living name that folds equal to the
target — that is the rename working, not a collision. Upstream excludes it for
the same reason.

The early-sync exemptions must keep applying. A fold near-miss must not
resurrect a collision on an `ADDED` requirement the baseline already carries
identically, or cospec starts refusing archives the binary performs at exit 0.

**Amended in review.** Both arms were first written to fold against
`living.requirementNames`, the pristine living spec, with a hand-built `vacated`
set standing in for the delta's own removals and renames. That is not what
upstream compares against: `specs-apply.ts` loads the spec into one map and
applies the delta in four ordered phases — `RENAMED`, `REMOVED`, `MODIFIED`,
`ADDED` — with every collision and near-miss search reading that map as it
stands when its operation runs. The difference is not cosmetic. It is the whole
class of collisions a delta makes with **itself**, all of which the
pristine-spec search reported clean while the binary aborted at archive: two
`ADDED` names that fold onto each other (verified against the real 1.13.1
binary), an `ADDED` folding onto the delta's own `RENAMED` target, a second
`RENAMED` target folding onto the first. It also over-refused in the other
direction, on a swap that renames `A` to `B` and then `C` to `A`.

`replayDeltaNames` (`core/rules/archive.ts`) replays those four phases and hands
each op the name set upstream would give it; only an operation the binary would
actually apply moves a name, since one it refuses aborts the merge. The
`vacated` set is gone — the replay subsumes it, and a capability with no living
spec now starts from the empty skeleton openspec builds rather than skipping the
collision arms entirely. The two exclusions above stay exactly as stated: they
are properties of a single operation, not of the sequence.

The same stale-view mistake lived in `cospec archive`'s post-merge spot-check,
where each operation was judged alone against the end state — so the swap above
archived correctly and was then reported as a
`cospec/openspec invariant breach`. `spotCheckMiss` now takes the capability's
net effect (which names the delta's other operations write, and which they take
away) alongside the merged spec.

### ADR-5: `deltas/unread-file` is a new ERROR; the `spec.md`-only discovery filter stays

cospec's change loader filters a change's delta files to `specs/**/spec.md`, and
that filter is correct — it is what lets an author keep companion notes beside a
delta. The defect is not the filter; it is that a genuinely delta-shaped file at
the wrong name or depth is skipped with **no diagnostic at all**. The fix adds
the diagnostic and leaves the filter alone, and extends `cospec archive`'s
zero-delta leniency so a change carrying only such files is no longer treated as
a true no-op.

The new ERROR also forces a correction to an existing duplicate class.
`{ rule: 'deltas/spec-at-specs-root', delegated: /^Delta spec found at specs\/spec\.md/ }`
has no `nativeKey` and therefore suppresses on rule alone; upstream's new
unread-file message begins with the same prefix for any path starting `spec.md`,
so `specs/spec.md.md` would be wrongly suppressed whenever
`deltas/spec-at-specs-root` also fired. The regex is narrowed through its own
distinguishing clause.

### ADR-6: Version literals that date a behaviour are left alone

The pin bump updates every literal that is a **read of the pin**. It does not
touch literals that record when a behaviour appeared or that are deliberately
arbitrary: the `1.11.0` in `core/rules/specs.ts`'s placeholder comment (whose
statement is re-confirmed at 1.13.1 instead), the `1.11.0` in the
`archive.test.ts` comment recording what the binary refused at that version
(restamped only where the re-probe shows the behaviour itself changed), the
`generatedBy: '1.11.0'` fixture, and the `init`/`doctor`/`feedback-format` unit
literals. Tests that genuinely follow the pin already import
`PINNED_OPENSPEC_VERSION` symbolically.

The same reasoning applies to the living `harness-workflows` requirement titled
"opsx 1.11.0 workflow parity". 1.13.1 adds no workflow to the `opsx` set and
cospec ships all twelve from one canon source, so the requirement's substance is
unchanged and its version names the release the parity was established against.
It is left unrenamed.

## Operational surface

The user-visible surface changes are all CLI, and all additive:

- New output: `cospec apply` prints the wrapped binary's relayed `warnings` in
  the human transcript, where today they reach only `--json`. The `--json`
  document gains the two declared fields `warnings` and `missingPrerequisites`;
  both are optional and absent when the resolved wrapped binary does not emit
  them.
- New rule ids reaching the report: `deltas/unread-file` as an ERROR, and the
  `openspec/validate` INFO class arriving from the wrapped binary's merge
  dry-run. INFO is counted and rendered but never scored, so no verdict moves.
- Changed text, not changed structure: relayed guidance names `cospec` rather
  than the wrapped binary wherever a backtick-delimited command span uses a verb
  cospec wraps.
- Exit codes are unchanged everywhere: `0` clear, `1` refusal/failure, `2`
  blocked, `3` soft-blocked. The two case-fold pre-flight arms move a refusal
  _earlier_ — from a delegated abort to cospec's own exit 1 — rather than
  introducing a new code.
- Distribution: the standalone binary's embedded openspec bundle and third-party
  notices are regenerated for 1.13.1. A shift in the notices' package list is
  expected, not drift.
- No new flag, no new subcommand, and no change to any existing JSON key.

## Integration contract

The wrapped `@fission-ai/openspec` binary is the external contract, and this
change is the thing that moves it:

- Pin `1.11.0` → `1.13.1` in `apps/cli/package.json`, the `npm:` mise tool pin,
  and `PINNED_OPENSPEC_VERSION`, with `bun.lock` and `mise.lock` regenerated in
  the same commit as their manifests — CI runs `mise install`,
  `git diff --exit-code mise.lock`, then `bun install --frozen-lockfile`, in
  that order. The vendored bundle is regenerated after `bun install`, because it
  resolves the package by path.
- The accepted runtime range is unchanged at `>=1.0.0 <2.0.0`, so every change
  here must be range-tolerant. The relay guard, the dedupe entries, and the
  case-fold arms are all cospec-native and version-independent; a wrapped binary
  that emits none of the new strings simply produces nothing for them to act on,
  which is why both new payload fields are optional.
- Every wrapped call keeps the discipline unchanged: declared expected exit
  codes, a stdout deny-list, an observable post-condition, and exactly one JSON
  document on stdout for `--json` callers. Success is computed from the
  filesystem, never from the exit code alone.
- New delegated issues arrive automatically through the existing delegated-issue
  mapping. Where one duplicates a cospec-native issue for the same file and
  defect it is suppressed — and only when the native rule actually fired.
  Fixtures that newly fail `--strict` get fixed; a rule is never filtered out to
  make a suite green.
- Upstream's schema loader now validates `apply.requires` at load time and warns
  on an `apply.tracks` mismatch. That makes an upstream invariant binding on
  cospec's eleven composed schemas at _load_, on the common path of every
  command — so it is proved before anything else depends on it.
- A store `openspec init`/`update` at 1.12+ now anchors empty directories
  (`openspec/specs`, `openspec/changes`, `openspec/changes/archive`) with
  `.gitkeep` files. cospec's own readers are directory-filtered (`change.ts`'s
  `withFileTypes` + `isDirectory()` scan, `spec-paths.ts`'s equivalent), so a
  `.gitkeep` entry is invisible to every cospec-native scan by construction — no
  interop hazard, and nothing to port.
- Behavioural deltas the re-probe is expected to surface, each rewritten
  honestly rather than asserted away: the archive-preflight dry run (1.12), the
  fence-aware blank-line collapse and looser `retire_capabilities` audit (1.13),
  and 1.13.1's four new archive refusals — unpaired `RENAMED`, case-only
  collision, unread delta file, and namespace folder.

## Risks / Trade-offs

**[A rewritten remedy names a `cospec` command that does not exist]** → the
guard's verb set is closed to `instructions`, `status`, and `validate`, all of
which cospec wraps. Any other verb is left as upstream wrote it, which is
worse-looking but never wrong. The re-probe confirms the emitted verb set at
1.13.1 rather than assuming the 1.13.0 reading still holds.

**[A `nativeKey` capture over-matches and suppresses a real delegated issue]** →
each capture is anchored to its own precondition shape and stops before the
conditional tail, and the acceptance evidence asserts that an unmatched
delegated issue still survives the merge. `mise run cospec-validate-all` over
this self-hosting repo is the scale check: a dedupe regression shows up there as
a doubled issue count.

**[The case-fold arms trade a false PASS for a false refusal]** → both
exclusions in ADR-4 carry their own evidence row, including the explicit
negative case that a case-only rename is not reported as a collision.

**[The schema loader's new load-time `apply.requires` validation rejects a
composed cospec schema]** → this would break _every_ cospec command, not just
`schema validate`, because schema load happens on the common path. It is proved
early by running both `openspec schema validate` against all eleven composed
schemas and the raw-binary `openspec:schema:validate` CI gate.

**[The contract re-probe tempts a weakened assertion]** → the discipline is
stated in the tasks and in the evidence rows: when the new binary falsifies a
test's narrative, the narrative is rewritten to what the binary now does. No
assertion is weakened and no test is deleted. A false archive PASS that survives
the suite is a release blocker.

**[The lockfiles drift from the manifests]** → CI runs `mise install`,
`git diff --exit-code mise.lock`, then `bun install --frozen-lockfile`. Both
manifests and both lockfiles move in a single commit, and the vendored bundle is
regenerated after `bun install` because it resolves the package by path.

## Open Questions

None. The three questions the plan left open — whether to print warnings in the
human transcript (ADR-1: yes), whether the relay guard is JSON-only (ADR-1: no),
and how the archive-preflight INFOs pair against cospec's rules (ADR-3) — are
all decided above, because each would have changed the specs or the task
breakdown.
