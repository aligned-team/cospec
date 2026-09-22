# Proposal

## Why

cospec pins `@fission-ai/openspec` at 1.11.0, and every gate, parser,
passthrough, and contract test in the repo was probed against that binary.
Upstream has since shipped 1.12.0, 1.13.0, and 1.13.1, and those releases move
behaviour cospec depends on: `openspec validate` now dry-runs the spec merge and
emits a family of archive-preflight INFO issues that collide head-on with
cospec's own `archive/*` rule family; `openspec instructions apply --json` grew
`warnings[]` and `missingPrerequisites[]`, both of which cospec already spreads
verbatim into `cospec apply --json` while declaring neither; the blocked-apply
remedy text and the new apply warnings both name **bare `openspec`**, which
cospec's routing discipline exists to keep out of agent-facing output;
`buildUpdatedSpec` gained four new refusals (unpaired `RENAMED`, case-only
requirement-name collision, unread delta file, namespace folder); and the schema
loader now validates `apply.requires` at load time and warns on an
`apply.tracks` mismatch, which turns an upstream invariant loose over cospec's
eleven composed schemas.

Two of those movements are release-blocker class rather than cosmetic, because
they make a cospec gate disagree with the binary it delegates to. `openspec`
1.13.1 refuses a `RENAMED` target and an `ADDED` name that collide with a living
requirement **case-insensitively**, while `rules/archive.ts` matches both arms
exactly — so `cospec validate --strict` reports clean and the delegated archive
then refuses, the false-PASS shape `CLAUDE.md` calls a release blocker. And the
validate INFO stream arrives free at the bump with no de-duplication, so every
would-be-refused delta is reported twice — once by cospec's own rule, once by
upstream's dry run — with the existing `deltas/spec-at-specs-root` duplicate
class now matching upstream's brand-new unread-delta-file message by prefix and
wrongly suppressing it. The pin bump is the right vehicle for all of it: it is
what makes the new surfaces reachable, and it is what forces the honest contract
re-probe that turns each disagreement from a reading of the source into recorded
evidence against the real binary.

## What Changes

- Bump the wrapped-OpenSpec pin from 1.11.0 to 1.13.1 (`apps/cli/package.json`,
  `mise.toml`/`mise.lock`, `bun.lock`, `PINNED_OPENSPEC_VERSION`, the vendored
  embedded bundle and its third-party notices) and re-probe the whole contract
  suite against the real binary, rewriting every test narrative the new binary
  falsifies rather than weakening an assertion to make it pass. The accepted
  range stays `>=1.0.0 <2.0.0`: `OPENSPEC_VERSION_FLOOR` is **not** raised, so
  the parser and marker fixes already landed by `fix: task-marker-coverage` and
  `fix: delta-parser-fidelity` remain what protects 1.0.0–1.12.x runtimes.
- Declare the two payload fields `cospec apply --json` already re-emits untyped:
  `warnings?: string[]` and `missingPrerequisites?: string[]` on
  `ApplyInstructionsJson`. Both are advisory, neither moves an exit code, and
  cospec's own apply gate keeps running first — `missingPrerequisites` is always
  a superset of cospec's `missingArtifacts`, never a new block.
- Add a relay guard so no wrapped guidance cospec re-emits ever names bare
  `openspec`. The rewrite is anchored to backtick-delimited command spans (not a
  bare `openspec ` token, because `collectApplyWarnings` embeds an absolute
  `.openspec.yaml` path in the same string) and covers the three verbs the
  1.13.x strings actually emit — `instructions`, `status`, `validate`. It
  applies on every path the relay is reachable from, including `applyLegacy`, a
  v1-grandfathered change whose narrower enforced `apply.requires` clears
  cospec's gate while upstream still returns `blocked`, and an empty `tasks.md`.
  `warnings[]` also starts reaching the human transcript, not just `--json`.
- De-duplicate the new `openspec/validate` archive-preflight INFO issues against
  cospec's own archive-precondition family, one `DUPLICATE_CLASSES` entry per
  upstream precondition shape (`MODIFIED … not found`, `REMOVED … not found`,
  `RENAMED … source not found`, `RENAMED … target already exists`,
  `ADDED … already exists`, and 1.13.1's two `differs only in case or spacing`
  variants), each with a `nativeKey` capture that stops before the `, but …` /
  `and differs only …` tail. Upstream's `MODIFIED … header mismatch in content`
  has no cospec twin and is deliberately kept. No scenario-preservation entry is
  added: upstream suppresses that blocker behind its own ERROR on the same path
  before it can become an INFO.
