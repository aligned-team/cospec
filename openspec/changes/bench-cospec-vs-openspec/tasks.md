## 1. Workspace + mise wiring

- [x] 1.1 Add `packages/*` to root `package.json` `workspaces`
- [x] 1.2 Scaffold `packages/bench/package.json` (`@aligned-team/cospec-bench`,
      `private: true`) plus `tsconfig.json` extending `tsconfig.base.json`
- [x] 1.3 Add `@anthropic-ai/claude-agent-sdk` as a pinned exact-version
      dependency of `packages/bench`; regenerate `bun.lock`
- [x] 1.4 Add `reports/` (bench output) to `.gitignore`
- [x] 1.5 Add root `mise.toml` tasks `bench` (full matrix) and `bench:smoke`
      (single cheap cell: `ci` scenario, sonnet-5/high, cospec arm) — advisory,
      not added to `check`

## 2. Sandbox + arm setup

- [x] 2.1 Port sandbox lifecycle (mkdtemp git repo, teardown) from
      `e2e/eval/context.ts` conventions into `packages/bench/src/sandbox.ts`
- [x] 2.2 Implement cospec-arm setup: run the working-tree CLI
      (`apps/cli/src/index.ts`) to `cospec init` the sandbox with the claude
      harness -> verified live via `mise run bench:smoke` (real headless run,
      cospec arm, exit 0)
- [x] 2.3 Implement openspec-arm setup: `openspec init` only, using the repo's
      pinned `@fission-ai/openspec` binary resolved by path (never `$PATH`),
      generic spec-driven prompt, no cospec skills -> verified standalone (no
      agent auth needed): sandbox produces `openspec/config.yaml` +
      `.claude/skills/openspec-*` and seeds the fixture
- [x] 2.4 Port secret redaction from `e2e/eval/redact.ts` conventions into
      `packages/bench/src/redact.ts` -> unit-tested indirectly via
      `report.test.ts`/`judge.test.ts` (redaction-guard throw + redactText
      replacement)

## 3. Scenario fixtures

- [x] 3.1 Author one scenario fixture + identical task prompt per cospec schema
      type (11 total) under `packages/bench/scenarios/` -> registry integrity
      unit-tested (`scenarios.test.ts`: 11 scenarios, unique ids, one per
      `COSPEC_TYPES`, every `fixtureDir` exists, every prompt non-empty and
      carries a unique `BENCH-*` sentinel)

## 4. Agent SDK runner

- [x] 4.1 Implement per-cell headless Claude Code invocation via `query()` with
      `settingSources: []`, `mcpServers: {}`, `strictMcpConfig: true`,
      `persistSession: false` where supported, explicit `allowedTools` (Bash,
      Read, Write, Edit, Glob, Grep), `permissionMode` bypass/dontAsk,
      per-scenario `maxTurns` and budget cap -> verified live via
      `mise run bench:smoke`: real Claude Code 2.1.211 run, 4 turns, exited
      `success`
- [x] 4.2 Wire auth: inherit process env (session already authenticated via
      `CLAUDE_CONFIG_DIR`); `ANTHROPIC_API_KEY` wins if set -> verified: the
      smoke cell authenticated via the inherited session with no
      `ANTHROPIC_API_KEY` set
- [x] 4.3 Set `CLAUDE_CODE_EFFORT_LEVEL` per run from the matrix cell's
      model+effort
- [x] 4.4 Capture telemetry from `SDKResultMessage`: `total_cost_usd`,
      `duration_ms`, `duration_api_ms`, `num_turns`, usage tokens
      (input/output/cache), `modelUsage`, terminal reason, and the running
      Claude Code version -> verified live: smoke cell's `cells.jsonl` row
      carries all of these populated with real values ($0.1925, 13006ms,
      13231ms, 4 turns, per-model token usage, `end_turn`/`completed`,
      `2.1.211`)
