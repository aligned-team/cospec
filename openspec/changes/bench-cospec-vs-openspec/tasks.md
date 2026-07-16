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
      fixture (`armNativeValidatePass: true`, `cospecValidate: null` — the
      archive-integrity short-circuit)
- [x] 6.5 Task completion check (did the fixture's requested code change land)
      -> verified live: the smoke cell's `ci` scenario predicate correctly
      reported `taskCompleted: true` after the agent wrote
      `.github/workflows/lint.yml`

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
