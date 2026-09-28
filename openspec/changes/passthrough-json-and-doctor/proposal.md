# Proposal

## Why

A script that swaps `openspec` for `cospec` gets a different answer from four
passthrough commands. Probed against the pinned binary in a sandboxed HOME/XDG:
`cospec store bogus --json`, `cospec store --json`, `cospec workset --json` and
`cospec workset bogus --json` print one line of plain stderr
(`cospec store: unknown subcommand 'bogus'`, `workset.ts:112-120`,
`store.ts:486-493`) where the binary prints one JSON document carrying
`unknown_store_subcommand` / `unknown_workset_subcommand`;
`cospec store --bogus` and `cospec -- workset --bogus` call `--bogus` an unknown
subcommand where the binary answers `Missing subcommand`; and
`cospec workset open x --json` drops `--json` and hands the terminal over
(`workset.ts:88-108`), printing
`Fix: Create it first: openspec workset create x`, where the binary refuses with
`workset_open_json_unsupported`. `cospec doctor` folds `openspec doctor --json`
in only for a store-backed or `references:` root (`doctor.ts:481-482`), so a
plain local root never gets upstream's root/store/references/status report and
`--json` never carries those keys; it reads only `openspec/config.yaml`
(`doctor.ts:284`, `:435`), so a `references:` list in `config.yml` — which the
binary reads — is invisible (probed: the binary reports `reference_unresolved`,
cospec reports nothing); and its failure hint says "run `openspec doctor`
directly" (`doctor.ts:513`).

Several relays still print bare `openspec` commands, which sends an agent around
every cospec gate: `store doctor|unregister|remove <unknown>` prints
`Fix: Run openspec store list …` (`store.ts:265-270`, text and `--json`);
`workset create` / an empty `workset list` print `openspec workset open|create`;
`config profile core` prints ``Run `openspec update` …``; `cospec schemas` with
no root and registered stores relays `run openspec init`; a successful
`cospec context` relays its reference block (`Fetch: openspec show …`,
`Fix: Run: openspec store doctor <id>`) and the same fields in `--json`; and the
`workset open` handover prints `Run 'openspec completion install'` because it
omits `OPENSPEC_NO_COMPLETIONS=1`. `config get foo --bogus --json` and
`config path --bogus --json` answer a cospec envelope (exit 1, `found: false` /
`path: ""`) where the binary refuses `--bogus`; `config --scope global` with no
subcommand answers cospec's one-line usage error where the binary prints the
`config` help on stderr; the terminal-handover leaves (`config edit`,
`config profile`, `config reset --all`, `workset open`) hand the terminal over
without first checking the argv, so a refusal or remedy the binary prints lands
on the inherited terminal unspelled; and `--cwd <nonexistent>` on `store`,
`config` and `workset` fails with `posix_spawn … ENOENT` naming cospec's own
runtime path.

## What Changes

- **Store and workset refusals are the binary's.** A missing, unknown or
  option-shaped subcommand (`store`, `store bogus`, `store --bogus`,
  `store -- --bogus`, `workset`, `workset bogus`, `workset -- --bogus`) is
  delegated to the binary with the user's argv (the `--` kept) and `--json`
  threaded when asked, and its answer is relayed with upstream's sentences
  spelled through cospec: one JSON document (`unknown_store_subcommand`,
  `unknown_workset_subcommand`) under `--json`, the binary's text otherwise.
- **`workset open --json` is refused, not handed over.** The call runs piped and
  relays the binary's `workset_open_json_unsupported` document, respelled.
- **`cospec doctor` folds `openspec doctor --json` on every root** and carries
  upstream's `root`, `store`, `references` and `status` keys verbatim (their
  remedies respelled) beside `version`/`findings`/`summary`. It reads
  `config.yaml` then `config.yml`, as the binary does; its failure hint names
  `cospec doctor`; and when cospec's own `initialized` check already reports the
  missing root, upstream's no-root diagnostic is carried in `status` but not
  folded twice into `findings`. Run from a subdirectory of a project, doctor's
  own checks target the enclosing root the resolver found.
- **Remedies are respelled on every store, workset, config, doctor, schemas and
  context relay.** A failed answer goes through the `core/remedies.ts`
  allowlist, as R1's failure relays already do. A successful answer is respelled
  structurally: from the binary's `--json` document, only the command-bearing
  fields (`members[].fetch`, `…status[].fix`) through the shared field-map
  helper `root-resolution-parity` adds to `core/passthrough-command.ts`, and
  cospec's human text rendered from the rewritten structure (`context`, `store`,
  `doctor`); for the text-only successes (`workset create`, an empty
  `workset list`, `config profile <preset>`) only the whole lines the binary
  prints as its next step, each an allowlist sentence. The ten `REACHABLE_OWNED`
  lines this change owns leave that list.