- [x] 4.5 Fix: the first smoke cell above (`changeProduced: false`, 4 turns)
      showed neither arm's prompt ever tells the agent a spec-driven workflow
      exists, so the benchmark measured nothing about either tool. Append one
      short, tool-neutral, byte-identical instruction to both arms via
      `query()`'s `systemPrompt` preset+append form (see
      `WORKFLOW_SYSTEM_PROMPT` in `packages/bench/src/agent.ts`) — confirmed
      against `@anthropic-ai/claude-agent-sdk`'s `sdk.d.ts` that this form is
      additive (keeps Claude Code's default system prompt) and does not replace
      it; only a bare-string `systemPrompt` would replace it, which this is not.
      Wording names neither tool. Updated the stale `scenarios/types.ts` doc
      comment and `docs/bench.md` (new "Workflow framing" section) that had
      implied this framing already existed -> unit-tested
      (`test/unit/agent.test.ts`: tool-neutral, mentions `.claude/skills`,
      short) -> re-verified live via `mise run bench:smoke` (attempt 1 of up to
      3; success on first try): `changeProduced: true`, `stampedSchema: "ci"`,
      `armNativeValidatePass: true`, `cospecValidate`
      `{errors: 0, warnings: 0}`, all required artifacts present with none
      forbidden, `taskCompleted: true` (agent scaffolded, authored, and
      validated a real change before writing `.github/workflows/lint.yml`). Cost
      $0.7844, duration 171749ms (durationApi 141422ms), 31 turns, tokens in/out
      60/5170 (cache read 1,287,335 / cache creation 53,308). Follow-up (not
      required by the stated success bar, left for a future change): the cell
      hit `error_max_turns` (30) before archiving (`changeArchived: false`,
      `tasksAllChecked: false`) — the `ci` scenario's `maxTurns: 30` was sized
      for the old direct-implementation path and is tight for a full
      propose->author->validate->implement->archive cycle now that the workflow
      is actually engaged. Resolved: retuned all scenario budgets in
      `packages/bench/scenarios/*.ts` — lite types (`build`, `chore`, `ci`,
      `docs`, `style`, `test`) 30 -> 70; full types (`feat`, `fix`, `perf`,
      `refactor`, `revert`) 60 -> 120 — and raised the per-cell
      `DEFAULT_BUDGET_USD` in `packages/bench/src/agent.ts` from 5 to 10 (a
      full-cycle opus cell can now exceed $5). `docs/bench.md` updated to
      document both numbers.

## 5. Matrix runner + CLI

- [x] 5.1 Implement matrix cell type `{ scenarioId, arm, model, repeat }` and
      cell enumeration -> unit-tested (`matrix.test.ts`)
- [x] 5.2 Implement CLI filters: `--scenario`, `--arm`, `--model`, `--repeats`,
      `--concurrency` (default 2) -> unit-tested (`--flag value`,
      `--flag=value`, comma-split, repeated flags, unknown-flag/value errors) +
      exercised live via `bench:smoke`'s `--scenario --model --arm --repeats`
      invocation
- [x] 5.3 Implement concurrency-bounded cell execution with per-cell isolated
      sandboxes

## 6. Mechanical metrics

- [x] 6.1 Arm-native validation pass/fail capture
- [x] 6.2 Post-hoc `cospec validate --json --strict` run against both arms'
      output trees; parse rule-ID hit counts -> the JSON-parsing step is
      unit-tested directly against fixture JSON matching the real
      `{items, summary.byRule}` `toJson` shape (`mechanical.test.ts`:
      `parseCospecValidateJson`, including the items-fallback and
      non-JSON/empty-body null paths)
- [x] 6.3 Artifact presence/proportionality check against the type's declared
      artifact set, derived from `apps/cli/src/core/rules/type-facts.ts` (never
      hardcoded) -> unit-tested for every one of the 11 types
      (`declaredArtifactFiles`/`requiredArtifactFiles` mirror `TYPE_ARTIFACTS`
      exactly) plus `scoreMechanical` over fabricated archived-change trees
      (forbidden/missing sets, `specs/` required vs. forbidden cases)
- [x] 6.4 Apply-gate obedience and archive integrity capture where the workflow
      reached them -> unit-tested via `scoreMechanical` over an archived-tree
      fixture (`armNativeValidatePass: true` — the archive-integrity
      short-circuit; see 6.6 below for `cospecValidate` on archived changes,
      superseding the stale "null" claim this line originally made)
- [x] 6.5 Task completion check (did the fixture's requested code change land)
      -> verified live: the smoke cell's `ci` scenario predicate correctly
      reported `taskCompleted: true` after the agent wrote
      `.github/workflows/lint.yml`
- [x] 6.6 Fix: the first full 44-cell run (`reports/2026-07-16T13-36-57-771Z/`)
      showed `cospecValidate: null` on every archived cell (43/44), even with
      `changeProduced`/`changeArchived`/`armNativeValidatePass` all `true` and
      `artifactFiles` populated. Root cause, confirmed by reproduction without
      spawning any agent (built a sandbox via `sandbox.ts`, authored + archived
      a real `ci` change with the working-tree `cospec` CLI, called
      `scoreMechanical` directly): `cospec validate <slug>` only resolves ACTIVE
      changes by exact id (`resolveChange` in `apps/cli/src/core/     change.ts`
      joins the id onto `openspec/changes/`, never
      `openspec/     changes/archive/`), so pointing it at an archived slug
      fails with "unknown item" (stderr, exit 1, empty stdout) ->
      `parseCospecValidateJson('')` -> `null`. `collectArtifactText` was
      re-checked against the same reproduction and was NOT reproducibly buggy —
      it already reads from `resolveChange`'s resolved dir (active or archived)
      and returned non-empty artifact text (377 chars) for the archived fixture;
      the recorded `quality: null` across all 44 cells is more likely a DeepSeek
      judge-call failure in that run than a path-resolution bug. Fix
      (`packages/bench/src/mechanical.ts`, `cospecValidateArchivedCounts`): copy
      the archived change dir into a disposable scratch repo, `cospec init`'d
      fresh, at the ACTIVE `openspec/changes/<slug>/` slot, then validate there
      — a fresh scratch repo (rather than the sandbox's own active slot) avoids
      a spurious already-archived/duplicate-slug conflict against the sandbox's
      own `openspec/changes/archive/<date>-<slug>` entry. Confirmed against
      `git stash` (pre-fix reproduces `cospecValidate: null`; post-fix yields
      real rule-id counts) -> unit-tested (`mechanical.test.ts`: two real-CLI
      cases — a clean archived `ci` change scores 0 errors, a defective one
      scores errors > 0, both non-null) plus the pre-existing archived-tree
      fixture test updated to drop the stale null expectation
- [x] 6.7 Persist a snapshot of each cell's resolved change artifacts (slug,
      resolved dir — active or archived —, and every file's text, REDACTED) into
      the per-cell report dir before sandbox teardown, so a future scoring bug
      (like 6.6) can be re-scored offline without re-running the agent ->
      `mechanical.ts`'s `snapshotChangeArtifacts` + `report.ts`'s
      `writeArtifactSnapshot` (writes `<runDir>/snapshots/<cellKey>.json`,
      applies `redactText` per file then `assertRedacted` as a self-check gate
      before writing). Fixed a latent redaction-guard bug surfaced while wiring
      this in: `findLeaks` flagged its own substitution marker as a leak
      whenever a sentinel's LABEL embeds its value (e.g.
      `ref:<scenarioId>:<ref>` from `scenarioSentinels`) — `redact.ts`'s
      `findLeaks` now strips `[REDACTED:...]` markers before scanning ->
      unit-tested (`report.test.ts`: no-op on no change, writes slug/dir/files,
      redacts a planted sentinel, and the self-check still throws on a genuine
      unredacted leak)
- [x] 6.8 Diagnose: why did the first full run score `quality: null` on all 44
      cells despite `judgeEnabled: true`? Reproduced without spawning any agent
      — a throwaway scratchpad script called the REAL DeepSeek
      `/chat/completions` endpoint with the REAL `DEEPSEEK_API_KEY` (present in
      the harness process env, confirmed via
      `mise exec -- bash -c     'echo ${DEEPSEEK_API_KEY:+yes}'`) and logged
      only status/finish_reason/ parse outcome, never the key or a completion.
      Result: every call returns HTTP 402
      `{"error":{"message":"Insufficient Balance", ...}}` — the DeepSeek account
      backing that key has no balance. Not a wrong endpoint/model/response-shape
      bug: auth and routing both succeed (DeepSeek's billing check runs after
      auth), `deepseek-v4-flash` against `https://api.deepseek.com` is correctly
      resolved. The actual defect was in the harness, not DeepSeek: `judge.ts`'s
      `oneSample` already treated a non-ok HTTP response as a failed sample
      (correct), but `judgeArtifacts` collapsed every failure — HTTP 402,
      `finish_reason: 'length'`, or a parse miss — into a bare `null`, and
      `run.ts` propagated that `null` into `CellResult.quality` with no trace of
      WHY. A judge outage was indistinguishable from "judge simply found nothing
      to say." Fix: `judge.ts`'s `oneSample` now returns a discriminated
      `SampleOutcome` (`{ok:true, scores}` | `{ok:false, reason}`, reason one of
      `` `http ${status}` ``/`finish_reason:length`/`parse_failed`/`no-content`
      — never the key or completion text); `judgeArtifacts` returns
      `JudgeResult { quality, error? }`, setting `error` only when every sample
      was attempted and failed (never when there was simply nothing to judge).
      `run.ts` copies `judged.error` onto a new `CellResult.judgeError` field
      (`report.ts`) so a judge outage is now visible in `cells.jsonl` instead of
      silently indistinguishable from a disabled judge -> unit-tested
      (`judge.test.ts`: every failure path now asserts its `error` string,
      including a dedicated 402 case naming the reproduced root cause;
      `report.test.ts`: `judgeError` round-trips through `appendCellResult`
      verbatim)

## 7. DeepSeek judge

- [x] 7.1 Reuse `e2e/eval`'s DeepSeek client patterns for
      `packages/bench/src/judge.ts`
- [x] 7.2 Implement the 5-axis 0-3 rubric (completeness, internal consistency,
      ambiguity inverted, verifiability, traceability), temperature 0, k=3
      averaged, artifact text only (redacted) -> unit-tested with a mocked
      `fetchImpl` (10 cases: normal CoT-then-verdict parse/average, stray braces
      in reasoning, `finish_reason: 'length'` treated as a failed sample,
      bare-JSON fallback, axis clamping, non-ok HTTP, missing-axis reply,
      partial-sample averaging, and the exact POST shape — url, bearer auth,
      `temperature: 0`)
- [x] 7.3 Graceful skip (`quality: null`) when `DEEPSEEK_API_KEY` is unset ->
      unit-tested (empty/whitespace artifact text short-circuits with no fetch
      call; every-sample-fails also resolves to `null`)

## 8. Reporting

- [x] 8.1 Per-cell JSONL writer under gitignored `reports/` -> verified live:
      `bench:smoke` produced `packages/bench/reports/<run>/cells.jsonl`
- [x] 8.2 Aggregate JSON writer (raw values + mean over repeats) -> unit-tested
      (`report.test.ts`: `aggregate` grouping/reduction, sorting, null
      handling) + verified live (`aggregate.json` produced with real data)
- [x] 8.3 Human-readable markdown summary table: arm × type × model on quality
      score, defect counts, duration, tokens, cost -> unit-tested
      (`writeMarkdown`) + verified live (`summary.md` produced with a populated
      row)
- [x] 8.4 Confirm reports never contain keys, raw prompts, or completions —
      counts/scores/rule IDs only -> unit-tested (`appendCellResult`/
      `writeAggregate` throw on a planted sentinel leak) + manually inspected
      the live smoke run's `cells.jsonl`/`aggregate.json`/`summary.md`: counts,
      scores, durations, cost, and token usage only

## 9. Docs

- [x] 9.1 Document `bench`/`bench:smoke` mise tasks and `packages/bench` in the
      mise tasks table this repo's `CLAUDE.md`/`AGENTS.md` reference, if the
      shared-content sync requires it -> updated `.agents/shared.md` (repository
      layout, stack snapshot, mise task table rows for `bench`/`bench:smoke`/
      `test:bench`, secrets discipline) and ran `mise run agents:sync` ->
      `agents:check` OK; also added `docs/bench.md` topic (sibling of
      `docs/eval.md`) documenting the harness, arms, matrix, metrics, judge, and
      redaction contract

## 10. Schema-conformance relabel + repeat statistics

- [x] 10.1 Rename the "defects" metric family to **schema conformance**
      end-to-end (user feedback: the forbidden/missing-artifact +
      post-hoc-`cospec-validate` metric is cospec's own rubric applied to
      openspec — a tautology when presented as "defects"). Renamed in
      `src/mechanical.ts`: `RuleCounts` -> `ConformanceCounts`,
      `MechanicalMetrics.cospecValidate` -> `.schemaConformance`,
      `parseCospecValidateJson` -> `parseSchemaConformanceJson`,
      `cospecValidateCounts`/`cospecValidateArchivedCounts` ->
      `schemaConformanceCounts`/`schemaConformanceArchivedCounts`; doc comments
      rewritten to state explicitly that arm-native validation is each tool's
      OWN bar while schema conformance is cospec's OWN rubric applied post-hoc
      to BOTH arms, reported alongside (never as a substitute for) native
      validation. In `src/report.ts`: `AggregateRow.meanDefects` ->
      `.meanConformanceIssues`, `defectCount` moved to `mechanical.ts` and
      renamed `conformanceIssueCount` (avoids a report.ts<->stats.ts import
      cycle once stats.ts needed it too). The underlying DATA is unchanged —
      same rule-id counts, same forbidden/missing lists — only names/framing
      moved -> unit-tested: every renamed symbol re-verified via
      `mechanical.test.ts`/`report.test.ts` (sed-renamed call sites, typechecked
      clean) -> verified live: `bunx tsgo --noEmit` clean, `bun test test/unit`
      132/132 pass (up from the pre-change 99, never reduced)
- [x] 10.2 `summary.md`'s main table: header `defects` -> `conformance*`
      (asterisk footnoted), `native-valid` gets a matching `†` footnote; two
      legend lines added below the table spelling out, in plain language, that
      conformance is cospec's own opinionated rubric applied post-hoc to both
      arms and is NOT a defect measure, and that native-valid is each arm's own
      validator on its own output (the actual pass/fail bar) — reported
      alongside for contrast, never conflated -> unit-tested (`report.test.ts`:
      header/legend text assertions) -> verified live via a throwaway
      `writeMarkdown` script against synthetic rows (see this change's
      conversation record) confirming the rendered legend reads as intended
- [x] 10.3 `docs/bench.md` "Mechanical metrics" section rewritten: explicit
      side-by-side framing of arm-native validation (each tool's own bar) vs.
      schema conformance (cospec's own rubric, applied post-hoc to both arms,
      not a defect measure — a cell can be `native-valid: true` for the openspec
      arm and still carry a nonzero conformance count, and that is expected, not
      a contradiction). Also fixed a stray `</content>\n</invoke>` tool-call-XML
      artifact that had leaked onto the end of the file (found while editing
      this exact section; in scope, not a drive-by) -> verified by rendering the
      file and reading it end-to-end
- [x] 10.4 Repeats statistics machinery (`src/stats.ts`, new file) — machinery
      only, the 44-cell matrix was NOT re-run: `summarizeNumeric` (mean, min,
      max, sample stddev with n-1 denominator; stddev null, never fabricated as
      0, when n<2), wired into `report.ts`'s `aggregate()` as new `AggregateRow`
      fields `durationSummary`/`costSummary`/`tokensInSummary`/
      `tokensOutSummary` (additive — existing `mean*` fields kept unchanged).
      `summary.md` gets a new "Repeat spread (n>1 only)" section: renders
      min/max/stddev per `(type, arm, model)` group when `repeats>1`, and an
      explicit "nothing to spread over" line when every group is `n=1` ->
      unit-tested (`stats.test.ts`: empty/all-non-finite/n=1/n>1 cases, a known
      stddev worked by hand; `report.test.ts`: `aggregate()` populates the new
      summary fields correctly at both n=1 and n>1, `writeMarkdown` renders the
      section both ways)
- [x] 10.5 Paired per-`(scenarioType, model)` win/loss comparison between the
      `cospec`/`openspec` arms on MATCHED cells (same scenario+model+repeat,
      neither skipped) for cost, duration, and schema-conformance issues
      (`src/stats.ts`'s `pairedComparisons`): per-metric win/loss/tie tally,
      value-range summaries per arm, and a simple two-sided exact sign test
      (`signTestPValue`, H0: either arm equally likely to win a pair; null when
      fewer than 2 decided pairs — a single decided pair carries no statistical
      information). A group is flagged **"not distinguishable at this n"**
      whenever the two arms' `[min,max]` ranges overlap (the "spread crosses the
      tie line" case) OR there are fewer than 2 matched pairs, in which case
      every row states `n=1 — no significance claim` verbatim rather than a bare
      dash or a spurious verdict. Wired into `summary.md` as a new "Paired
      comparison" section (`renderPairedComparisonMarkdown`), including at the
      common n=1 case -> unit-tested (`stats.test.ts`: `rangesOverlap`,
      `signTestPValue` (null-at-n<2, symmetry, a known-significant lopsided
      split), and `pairedComparisons` over synthetic `CellResult` fixtures —
      matched vs. unmatched cells, skipped cells excluded, a metric missing on
      one side excluding only that metric not the whole pair, all-cospec-wins ->
      distinguishable, overlapping-range mixed results -> not distinguishable,
      group sort order; `report.test.ts`: the section renders in `writeMarkdown`
      and states the n=1 verdict verbatim) -> verified live via the same
      throwaway `writeMarkdown` script (2 repeats per arm, synthetic
      cost/duration/conformance data): rendered a correct win tally, sign-test
      p-value, and "not distinguishable" case
- [x] 10.6 `docs/bench.md`: new "Repeats and statistical significance" section
      documenting both 10.4/10.5 (spread + paired comparison, what "not
      distinguishable at this n" means, the n=1 no-significance-claim
      convention), and the "Output & redaction contract" section's `summary.md`
      description updated to name the new sections and the conformance relabel
      -> verified by reading the rendered doc end-to-end
- [x] 10.7 Confirm no regression: `bunx tsgo --noEmit` clean,
      `bun test test/unit` 132/132 pass (99 pre-existing + 33 new across
      `stats.test.ts` and extended `report.test.ts`/`mechanical.test.ts` cases)
      -> unit-test count never reduced, per this change's constraint. The full
      44-cell benchmark matrix was deliberately NOT re-run for this task (10.4
      /10.5 are machinery-only, per the instruction that spawned them)

## 11. Held-out hidden test suites (escaped-defect rate)

- [x] 11.1 Author one held-out `bun:test` suite per scenario
      (`packages/bench/scenarios/hidden/<id>/`, 11 dirs, one `*.test.ts` each,
      4-8 focused cases) — deliberately OUTSIDE every scenario's `fixtureDir` so
      `src/sandbox.ts`'s `createArmSandbox` (which only ever `cp`s `fixtureDir`
      into the sandbox) never seeds them; the agent never sees these while doing
      the task. Each suite targets edge cases beyond the scenario's own visible
      acceptance path (empty inputs, boundary values, error paths, idempotency),
      written against the POST-task behavior described in the scenario's own
      prompt. For behavior-changing scenario types (`feat`, `fix`, `perf`,
      `revert`, `build`, `ci`) every case is written to fail on the unmodified
      fixture and pass on a correct fix; for behavior-preserving types
      (`refactor`, `style`, `chore`, `docs`, `test`, where the completion
      criterion is structural, not behavioral — the underlying behavior was
      already correct pre-task and must stay correct post-task) each suite mixes
      a structural/content check that DOES discriminate with a few
      behavior-regression guards, documented in `scenarios/hidden/README.md`'s
      design note. `feat`'s suite uses a dynamic `await import(...)` (rather
      than a static named import of an export that doesn't exist pre-task) so a
      missing export fails each affected `test()` individually instead of
      crashing the whole file at module-link time (verified live: a static
      import of a nonexistent named export throws `SyntaxError` at load and bun
      still counts it, just as one lumped failure rather than per-case ->
      confirmed via a throwaway `/tmp/bt-experiment` repro before choosing the
      dynamic-import form). `perf`'s two timing cases use data
      profiles/thresholds DIFFERENT from the scenario's own visible
      `bench/measure.ts` (N=15000/range=7500/150ms) so an implementation
      special-cased to that one profile would not also clear these, calibrated
      empirically on this machine (cold, single-shot `bun` process, no JIT
      warmup): unmodified nested-loop `dedupe` took ~1000-1400ms on a
      20000-value/12000-range profile and ~360-395ms on a fully-unique
      10000-value profile; a Set-backed rewrite took ~1ms on both -> thresholds
      (400ms, 200ms) sit far below the slow numbers and far above the fast ones
      -> unit-tested indirectly via 11.3 below (every scenario's
      fail-before/pass-after check, including `perf`'s, is a real `bun test`
      spawn against these exact files)
- [x] 11.2 Wire scoring into the harness (`src/mechanical.ts`): new
      `parseBunTestSummary` (pure — parses bun's own ` N pass`/` N fail` summary
      line into `{total, failed}`, null when unparseable, never a fabricated
      `{total: 0, failed: 0}`) and `scoreHiddenTests` (copies
      `packages/bench/scenarios/hidden/<scenarioId>/` into the FINISHED sandbox
      at `hidden-tests/`, sibling to `src/`, then spawns `bun test .` there and
      parses the summary; null when the scenario has no suite yet).
      `MechanicalMetrics` gains `hiddenTests: {total, failed} | null`, scored on
      BOTH branches of `scoreMechanical` (change produced or not) so a cell that
      never produced a change still gets an escaped-defect signal against
      whatever source tree exists. New pure helper `escapedDefectRate`
      (failed/total, null when total is 0) alongside the existing
      `conformanceIssueCount` -> unit-tested in `mechanical.test.ts`:
      `parseBunTestSummary` against a normal/all-pass/import-crash/unparseable
      summary text, `scoreHiddenTests`'s null path (no suite under a fake
      repoRoot) plus two REAL-CLI cases (the actual `fix` hidden suite scored
      against a seeded buggy `strings.ts` -> `failed > 0`, and against a correct
      one -> `failed === 0`), `escapedDefectRate`'s divide-by-total and
      null-at-zero-total cases
- [x] 11.3 Verify BOTH directions for all 11 scenarios (per the task's explicit
      requirement, mirroring how the scenarios stage validated completion
      predicates against a correct implementation): new
      `test/unit/hidden.test.ts` scripts a hand-written CORRECT reference fix
      per scenario id (`REFERENCE_FIXES`, applied directly to a scratch copy of
      that scenario's fixture — fully independent of the agent/CLI), then runs
      the real hidden suite via `scoreHiddenTests` against (a) an unmodified
      scratch copy — asserts `failed > 0` for all 11 — and (b) the same fixture
      with the reference fix applied — asserts `failed === 0` and `total > 0`
      for all 11. Also covers registry integrity (every scenario has a hidden
      suite with 4-8 cases; `hidden/<id>` never overlaps any `fixtureDir`,
      checked structurally for all 11) and one real integration check: a live
      `createArmSandbox` call (cospec arm, `ci` fixture) whose resulting sandbox
      tree is scanned and asserted to contain no `hidden-tests` path anywhere ->
      all 15 cases in this file pass (11 scenarios' fail-before/pass-after + 4
      registry/integrity checks)
- [x] 11.4 Report wiring (`src/report.ts`): `AggregateRow` gains
      `meanEscapedDefects`/`meanHiddenTestsTotal` (mean failed / mean total
      hidden-test count over repeats, additive — no existing field touched);
      `summary.md`'s main table gains an `escaped‡` column
      (`meanFailed/meanTotal`, dash when unscored) placed next to
      `native-valid†`, with a new legend line naming it the PRIMARY,
      tool-neutral defect signal in contrast to `conformance*` (cospec's own
      rubric) -> unit-tested (`report.test.ts`: aggregate's new fields at both
      null and populated states, the markdown column/legend text, the
      dash-rendering path when hidden tests weren't scored)
- [x] 11.5 `packages/bench/tsconfig.json` excludes `scenarios/hidden/**`: those
      files assume they'll be copied to `<sandbox>/hidden-tests/` (one level
      below the fixture root) and import source as `../src/...` accordingly,
      which does not resolve from their real on-disk location
      (`scenarios/hidden/<id>/`, two levels from `scenarios/fixtures/<id>/`);
      `tsgo` cannot type-check them in place, so `bun test` (both at score-time
      and in 11.3's verification) is the only thing that ever executes them —
      documented in `scenarios/hidden/README.md`
- [x] 11.6 `docs/bench.md`: new "Escaped defects (primary defect metric)"
      section (directory layout, the never-seeded guarantee, the primary-vs-
      schema-conformance framing, the `escaped‡` column), a new bullet in the
      existing "Mechanical metrics" list pointing to it, and the "Output &
      redaction contract" section's `summary.md` description updated to name
      escaped defects among the reported columns -> verified by reading the
      rendered doc end-to-end
- [x] 11.7 Confirm no regression: `bunx tsgo --noEmit` clean (with
      `scenarios/hidden/**` excluded per 11.5), `mise run lint` exit 0 (no new
      warnings), `mise run format:check` clean (after one `format:fix` pass),
      `bun test test/unit` 162/162 pass (132 pre-existing + 30 new: 15 in the
      new `hidden.test.ts`, 11 in `mechanical.test.ts`
      (`parseBunTestSummary`/`scoreHiddenTests`/`escapedDefectRate`), 4 in
      `report.test.ts`, plus the `hiddenTests: null` field added to the shared
      `mechanical()` fixture factories in `report.test.ts`/`stats.test.ts`) ->
      unit-test count never reduced, per this change's constraint. The full
      44-cell benchmark matrix was deliberately NOT run for this task.

## 12. Per-cell diff persistence + adversarial review stage

- [x] 12.1 Persist per-cell code diffs (`src/sandbox.ts`'s new
      `captureSandboxDiff`): the seed-commit `git diff` for tracked files plus
      each untracked file's full content (via `git diff --no-index` against
      /dev/null), EXCLUDING `openspec/`, `.claude/`, `.codex/`, `.opencode/`,
      and the injected `hidden-tests/` via git pathspec `:(exclude)` magic — so
      the captured diff is the arm-agnostic engineering change only. `run.ts`
      captures it after the agent stops but BEFORE `scoreMechanical` seeds
      `hidden-tests/`, then writes it via `src/report.ts`'s new `writeCellDiff`
      (REDACTED before a defensive 200k-char size cap — redaction first so a cut
      never bisects a sentinel) to `<runDir>/snapshots/<cellKey>.diff`
      (`reports/` is gitignored); `readCellDiff` reads it back. An empty diff is
      a no-op -> unit-tested: `sandbox.test.ts` (real git — tracked+untracked
      capture, all five excluded dirs absent from the diff, empty-tree case),
      `report.test.ts` (`writeCellDiff`/`readCellDiff` round-trip, empty-diff
      no-op, missing-key undefined, sentinel redaction, oversize truncation
      marker)
- [x] 12.2 Adversarial review stage (`src/review.ts`): given a cell's diff +
      scenario prompt, `reviewDiff` spawns K=2 independent reviewer runs
      (`claude-haiku-4-5-20251001`, effort high, read-only tools
      [`Read`,`Grep`,`Glob`], `maxTurns` 15, $1 budget cap, hermetic
      `settingSources:[]`/`mcpServers:{}`, throwaway empty cwd) each prompted to
      find real CORRECTNESS bugs (not style, not spec-conformance) and return a
      strict JSON findings array; findings are deduped (`dedupeFindings`, by
      normalized title+location), then a per-unique-finding verifier run (same
      model) is prompted to REFUTE it against the diff — only findings it cannot
      refute count as confirmed. Result ->
      `MechanicalMetrics.reviewDefects     {found, confirmed} | null`
      (optional/absent by default; new `confirmedReviewDefectCount` helper, null
      when not reviewed). Every LLM boundary is an injected `ReviewRunner`;
      `defaultReviewRunner` drives the Agent SDK `query()` and returns only the
      final result text -> unit-tested with a MOCKED runner (`review.test.ts`):
      finding parse (fenced/prose/empty/ malformed/missing-title), verdict parse
      (unparseable refutes, never inflates), dedupe, the full K-reviewer ->
      dedupe -> refute-filter flow (found/confirmed counts), empty-diff
      short-circuit, refute-all path; `mechanical.test.ts` covers
      `confirmedReviewDefectCount`
- [x] 12.3 Reviewer/verifier prompts are ARM-BLIND: `buildReviewPrompt`/
      `buildVerifierPrompt` scrub every `cospec`/`openspec` identifier from the
      diff and task (`scrubArmIdentifiers` -> neutral `the-tool`) and pass the
      built prompt through `assertArmBlind`, which throws if any identifier
      survives (defense against a programming error reintroducing one) -> unit-
      tested (`review.test.ts`): `containsArmIdentifier` (case-insensitive, /g
      lastIndex reset), `scrubArmIdentifiers`, `assertArmBlind` throw/pass, both
      prompt builders arm-blind against a diff+task that name both tools, and a
      `reviewDiff` run whose mocked runner asserts every prompt it receives is
      arm-blind
- [x] 12.4 Standalone `--review-report <dir>` CLI mode (`run.ts`'s
      `reviewPastRun`, wired through `matrix.ts`'s `parseArgs`): reviews all
      cells of a PAST run from its persisted diffs (`snapshots/<cellKey>.diff`)
      with NO agent re-run, attaches confirmed-defect counts to each cell's
      mechanical metrics, and rewrites that run's `aggregate.json` +
      `summary.md` in place; cells with no persisted diff (skipped, or a
      pre-feature run) are left untouched. The inline version is gated behind
      `--review` (off by default; documented cost). Confirmed review defects
      wired into `summary.md`'s main table (`review§` column, dash when
      unreviewed, with a legend line naming the arm-blind reviewer) and into the
      paired-comparison stats (new `reviewDefects` metric — lower is better;
      renders no row when review never ran) -> unit-tested: `matrix.test.ts`
      (`--review`/`--review-report` parse + missing-value throw),
      `report.test.ts` (`meanConfirmedReviewDefects` aggregate field
      null/populated, `review§` column value + dash paths), `stats.test.ts`
      (`reviewDefects` paired comparison populated + zero-pairs-
      when-unreviewed)
- [x] 12.5 `docs/bench.md`: new "Adversarial review (bugs that slipped through)"
      section (diff persistence + exclusions, K=2 reviewers,
      refute-then-confirm, arm-blindness, `--review`/`--review-report`, cost
      note, the `review§` column) and the "Output & redaction contract" section
      updated to name the persisted diffs and the review column -> verified by
      reading the rendered doc end-to-end
- [x] 12.6 Confirm no regression: `mise run typecheck` clean, `mise run lint`
      exit 0 (no new bench warnings), `mise run format:check` clean (after one
      `format:fix` pass reformatting `src/sandbox.ts` + `review.test.ts`),
      `mise run //packages/bench:test` 201/201 pass (162 pre-existing + 39 new
      across `review.test.ts`, `sandbox.test.ts`, `matrix.test.ts`,
      `report.test.ts`, `stats.test.ts`, `mechanical.test.ts`),
      `mise run cospec     -- validate bench-cospec-vs-openspec --strict` passes
      -> unit-test count never reduced. The full 44-cell benchmark matrix was
      deliberately NOT run.

## 13. Planted latent bugs (verification-discipline signal)

- [x] 13.1 `scenarios/types.ts` gains a
      `PlantedBug {file, description,     detector}` interface and an optional
      `Scenario.plantedBug` field. The 5 heavy scenarios (`feat`, `fix`, `perf`,
      `refactor`, `revert`) each declare one, seeded ADJACENT to (never inside)
      that scenario's own task subject: `feat`'s `removeItem` (rewritten to only
      drop the FIRST matching cart line item, via findIndex/splice instead of
      filter), `fix`'s new sibling `capitalize` (`input.slice(2)` instead of
      `input.slice(1)`), `perf`'s new sibling `countUnique` (`seen.size + 1`
      fencepost error), `refactor`'s new sibling `validateAge` (`age >= 120`
      instead of `age > 120` at the upper boundary), `revert`'s new sibling
      `farewell` (`name.length > 1` instead of `name.length > 0`) -> unit-tested
      (`test/unit/planted.test.ts`): every heavy scenario declares a plant,
      matched to a real detector file -> verified with a real `bun test` run
      against each edited fixture (see 13.2)
