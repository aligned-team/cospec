# Benchmark: cospec vs openspec

`mise run bench` drives a **real headless Claude Code agent** through the same
engineering task twice per scenario — once with the `cospec` arm, once with the
bare-`openspec` arm — across the 11 schema types and two models, then compares
the two arms on mechanical validation, artifact fidelity, and DeepSeek-judged
quality. It answers one question: does cospec's typed, sized workflow produce
better spec-driven output than bare OpenSpec under an identical prompt?

The benchmark is **advisory**, exactly like the [E2E eval](./eval.md). It is
never in `mise run check`, never in required CI, and a run always exits 0 (only
a malformed invocation — an unknown flag — exits 2, so a typo never silently
runs the full, expensive matrix). Its `test:bench` unit suite _is_ gated in
`check`; the matrix run itself never is.

## Running it

```bash
mise run bench           # full matrix
mise run bench:smoke     # one cheap cell: ci scenario, sonnet-5/high, cospec arm
```

Auth is inherited from the process environment — a Claude Code session (via
`CLAUDE_CONFIG_DIR`) or `ANTHROPIC_API_KEY` if set. A cell whose agent cannot
authenticate is skipped gracefully rather than reported as a zeroed run. Without
`DEEPSEEK_API_KEY` the run still executes; quality scores are recorded as
`null`.

CLI filters narrow each axis (pass after `--`, e.g.
`mise run bench -- --scenario feat --arm cospec`):

| flag            | default | purpose                                      |
| --------------- | ------- | -------------------------------------------- |
| `--scenario`    | all 11  | scenario id(s); repeatable / comma-separated |
| `--arm`         | both    | `cospec` \| `openspec`                       |
| `--model`       | both    | `claude-sonnet-5` \| `claude-opus-4-8`       |
| `--repeats`     | 1       | copies per cell (surfaces variance)          |
| `--concurrency` | 2       | bounded worker pool size                     |
| `--smoke`       | off     | collapse to the single cheap cell            |

Judge configuration is environment-only, sharing the eval's defaults:
`DEEPSEEK_API_KEY` (presence gates judging), `DEEPSEEK_MODEL_ID`
(`deepseek-v4-flash`), `DEEPSEEK_BASE_URL` (`https://api.deepseek.com`).

## The matrix

A cell is `{ scenario, arm, model, repeat }`. The full product is 11 scenarios
(one per cospec schema type) × 2 arms × 2 models × `repeats`. Each cell runs in
its own `mkdtemp` git repo seeded from the scenario's fixture, with a baseline
commit so task-completion diffs have a reference point. Effort is tied to the
model — sonnet-5 → high, opus-4-8 → medium — via `CLAUDE_CODE_EFFORT_LEVEL`, so
the matrix stays two-dimensional instead of exploding into a model×effort grid.

## The two arms

