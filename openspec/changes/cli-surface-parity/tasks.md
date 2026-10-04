# Tasks

Tracks follow design D1. Each track owns its files, and the shared
`command-table.ts` / `parity-pending.yaml` hunks land only in the task named for
them. Contract rows are written first (T6) as `test.failing`, and each
implementing task flips exactly its own rows in the commit that makes them pass.
Every task ends with `mise run check` green and one commit (the harness's
Co-Authored-By trailer, never `--no-verify`).

## 1. Rebase

- [ ] 1.1 Once `passthrough-json-and-doctor` has merged, rebase this branch onto
      `main` (`--force-with-lease`, no merge commit), run
      `bun install --frozen-lockfile` and `mise run check`. Re-check that none
      of its files are in D1's windows, and that design's `status.ts`,
      `list.ts`, `validate.ts`, `apply.ts` and `complete.ts` line references
      still hold. The rebased branch is verified by `git log main..HEAD` showing
      only this change's commits, and it adds no commit of its own

## 2. T6 — contract rows first (`apps/cli/test/contract/cli-surface.test.ts`, `apps/cli/test/contract/support/key-oracle.ts`)

- [x] 2.1 Write `key-oracle.ts` (design D5: identity matching, the six path
      classes, the native-key snapshot) and its self-test (verification 1.8),
      plus the fixture builders: the staged-mtime list fixture via `utimes`, the
      namespace folder, the detector matrix, a project fork, a `spec-driven`
      change, an unknown-schema change, a hand-made change directory, an
      ambiguous `gamma`, and the mode-000 cases. The self-test passing under
      `mise run test:contract` is the check. Commit
      `test(cli): add the upstream key oracle and cli-surface fixtures`
- [x] 2.2 Add every contract row of verification groups 1, 3.2, 3.4, 4, 5, 6,
      7.1–7.6, 7.8, 7.9, 8.1, 8.4, 9.1, 10.2 to `cli-surface.test.ts`. Each
      reads the binary's answer at test time through the upstream oracle, and
      each row that fails on this tree is marked `test.failing`. Record the
      failing count, run `mise run test:contract` green, and commit
      `test(cli): pin cli-surface-parity differentials as failing rows`

## 3. T1 — detector, meta rules, schema tier (`apps/cli/src/core/change.ts`, `apps/cli/src/core/rules/meta.ts`)

- [x] 3.1 Port `findNestedChangesIn`, `findNestedChanges` and
      `describeNestedChange` into `change.ts` (design D2), with the detector
      unit table (verification 4.5), and make `listChanges` drop
      dot-directories. Verify with the unit table green and 4.6 flipped. Commit
      `feat(cli): detect namespace folders the way OpenSpec does`
- [x] 3.2 Add `meta/nested-change`, `meta/unreadable-artifact` and
      `meta/item-missing` issue builders to `meta.ts`, each unit-tested for
      level, path and message. Commit
      `feat(validate): add the nested-change, unreadable and missing-item rules`
- [x] 3.3 Export `userSchemasDir` from `change-metadata.ts`, and make
      `resolveSchema` (`change.ts`) and `new.ts` import it (design D8). Verify
      with the unit row 10.1 and the flipped contract row 10.2. Commit
      `fix(cli): classify user schemas from the directory OpenSpec reads`

## 4. T2 — status (`apps/cli/src/commands/status.ts`, `apps/cli/src/core/upstream-keys.ts`)

- [x] 4.1 Add `resolveNext` and wire it to `next` on every entry and to the
      human `Next:` line (design D4), with the unit table 3.3 and the rows 3.1,
      3.4 and 3.5. Commit `feat(status): name the next step on every entry`
- [x] 4.2 Add `core/upstream-keys.ts` (design D3), its unit test (collision
      list, identity merge), and the one delegated `status --json` /
      `--all --json` call merged into cospec's documents with `root` as the
      resolver's object and `nextSteps` respelled. Flip rows 1.3, 1.4 and 3.2.
      Commit `feat(status): add OpenSpec's status keys to the JSON documents`
- [x] 4.3 Answer a schema cospec doesn't type (fork, `spec-driven`, unknown, no
      `.openspec.yaml`) from the delegated document: the text renderer port, the
      merged `--json` entry and the binary's exit code. Flip rows 5.1–5.4 and
      5.6. Commit
      `feat(status): render schemas cospec does not type from OpenSpec's status`
- [x] 4.4 Accept `--schema` as an override, forwarded and checked as the binary
      checks it. Move it from pending to handled in `command-table.ts` and
      delete its `parity-pending.yaml` entry in this commit. Flip row 5.5.
      Commit `feat(status): accept --schema as OpenSpec's schema override`