- [x] 13.2 Re-verified, for every fixture edited in 13.1, that the plant does
      NOT break: (a) the scenario's own visible test suite (`bun test` in the
      fixture root — unchanged pass/fail counts before/after: `feat` 3/3, `perf`
      2/2, `refactor` 9/9 pass; `fix`/`revert` still fail exactly the one
      pre-existing, by-design case the task itself must fix); (b) the scenario's
      `completed` predicate (unaffected — none of it inspects the
      planted-adjacent function); (c) the existing `scenarios/hidden/<id>/`
      suite's fail-before/pass-after guarantee in `test/unit/hidden.test.ts`
      (re-run green; none of those suites reference the newly added functions)
      -> verified by direct `bun test` runs against each fixture plus a full
      `mise run //packages/bench:test` pass
- [x] 13.3 Per-plant held-out detector at `scenarios/planted/<id>/` (never
      seeded into the agent's sandbox — same discipline as `scenarios/hidden/`,
      documented in new `scenarios/planted/README.md`): one `planted.test.ts`
      per heavy scenario, each verified (13.4) to FAIL against the fixture as
      seeded and PASS once a scripted, targeted, task-independent fix patches
      only the planted line
- [x] 13.4 `src/mechanical.ts` gains
      `scorePlantedBug(repoRoot, sandbox,     scenario)`: copies
      `scenarios/planted/<id>/` into the FINISHED sandbox at `planted-check/` (a
      directory and `bun test` invocation SEPARATE from `scoreHiddenTests`'s
      `hidden-tests/`, so a plant is never folded into the escaped-defect
      tally), runs it, and returns `boolean | null` — null when the scenario has
      no plant or the summary is unparseable, else whether the detector passed.
      Wired into `MechanicalMetrics.plantedBugCaught` (both branches of
      `scoreMechanical`) -> unit-tested: `mechanical.test.ts`
      (null-when-no-plant against a real no-plant scenario, false/true against
      the real `fix` detector run over a seeded/fixed `strings.ts`),
      `test/unit/planted.test.ts` (registry integrity — every heavy scenario has
      a matching detector, `planted/<id>/` never overlaps any `fixtureDir`,
      `createArmSandbox` never seeds `planted-check/` — plus the
      fail-before/pass-after check per scenario via a scripted targeted fix
      independent of `hidden.test.ts`'s `REFERENCE_FIXES`)
- [x] 13.5 `tsconfig.json`'s `exclude` gains `scenarios/planted/**` (same reason
      as `scenarios/hidden/**` — these files assume they are copied to
      `<sandbox>/planted-check/` and import accordingly; `tsgo` cannot resolve
      that in place)