The task prompt is **identical** across arms and models; only the tool and the
model/effort vary. The scenario prompt itself is a plain engineering task and
never mentions a spec-driven workflow — see
[Workflow framing](#workflow-framing) for how the agent is told one exists.

- **cospec arm** — the sandbox is initialized by the **working-tree CLI**
  (`apps/cli/src/index.ts … init . --harness claude --yes`), so the generated
  `cospec-*` skills and typed schemas come from the current tree under test.
- **openspec arm** — initialized by the repo's pinned `@fission-ai/openspec`
  1.5.0 binary, resolved **by path** (never `$PATH`), running
  `openspec init . --tools claude`, which ships OpenSpec's own `openspec-*`
  skills.

Both tools ship their entire agent-facing guidance **as skills** under
`.claude/skills/<tool>-*` (neither writes a root `CLAUDE.md`/`AGENTS.md`), so
the harness enables `skills: 'all'` for **both** arms — symmetrically. A sandbox
only ever contains its own tool's skills, so `'all'` surfaces exactly that
tool's guidance. This is deliberate: under the hermetic `settingSources: []`
enabling skills for one arm but not the other would risk running the openspec
arm with no guidance at all, biasing the comparison.

## Workflow framing

A scenario's `prompt` (see `packages/bench/scenarios/*.ts`) is a plain
engineering task — it never mentions a spec-driven workflow, cospec, or
OpenSpec. Left there alone, the agent has no reason not to solve the task
directly, which measures nothing about either tool. `src/agent.ts` appends one
extra, **byte-identical** instruction to both arms' SDK `systemPrompt` (via the
`{ type: 'preset', preset: 'claude_code', append: … }` form, which keeps Claude
Code's own default system prompt and adds to it rather than replacing it):

> This repository manages every change through a spec-driven workflow whose
> skills are installed under .claude/skills. Before implementing, scaffold or
> propose a change using that tooling, author its required artifacts, validate
> it, then implement and complete the change through the workflow.

The wording is deliberately tool-neutral — it names neither tool — so it tells
the agent a workflow exists and where to find it without itself favoring either
arm; each sandbox only ever contains its own tool's skills under
`.claude/skills/<tool>-*`, so the same sentence resolves to a different concrete
workflow per arm.

## Transport

The agent is driven by `@anthropic-ai/claude-agent-sdk`'s `query()` — real
headless Claude Code, not a hand-rolled tool loop. Options are hermetic:
`settingSources: []` (no `CLAUDE.md`/user config leaks in), `mcpServers: {}` +
`strictMcpConfig` (no MCP), `persistSession: false`, an explicit
code-editing-minimum tool allowance (`Bash`, `Read`, `Write`, `Edit`, `Glob`,
`Grep` — no `WebFetch`/`WebSearch`/`Task`, so cells stay comparable and
offline), a per-scenario `maxTurns` (70 for lite types — build, chore, ci, docs,
style, test; 120 for full types — feat, fix, perf, refactor, revert — calibrated
for the full propose->author->validate->implement->archive cycle, not direct
implementation), and a hard `maxBudgetUsd` ceiling (default 10). Telemetry is
read verbatim from the SDK's own init and result messages (Claude Code version,
resolved model, subtype, cost, durations, turns, token and per-model usage,
terminal reason) — never the assistant's text or tool payloads.

## Mechanical metrics (authoritative — no LLM)

Scored post-hoc against each arm's sandbox tree:

- **arm-native validation** — the tool's own validator on its own output
  (`cospec validate --strict` / `openspec validate --strict`).
- **post-hoc `cospec validate --json --strict`** over _both_ arms' trees,
  yielding rule-id hit counts — a shared rubric (with the caveat that it is
  cospec's own).
- **artifact proportionality** vs the type's artifact set read from canon
  type-facts (never hardcoded): over-production is measured against the
  `declared` set, under-production against the `apply.requires` floor, so an
  optional-but-declared artifact is not wrongly flagged missing.
- **task completion** — `tasksAllChecked` from `tasks.md`, plus the scenario's
  own `completed` predicate, which favors real execution (running `bun test` /
  `bun run build` in the sandbox) over string-matching where the fixture has
  runtime behavior.

## Quality judge (DeepSeek)

A non-Claude judge (avoiding self-preference) scores **redacted, defensively
truncated** artifact text on a per-axis 0–3 rubric — completeness, internal
consistency, ambiguity (inverted: 3 = crisp), verifiability, traceability — at
temperature 0, k=3 samples averaged. The judge is prompted for brief per-axis
reasoning followed by a delimited final JSON verdict; a sample that hits the
token ceiling (`finish_reason: 'length'`) is discarded rather than parsed from a
truncated fragment. Quality is `null` when the key is unset, there is nothing to
judge, or every sample fails to parse — never a fabricated score.

## Output & redaction contract

Reports are written to `packages/bench/reports/<ts>/` (git-ignored): per-cell
`cells.jsonl`, an aggregate `aggregate.json` (raw rows + means over repeats),
and a human-readable `summary.md` table (type × arm × model on quality, defects,
native-valid rate, task-done rate, duration, cost, tokens). Every object passes
a **sentinel self-check before it touches disk**: reports carry only counts,
scores, rule ids, durations, and token/cost telemetry — never an API key, raw
prompt, completion, artifact body, or fixture-unique string. If any sentinel
survives into a report object, the write throws rather than leak. This mirrors
the [eval's redaction discipline](./eval.md#redaction-contract). </content>
</invoke>