- [x] 4.5 Wire the detector (refusal and sweep failure entry), the
      unreadable-archive warning with the empty-index gate, and `change_error`
      for other read failures and raw resolver failures (design D4, D10). Flip
      rows 4.1, 4.2, the status parts of 6.2, 6.3, 8.1 and 8.4. Commit
      `fix(status): report namespace folders and read failures as OpenSpec does`

## 5. T3 — list (`apps/cli/src/commands/list.ts`)

- [x] 5.1 Make `list` one delegated `openspec list --json` call merged by name
      (design D6), with `--sort` forwarded, and `root` on `--specs`. Move
      `--sort` from pending to handled and delete its yaml entry in this commit.
      Flip rows 1.1, 1.2 and 6.1. Commit
      `feat(list): sort and carry OpenSpec's list keys`
- [x] 5.2 Mark namespace rows (`not a change`, `state: 'not-a-change'`,
      `nested`, the trailing warnings), relay the binary's failure document, the
      archive warning, per-row `error` for `blocking-changes.md`, and the
      raw-resolver `list_error` payloads. Flip rows 4.3, 6.2–6.4 and the list
      parts of 8.1 and 8.4. Commit
      `fix(list): answer namespace folders and read failures as OpenSpec does`

## 6. T4 — validate (`apps/cli/src/commands/validate.ts`, `apps/cli/src/core/report.ts`)

- [x] 6.1 Port item resolution: `--type`, the ambiguity refusal,
      `nearestMatches`, `invalid_item`, `meta/item-missing`, and bulk-flag
      precedence (design D7). Move `--type` from pending to handled and delete
      its yaml entry in this commit. Flip rows 7.1–7.4. Commit
      `feat(validate): resolve items and bulk scopes as OpenSpec does`
- [x] 6.2 Add `--report full|findings` with the four request refusals ahead of
      root resolution and `toFindings` in `report.ts`. Move `--report` from
      pending to handled and delete its yaml entry in this commit. Flip rows
      1.6, 7.5 and 7.6. Commit `feat(validate): add --report full|findings`
- [x] 6.3 Replace `Promise.all` with the bounded pool honouring `--concurrency`,
      `OPENSPEC_CONCURRENCY` and 6, with the unit row 7.7. Move `--concurrency`
      from pending to handled and delete its yaml entry in this commit. Commit
      `feat(validate): bound bulk validation with --concurrency`
- [x] 6.4 Add `root`, `items[].durationMs`, `summary.totals` and
      `summary.byType` to the report JSON, keeping `version: 1` and the schema
      `items[].type`. Flip row 1.5. Commit
      `feat(validate): add OpenSpec's report keys to the JSON document`
- [x] 6.5 Read artifacts through the errno-recording helper and short-circuit to
      `meta/unreadable-artifact`, and a namespace folder to
      `meta/nested-change`. Respell every delegated message and the `--archived`
      fallback, and give raw resolver failures `validate_error`. Flip rows 4.4,
      7.8, 7.9 and the validate parts of 8.1 and 8.4. Commit
      `fix(validate): report unreadable artifacts and respell relayed remedies`
- [x] 6.6 Rewrite the `archive/target-invalid` dedupe as the per-line matcher,
      and make the ReDoS unit test fail on the pre-fix pattern
      (`test/unit/commands/validate.test.ts`). Add the quoted-header row to
      `validation-parity.test.ts`. Verify with rows 11.1 and 11.2. Commit
      `fix(validate): match structurally-invalid targets in linear time`
- [x] 6.7 Add the commented mis-depth-scenario archive row to
      `validation-parity.test.ts`, and cite it from the `deltas/scenario-depth`
      exception in `views.ts` and `views.test.ts`. Verify with row 12.1. Commit
      `test(validate): prove the scenario-depth masked-view exception`

## 7. T5 — completion (`apps/cli/src/commands/complete.ts`, `apps/cli/src/core/completions/`)

- [x] 7.1 Add the `schemas` and `archived-changes` sources and case-insensitive
      source names. Move both `__complete` values from pending to handled and
      delete both yaml entries in this commit. Flip row 9.1. Commit
      `feat(completion): serve the schemas and archived-changes sources`
- [x] 7.2 Wire `schemas` into `spec.ts` (`--schema` values and the three
      `schema` subcommand positionals) and the bash, zsh and fish generators,
      verified by `completion.test.ts` (row 9.2). Commit
      `feat(completion): complete schema names in the generated scripts`

## 8. T7 — apply (`apps/cli/src/commands/apply.ts`)

- [x] 8.1 Answer every early exit under `--json` with one `change_error`
      document (design D10), with the unit test over every path (row 8.2). Flip
      rows 1.7 and 8.3. Commit
      `fix(apply): answer every early exit with one JSON document`

## 9. Docs