- [x] 13.6 Reporting: `AggregateRow.plantedBugCaughtRate` (mean of
      `MechanicalMetrics.plantedBugCaught` over repeats, `rate()` helper — null
      when the scenario has no plant or no cell scored it) wired into
      `summary.md`'s main table as a new `plant¶` column (dash when unscored)
      with a legend line explicitly naming it distinct from `escaped‡` (no
      double-count) -> unit-tested: `report.test.ts` (`plantedBugCaughtRate`
      null/populated aggregate cases, `plant¶` column value + dash rendering
      paths)
- [x] 13.7 `docs/bench.md`: new "Planted bugs (verification-discipline signal)"
      section (mechanism, the 5 planted defects, `plantedBugCaught`,
      explicitly-not-a-double-count framing, the `plant¶` column) plus a bullet
      in "Mechanical metrics" and an update to "Output & redaction contract"
      naming the new column -> verified by reading the rendered doc end-to-end
- [x] 13.8 Confirm no regression: `mise run typecheck` clean, `mise run lint`
      exit 0 (no new bench warnings — only pre-existing unrelated warnings in
      `apps/cli`), `mise run format:check` clean (after one `format:fix` pass
      reformatting `docs/bench.md`, this change's `proposal.md`, `report.ts`,
      `mechanical.test.ts`, `scenarios/planted/README.md`),
      `mise run //packages/bench:test` 218/218 pass (201 pre-existing + 17 new
      across `planted.test.ts` (new file, 10 tests), `mechanical.test.ts` (3),
      `report.test.ts` (4)),
      `mise run cospec -- validate     bench-cospec-vs-openspec --strict` passes
      -> unit-test count never reduced. The full 44-cell benchmark matrix was
      deliberately NOT run.

## 14. Opt-in `-hard` variants (multi-file, higher-stakes)

- [x] 14.1 5 new multi-file fixtures under `scenarios/fixtures/<type>-hard/`
      (8-15 files each, real state/error-paths/boundary conditions, a task
      spanning 3+ files): `feat-hard` (an inventory/cart/pricing/orders checkout
      library — 11 files; task adds store credit, touching `types.ts`,
      `pricing.ts`, `orders.ts`), `fix-hard` (a token-bucket rate limiter split
      into `bucket.ts`/`store.ts`/`limiter.ts` — 10 files; three related bugs,
      one per file: a `Math.floor` fractional-second refill truncation, a
      `capacity - 1` reset off-by-one, and a missing `store.set` that silently
      never persists consumed tokens), `perf-hard`
      (`dedupe`/`groupBy`/`searchBatch` across 3 files, each O(n^2) or
      O(queries*docs*words) — 10 files; `bench/measure.ts` checks correctness +
      an independent speed threshold per function, calibrated empirically: naive
      ~400ms/~207ms/~400ms vs optimized ~1ms/~2ms/~7ms on this machine),
      `refactor-hard` (the same non-empty-string guard duplicated across THREE
      SEPARATE FILES — `email.ts`/`username.ts`/`password.ts`, not three
      functions in one file — 10 files; task removes the duplication across all
      three), `revert-hard` (a single "hype rebrand" regressed
      `greet`/`formatDisplayName`/`formatPrice` across
      `greet.ts`/`format.ts`/`currency.ts`, documented in one shared
      CHANGELOG.md — 10 files; task reverts all three) -> every fixture's
      visible test suite verified green as authored (`bun test .` in each
      fixture root: feat-hard 20/20, perf-hard 7/7, refactor-hard 9/9 pass;
      fix-hard 10/15 pass with the 5 expected pre-seeded failures across all 3
      bug files; revert-hard 0/3 pass, all 3 failing exactly as documented by
      CHANGELOG.md)
- [x] 14.2 `scenarios/types.ts` already supports `id !== type` (`PlantedBug` +
      `Scenario.id`/`Scenario.type` were already separate fields from task #3) —
      no change needed. New
      `scenarios/{feat,fix,perf,refactor,revert}     -hard.ts` scenario
      definitions: `id` suffixed `-hard`, `type` stays the BASE cospec type
      (e.g. `feat-hard` is `type: 'feat'`, so `src/mechanical.ts`'s
      artifact-proportionality scoring — keyed off `scenario.type` via canon
      `TYPE_ARTIFACTS` — treats it exactly like a `feat` change),
      `maxTurns: 150` (vs. 70/120 for the standard scenarios), a `completed`
      predicate, and a `plantedBug`. `scenarios/index.ts` gains `HARD_SCENARIOS`
      (the 5 hard variants, separate from the untouched 11-scenario `SCENARIOS`
      core registry) and `ALL_SCENARIOS` (their union); `scenarioById` now
      searches `ALL_SCENARIOS` so a hard id resolves -> unit-tested:
      `test/unit/scenarios-hard.test.ts` (new, 11 tests) — exactly 5, one per
      heavy type; ids suffixed `-hard`; a hard variant shares its base `type`
      with (but never the same `id` as) the regular scenario of that type;
      `SCENARIOS`' own "exactly 11" invariant left untouched; `ALL_SCENARIOS` is
      exactly 16 with unique ids; `scenarioById` resolves every id in the union;
      fixtureDir/maxTurns/prompt/title/completed/ plantedBug all present and
      well-formed
- [x] 14.3 `src/matrix.ts` gains a `--hard` boolean flag (`MatrixFilters.hard`).
      `expandMatrix`'s DEFAULT (no `--scenario` filter) axis excludes any
      `-hard`-suffixed id unless `--hard` is set; an EXPLICIT
      `--scenario feat-hard` always resolves regardless of `--hard`, since it is
      matched directly against `availableIds`. `src/run.ts` passes
      `ALL_SCENARIOS`' ids as `availableIds` unconditionally (so an explicit
      hard id is never reported "unknown") and reads `scenarioSentinels()` from
      `ALL_SCENARIOS` (so hard-variant `BENCH-*-HARD` prompt refs are redacted
      too) -> unit-tested: `matrix.test.ts` (`--hard` parses with no value; the
      default axis excludes `-hard` ids unless `--hard` is set; an explicit
      `--scenario feat-hard` resolves regardless of `--hard`)
