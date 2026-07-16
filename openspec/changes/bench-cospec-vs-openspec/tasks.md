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
