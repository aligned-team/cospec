## Context

cospec wraps `@fission-ai/openspec`, pinned at 1.5.0, and accepts any runtime
copy in `>=1.0.0 <2.0.0`. Upstream shipped 1.6.0 through 1.11.0 while the pin
stood still. A per-item audit of those six releases against cospec's source
produced three classes of work: behaviour the wrapped binary now performs
differently (archive naming, spec discovery, archive warnings, new metadata
keys, `defaultStore`), surfaces the bump makes reachable that cospec must expose
so a user never falls back to bare `openspec` (`status --all`,
`validate --archived`, `instructions archive`), and defects the audit exposed in
cospec's own code that are live at the current pin (UTC archive-target dates, a
naive code-fence toggle, missing `$ARGUMENTS` in OpenCode commands,
`AskUserQuestion` rendered into harnesses without that tool, an `opsx` leftover
scan blind to `.agents/skills/`).

The audit also produced a set of confident negatives that shape the scope:
cospec's scenario-drop check is already count-based and any-`####`-aware, so
upstream's multiplicity bug never existed here; generated YAML frontmatter is
already `yaml.stringify`-escaped; `skip_specs`/`retire_capabilities` are inert
rather than breaking, because both the metadata loader and the metadata rules
ignore unknown keys; and three declared wrapped-payload types in
`core/openspec.ts` have no call sites at all, so upstream's changes to those
payloads touch nothing but the stale declarations.

Constraints that bound every decision below: the accepted range stays
`>=1.0.0 <2.0.0`, so gate fixes must be range-tolerant rather than
1.11-specific; managed files are generated from `apps/cli/src/canon/`, so every
prose fix is a canon edit plus `mise run generate`; wrapped-call discipline
requires each call to declare expected exit codes, a stdout deny-list, and an
observable post-condition, trusting the filesystem over the exit code; and
`docs/` and `apps/docs/` must not drift from released behaviour.

## Goals / Non-Goals

**Goals:**

- Move the pin to 1.11.0 and re-probe every contract test against the real
  binary, rewriting test narratives the new binary falsifies instead of
  weakening assertions.
- Make cospec agree with the wrapped binary wherever they now disagree: archive
  directory naming and dates, capability derivation for nested specs, root
  selection via `defaultStore`, and the metadata keys openspec writes.
- Stop losing information the wrapped binary produces: archive warnings on the
  success path.
- Close the "must drop out to bare openspec" gaps the bump opens:
  `status --all`, `validate --archived`, `instructions archive`.
- Fix the cospec-native defects the audit exposed, whether or not they are
  caused by the bump: local-date archive verification, parser hardening,
  OpenCode `$ARGUMENTS`, runtime-neutral workflow prose, `.agents/skills/`
  leftover detection.
- Ship the twelfth workflow, `/cospec:update`, whose existing deferral note
  names this bump as its trigger.

**Non-Goals:**

Three items are deliberately deferred to their own future release rather than
folded in here — each is real, but none is required to reach parity with the
pinned 1.11.0 binary, and each deserves its own change so it can be reviewed,
tested, and shipped on its own timeline:

- **Follow-up 1 — a broader harness matrix.** cospec's `HarnessName` is a
  deliberately closed union (`claude`, `codex`, `opencode`) with its own
  generator; OpenSpec itself now targets 30+ tools. Widening cospec's own set
  (`zed`, `antigravity`, `oh-my-pi`, `trae`, `minimax`, `rovodev`, …) is a
  product decision about which harnesses cospec supports, not a parity item —
  and the cheapest first step, when that work happens, is OpenSpec's own
  vendor-neutral `agents` target, which already writes to the shared
  `.agents/skills/` root this change teaches `cospec init --remove-opsx` and
  `cospec doctor` to scan (but never write to).
- **Follow-up 2 — moving cospec's Codex output to `.agents/skills`.** Upstream
  moved _its own_ Codex output there from 1.8.0 on; cospec's Codex output stays
  at `.codex/skills`, paired with `.codex/rules/cospec.rules`, which has no
  equivalent under `.agents/`. Moving cospec's own output would break every
  existing Codex install for zero benefit today. A real migration — with
  backward compatibility for existing `.codex/` installs, driven by
  `cospec update` — is its own change, once there's a harness (from Follow-up 1)
  that actually needs the shared root.