- Extend cospec's own archive pre-flight to refuse a case-only collision on the
  `RENAMED`-target and `ADDED` arms, mirroring the near-miss fold the
  `archive/target-missing` arm already performs, so cospec refuses at pre-flight
  rather than letting the delegated 1.13.1 binary refuse later. A case-only
  _rename_ (`Foo` → `foo`) is a real rename, not a collision, and the existing
  early-sync exemptions keep applying.
- Add `deltas/unread-file`, a cospec ERROR for a delta-shaped markdown file
  under a change's `specs/` tree that cospec's own discovery skips — a file not
  named `spec.md`, or one at the wrong depth. The `spec.md`-only filter stays
  correct for companion notes; what changes is that a genuinely delta-shaped
  file is no longer invisible. `cospec archive`'s zero-delta leniency stops
  treating such a change as a clean no-op.
- Suppress upstream's new `This change counts as 0 tasks` WARNING behind
  cospec's own `tasks/has-tasks`, which is an ERROR for the same state and
  therefore strictly ahead; and narrow the existing `deltas/spec-at-specs-root`
  duplicate regex through its own distinguishing clause so it stops matching the
  new unread-file message by prefix.
- Update every page that owns a fact this bump moves — the pin, the
  `cospec apply --json` example, the validation-rule ids and the INFO class, the
  wrapped-tool narrative, and `.agents/shared.md` — in this change, not after
  it.
- No breaking changes: every behavioural change either fixes a result that
  disagrees with the binary, types a field already being emitted, or adds a
  diagnostic where there was silence.

## Capabilities

### New Capabilities

None. Every behaviour below extends a capability that already exists; the pin
bump itself moves no requirement, because `embedded-openspec` is written against
"the pinned version" rather than a literal.

### Modified Capabilities

- `spec-parsing-and-discovery`: the delegated-duplicate suppression set grows to
  cover 1.12's archive-preflight INFO family, 1.13.1's zero-task WARNING, and a
  narrowed `spec-at-specs-root` regex; and a delta-shaped file at a path
  cospec's discovery skips becomes a named ERROR rather than silence.
- `archive-integrity`: the archive-precondition family refuses a case-only
  collision on the `RENAMED`-target and `ADDED` arms, matching what the 1.13.1
  binary refuses.
- `change-progress-reporting`: `cospec apply --json` declares the wrapped
  payload's advisory `warnings` and `missingPrerequisites` fields, and relays
  warnings to the human transcript as well.
- `openspec-read-passthroughs`: guidance relayed out of the wrapped binary is
  rewritten so it never instructs a reader to run bare `openspec`.

## Impact

- Modified (pin/wrapped layer): `apps/cli/package.json`, `bun.lock`,
  `mise.toml`, `mise.lock`, `apps/cli/src/core/openspec.ts` (the
  `PINNED_OPENSPEC_VERSION` constant, the floor-through-pin span comment, and
  the `ApplyInstructionsJson` declaration),
  `apps/cli/src/vendor/openspec.bundle.js.tpl`,
  `apps/cli/THIRD-PARTY-LICENSES.md`. Lockfile ordering is load-bearing: both
  manifests and both lockfiles move in one commit, and
  `mise run vendor:openspec` runs after `bun install`.
- Modified (behaviour): `apps/cli/src/commands/apply.ts` (relay guard, human
  warnings), `apps/cli/src/commands/validate.ts` (`DUPLICATE_CLASSES`, the
  narrowed `spec-at-specs-root` regex), `apps/cli/src/core/rules/archive.ts`
  (case-fold arms), and a new delta rule with its registration in
  `apps/cli/src/core/rules/`.
- Contract re-probe (no weakened assertions): `archive-parity`,
  `archive-gotchas`, `scenario-preservation`, `hard-reality`, `config-surface`,
  `store`, `added-early-sync`, `legacy-schema-lifecycle`, and
  `delta-bullet-markers`, whose recorded 1.11.0 narrative flips at this bump.
  Version literals that are not pin reads — the `generatedBy` fixture, the
  `init`/`doctor` and `feedback-format` unit literals — are deliberately
  arbitrary and are not churned.