- [x] 9.1 Update `apps/docs/reference/commands.md`,
      `apps/docs/reference/validation-rules.md`,
      `apps/docs/concepts/how-it-relates-to-openspec.md` and
      `docs/architecture.md` (design D12). Add the standing rule verbatim to
      `docs/validation.md`'s parser-tolerances section. Verify with rows 12.2,
      13.1–13.4 and 13.6 (`mise run docs:build` exit 0). Commit
      `docs(cli): document cli-surface-parity behavior`
- [x] 9.2 Tick row 7.2 in
      `openspec/changes/archive/2026-09-28-validation-parity/tasks.md` with a
      note: the archive ran with `--force-incomplete`, which waived the tasks
      gate for that one self-referential row, and both hard gates ran. Verify
      with row 13.5. Commit
      `docs(validate): record how the validation-parity archive ran`

- [x] 9.3 Add the additive-JSON discipline paragraph to `.agents/shared.md`
      (design D12), run `mise run agents:sync`, and verify with row 13.7
      (`mise run agents:check` exit 0). Commit
      `docs(agents): record the additive upstream-key discipline`

## 10. Close-out

- [x] 10.1 Record observed evidence on every verification row, confirm zero
      `test.todo`/`test.failing` in `cli-surface.test.ts` (row 14.1), the
      pending count 7 → 0 (row 2.1), the BREAKING list (row 14.3),
      `validate --all --strict` (row 14.2) and `mise run check` (row 14.4).
      Commit `docs(cli): record cli-surface-parity evidence`
- [ ] 10.2 After the final rebase onto `main`, tick this row, run
      `mise run cospec -- validate cli-surface-parity --strict`, then
      `mise run cospec -- archive cli-surface-parity` with no `--force*` flag,
      as the PR branch's final commit. Verify with `git show --stat` listing
      only `openspec/` paths

## 11. Round-2 review fixes

Each fix below lands in its own commit, flipping its own `test.failing` rows
(verification group 15) and ticking its own task. Task 10.2 stays the branch's
final commit.

- [x] 11.1 Write rows 15.1–15.10 first: the round-2 contract rows in
      `cli-surface.test.ts`, `nested-detector.test.ts` and `glob.test.ts`, and
      the bench parser rows in `packages/bench/test/unit/mechanical.test.ts`,
      each as `test.failing`. Commit
      `test(cli): add the round-2 review rows as failing`
- [ ] 11.2 `validate <id> --type spec` on a spec file discovery skips (a
      dot-directory, a linked capability) validates that file as the binary
      does, never an empty passing report. Verify with row 15.1. Commit
      `fix(validate): validate a forced spec that discovery skips`
- [ ] 11.3 The namespace-folder detector matches `generates` with the binary's
      glob semantics (fast-glob: braces, extglobs, negation) through a faithful
      port in `core/glob.ts`, held to the pinned binary's modules. Verify with
      rows 15.2 and 15.3. Commit
      `fix(cli): match schema outputs with the binary's glob semantics`
- [ ] 11.4 `packages/bench` `parseSchemaConformanceJson` returns null for a
      document with a `status[]` error or without `summary` or `items`. Verify
      with row 15.10. Commit
      `fix(bench): count a refused validate document as no report`
- [ ] 11.5 `status` answers every change on a schema cospec doesn't type from
      the binary's status, and a cospec-typed change with no artifacts takes its
      next step from its own matrix. Verify with row 15.4. Commit
      `fix(cli): take a custom schema's status from its own artifacts`
- [ ] 11.6 `validate --archived` relays the binary's failure document: under
      `--json` that one document with the binary's exit code, in text its
      messages. Verify with row 15.5. Commit
      `fix(validate): relay the binary's --archived failure document`
- [ ] 11.7 An unreadable `openspec/changes/archive/` leaves `validate` and
      `apply` answering from an empty archive with an `archive_unreadable`
      warning. Verify with row 15.6. Commit
      `fix(cli): validate and apply past an unreadable archive`
- [ ] 11.8 `validate --json` with no `openspec/` directory prints one
      `no_openspec_root` document. Verify with row 15.7. Commit
      `fix(validate): answer --json outside a root with one document`
- [ ] 11.9 `list --specs` relays the binary's failure document under `--json`
      and its message and fix in text. Verify with row 15.8. Commit
      `fix(cli): relay a failed list --specs as the binary's document`
- [ ] 11.10 An unreadable living `spec.md` is one `meta/unreadable-artifact`
      ERROR on that spec. Verify with row 15.9. Commit
      `fix(validate): report an unreadable living spec as an issue`
- [ ] 11.11 Record observed evidence on every group-15 row, re-observe rows
      14.1–14.4, and update the docs pages that own each fact. Commit
      `docs(cli): record the round-2 review fixes`