- **Follow-up 3 — disciplined passthroughs for `config`, `completion`, and
  `feedback`.** These are the only everyday OpenSpec surfaces this change leaves
  unwrapped — a user still has to drop to bare `openspec` for them.
  `init`/`update` are the deliberate exception, not an oversight: they stay
  cospec-native by design, because passing them through to `openspec init`/
  `openspec update` would write the very opsx files cospec's own leftover scan
  flags and offers to remove. `config`/`completion`/`feedback` have no such
  conflict and are straightforward disciplined-passthrough candidates; they are
  out of scope here purely to keep this change's surface to what the 1.11.0 bump
  actually requires.

Also out of scope, for reasons specific to each:

- Raising `OPENSPEC_VERSION_FLOOR`. Widening it to `1.0.0` was a deliberate
  prior change, and every fix here is written to be range-tolerant.
- Reimplementing `show --diff`: `show.ts` already forwards `...ctx.args`, so
  `--diff` works end to end. Docs-only.
- `openspec init`/`update` internals — self-upgrade, `--tools` aliases, profile
  sync, IDE-restart hints, `skills.sh`. cospec's `init`/`update` are independent
  managed-file engines that never invoke the wrapped command (see Follow-up 3
  above for why they stay that way).
- `operations.apply.guidance` / `operations.archive.guidance` config reading.
  Real, but it needs its own precedence story against `## Surfaces` prompts;
  deferred to its own change.
- Name-identity scenario-drop detection in cospec's own gate; the same-count,
  different-name case now arrives free through delegation. Follow-up.
- Deleting the dead `openspecStatus`/`openspecList`/
  `openspecArtifactInstructions` helpers. This change corrects their stale type
  declarations; wholesale removal is separate dead-code cleanup.

## Decisions

**D1 — One change, not a `build` pin bump plus a `feat` follow-up.** Splitting
the bump out would leave every gate fix unverifiable: the contract suite that
proves them only means something against 1.11.0, and the re-probe itself is
where unknown drift surfaces. _Rejected:_ a standalone `build` change, because
it would ship a pin whose behavioural consequences are known and unaddressed.

**D2 — Keep cospec's scenario-preservation gate even though 1.6.0+ ships an
overlapping check, and suppress the delegated duplicate rather than the native
one.** cospec's gate fires before delegation with cospec's own message, and is
the only defence across `1.0.0`–`1.5.x`, which the accepted range still admits.
Reporting both would double-report one defect the moment the pin lands.
_Rejected:_ dropping cospec's gate in favour of delegation (loses the lower half
of the range and the exit-1-before-delegation guarantee); and reporting both
(noise, and two different messages for one defect).

**D3 — `defaultStore` is a fallback after local-root resolution fails, never a
precedence tier above it.** Upstream's `root-selection.ts` consults
`defaultStore` only once the nearest local root fails to resolve; treating it as
a tier above `localRoot` would retarget a store from inside a local `openspec/`
repo — the opposite of the invariant `core/root.ts`'s own doc comment claims. It
is read through the wrapped binary's `config get`, which returns a raw value and
exits 1 when unset, rather than by reimplementing global-config path discovery.
_Rejected:_ the tier-above-`localRoot` reading in the original plan, and a
native reimplementation of the global config path.

**D4 — Port upstream's `buildCodeFenceMask` semantics rather than patching the
existing fence toggle.** cospec's toggle matches `/^\s*```/` and ignores `~~~`
fences and fence length, so a spec documenting markdown inside a four-backtick
block inverts in-fence state for the rest of the file, silently disarming both
hard archive gates. Masking blanks spans in place so line numbers do not shift.
_Rejected:_ "fence handling is already correct, only add BOM and comment
masking" — measurably false against the four-backtick case.

**D5 — Capability comes from a delta file's immediate parent directory, via one
shared `core/spec-paths.ts` consumed by validate, the scenario-preservation
gate, and the post-archive spot check.** Today three code paths derive it
independently and two of them take the first path segment, so
`specs/<area>/<capability>/spec.md` resolves to `<area>`. Because this feeds the
archive merge, the module adopts upstream's error policy too: resolve
in-capability symlinks, reject links escaping their capability, skip dangling
links, swallow only `ENOENT`. _Rejected:_ silently skipping an unreadable
capability, which recreates the data-loss class upstream closed.

