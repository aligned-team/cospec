## Why

We claim cospec sizes the spec-driven workflow better than bare OpenSpec, but
the claim has never been measured against a real headless Claude Code agent
driving both tools across the 11 schema types. This change adds an advisory
benchmark harness — modeled on `e2e/eval`'s sandbox/redaction/report conventions
but using the real `@anthropic-ai/claude-agent-sdk` instead of a hand-rolled
tool loop — that runs the same task prompt through the `cospec` arm and the
bare-`openspec` arm per scenario × model, and compares them on mechanical
validation, artifact fidelity, and DeepSeek-judged quality.

## What Changes

- New private workspace package `packages/bench` (`@aligned-team/cospec-bench`,
  `private: true`), wired into root `package.json` `workspaces` and covered by
  `tsconfig.base.json`.
- A thin Bun/TS harness: per-cell hermetic sandbox (mkdtemp git repo seeded from
  a scenario fixture), spawning real headless Claude Code via the Claude Agent
  SDK's `query()` with `settingSources: []`, `mcpServers: {}`,
  `strictMcpConfig: true`, explicit `allowedTools`, and a per-scenario
  `maxTurns`/budget cap. Scenario prompts are plain engineering tasks with no
  workflow framing, so `query()`'s `systemPrompt` option uses the preset-with-
  append form (additive — it keeps Claude Code's own system prompt rather than
  replacing it) to append one short, tool-neutral, byte-identical instruction to
  both arms: this repository manages every change through a spec-driven workflow
  whose skills live under `.claude/skills`, use it before implementing — so the
  harness measures the workflow each tool ships, not whether the agent notices
  it exists.
- Matrix cell =
  `{ scenarioId (one per the 11 cospec schema types), arm: 'cospec' | 'openspec', model: 'claude-sonnet-5' | 'claude-opus-4-8', repeat }`,
  with `--scenario`/`--arm`/`--model`/`--repeats`/`--concurrency` CLI filters.
- `cospec` arm: sandbox runs the working-tree CLI entry
  (`apps/cli/src/index.ts`) to `cospec init` the sandbox so generated
  `/cospec:*` skills and schemas come from the current tree. `openspec` arm:
  `openspec init` only, using the repo's pinned `@fission-ai/openspec` 1.5.0
  binary resolved by path (never `$PATH`), with a generic spec-driven prompt and
  no cospec skills. Identical task prompt across arms/models; only the tool and
  model/effort vary.
- Telemetry captured from the SDK's result message (cost, duration, turns, token
  usage, model usage, terminal reason), plus mechanical metrics: arm-native
  validation pass/fail, a post-hoc `cospec validate --json --strict` pass
  against both arms' output trees (rule-ID hit counts), artifact
  presence/proportionality against the type's declared artifact set (read from
  canon/type facts, never hardcoded), apply-gate/archive-integrity observance,
  and fixture task completion.
