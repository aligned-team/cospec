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
  human-readable markdown summary table (arm × type × model on quality, defect
  counts, duration, tokens, cost).
- Root `mise.toml` tasks `bench` (full matrix) and `bench:smoke` (one cheap
  cell: `ci` scenario, sonnet-5/high, cospec arm) — advisory, never added to
  `check`.

## Impact

- `package.json` (workspaces), `tsconfig.base.json` (if package-scoped overrides
  are needed), `mise.toml` (two new tasks), `.gitignore` (bench reports), new
  `packages/bench/**` tree. No changes to `apps/cli` runtime behavior, no CI
  gating impact — `bench`/`bench:smoke` are advisory only, same covenant as
  `mise run eval:e2e`.