- [x] 14.4 Held-out hidden suites at `scenarios/hidden/<id>-hard/` (8-12 cases
      each, vs. 4-8 for the standard scenarios — same never-seeded discipline as
      `scenarios/hidden/<id>/`), and planted-bug detectors at
      `scenarios/planted/<id>-hard/` (one plant per hard variant, adjacent to
      but never inside its task subject: `feat-hard`'s `releaseStock` off-by-one
      capacity cap, `fix-hard`'s `isBucketFull` boundary comparison,
      `perf-hard`'s `countGroups` fencepost, `refactor-hard`'s `validateAge`
      boundary, `revert-hard`'s `initials` missing separators) -> unit-tested in
      two NEW files (kept separate from `hidden.test.ts`/ `planted.test.ts` so
      those files' tighter 4-8 case bound and the core-11/5-heavy invariants
      stay pure statements about the core registry):
      `test/unit/hidden-hard.test.ts` (9 tests — 8-12 case count per suite, no
      fixtureDir overlap, a scripted reference fix per hard scenario
      (`REFERENCE_FIXES_HARD`), `createArmSandbox` never seeds `hidden-tests/`
      into a hard-variant sandbox, and a real fail-before/pass-after
      `scoreHiddenTests` run per scenario) and `test/unit/planted-hard.test.ts`
      (10 tests — registry integrity + `PLANTED_FIXES_HARD`
      fail-before/pass-after `scorePlantedBug` run per scenario)
- [x] 14.5 Fixed a related latent report/stats bug this feature would have
      exposed the moment a `-hard` cell and its base scenario ran in the same
      matrix: `CellResult`/`AggregateRow` (`src/report.ts`) and
      `PairedComparisonGroup` (`src/stats.ts`) grouped/displayed by
      `scenarioType` (sourced from `Scenario.type`), which is NOT unique once a
      hard variant shares a base type with its regular counterpart — a `feat`
      cell and a `feat-hard` cell would have silently merged into one
      `summary.md` row and been wrongly cross-paired in the paired-comparison
      stats. Renamed the field to `scenarioId` throughout (sourced from
      `Scenario.id`/`Cell.scenarioId`, which is unique across every registered
      scenario — the 11 core ids never differed from their type anyway, so this
      is a NO-OP for every existing report), including the `summary.md` column
      header (`type` -> `scenario`) and the "Paired comparison" table header ->
      unit-tested: `report.test.ts` (new case: a `feat`/`feat-hard` pair of
      results produces 2 separate aggregate rows, not 1), `stats.test.ts` (new
      case: a `feat`/`feat-hard` pair across arms produces 0 matched pairs per
      metric, never cross-paired) — plus every pre-existing `scenarioType`-keyed
      test/fixture-factory mechanically renamed to `scenarioId`
      (behavior-preserving; values unchanged)
- [x] 14.6 `docs/bench.md`: new "Hard-mode variants (opt-in, `--hard`)" section
      with a **cost warning** (multi-file, `maxTurns: 150`, meaningfully pricier
      per cell than a standard cell of the same type; `--hard` grows the
      scenario-id count from 11 to 16), the mechanism
      (`HARD_SCENARIOS`/`ALL_SCENARIOS`, id-vs-type distinction, default-axis
      gating), and usage examples; `--hard` added to the CLI-flags table; the
      "Output & redaction contract" section updated to name the
      scenario-id-not-type grouping fix -> verified by reading the rendered doc
      end-to-end
- [x] 14.7 Confirm no regression: `mise run typecheck` clean, `mise run lint`
      exit 0 (no new bench warnings — only pre-existing unrelated warnings in
      `apps/cli`), `mise run format:check` clean (after one `format:fix` pass
      reformatting `docs/bench.md`, this change's `tasks.md`/`proposal.md`,
      `scenarios/index.ts`, `src/matrix.ts`, and several new fixture/test
      files), `mise run //packages/bench:test` 253/253 pass (218 pre-existing +
      35 new across `scenarios-hard.test.ts` (11, new file),
      `hidden-hard.test.ts` (9, new file), `planted-hard.test.ts` (10, new
      file), `matrix.test.ts` (3), `report.test.ts` (1), `stats.test.ts` (1)),
      `mise run cospec -- validate bench-cospec-vs-openspec --strict` passes ->
      unit-test count never reduced. The full 44-cell (or 64-cell with `--hard`)
      benchmark matrix was deliberately NOT run.

## 15. End-to-end verification pass (full gate + registry integrity + live smokes)

- [x] 15.1 `mise run check` from repo root -> green with no fallout to fix: lint
      (0 errors; only the 3 pre-existing `apps/cli` unicorn warnings),
      format:check, typecheck (`cospec`, `cospec-bench`, `e2e/tsconfig.json`),
      `generate:check` (no drift), `agents:check` (shared blocks in sync),
      `vendor:openspec:check`, `cospec-validate-all` (0 errors/warnings across 2
      changes/12 specs), `openspec:schema:validate` (all 11 schemas valid), and
      every test project: `apps/cli` unit 543/543, integration 92/92, contract
      29/29; `packages/bench` 253/253; `e2e` release-test 14/14
- [x] 15.2 Registry invariants re-confirmed: `SCENARIOS` = 11 (one per cospec
      schema type), `HARD_SCENARIOS` = 5, `ALL_SCENARIOS` = 16 unique ids,
      `scenarioById` resolves all 16 -> read `scenarios/index.ts` directly
- [x] 15.3 Wrote one throwaway scratchpad script (deleted after use, per
      instructions — never checked in) that re-ran, independently of the
      permanent suite, the scripted fail-on-seed/pass-on-reference check for all
      16 scenarios across 3 signals: the scenario's own `completed` predicate
      (false on the unmodified fixture, true after the scripted correct
      reference fix), the held-out hidden-test suite (`failed > 0` before,
      `failed === 0` after), and the planted-bug detector where declared
      (`false` before, `true` after the scripted targeted fix; `n/a` for the 6
      scenarios with no plant). Result: **16/16 scenarios, all applicable checks
      OK** (48 cells checked: 16 completed + 16 hidden + 10 planted + 6 n/a) ->
      full 16x3 matrix:

      | id | completed(before→after) | hidden.failed(before→after) | planted(before→after) |
      | --- | --- | --- | --- |
      | build | false→true | 4→0 | n/a |
      | chore | false→true | 2→0 | n/a |
      | ci | false→true | 3→0 | n/a |
      | docs | false→true | 3→0 | n/a |
      | feat | false→true | 7→0 | false→true |
      | fix | false→true | 5→0 | false→true |
      | perf | false→true | 2→0 | false→true |
      | refactor | false→true | 1→0 | false→true |
      | revert | false→true | 5→0 | false→true |
      | style | false→true | 2→0 | n/a |
      | test | false→true | 4→0 | n/a |
      | feat-hard | false→true | 10→0 | false→true |
      | fix-hard | false→true | 9→0 | false→true |
      | perf-hard | false→true | 3→0 | false→true |
      | refactor-hard | false→true | 1→0 | false→true |
      | revert-hard | false→true | 9→0 | false→true |

- [x] 15.4 Live smoke (a):
      `mise run bench -- --scenario ci --arm openspec     --model claude-sonnet-5`
      -> ran 1 cell, `done (success)`; confirmed in the fresh report:
      `hiddenTests: {total:4, failed:0}` and `escaped‡ 0.0/4.0` in `summary.md`;
      `schemaConformance` populated and the `conformance*` column/legend present
      (relabel landed); `snapshots/ci__openspec__claude-     sonnet-5__r1.diff`
      persisted (the `.github/workflows/lint.yml` addition, redacted).
      Telemetry: 120905ms, $1.1275, 62 tok-in / 6923 tok-out
- [x] 15.5 Live smoke (b): standalone review mode over that same report dir —
      `mise run bench -- --review-report <dir>` ->
      `reviewed     ci__openspec__claude-sonnet-5__r1 — found 0, confirmed 0`;
      rewrote `aggregate.json`
      (`mechanical.reviewDefects: {found:0, confirmed:0}`) and `summary.md`
      (`review§` column now `0.0` instead of a dash) in place. 0 confirmed is a
      legitimate outcome for a single-file CI-workflow diff; no "review failed"
      warning was logged, so the K=2 reviewer pass ran for real. Arm-blindness
      relies on `review.ts`'s `assertArmBlind` (unit-tested in
      `test/unit/review.test.ts`), not re-verified by hand here
- [x] 15.6 Live smoke (c): planted-bug cell —
      `mise run bench -- --scenario fix     --arm cospec --model claude-sonnet-5`
      -> ran 1 cell, `done (success)`; `mechanical.plantedBugCaught: false`
      populated (a real, non-fabricated value — the agent correctly fixed
      `truncate` per the diff and hidden suite
      (`hiddenTests: {total:5, failed:0}`) but left the adjacent `capitalize`
      off-by-one untouched, exactly the discrimination the plant is designed to
      catch). Telemetry: 112729ms, $0.7242, 62 tok-in / 6392 tok-out