**D6 — Recognise `skip_specs` minimally: a persisted equivalent of the existing
`--skip-specs` flag plus an apply-gate escape hatch, with an ERROR when the
marker and real deltas coexist.** Both the metadata loader and the metadata
rules ignore unknown keys today, so upstream's auto-written marker is inert, not
breaking — the work is recognition and honouring, not a re-plumb. The conflict
ERROR is what keeps a widened gate from being left half-open. _Rejected:_ a full
metadata re-plumb, and honouring the marker without the conflict ERROR.

**D7 — Relay archive warnings by capturing the existing success-path stdout, not
by adding `--json` to the archive spawn.** The `-y`, non-`--json` invocation is
what the filesystem-verification design depends on; changing it to get a
`warnings` array would trade a proven post-condition for a parsed one.
_Rejected:_ spawning `openspec archive --json`.

**D8 — `cospec instructions archive` is a listing and discipline fix, not a new
command.** `commands/instructions.ts` never validates the artifact against
`ARTIFACTS` — the constant only feeds an error message — so the artifact already
passes through on a ≥1.7 binary. The real work is adding it to the advertised
list and routing the generic branch through `passthroughOpenspec`, which it
uniquely bypasses today. It is explicitly **not** aliased to `cospec archive`:
the wrapped instructions surface is read-only.

**D9 — `cospec status --all` is cospec-native and never aborts on one bad
change.** `commands/status.ts` is a from-scratch reimplementation that never
calls `openspec status`, so the sweep is cospec's own loop; a single unparseable
change must not blank the whole report, so it becomes a failure entry and the
command still emits the full envelope while exiting 1. _Rejected:_ delegating to
`openspec status --all` (cospec's status carries the verification verdict the
wrapped one has never had).

**D10 — Two surfaces are version-gated in docs rather than by a floor bump.**
`instructions archive` needs ≥1.7.0 and `validate --archived` needs ≥1.9.0. Both
are disciplined passthroughs that relay the wrapped unknown-flag error cleanly
on an older runtime, so the per-surface minimum is documented in the command
reference and the floor stays at `1.0.0`.

**D11 — Reconcile `apply --json`'s task counts rather than letting two totals
ship.** The wrapped `instructions apply --json` builder now counts nested
sub-task checkboxes, while cospec's `core/tasks.ts` counts only top-level rows;
both are re-emitted in one `cospec apply --json` document. Either counting is
defensible, but two disagreeing totals in one document is not, so the change
picks one, states it, and pins it with a contract test.

**D12 — Ownership is exclusive per file across the implementation tracks, and no
track edits this change's own `openspec/changes/` directory.** Each track
returns what it completed and the evidence it observed; one ledger pass writes
`tasks.md` and `verification.md`. This prevents the merge conflicts that
concurrent checkbox edits guarantee.

## Operational surface

The user-visible surface changes are all CLI:

- New flags: `cospec status --all` (mutually exclusive with `--change`;
  `--all --json` emits `{ changes: [...], root }`; text mode emits
  blank-line-separated blocks; exit 1 if any entry failed while still emitting
  the full envelope) and `cospec validate --archived` (delegated envelope
  rendered through the existing issue reporter; exit 1 on any failed item).
- New artifact value: `archive` in `cospec instructions`' advertised list,
  read-only.
- New output: archive warning lines in the human summary and a `warnings` array
  in `cospec archive --json`. The single-change `status` shapes and the existing
  `archive --json` keys are unchanged; `warnings` is additive.
- Exit codes are unchanged everywhere: `0` clear, `1` refusal/failure, `2`
  blocked, `3` soft-blocked.
- Forced spawn environment gains `OPENSPEC_NO_COMPLETIONS=1` alongside the
  existing `OPENSPEC_TELEMETRY=0`, so no cospec surface ever relays a suggestion
  to run a bare `openspec` command. `OPENSPEC_TELEMETRY=0` is also what disables
  the wrapped binary's per-command update check — that is load-bearing, not
  incidental, and must not be removed as "just telemetry".
- Agent-facing surface: twelve rendered workflows instead of eleven, OpenCode
  commands that no longer drop their arguments, and workflow bodies that name no
  harness-specific tool. The **schema** count stays eleven.
- Distribution: the standalone binary's embedded openspec bundle and third-party
  notices are regenerated; `posthog-node` leaves the tree upstream, so the
  notices file shrinks — expected, not drift.