- **Config parity.** `config [--scope <s>]` with no subcommand prints cospec's
  own `config` help on stderr, exit 1 (upstream's help names bare `openspec`);
  with `--json` the binary's refusal of `--json` is relayed. A commander parse
  rejection (`config get foo --bogus --json`) is relayed as the binary's text,
  exit 1, ahead of any cospec envelope.
- **Terminal-handover leaves pre-validate before the terminal is handed over.**
  The argv is parsed against the command table first, so commander's refusal is
  answered on cospec's own streams identically to the binary; a leaf that could
  not be interactive (no TTY on the stream upstream tests, `CI`,
  `OPEN_SPEC_INTERACTIVE=0`) runs piped with a respelled relay instead;
  `workset open` checks the saved workset with a read-only `workset list --json`
  and answers a missing name or member-less workset through the piped call;
  `config profile` checks an unreadable config with a read-only
  `config list --json`. The handover env gains `OPENSPEC_NO_COMPLETIONS=1` for
  `workset open`. What the binary can still print during a live interactive
  session is enumerated and documented as the residual.
- **`--cwd <nonexistent>`** on `store`, `config` and `workset` answers
  `cospec: directory not found: <path>` (under `--json`, the resolver's
  `{status:[diagnostic]}` document), exit 1, with nothing spawned — the same
  answer `root-resolution-parity`'s resolver gives `context`, `doctor` and
  `schemas`.

**BREAKING (output shape).** `cospec workset`/`cospec store` refusals change
text (upstream's, respelled) and gain a JSON document under `--json`;
`cospec workset open --json` exits 1 without opening anything;
`cospec doctor --json` gains four top-level keys and, on a plain local root,
upstream's diagnostics as findings; `cospec config get|path … --bogus --json`
prints no document.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `openspec-relationship-health`: doctor folds upstream's report on every root
  and carries its keys (the "plain local repo omits the section" rule was the
  defect).
- `openspec-read-passthroughs`: context's reference fields and workset's next
  steps are respelled; workset group refusals and `workset open --json` are the
  binary's; the handover pre-validates and sets `OPENSPEC_NO_COMPLETIONS=1`.
- `openspec-config-passthrough`: no-subcommand help, parse-rejection relay ahead
  of envelopes, respelled next steps, handover pre-validation and the non-TTY
  piped path.
- `openspec-store-management`: store group refusals and diagnostics are the
  binary's, spelled through cospec, text and `--json`.
- `cli-option-contract`: the forward-row contract's "successful answer relayed
  untouched" and "pre-spawn guard answers only what the binary would not" gain
  the two exceptions above (the binary's own reference fields and next-step
  lines; the terminal-handover leaves' pre-validation).

## Impact

- `apps/cli/src/commands/workset.ts`, `store.ts`, `doctor.ts`, `config.ts`,
  `schemas.ts`, `context.ts`.
- `apps/cli/src/core/remedies.ts` (new allowlist entries for sentences a piped
  non-interactive leaf now relays; a whole-line respell),
  `core/forward-relay.ts` (group-refusal delegation, handover pre-validation,
  `--cwd` check), `core/command-table.ts` (one export: the subcommand-surface
  parser the pre-validation reuses). `core/passthrough-command.ts` is consumed,
  not edited, unless the field-map helper lacks a sentence-rule field kind
  (design D4).
- Tests: new `test/contract/doctor-parity.test.ts`,
  `test/contract/passthrough-json.test.ts`,
  `test/contract/handover-prevalidation.test.ts`,
  `test/unit/json-envelope.test.ts`;
  `test/integration/doctor-relationship.test.ts` and `workset.test.ts` rows that
  encoded the defect invert; `test/contract/relayed-remedies.test.ts` context
  success rows; `test/contract/support/remedy-sources.ts` (`REACHABLE_OWNED`,
  `OWNERS`, `SUCCESS_RELAYS`, the `TIP` and `PROFILE_HANDOVER` reasons).
- Docs: `apps/docs/reference/commands.md`, `apps/docs/concepts/stores.md`,
  `apps/docs/reference/configuration.md`, `docs/stores.md`,
  `docs/architecture.md`; `.agents/shared.md` (the success-path respell rule and
  the handover pre-validation) synced into `CLAUDE.md`/`AGENTS.md`; the living
  `openspec-relationship-health` Purpose.
- No dependency change; no registry surface (`parity-pending.yaml` has no entry
  for this change).

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
