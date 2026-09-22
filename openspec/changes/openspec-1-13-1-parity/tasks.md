# Tasks

<!-- Track E (canon workflow prose) landed as the archived `canon-workflow-grounding` change and has no group here; this change touches no canon file. -->

## 1. Track A — pin and vendor

- [ ] 1.1 Re-probe the real 1.13.1 binary before touching any test file — run
      each contract fixture against it and record what actually changed — and
      verify by a written re-probe note naming, per stamped contract file, the
      behaviour the new binary exhibits; no test edit may precede this task
- [ ] 1.2 Edit `apps/cli/package.json` and `mise.toml` to `1.13.1`, run
      `bun install` then `mise install`, and commit both manifests with both
      lockfiles in one commit; verify with
      `mise install && git diff --exit-code mise.lock` and
      `bun install --frozen-lockfile` both exiting 0 (verification 1.1, 1.2)
- [ ] 1.3 Move `PINNED_OPENSPEC_VERSION` to `1.13.1` and restamp the
      floor-through-pin span comment in `apps/cli/src/core/openspec.ts`, leaving
      `OPENSPEC_VERSION_FLOOR` and `OPENSPEC_VERSION_CEILING` untouched; verify
      with `mise run cospec -- doctor` reporting a resolved `1.13.1`
      (verification 1.3)
- [ ] 1.4 Regenerate the vendored bundle and third-party notices with
      `mise run vendor:openspec` **after** `bun install`; verify with
      `mise run vendor:openspec:check` exiting 0 (verification 1.4)
- [ ] 1.5 Rewrite each falsified contract narrative from the 1.1 re-probe —
      `archive-parity`, `archive-gotchas`, `hard-reality`, `config-surface`,
      `store`, `added-early-sync`, `legacy-schema-lifecycle`,
      `delta-bullet-markers` — to what the binary now does, weakening no
      assertion and deleting no test; verify with `mise run test:contract` green
      and a human review of the diff (verification 2.1, 2.2, 2.3)
- [ ] 1.6 Confirm no version literal that is not a pin read was churned, and
      that the `harness-workflows` parity requirement and the `rules/specs.ts`
      comment still hold at 1.13.1; verify by the repo-wide `1.11.0` grep
      leaving only dating or deliberately-arbitrary literals (verification 1.5,
      11.5)

## 2. Track B — declare the wrapped apply advisories

- [ ] 2.1 Add `warnings?: string[]` and `missingPrerequisites?: string[]` to
      `ApplyInstructionsJson` in `apps/cli/src/core/openspec.ts` (serialised
      after Track A, which owns the same file); verify with `mise run typecheck`
      clean and a unit case parsing a payload that carries neither field
      (verification 3.4)
- [ ] 2.2 Print relayed `warnings` in `cospec apply`'s human transcript
      alongside the `--json` spread; verify with a contract run asserting the
      same warnings on both surfaces (verification 3.1, 3.3)
- [ ] 2.3 Add contract coverage that `missingPrerequisites` is a superset of
      cospec's `missingArtifacts` and moves no exit code, and that cospec's
      `skip_specs` precedence still wins over a contradicting wrapped warning;
      verify with `mise run test:contract` (verification 3.1, 3.2)

## 3. Track C — the bare-openspec relay guard

- [ ] 3.1 Confirm from the Track A re-probe that `instructions`, `status`,
      `validate` is still the complete verb set the 1.13.1 strings emit, rather
      than carrying the 1.13.0 reading forward; verify by the recorded re-probe
      observation (verification 4.6)
- [ ] 3.2 Implement the rewrite in `apps/cli/src/commands/apply.ts` (serialised
      after Track B, same file), anchored to backtick-delimited command spans
      over the closed verb set and applied on every relay path — main,
      `applyLegacy`, human and `--json`; verify with unit cases for the embedded
      `.openspec.yaml` path and for an unwrapped verb (verification 4.4, 4.5)
- [ ] 3.3 Add contract coverage on the three reachable leaks — `applyLegacy`, a
      v1-grandfathered change blocked upstream on `verification`, and an empty
      `tasks.md` — asserting on `--json` that no relayed string carries a
      bare-`openspec` command span; verify with `mise run test:contract`
      (verification 4.1, 4.2, 4.3)

## 4. Track D — validate dedupe, case-fold arms, and the new delta rule

- [ ] 4.1 Add one `DUPLICATE_CLASSES` entry per upstream archive-precondition
      shape in `apps/cli/src/commands/validate.ts`, each `nativeKey` capture
      stopping before the conditional `, but "…" exists` and
      `and differs only in case or spacing` tails, with no scenario-preservation
      entry; verify with unit cases in
      `apps/cli/test/unit/rules/delegated-dedupe.test.ts` over each tail variant
      (verification 5.4)