- [x] 15.7 **Harness bug found and fixed via smoke (c)**: `taskCompleted` was
      `false` for the fix-scenario cell above even though the agent's diff
      correctly fixed `truncate` alone (confirmed by reproducing the identical
      diff against a fresh sandbox in isolation, where `completed` returned
      `true`). Root cause: `scoreMechanical` runs `scoreHiddenTests` and
      `scorePlantedBug` — which each `cp` a scratch suite into the sandbox at
      `<sandbox>/hidden-tests/` and `<sandbox>/planted-check/` respectively and
      never removed it — BEFORE `taskCompleted`, and 8 of the 11 core scenarios'
      (and all 5 hard variants') own `completed` predicates spawn a bare,
      unscoped `bun test` at the sandbox ROOT. That later invocation recursively
      picked up the leftover `hidden-tests/*.test.ts` and
      `planted-check/*.test.ts` files alongside the real suite — for `fix`,
      `planted-check/planted.test.ts` asserts the (still-unfixed) `capitalize`
      plant, which failed and flipped the sandbox-root `bun test` exit code to
      nonzero, corrupting `taskCompleted` to `false` for a cell that actually
      completed its task. Reproduced directly (`bun test` at a scratch sandbox
      root with both leftover dirs present: exit 1, 2 failures) before fixing.
      **This was invisible to every prior verification pass** (including 15.3's
      own fresh-scratch-per-check matrix) because those checks always scored
      `completed`/hidden/planted from separate, independently-seeded scratch
      copies — never all three against the SAME directory in the same order
      `scoreMechanical` uses in production, which is the only place the
      interaction occurs
- [x] 15.8 Fix: `scoreHiddenTests`/`scorePlantedBug` (`src/mechanical.ts`) now
      `rm(dest, {recursive:true, force:true})` their copied directory in a
      `finally` block before returning (success or thrown), so neither
      `hidden-tests/` nor `planted-check/` ever persists past its own scoring
      call regardless of downstream call order -> re-verified the exact fix
      repro (same diff, same sandbox shape): 0 leftover dirs after scoring, bare
      `bun test` at sandbox root now exits 0
- [x] 15.9 Re-ran smokes (a) and (c) unaffected by the fix (ci scenario's
      `completed` never called `bun test` at the point of failure risk — the
      `openspec` arm result was already correct — but its own generated
      `.github/workflows/` structure is untouched by this change) and added 2
      permanent regression tests (`test/unit/mechanical.test.ts`): one per
      function, seeding a real `src/strings.ts` + passing `src/strings.test.ts`
      visible suite, asserting the copied directory is gone (`existsSync` false)
      and that a subsequent bare `spawnIn(['bun',     'test'], sandbox)` at the
      sandbox root exits 0 -> `mise run     //packages/bench:test` 255/255 pass
      (253 pre-existing + 2 new; none removed)
- [x] 15.10 Full gate re-confirmed after the fix: `mise run typecheck` clean,
      `mise run lint` exit 0 (same 3 pre-existing unrelated warnings only),
      `mise run format:check` clean (no diff from a `format:fix` pass — this
      change's edits were already correctly formatted),
      `mise run     //packages/bench:test` 255/255,
      `mise run cospec -- validate     bench-cospec-vs-openspec --strict` passes
      (0 errors/warnings)

## 16. Results publishing (RESULTS.md + README managed block)

- [x] 16.1 `src/report.ts` refactored (no behavior change for `summary.md`):
      extracted `renderRunMetaLines` (the `- run:`/`- claude code:`/`- judge:`/
      `- cells:` block) and `renderSummaryBody` (the table, legend, "Repeat
      spread", and "Paired comparison" sections — everything below the
      run-metadata block) out of `writeMarkdown`, which now just concatenates
      them plus the title and writes the file — byte-identical output.
      Grouping-reduction itself factored into a new `reduceGroup` (every
      `AggregateRow` field except the grouping keys), reused by both `aggregate`
      (groups by scenarioId+arm+model, unchanged behavior) and a new
      `aggregateByArmModel` (groups by arm+model ONLY, collapsing every scenario
      into one row — the reduction a new `renderCompactArmModelMarkdown` renders
      for the README's compact table) — a "mean cost" can never quietly mean two
      different things between `summary.md` and the README block since both
      trace back to the same `reduceGroup` -> unit-tested: all 262 pre-existing
      `report.test.ts`/other bench tests still pass unchanged (byte-identical
      `writeMarkdown` output confirmed via the pre-existing assertions), new
      coverage added in 16.5 below
- [x] 16.2 New `src/sentinels.ts`: `scenarioSentinels`/`buildSentinels` moved
      out of `run.ts` (which has a top-level `process.exit(await main())` side
      effect on import — unsafe to import from a standalone tool or test) so
      both the live runner and the new standalone publish path can build
      sentinels without executing the CLI entry point. `run.ts` imports from
      here now; behavior unchanged (verified: full `//packages/bench:test` suite
      green with no assertions touching sentinel construction affected)
- [x] 16.3 New `src/publish.ts`: `collectGitInfo` (spawns real
      `git rev-parse     HEAD` / `git remote get-url origin` /
      `git describe --tags     --exact-match` / `git status --porcelain` /
      `git branch --show-current` — no caching, no guessing),
      `parseGitHubRemote` (handles both `https://` and `git@github.com:` remote
      URL forms, derives org/repo from whatever remote is actually configured —
      never hardcoded), `commitUrl`, `buildProvenance`/`renderProvenanceLines`
      (commit hyperlink, tag if HEAD is exactly tagged, ISO publish date, Claude
      Code version, distinct arms/model+effort pairs actually present in the
      results, cell/repeat counts, judge status, and an explicit **WARNING**
      banner — never blocking, per the design's "still publishes" requirement —
      when the working tree was dirty or the branch wasn't `main`),
      `renderResultsMarkdown` (provenance + `report.ts`'s `renderSummaryBody`,
      REUSED not duplicated), `renderReadmeBlock` (provenance +
      `renderCompactArmModelMarkdown` + a link out to `RESULTS.md`),
      `replaceMarkerBlock` (idempotent
      `<!-- bench:start -->`/`<!-- bench:end -->` replace mirroring
      `scripts/mise-tasks/agents/sync`'s CLAUDE.md shared-block pattern — insert
      before the first `## License` heading, or append at the end, when markers
      are absent), and `publishResults`/`publishFromReportDir` (orchestration,
      the latter reading a past run's `aggregate.json` back off disk with no
      agent re-run, rejecting — with an actionable error, not a silent garbage
      render — a report predating the `scenarioId` field on `CellResult`, per
      16.7 below). Every write passes through the existing `assertRedacted`
      self-check before touching disk, exactly like every other bench artifact
- [x] 16.4 CLI wiring: `src/matrix.ts` gains `--publish` (boolean,
      `MatrixFilters.publish`) and `--publish-from <dir>`
      (`MatrixFilters.publishFrom`), the latter validated mutually exclusive
      with every cell-selecting flag (`--scenario`/`--arm`/`--model`/`--smoke`/
      `--hard`/`--review`), `--publish`, and `--review-report` (each of
      `--publish-from`/`--review-report` is its own standalone mode; only one
      may run per invocation) — `parseArgs` throws immediately on any of these
      combinations rather than silently picking one. `src/run.ts`'s `main()`
      dispatches `--publish-from` to a new `publishPastRun` (thin wrapper around
      `publish.ts`'s `publishFromReportDir`, exit 2 with the thrown message on
      failure) BEFORE the existing `--review-report` dispatch, and a live run's
      tail calls `publishResults` when `filters.publish` is set, after the usual
      `writeAggregate`/`writeMarkdown` -> unit-tested (`matrix.test.ts`: 7 new
      cases — `--publish` parses with no value, `--publish-from` both
      `--flag value`/`--flag=value` forms, missing-value throw, and all 4
      mutual-exclusion throw cases: combined with a cell-selecting flag, with
      `--publish`, with `--review-report`, and parsing cleanly alone)
- [x] 16.5 `src/agent.ts`: confirmed (not a new bug — the pre-existing
      `env: { ...process.env, CLAUDE_CODE_EFFORT_LEVEL: effort }` already spread
      `process.env` first) that the harness's account-routing mechanism works,
      and made it independently testable/documented rather than an inline object
      literal: extracted `buildAgentEnv(effort)`, confirmed against the
      installed `@anthropic-ai/claude-agent-sdk`'s `sdk.d.ts`
      (`Options.env?: Record<string, string>`, doc'd "Environment variables to
      set for Claude Code sessions") that the SDK forwards `env` verbatim to the
      spawned Claude Code child process, so `CLAUDE_CONFIG_DIR` (this repo's
      multi-account switch — see the root `CLAUDE.md`) set on the invoking shell
      reaches the agent that actually authenticates -> new
      `describe('buildAgentEnv', …)` in `test/unit/agent.test.ts` (3 cases:
      `CLAUDE_CONFIG_DIR` forwarded verbatim, `CLAUDE_CODE_EFFORT_LEVEL`
      overlaid without dropping other parent vars — spot-checked against `PATH`
      — and the overlay always winning even if the parent shell already set
      `CLAUDE_CODE_EFFORT_LEVEL` to something stale)
- [x] 16.6 Unit tests (`test/unit/publish.test.ts`, new — 25 cases):
      `parseGitHubRemote` (https with/without `.git`, ssh form, throws on a
      non-GitHub remote), `commitUrl` (never hardcodes org/repo — built from
      whatever `GitInfo` is passed), `renderProvenanceLines` with MOCKED git
      info (commit link/date/claude-code/models/cells/judge rendering, the tag
      note, the WARNING banner on dirty and on non-main branch separately,
      confirmed it never throws — "still publishes" — and the judge-enabled
      case), `renderResultsMarkdown`/`renderReadmeBlock` (provenance + shared
      body present in RESULTS.md; the README block is compact — no "Paired
      comparison" noise — and links out to RESULTS.md), `replaceMarkerBlock`
      (in-place replace leaving surrounding content untouched, idempotent
      double-replace, insert-before-License when markers are absent,
      append-at-end when there's no License section either, and idempotent
      insert-then-replace across the marker-creation boundary), `publishResults`
      (writes both files + returns their paths, creates `README.md` fresh when
      absent, republishing twice never duplicates the marker block, throws the
      redaction self-check on a planted sentinel), and `publishFromReportDir`
      OVER TWO NEW FIXTURE REPORT DIRS (`test/fixtures/report-min/` —
      current-schema, 2 cells, cospec+openspec — publishes correctly with no
      agent re-run; `test/fixtures/report-stale/` — modeled on the
      pre-`scenarioId`-rename schema — confirms the predates-scenarioId
      rejection fires instead of silently grouping under the literal string
      "undefined"; plus a missing-`aggregate.json` throw)
- [x] 16.7 **Live-verified real bug found via the merged report named in the
      task**:
      `mise run bench -- --publish-from     packages/bench/reports/2026-07-16-full-run-merged`
      (the exact path named in this task's instructions) does NOT work — that
      dir predates the `scenarioId` rename (task 14.5) and the
      `schemaConformance` rename (task 10.1): its cells carry
      `scenarioType`/`cospecValidate` instead of
      `scenarioId`/`schemaConformance`, and have no `hiddenTests`/
      `reviewDefects`/`plantedBugCaught` fields at all. Reproduced BEFORE
      writing the guard: without it, `aggregate()`/`aggregateByArmModel` would
      have silently grouped every cell under the literal key
      `"undefined|cospec|claude-opus-4-8"` and rendered `undefined` scenario
      names rather than failing loudly. Fixed with the `publishFromReportDir`
      guard in 16.3 (surfaced as a specific unit test in 16.6); this is a
      genuine repo-state discovery (that directory is stale, pre-dating several
      fields this same change's earlier tasks added), not something this stage
      silently patched — flagging the directory as stale is in-scope for
      `publish.ts`'s own correctness, migrating or regenerating that old report
      is not, and is left for whoever wants a fresh full-matrix publish
- [x] 16.8 Live smokes, both directions, confirming the exact behavior 16.7
      describes: (a)
      `mise run bench -- --publish-from reports/2026-07-16-full-run-merged` ->
      exit 2,
      `predates the scenarioId field on CellResult and cannot be     republished`,
      no files written; (b)
      `mise run bench -- --publish-from     reports/2026-07-17T01-34-09-589Z` (a
      real current-schema single-cell report from this change's own earlier
      live-smoke history) -> exit 0,
      `bench — published <repoRoot>/packages/bench/RESULTS.md and     <repoRoot>/README.md from reports/2026-07-17T01-34-09-589Z`;
      inspected both files by hand: `RESULTS.md` carried a correct
      commit-hyperlink provenance header, the `fix`/`cospec`/`claude-sonnet-5`
      row, the legend, and both stats sections; `README.md` gained a
      `<!-- bench:start -->`/ `<!-- bench:end -->` block inserted correctly
      immediately before `## License`, with a matching compact table and a link
      to `packages/bench/RESULTS.md`. Because the working tree was dirty (this
      change in progress) and the branch was `worktree-bench-cospec-vs-openspec`
      (not `main`), the rendered WARNING banner correctly fired in both files,
      naming both reasons — confirming the disclosure-not-gate behavior live,
      not just in mocked unit tests. Also live-verified the CLI's
      mutual-exclusion guards from a real invocation (not just
      `matrix.test.ts`'s unit coverage):
      `--publish-from <dir>     --scenario ci`,
      `--publish-from <dir> --publish`, and
      `--publish-from     <dir> --review-report <dir2>` each exit 2 with the
      expected message before touching any file. **Reverted the demo
      `RESULTS.md`/`README.md` writes afterward** (`git checkout -- README.md`,
      removed the untracked `RESULTS.md`) — a single-cell smoke run from a
      dirty, non-main branch is not the real published benchmark result this
      repo should ship in its README, per the "canonical publish is from a clean
      main" convention documented in 16.9; the mechanism is proven live, the
      committed content is left for an actual clean-main full-matrix publish
- [x] 16.9 `docs/bench.md`: flags table gains `--publish`/`--publish-from` rows;
      the brief inline auth note in "Running it" replaced with a link to a new
      "Auth" section (default inherits the session account; override with
      `CLAUDE_CONFIG_DIR`, with the exact mechanism — `buildAgentEnv` spreading
      `process.env` before the effort-level overlay — spelled out); new
      "Publishing" section (the two committed artifacts and what each contains,
      the two flags and their mutual exclusivity, the full provenance field
      list, the WARNING-banner-is-a-disclosure-not-a-gate behavior, and the
      canonical-publish-from-clean-main convention with the
      point-in-time-honesty rationale); "Output & redaction contract" section
      gains a closing paragraph naming `RESULTS.md`/the README block as the only
      two NOT-git-ignored bench artifacts and confirming they pass the same
      redaction self-check -> verified by reading the rendered doc end-to-end
- [x] 16.10 Confirm no regression: `mise run typecheck` clean, `mise run lint`
      exit 0 (same 3 pre-existing unrelated `apps/cli` warnings only),
      `mise run format:check` clean (after one `format:fix` pass reformatting
      `docs/bench.md`, `publish.ts`, `publish.test.ts`, and the two new fixture
      JSON files), `mise run //packages/bench:test` 290/290 pass (255
      pre-existing + 35 new: 25 in `publish.test.ts`, 7 in `matrix.test.ts`, 3
      in `agent.test.ts`), `mise run check` green end-to-end from repo root
      (lint/format/typecheck/`generate:check`/`agents:check`/
      `vendor:openspec:check`/`cospec-validate-all`/`openspec:schema:validate`
      plus every test project: `apps/cli` unit 543/543, integration 92/92,
      contract 29/29; `packages/bench` 290/290; `e2e` release-test 14/14),
      `mise run cospec -- validate bench-cospec-vs-openspec --strict` passes (0
      errors/warnings). `git status` confirms only the intended files changed
      (`docs/bench.md`, `src/{agent,matrix,report,run}.ts`,
      `test/unit/{agent,matrix}.test.ts` modified; `src/{publish,sentinels}.ts`,
      `test/unit/publish.test.ts`, `test/fixtures/report-{min,stale}/` new) — no
      stray `RESULTS.md`/`README.md` demo output left over from 16.8

## 17. Resumable runs (`--resume`)

- [x] 17.1 `src/matrix.ts`: `MatrixFilters` gains `resume?: string`; `parseArgs`
      gains `--resume <dir>` (both `--flag value` and `--flag=value` forms).
      Mutually exclusive with the two OTHER standalone modes only —
      `--review-report` and `--publish-from` — since `--resume` runs the matrix
      (or backfills review on it), unlike those two; it composes normally with
      every axis flag plus `--review`/`--publish`, per the task spec ("the
      caller passes the same flags as the original run, plus `--resume <dir>`").
      `--publish-from`'s existing cell-selecting-flags guard extended to also
      reject `--resume` (it is itself a standalone, non-cell-selecting mode, but
      combining two standalone modes in one invocation is exactly the ambiguity
      that guard exists to prevent) -> `matrix.test.ts` new cases: value parsing
      (both forms), missing-value error, composition with `--hard`/`--repeats`/
      `--review`/`--publish` in one invocation, and both directions of the
      `--resume`×`--review-report`/`--publish-from` mutual-exclusion errors
- [x] 17.2 `src/report.ts` gains two exports shared by `--resume` and (via a
      refactor) `--publish-from`: `readCellsJsonl(runDir)` — parses
      `cells.jsonl` back into `CellResult[]`, throwing an actionable error for a
      missing file or an unparseable row (a resumed run may have NO
      `aggregate.json` yet, since that is only ever written once at the very end
      of a full run, so `--resume`'s validation reads the live `cells.jsonl`
      instead) — and `isStaleSchema(cells)` (the predates-`scenarioId` check,
      factored out of `publish.ts`'s inline version so `--resume` and
      `--publish-from` share exactly one schema check rather than two that could
      drift) -> `report.test.ts` new cases: round-trip read of appended rows in
      order, missing-file error, corrupt-row error, trailing-blank-line
      tolerance; `isStaleSchema` true/false/ skipped-exempt cases.
      `publish.ts`/`publish.test.ts` re-verified unaffected by the refactor
      (same 25 cases still pass, same error message text)
- [x] 17.3 New `src/resume.ts` — pure logic only (no filesystem/subprocess),
      deliberately split out of `run.ts` because `run.ts` self-executes
      `process.exit(await main())` on import and so cannot itself be
      unit-imported: `completedCellKeys(existing)` (the `cellKey` set already
      present in a loaded report — confirms point 2 of the task, "cellKey
      already exists" and already embeds the repeat index, e.g.
      `perf__cospec__claude-sonnet-5__r2`, so skip-matching is inherently
      per-repeat, not per-scenario); `partitionResumeCells(cells, existing)` ->
      `{ toRun, skipped }`, splitting the FULL requested-matrix expansion by
      `cellKey` membership; `needsReviewBackfill(result)` — true only for a
      non-skipped, mechanically-scored cell with no `reviewDefects` yet (point 3
      of the task: review results live on `MechanicalMetrics.reviewDefects`, so
      "already reviewed" is exactly "`reviewDefects !== undefined`") ->
      `resume.test.ts` (new, 10 cases): skip-set computation from a constructed
      multi-scenario/arm/model/repeat matrix (mirrors the real partial run this
      change dry-verified against — see 17.6), the per-repeat identity case
      (repeats 1-2 present, 3 missing -> only repeat 3 runs), empty-existing-set
      (fresh-run equivalence) and all-already-complete (nothing to run) edge
      cases, and `needsReviewBackfill`'s four cases
      (unreviewed/already-reviewed/skipped/ no-mechanical)
- [x] 17.4 `src/run.ts` wired to the above: on `--resume`, `runDir` becomes the
      given directory (skipping `ensureRunDir`'s fresh-timestamp path entirely)
      and `readCellsJsonl` + `isStaleSchema` gate it exactly like
      `publishFromReportDir` gates `--publish-from` (missing dir -> exit 2 with
      "no cells.jsonl under ..."; stale schema -> exit 2 naming the `scenarioId`
      field, mirroring `publish.ts`'s message). `expandMatrix` is called exactly
      as a fresh run would (same `availableIds`/`filters`), then
      `partitionResumeCells` splits it; only `toRun` goes through `runPool`,
      each fresh result appended to the SAME `cells.jsonl` via the existing
      `appendCellResult` (already append-only — no code change needed there) and
      new snapshots/diffs written into the same `snapshots/` dir via the
      existing `writeArtifactSnapshot`/`writeCellDiff` (same reason — already
      keyed by `cellKey` under the given `runDir`, so "copy new snapshots
      alongside existing ones" falls out for free). `--review` additionally runs
      a new `backfillReview` pass over `existingResults` first, reviewing any
      cell `needsReviewBackfill` flags via its persisted diff (`readCellDiff`)
      and the same `reviewDiff`/`defaultReviewRunner` inline review already uses
      — mirroring `reviewPastRun`'s per-cell logic exactly, but writing the
      result back onto the in-memory `CellResult` rather than a whole past run's
      `aggregate.json`. At the end, `[...existingResults,     ...freshResults]`
      — old + new — is what `writeAggregate`/`writeMarkdown` (and `--publish`)
      render from, so a resumed run's report always reads as one complete matrix
- [x] 17.5 `docs/bench.md`: flags table gains a `--resume <dir>` row, pointing
      at a new "Resuming a run" section (placed just before "Publishing"):
      states plainly that interrupted runs lose nothing (every cell result is
      appended to `cells.jsonl` as it finishes), that the caller passes the SAME
      flags as the original run plus `--resume <dir>` (with the correctness
      argument: `expandMatrix` is a pure function of `(availableIds, filters)`,
      so identical flags reproduce an identical cell set in the same order,
      which is what makes skip-matching correct), and walks the 5-step mechanism
      (schema-checked load, skip-matching via `cellKey` including the repeat
      index, running only the missing cells, the inline-review backfill and its
      never-re-reviews-a-reviewed-cell guarantee, and the full-set
      aggregate/summary regeneration) -> verified by reading the rendered
      section end-to-end against the actual `resume.ts`/`run.ts` behavior
- [x] 17.6 **Dry-run skip-set verification against the real partial run**,
      READ-ONLY (no cells run, no files written) — per the task's explicit
      instruction not to run any cells: identified
      `packages/bench/reports/2026-07-17T20-01-31-623Z/` (81 rows in
      `cells.jsonl`, the newest report dir at/after 2026-07-17T19:5x with no
      `aggregate.json`, i.e. genuinely interrupted mid-run) as the target. A
      throwaway scratchpad script
      (`packages/bench/scripts_dry_verify_scratch.ts`, deleted after use, per
      15.3's convention) called `readCellsJsonl` + `isStaleSchema` on that dir,
      `parseArgs(['--hard',     '--repeats', '3'])` + `expandMatrix` over
      `ALL_SCENARIOS` to reconstruct the original run's full 192-cell matrix (16
      scenario ids incl. `-hard` × 2 arms × 2 models × 3 repeats), then
      `partitionResumeCells` against the 81 loaded rows. Result: **81 skipped
      (already-complete), 111 to run** — matching the task's stated expectation
      exactly. `isStaleSchema` was `false` (current schema, resumable). The 111
      missing cells break down as `perf` (3 — only the `claude-opus-4-8` repeats
      never ran) plus 9 whole scenarios untouched (`refactor`, `revert`,
      `style`, `test`, `feat-hard`, `fix-hard`, `perf-hard`, `refactor-hard`,
      `revert-hard`) × 2 arms × 2 models × 3 repeats = 12 each. Full
      missing-cell-key listing captured in this task's PR description /
      conversation log. `git status` confirmed no report dirs were touched by
      this verification
- [x] 17.7 Confirm no regression: `mise run typecheck` clean (both
      `@aligned-team/cospec-bench` and `@aligned-team/cospec` projects, plus
      `e2e`), `mise run lint` exit 0 (same 3 pre-existing unrelated `apps/cli`
      warnings only, none new), `mise run format:check` clean (after one
      `format:fix` pass reformatting `docs/bench.md`, `run.ts`, and
      `resume.test.ts`'s import ordering), `mise run //packages/bench:test`
      313/313 pass (290 pre-existing + 23 new: 10 in `resume.test.ts`, 9 in
      `report.test.ts` (`readCellsJsonl` ×4, `isStaleSchema` ×3, the merged
      old+new aggregate case ×1 — plus the pre-existing publish-refactor
      coverage unaffected), 4 in `matrix.test.ts`), `mise run check` green
      end-to-end from repo root (lint/format/typecheck/`generate:check`/
      `agents:check`/`vendor:openspec:check`/`cospec-validate-all`/
      `openspec:schema:validate` plus every test project: `apps/cli` unit
      543/543, integration 92/92, contract 29/29; `packages/bench` 313/313;
      `e2e` release-test 14/14),
      `mise run cospec -- validate     bench-cospec-vs-openspec --strict` passes
      (0 errors/warnings). `git     status` confirms only the intended files
      changed (`docs/bench.md`, `src/{matrix,publish,report,run}.ts`,
      `test/unit/{matrix,report}.test.ts` modified; `src/resume.ts`,
      `test/unit/resume.test.ts` new) — no stray report-dir writes or demo
      output left over from 17.6's dry-run

## 18. Judge backfill from artifact snapshots (`--judge-report`)

- [x] 18.1 `src/matrix.ts`: `MatrixFilters` gains `judgeReport?: string`;
      `parseArgs` gains `--judge-report <dir>` (both `--flag value`/
      `--flag=value` forms). Standalone, mirroring `--review-report`/
      `--publish-from`: mutually exclusive with every cell-selecting flag
      (`--scenario`/`--arm`/`--model`/`--smoke`/`--hard`/`--review`),
      `--publish`, `--review-report`, `--publish-from`, and `--resume` — the
      existing `--publish-from`/`--resume` guards extended to also reject
      `--judge-report`, and a new symmetric `--judge-report` guard rejects all
      of the above -> `matrix.test.ts` new cases (10): value parsing (both
      forms), missing-value throw, parses cleanly alone, all 4
      cell-selecting-flag combinations throw, `--publish` throws, and both
      directions of the `--judge-report`×`--review-report`/`--publish-from`/
      `--resume` mutual-exclusion errors (the reciprocal `--publish-from`/
      `--resume` throw-on-`--judge-report` cases added to their existing
      describe blocks)
- [x] 18.2 `src/judge.ts` gains `judgeInputFromArtifactFiles(files, sentinels)`
      — rebuilds the exact judge input `collectArtifactText` would have
      produced, from a persisted `ArtifactSnapshot.files` map instead of the
      live sandbox filesystem: same `ARTIFACT_FILE_ORDER`, same `specs/**/*.md`
      inclusion (sorted), same redact-then-truncate contract
      (`collectArtifactText` refactored to share a new private
      `redactAndTruncate` helper with it, so the two paths cannot drift into
      different truncation behavior) -> unit-tested (`judge.test.ts`, 8 new
      cases): empty map -> empty string, fixed file order with headers, an
      absent file is skipped not rendered empty, `specs/**/*.md` keys included
      under their own header and sorted, a non-`.md` file under `specs/`
      excluded, defensive redaction of already-redacted snapshot text, the
      truncation ceiling, and a byte-equivalence check against
      `collectArtifactText` for the same artifact set
- [x] 18.3 `src/report.ts` gains `writeCellsJsonl(runDir, results, sentinels)` —
      overwrites `cells.jsonl` wholesale (guarded by the same `assertRedacted`
      self-check `appendCellResult` uses), the update path `--judge-report`
      needs after mutating already-written rows in place (unlike
      `appendCellResult`'s append-only writes during a live run) -> unit-tested
      (`report.test.ts`, 3 new cases): a full load-mutate-rewrite-reload round
      trip (backfills one row, clears its `judgeError`, leaves an untouched
      row's stale `judgeError` intact), an empty result set writes an empty file
      rather than throwing, and the redaction self-check throws on a planted
      sentinel
- [x] 18.4 `src/resume.ts` gains `needsJudgeBackfill(result)` — true exactly
      when a cell ran (not skipped) and its `quality` is exactly `null`; false
      once a cell already carries a real `QualityScore`, and false for a skipped
      cell (never had a `quality` field) — the `--judge-report` analogue of
      `needsReviewBackfill`, added to the same module (its module doc comment
      updated to name both standalone modes it now backs) -> unit-tested
      (`resume.test.ts`, 5 new cases): true for a ran cell with null quality
      (with and without an accompanying `judgeError`), false once a real score
      is present, false for a skipped cell, false when `quality` is `undefined`
      (judge never even attempted)
- [x] 18.5 `src/run.ts` gains standalone `--judge-report <dir>` mode
      (`judgeReportPastRun`), wired into `main()`'s dispatch alongside
      `--publish-from`/`--review-report`: requires `DEEPSEEK_API_KEY` (exit 2
      with an actionable message if unset — there is nothing to backfill scores
      WITH otherwise) and an existing `aggregate.json` (exit 2 if missing, for
      its `meta`), loads `cells.jsonl` via `readCellsJsonl`, and for every row
      `needsJudgeBackfill` flags: looks up `snapshots/<cellKey>.json`,
      logs-and-skips (never throws) when absent or unparseable, else rebuilds
      the judge input via `judgeInputFromArtifactFiles` and calls the REAL
      `judgeArtifacts`, writing the result back onto the row (`quality` set; a
      successful score clears any stale `judgeError`, a repeat failure records a
      fresh one). Rewrites the FULL `cells.jsonl` (`writeCellsJsonl`) and
      regenerates `aggregate.json`/`summary.md` from the updated set, mirroring
      `--review-report`'s structure exactly. Logs a final
      scored/still-null/no-snapshot tally
- [x] 18.6 `docs/bench.md`: flags table gains a `--judge-report <dir>` row
      linking to a new "Judge backfill (`--judge-report`)" section (placed right
      after "Quality judge (DeepSeek)"), walking the 3-step mechanism
      (skip-matching via `needsJudgeBackfill`, snapshot -> judge-input rebuild,
      row update + full aggregate/summary regeneration), the
      `DEEPSEEK_API_KEY`-required exit-2 behavior, and its standalone
      mutual-exclusion set; "Output & redaction contract" section gains a
      sentence naming the artifact snapshot as `--judge-report`'s input ->
      verified by reading the rendered section end-to-end
- [x] 18.7 **Real backfill run against the actual stale report** named in this
      task: `packages/bench/reports/2026-07-17T20-01-31-623Z/` (192 cells, 83
      with `quality: null` — 80 carrying
      `judgeError: "3 sample(s) failed:     http 402 x3"` from the first-attempt
      DeepSeek-balance outage, plus 3 with no `judgeError` and no persisted
      snapshot, i.e. genuinely nothing to judge). `DEEPSEEK_API_KEY` confirmed
      present in the harness process env (now funded, per this task's premise)
      before running:
      `mise run bench -- --judge-report /Users/rg/repos/sqf/aligned/cospec/.claude/worktrees/bench-cospec-vs-openspec/packages/bench/reports/2026-07-17T20-01-31-623Z`
      ->
      `bench — judge-report: scored 80, still null 0, no snapshot 3;     rewrote cells.jsonl, aggregate.json, and summary.md`.
      Every one of the 80 snapshot-backed cells scored on the first attempt (0
      judge failures this time — DeepSeek responded normally); the 3 no-snapshot
      cells were logged (`no snapshot for <key> — leaving quality: null`) and
      left untouched, exactly as designed — confirmed post-run: 189/192 cells
      now carry a real `quality.overall` (range observed ~2.13-3.00), exactly 3
      still `null` (the same 3 no-snapshot cells, unchanged)
- [x] 18.8 Republished from the now-complete report:
      `mise run bench -- --publish-from /Users/rg/repos/sqf/aligned/cospec/.claude/worktrees/bench-cospec-vs-openspec/packages/bench/reports/2026-07-17T20-01-31-623Z`
      -> `packages/bench/RESULTS.md` and the `README.md` managed block
      rewritten; every scenario × arm × model row in `RESULTS.md` now shows a
      real `quality` value (previously `—` for the 80 backfilled + 3
      unscored-from-the-start groups) confirmed by inspection. Per-(arm, model)
      mean quality overall, computed directly from the republished `cells.jsonl`
      (189 scored cells): `cospec/claude-opus-4-8` 2.871 (n=47),
      `cospec/claude-sonnet-5` 2.833 (n=48), `openspec/claude-opus-4-8` 2.967
      (n=47), `openspec/claude-sonnet-5` 2.956 (n=47) — both arms cluster
      tightly in the high-2s on this rubric; the openspec arm reads marginally
      higher on raw quality here, though `RESULTS.md`'s paired comparison
      (schema-conformance/cost/duration, not quality) remains the change's
      authoritative win/loss signal, not this single aggregate number
- [x] 18.9 Confirm no regression: `mise run //packages/bench:typecheck` (via
      `bun run typecheck`) clean, `mise run lint` exit 0 (same 3 pre-existing
      unrelated `apps/cli` warnings only, none new), `mise run format:check`
      clean (after one `format:fix` pass reformatting `docs/bench.md`, `run.ts`,
      and `matrix.test.ts`'s line wrapping), `mise run //packages/bench:test`
      339/339 pass (313 pre-existing + 26 new: 8 in `judge.test.ts`, 10 in
      `matrix.test.ts`, 5 in `resume.test.ts`, 3 in `report.test.ts`),
      `mise run cospec -- validate     bench-cospec-vs-openspec --strict` passes
      (0 errors/warnings). `git     status` confirms only the intended files
      changed (`docs/bench.md`, `src/{judge,matrix,report,resume,run}.ts`,
      `test/unit/{judge,matrix,report,resume}.test.ts` modified;
      `packages/bench/reports/2026-07-17T20-01-31-623Z/` backfilled in place
      (gitignored — never a git change); `packages/bench/RESULTS.md` and
      `README.md` republished with the complete quality data)