## Integration contract

The wrapped `@fission-ai/openspec` binary is the external contract, and it is
the thing this change moves:

- Pin `1.5.0` → `1.11.0` in `apps/cli/package.json`, the `npm:` mise tool pin,
  and `PINNED_OPENSPEC_VERSION`; `mise.lock` regenerated for every platform
  entry, or the linux CI leg fails. `version-tripwire.test.ts` asserts the
  manifest pin, the mise pin, and the live binary agree, and is designed to fail
  first.
- Accepted runtime range is unchanged at `>=1.0.0 <2.0.0`. Every gate fix must
  therefore be range-tolerant: the archive target matcher accepts both the
  pre-1.7 double-date-prefixed and the 1.7+ verbatim directory forms;
  `OPENSPEC_NO_COMPLETIONS` is inert below 1.10; the parser and discovery
  changes are cospec-native and version-independent.
- Per-surface runtime minimums documented rather than enforced:
  `instructions archive` ≥1.7.0, `validate --archived` ≥1.9.0. Below those, the
  wrapped unknown-subcommand/flag error is relayed cleanly and the command exits
  non-zero.
- Every new or changed wrapped call keeps the discipline: declared expected exit
  codes, a stdout deny-list, an observable post-condition, and — for `--json`
  callers — exactly one JSON document on stdout, including the
  `status:[{severity,code,message,fix?}]` failure mirror. Success is computed
  from the filesystem, never from the exit code alone.
- New delegated issues arrive automatically through the existing delegated-issue
  mapping (1.8.0 scenario-loss, 1.9.0 task-numbering). Fixtures that newly fail
  `--strict` get fixed; rules are never filtered out. Where a delegated issue
  duplicates a cospec-native one for the same file and defect, the delegated
  copy is suppressed — and only when the native rule actually fired.
- Behavioural deltas the re-probe is expected to surface, each of which must be
  rewritten honestly rather than asserted away: upstream's own scenario-loss
  refusal (1.6.0/1.7.0/1.9.0), early-sync operations that became no-ops rather
  than throws (1.7.0), the rename-order fix (1.9.0), removed store diagnostics
  and new pointer codes (1.6.0/1.8.0), `schema init --default` writing `schema:`
  and `schema fork` becoming transactional (1.8.0–1.11.0), and `schemas` finally
  honouring the `--store` cospec has always threaded (1.9.0).

## Risks / Trade-offs

- [The re-probe uncovers drift nobody predicted] → The pin commit lands first,
  alone, before any other track's work, and the contract suite is run before a
  single test is edited so the full failure list is recorded as evidence rather
  than discovered piecemeal. Budget is reserved for it as its own work unit.
- [A parser or discovery regression turns a hard archive gate into a no-op] →
  Both gate paths are covered by fixtures driven end to end — validate, the
  scenario-preservation gate, and the post-archive spot check — not by unit
  tests over the parser alone, and the fence/comment cases are asserted to still
  refuse rather than merely to parse.
- [Widening the apply gate with `skip_specs` leaves an escape hatch open] → The
  marker is an ERROR when declared alongside any file under `specs/`, and
  precedence (flag > marker > structural) is unit-tested as a table.
- [`--remove-opsx` is destructive and now scans a new root] → Detection stays
  shape-based, never directory-membership-based, and a negative test asserts a
  non-openspec file under `.agents/skills/` survives.
- [Relaying archive warnings weakens success computation] → Warnings are
  additive output only; the filesystem post-condition is untouched, and a
  regression test asserts the abort/cancel detection does not match warning
  text.
- [The 11 → 12 workflow count is duplicated across docs and fixtures, and
  "eleven schemas" must stay eleven] → The docs sweep is its own work unit run
  last, gated by `mise run agents:check`, `mise run docs:build`, and a grep for
  surviving `1.5.0` literals and "eleven workflows".
- [`$ARGUMENTS` injection rewrites every generated OpenCode command] → The diff
  is large by construction; injection is idempotent, preserves line endings, and
  is applied only to bodies audited as taking positional input, with a render
  test asserting the result.
- [Parallel tracks collide in shared files] → File ownership is exclusive, the
  one genuine cross-track dependency (`core/spec-paths.ts`, and the metadata
  interface) lands as an early standalone commit, and no track edits this
  change's own artifacts.