- A DeepSeek-judged quality score (reusing `e2e/eval`'s client patterns): 0-3
  per axis (completeness, internal consistency, ambiguity inverted,
  verifiability, traceability), temperature 0, k=3 averaged, redacted artifact
  text only, `quality: null` when `DEEPSEEK_API_KEY` is unset.
- Output: gitignored `reports/` — per-cell JSONL, an aggregate JSON, and a
  human-readable markdown summary table (arm × type × model on quality, schema
  conformance, duration, tokens, cost).
- Metric naming (following user feedback that the forbidden/missing-artifact +
  post-hoc `cospec validate` metric is cospec's own rubric applied to openspec —
  a tautology if presented as "defects"): that metric family is named **schema
  conformance** end to end (`MechanicalMetrics.schemaConformance` in
  `src/mechanical.ts`, `AggregateRow.meanConformanceIssues` and the `summary.md`
  `conformance*` column in `src/report.ts`), explicitly framed — in code
  comments, `summary.md`'s legend, and `docs/bench.md` — as cospec's OWN
  opinionated rubric applied post-hoc to BOTH arms, NOT a defect measure. Each
  arm's OWN validator result is reported alongside it, unrenamed, as the actual
  pass/fail bar per tool (`armNativeValidatePass` / `summary.md`'s
  `native-valid` column). The underlying data (rule-id counts, forbidden/missing
  artifact lists) is unchanged — only the naming/framing.
- Statistics machinery for repeated cells (`src/stats.ts`, machinery only — the
  44-cell matrix is not re-run to produce this): per-`(type, arm, model)` group
  mean/min/max/sample-stddev over `--repeats` (`AggregateRow`'s
  `durationSummary`/`costSummary`/`tokensInSummary`/`tokensOutSummary`, rendered
  as `summary.md`'s "Repeat spread" section), and a paired
  per-`(scenarioType, model)` win/loss comparison between the `cospec` and
  `openspec` arms on matched cells (same scenario+model+repeat) for cost,
  duration, and schema-conformance issues, with a two-sided exact sign test and
  a "not distinguishable at this n" flag whenever the two arms' value ranges
  overlap or there are fewer than 2 matched pairs (`summary.md`'s "Paired
  comparison" section — renders sensibly, with no significance claim, at the
  common `n=1` case).
- Root `mise.toml` tasks `bench` (full matrix) and `bench:smoke` (one cheap
  cell: `ci` scenario, sonnet-5/high, cospec arm) — advisory, never added to
  `check`.
- **Escaped defects — the benchmark's primary, tool-neutral defect metric**: one
  held-out `bun:test` suite per scenario
  (`packages/bench/scenarios/hidden/<id>/`, 4-8 cases each, 11 total),
  deliberately outside every scenario's `fixtureDir` so the agent's sandbox
  never sees them. After the agent stops, `src/mechanical.ts`'s new
  `scoreHiddenTests` copies the suite into the finished sandbox and runs it
  against whatever the arm actually produced, yielding
  `MechanicalMetrics.hiddenTests: {total, failed} | null`. Unlike schema
  conformance (cospec's own rubric, applied post-hoc to both arms), a
  hidden-test failure means the produced code does not do what the prompt asked
  — mechanical and identical for both arms. Every suite is verified, both
  directions, against a scripted correct reference implementation
  (`test/unit/hidden.test.ts`): at least one failure on the unmodified fixture,
  zero failures on the reference fix. `summary.md`'s main table gains an
  `escaped‡` column (`meanFailed/meanTotal`).
- **Per-cell diff persistence + adversarial review stage**: before teardown,
  each cell's code change is captured (`src/sandbox.ts`'s `captureSandboxDiff` —
  the seed-commit `git diff` plus untracked file contents, EXCLUDING
  `openspec/`, `.claude/`, `.codex/`, `.opencode/`, and the injected
  `hidden-tests/`) and written REDACTED, size-capped, to
  `<runDir>/snapshots/<cellKey>.diff` (`src/report.ts`'s
  `writeCellDiff`/`readCellDiff`). A new `src/review.ts` measures "bugs that
  slipped through the workflow": K=2 independent, ARM-BLIND reviewer runs (cheap
  `claude-haiku-4-5-20251001`, effort high, read-only tools, low `maxTurns`)
  each find real CORRECTNESS bugs in the diff and return strict JSON findings;
  findings are deduped, then a per-finding verifier run is prompted to REFUTE
  each against the diff — only findings it cannot refute count as
  `MechanicalMetrics.reviewDefects.confirmed`. Reviewer/verifier prompts never
  see which arm produced a diff (tool identifiers scrubbed; every prompt passes
  an `assertArmBlind` guard). Runs inline behind `--review` (off by default;
  extra agent spend) or post-hoc standalone via `--review-report <dir>`, which
  reviews a past run's persisted diffs with no agent re-run and rewrites its
  `aggregate.json`/`summary.md`. Confirmed review defects are wired into
  `summary.md`'s main table (`review§` column) and the paired-comparison stats
  (new `reviewDefects` metric).
- **Planted latent bugs — a verification-discipline signal, kept separate from
  escaped defects**: the 5 heavy scenario types (`feat`, `fix`, `perf`,
  `refactor`, `revert`) each seed one realistic latent bug ADJACENT to (never
  inside) the task subject — e.g. `fix`'s sibling `capitalize` off-by-one — with
  its own held-out `bun:test` detector at `scenarios/planted/<id>/` (never
  seeded into the agent's sandbox; declared on the scenario as
  `plantedBug: {file, description, detector}`). After the agent stops,
  `src/mechanical.ts`'s new `scorePlantedBug` runs the detector as a SEPARATE
  `bun test` invocation from `scoreHiddenTests`, yielding
  `MechanicalMetrics.plantedBugCaught: boolean | null` — whether the workflow's
  verification discipline led the agent to notice and fix it, never folded into
  `hiddenTests`/`escapedDefectRate` (a plant unfixed is not a double-counted
  escaped defect). Every plant is verified, both directions, via a scripted
  targeted fix (`test/unit/planted.test.ts`), and adding it was re-checked
  against the scenario's existing visible tests, completion predicate, and
  hidden-test fail-before/pass-after guarantee. `summary.md`'s main table gains
  a `plant¶` column (mean caught-rate, dash for scenario types with no plant).
- **Opt-in `-hard` variants — multi-file, higher-stakes versions of the 5 heavy
  types**: `scenarios/{feat,fix,perf,refactor,revert}-hard.ts`, each an 8-15
  file fixture with real state/error-paths/boundary conditions (an inventory
  ledger, a token-bucket rate limiter, a batch search index, …), a task prompt
  requiring changes across 3+ files, `maxTurns: 150`, an 8-12 case held-out
  hidden suite, and its own planted bug — verified with the exact same
  fail-before/pass-after discipline as the standard scenarios
  (`test/unit/{hidden,planted}-hard.test.ts`). Registered on a new
  `scenarios/index.ts` export, `HARD_SCENARIOS` (`ALL_SCENARIOS` is the union
  with the 11-scenario `SCENARIOS` core registry, which stays untouched at
  exactly 11); a hard variant's `id` is suffixed `-hard` while `type` stays the
  BASE cospec type, so cospec's artifact-proportionality scoring treats it
  exactly like its base type. **Never run by default** — `src/matrix.ts`'s
  `expandMatrix` excludes `-hard` ids from the default axis unless a new
  `--hard` flag is passed; an explicit `--scenario feat-hard` always resolves
  regardless. Fixed a related latent bug this surfaced: `CellResult`/
  `AggregateRow`/`PairedComparisonGroup` grouped and displayed by cospec `type`
  (not scenario `id`), which would have silently merged a `-hard` cell into its
  base scenario's row/pair the moment both ran in the same matrix — renamed the
  grouping field to `scenarioId` throughout `report.ts`/`stats.ts` (no behavior
  change for the 11 core scenarios, where id and type always matched 1:1).
  `docs/bench.md` gains a "Hard-mode variants" section with a cost warning
  (multi-file, `maxTurns: 150`, meaningfully pricier per cell).
- **Results publishing** — two flags (`--publish`, run after a live matrix
  completes; `--publish-from <reportDir>`, standalone, re-renders from an
  EXISTING report dir's `aggregate.json` with no agent re-run — works with a
  hand-merged report dir too) render two artifacts that, unlike everything else
  the harness writes, are COMMITTED rather than git-ignored (`src/publish.ts`):
  `packages/bench/RESULTS.md` (a provenance header plus exactly `summary.md`'s
  table/legend/stats sections, reused via `report.ts`'s new `renderSummaryBody`
  rather than duplicated) and an idempotent managed block in the root
  `README.md` between `<!-- bench:start -->`/ `<!-- bench:end -->` markers (a
  compact per-arm×model table via a new `aggregateByArmModel`, plus a link out
  to `RESULTS.md`), mirroring `scripts/mise-tasks/agents/sync`'s CLAUDE.md
  shared-block replace pattern and inserting before `## License` when the README
  has no markers yet. Both documents share one provenance header: the commit SHA
  (hyperlinked to `https://github.com/<org>/<repo>/commit/<sha>`, org/repo
  derived from the `origin` remote at runtime, never hardcoded), the tag if HEAD
  is exactly tagged, ISO publish date, Claude Code version, model ids + efforts,
  cell/ repeat counts, judge status, and an explicit WARNING banner — never
  blocking — when the working tree is dirty or the branch isn't `main`, since a
  publish is a point-in-time claim about a specific commit and the canonical
  publish is from a clean `main` checkout. Confirmed live that `src/agent.ts`
  already forwarded the parent process env (in particular `CLAUDE_CONFIG_DIR`,
  this machine's multi-account switch) to the spawned Agent SDK `query()` before
  this change; extracted it into a documented, independently-tested
  `buildAgentEnv` rather than leaving it an inline object literal. Every write
  passes the existing redaction self-check.
- Fixed a real scoring bug found via a live smoke run, not a code read:
  `scoreHiddenTests`/`scorePlantedBug` (`src/mechanical.ts`) copied a scratch
  test suite into the finished sandbox (`hidden-tests/`, `planted-check/`) and
  never removed it, and both run BEFORE `taskCompleted` in `scoreMechanical` — a
  scenario's own `completed` predicate then ran a bare, unscoped `bun test` at
  the sandbox root that picked up those leftover suites too, silently corrupting
  `taskCompleted` for any cell where the leftover suite's own assertions (e.g. a
  planted bug's detector) failed. Both functions now remove their copy in a
  `finally` block before returning; 2 new permanent regression tests lock this
  in.

## Impact

- `package.json` (workspaces), `tsconfig.base.json` (if package-scoped overrides
  are needed), `mise.toml` (two new tasks), `.gitignore` (bench reports), new
  `packages/bench/**` tree. No changes to `apps/cli` runtime behavior, no CI
  gating impact — `bench`/`bench:smoke` are advisory only, same covenant as
  `mise run eval:e2e`.
