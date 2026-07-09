## Why

cospec renders a `/cospec:*` command+skill for only 6 of the 11 live workflows
in the pinned opsx 1.5.0
(`propose, explore, new, continue, apply, ff, sync, archive, bulk-archive, verify, onboard`).
A user migrating from raw OpenSpec — or reading opsx's own docs — reasonably
expects `/cospec:verify`, `/cospec:new`, `/cospec:ff`, `/cospec:bulk-archive`,
and `/cospec:onboard` to exist, and today they don't. `/cospec:verify` in
particular is the command most likely to be missed: it is the dress rehearsal
before the two hard archive gates (`archive/verification-incomplete`,
`archive/scenario-preservation`), and without a generated body teaching it,
agents skip straight to `archive` and get blocked with no guided recovery path.

## What Changes

- Add 5 new cospec-adapted workflows to the canon: `new`, `ff`, `verify`,
  `bulk-archive`, `onboard`. Each is rewritten for cospec's typed model (typed
  artifact plan, deterministic `apply` gate, machine-parsed verification ledger,
  hard archive gates, always-CLI archive) — never a copy of opsx prose.
- cospec has no core/custom profile split: it emits its full set of 11 workflows
  to every harness (claude, codex, opencode) — there is no per-workflow
  allow/deny knob. This is a deliberate decision, not an oversight: users coming
  from opsx must never find a `/cospec:*` command missing.
- All 5 new workflows compose only existing `cospec` subcommands (`new`,
  `instructions`, `status`, `validate`, `apply`, `archive`, `list`). No new CLI
  subcommand, no `src/commands/` change, no `src/core/` change, no
  wrapped-binary change — this is a canon + harness + tests + docs change
  end-to-end.

## Capabilities

### New Capabilities

- `harness-workflows`: the set of workflow commands+skills cospec renders to
  each supported agent harness (claude, codex, opencode), including which opsx
  1.5.0 workflows they map to and how each body is adapted to cospec's typed
  model.

### Modified Capabilities

(none)

## Impact

- `apps/cli/src/canon/workflows/harness.yaml` — 5 new workflow entries.
- `apps/cli/src/canon/workflows/{new,ff,verify,bulk-archive,onboard}.md` — 5 new
  bodies.
- `apps/cli/src/canon/workflows/embedded.ts` — 5 new imports + map entries.
- `apps/cli/src/canon/workflows/adapters.ts` — unchanged (deliberate;
  `bulk-archive`/`onboard` call `cospec archive`, intentionally not pre-approved
  in the codex rules, matching the existing `archive` precedent).
- `.claude/`, `.codex/`, `.opencode/` — regenerated managed files
  (`mise run generate`).
- `apps/cli/test/unit/harness/*`, `apps/cli/test/integration/support.ts` —
  updated fixtures, counts (6 → 11), and the type-table test branch.
- `docs/harness-integration.md`, `apps/docs/guide/harness-setup.md`,
  `docs/architecture.md`, `apps/docs/guide/workflow.md` — updated counts,
  inventories, and cross-references.
- `.agents/shared.md` — one new line on the optional verify dress rehearsal and
  new/ff/continue as entry variants of propose, synced via
  `mise run agents:sync`.
- No breaking changes: purely additive workflow surface.

## Out of scope

- `/opsx:update` — documented on OpenSpec `main` but not present in the pinned
  1.5.0 dist (no template, not in `ALL_WORKFLOWS`, zero grep hits). Per cospec's
  load-bearing pin discipline, this is deferred until OpenSpec ships it tagged
  in a release and the cospec pin advances (with a contract-suite re-run and
  re-probe).
- `feedback` — dead code in opsx 1.5.0 (not wired into `getSkillTemplates`).
  cospec has no `cospec feedback` subcommand; adding one is out of scope and
  noted only as a possible future follow-up.

## Surfaces

- [x] interactive — 5 new agent-facing slash commands + skills across
      claude/codex/opencode, changing the discoverable CLI/agent UX
- [ ] deploy
- [ ] integration
- [ ] agent-behavior