- [ ] 4.2 Add the `tasks/has-tasks` suppression row for upstream's zero-task
      WARNING and narrow the existing `deltas/spec-at-specs-root` regex through
      its own distinguishing clause; verify with unit cases asserting the
      narrowed regex does not match upstream's unread-file message for
      `specs/spec.md.md` (verification 5.5, 5.6)
- [ ] 4.3 Extend the `RENAMED`-target and `ADDED` pre-flight arms in
      `apps/cli/src/core/rules/archive.ts` with the fold near-miss check,
      excluding the operation's own source and preserving every early-sync
      exemption; verify with contract cases for a case-only collision, a
      case-only rename that is not a collision, and an early-synced ADDED
      (verification 6.1, 6.2, 6.3)
- [ ] 4.4 Add the `deltas/unread-file` rule and register it, and extend
      `cospec archive`'s zero-delta leniency so a change carrying only unread
      delta-shaped files is not a clean no-op; verify with contract cases for
      `specs/user-auth.md` and `specs/user-auth/delta.md`, and a unit case
      proving a companion note stays silent (verification 7.1, 7.2, 7.3)
- [ ] 4.5 Re-probe and rewrite
      `apps/cli/test/contract/scenario-preservation.test.ts` for the new INFO
      stream, asserting exactly one finding per defect and at most one
      archive-preflight INFO per delta file; verify with
      `mise run test:contract` (verification 5.1, 5.2, 5.3)
- [ ] 4.6 Confirm `DELEGATED_DELTA_PATH_RE` still maps `<specId>/spec.md` for a
      nested capability so the new pairings fire there too; verify with a unit
      case over a nested delta path (verification 11.1)

## 5. Track F — docs, shared.md, and zero drift

- [ ] 5.1 Update `apps/docs/concepts/how-it-relates-to-openspec.md` — the single
      owner of the pin fact — to `1.13.1` and extend its behaviour-delta list
      with 1.12's archive-preflight INFO, 1.13's archive-fidelity fixes, and
      1.13.1's four new archive refusals; verify by a human read of the rendered
      page (verification 12.4)
- [ ] 5.2 Update `apps/docs/concepts/apply-and-archive.md` and
      `docs/apply-archive.md` with `warnings` and `missingPrerequisites` as
      advisory fields that never move an exit code; verify by a human read
      (verification 12.4)
- [ ] 5.3 Update `apps/docs/reference/validation-rules.md` and
      `docs/validation.md` with `deltas/unread-file`, the `openspec/validate`
      INFO class, the new dedupe pairings, and the `tasks/has-tasks`
      supersession; verify by a human read (verification 12.4)
- [ ] 5.4 Update `docs/architecture.md` with the pin refs, the relay-guard
      rationale, and the nested-change deferral rationale, and restate the opsx
      parity claim at 1.13.1 in `docs/harness-integration.md` and
      `apps/docs/guide/harness-setup.md`; verify by a human read (verification
      12.4)
- [ ] 5.5 Move the incidental pin mentions in `docs/stores.md`,
      `docs/self-hosting.md`, `docs/bench.md`, `README.md`, and
      `apps/cli/README.md`; verify with the repo-wide `1.11.0` grep from 1.6
      (verification 1.5)
- [ ] 5.6 Edit `.agents/shared.md` and run `mise run agents:sync`, never
      touching `CLAUDE.md`/`AGENTS.md` by hand; verify with
      `mise run agents:check` clean (verification 12.2)
- [ ] 5.7 Run `mise run generate:check` and `mise run docs:build`; verify both
      exit 0 (verification 12.1, 12.3)

## 6. Close-out — whole-system proof

- [ ] 6.1 Prove the nested-change deferral bound: contract cases for a namespace
      folder at `cospec validate` and at `cospec archive`; verify the upstream
      messages reach the user verbatim (verification 8.1, 8.2)
- [ ] 6.2 Prove the composed schemas survive load-time validation with
      `openspec schema validate` over all eleven and
      `mise run openspec:schema:validate`; verify both exit clean (verification
      9.1, 9.2)
- [ ] 6.3 Prove the inherited store, config, and git-probe fixes reach cospec's
      surfaces; verify with the `store`, `config-surface`, and
      feedback-provenance re-probes (verification 10.1, 10.2, 10.3, 10.4, 11.2,
      11.3, 11.4)
- [ ] 6.4 Prove the archive gates agree with the binary in both directions
      across the whole gate family; verify with the contract cases for
      fence-aware collapse, retirement, unpaired `FROM:`, bare-header scenarios,
      and the re-probed gate suite (verification 6.4, 6.5, 6.6, 6.7, 6.8)
- [ ] 6.5 Run `mise run cospec-validate-all` over this self-hosting repo and
      compare issue counts against the pre-bump run; verify no doubled count and
      no unexplained new issue (verification 5.7)
- [ ] 6.6 Walk the parity plan's decision ledger and record any item whose
      disposition changed once the code was written; verify by the recorded
      walk-through (verification 13.1)
- [ ] 6.7 Run `mise run check`; verify it exits 0 end to end (verification 12.5)