- Dependency: `@fission-ai/openspec` `1.11.0` → `1.13.1`, exact-pinned in both
  the manifest and the mise tool pin, with `mise.lock` regenerated for every
  platform entry.
- Docs: `apps/docs/concepts/how-it-relates-to-openspec.md` (the single owner of
  the pin fact), `apps/docs/concepts/apply-and-archive.md`,
  `apps/docs/reference/validation-rules.md`, `docs/architecture.md`,
  `docs/validation.md`, `docs/apply-archive.md`, `docs/harness-integration.md`,
  `apps/docs/guide/harness-setup.md`, `docs/stores.md`, `docs/self-hosting.md`,
  `docs/bench.md`, `README.md`, `apps/cli/README.md`, and `.agents/shared.md`
  followed by `mise run agents:sync`.
- No migration: no `schemaVersion` bump is implied, and existing changes, specs,
  and archived changes are unaffected.

## Non-Goals

Six items are real, were assessed against cospec's source, and are deliberately
out of this change. None is drift, and none should hold the pin bump.

1. **Nested-change namespace detection.** Upstream 1.13.1 detects a folder under
   `openspec/changes/` that merely wraps other changes. `validate` and `archive`
   both inherit the authoritative refusal at the pin — this change proves that
   with two evidence rows — so what remains is reporting quality in `status` and
   `list`: a new detector in `core/change.ts` plus four call sites. Propose as
   `feat: nested-change-detection`.
2. **`cospec status`'s `Next:` line.** `ChangeStatus` has no `next` field and
   `renderHuman` prints none; only `emptyChangeEntry` has one. Self-contained
   UX, pin-independent, not parity-required. Propose as
   `feat: status-next-step`.
3. **Requirement-header keyword case-insensitivity.** Upstream's
   `REQUIREMENT_HEADER_REGEX` has been case-insensitive since at least 1.13.0
   while cospec's `REQUIREMENT_RE` is case-sensitive, so `### requirement: Foo`
   is a requirement to the binary and invisible to cospec — the same
   silent-drop-into-a-hard-gate class as the delta-parser fixes, but not a
   1.13.1 change and therefore not this stack's scope. Propose as
   `fix: requirement-header-case` immediately after.
4. **`cospec validate --report full|findings`.** Net-new product scope:
   bulk-scope-only, mutually exclusive with an item name, a findings projection
   over cospec's own `ItemReport[]`, and a new envelope in `core/report.ts`.
   Nothing in cospec disagrees with the binary today, because cospec never
   passes `--report`.
5. **A `codeassistant` harness target.** A from-scratch fifth `HarnessName` with
   adapter, skill-set membership, canon regeneration, and doctor detection.
6. **Raising `OPENSPEC_VERSION_FLOOR`.** The accepted range stays
   `>=1.0.0 <2.0.0`, with the consequence recorded deliberately rather than
   assumed away.

Additionally out of scope by domain, not by deferral: `openspec init`/`update`
internals (IDE-restart wording, `.gitkeep` anchors, the legacy-command-folder
cleanup, the tool-picker rename), upstream's completion registry and shell
installer, `specs-apply.ts` internals (the ENOENT rethrow, the fence-aware
blank-line collapse, the `maskHtmlComments` rewrite) whose _effects_ are
re-verified but whose implementations stay delegated, upstream's global config,
telemetry, and npm-registry paths, upstream's profile / `[[opsx:if-workflow]]`
templating, and upstream's generated-template prose as a source of truth.

## Surfaces

- [x] interactive — `cospec apply` starts printing relayed wrapped warnings in
      the human transcript, and two new validation rule ids reach the CLI's
      report output.
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — the whole change hangs off a three-release bump of the
      wrapped `@fission-ai/openspec` binary; every gate, passthrough, and
      post-condition must be re-proved against the real 1.13.1 binary, not a
      stub, and a gate that disagrees with it in either direction is a release
      blocker.
- [x] agent-behavior — the relay guard changes the text agents read out of
      `cospec apply` and `cospec apply --json`, keeping bare-`openspec`
      instructions out of agent-facing output.
