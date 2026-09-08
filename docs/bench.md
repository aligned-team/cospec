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

Auth is inherited from the process environment — see [Auth](#auth) below for how
to route a run to a specific Claude account. Without `DEEPSEEK_API_KEY` the run
still executes; quality scores are recorded as `null`.

CLI filters narrow each axis (pass after `--`, e.g.
`mise run bench -- --scenario feat --arm cospec`):

| flag                    | default | purpose                                                                                                                           |
| ----------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `--scenario`            | all 11  | scenario id(s); repeatable / comma-separated                                                                                      |
| `--arm`                 | both    | `cospec` \| `openspec`                                                                                                            |
| `--model`               | both    | `claude-sonnet-5` \| `claude-opus-4-8`                                                                                            |
| `--repeats`             | 1       | copies per cell (surfaces variance)                                                                                               |
| `--concurrency`         | 2       | bounded worker pool size                                                                                                          |
| `--smoke`               | off     | collapse to the single cheap cell                                                                                                 |
| `--hard`                | off     | include the opt-in `-hard` variants in the default matrix — see below                                                             |
| `--review`              | off     | run the adversarial review stage inline (extra agents — see below)                                                                |
| `--review-report <dir>` | —       | review a past run's persisted diffs; no matrix run                                                                                |
| `--judge-report <dir>`  | —       | backfill quality scores for a past run's null-quality cells; no matrix run — see [Judge backfill](#judge-backfill---judge-report) |
| `--publish`             | off     | after the run, render the committed publish artifacts — see below                                                                 |
| `--publish-from <dir>`  | —       | render publish artifacts from a past report; no matrix run                                                                        |
| `--resume <dir>`        | —       | resume an interrupted run into `<dir>` instead of starting a new one — see [Resuming a run](#resuming-a-run)                      |

Judge configuration is environment-only, sharing the eval's defaults:
`DEEPSEEK_API_KEY` (presence gates judging), `DEEPSEEK_MODEL_ID`
(`deepseek-v4-flash`), `DEEPSEEK_BASE_URL` (`https://api.deepseek.com`).

## Auth

Auth is inherited from the process environment — a Claude Code session (via
`CLAUDE_CONFIG_DIR`) or `ANTHROPIC_API_KEY` if set. A cell whose agent cannot
authenticate is skipped gracefully rather than reported as a zeroed run.

By **default**, a run authenticates as whatever account the invoking shell
session is already using — the same account `mise run bench` inherits from
however Claude Code itself was launched. To route a run to a **specific**
account instead (see this machine's multi-account setup in the root
`CLAUDE.md`), set `CLAUDE_CONFIG_DIR` before invoking:

```bash
CLAUDE_CONFIG_DIR=~/.claude-accounts/aligned mise run bench -- --smoke
```

This works because `src/agent.ts`'s `buildAgentEnv` spreads the harness
process's own `env` into the Agent SDK's `query()` `env` option BEFORE
overlaying `CLAUDE_CODE_EFFORT_LEVEL` — the SDK forwards `Options.env` verbatim
to the spawned Claude Code child process's environment, so every variable the
invoking shell set (in particular `CLAUDE_CONFIG_DIR`) reaches the agent that
actually authenticates, exactly as it would for an interactive session.
`ANTHROPIC_API_KEY`, if set, wins over any session-based auth.

## The matrix

A cell is `{ scenario, arm, model, repeat }`. The full product is 11 scenarios
(one per cospec schema type) × 2 arms × 2 models × `repeats`. Each cell runs in
its own `mkdtemp` git repo seeded from the scenario's fixture, with a baseline
commit so task-completion diffs have a reference point. Effort is tied to the
model — sonnet-5 → high, opus-4-8 → medium — via `CLAUDE_CODE_EFFORT_LEVEL`, so
the matrix stays two-dimensional instead of exploding into a model×effort grid.

## Hard-mode variants (opt-in, `--hard`)

> **Cost warning.** Every hard variant is a multi-file fixture with a `maxTurns`
> of 150 (vs. 70/120 for the standard scenarios) and a task that genuinely spans
> 3+ files, so a cell can run noticeably longer and cost noticeably more than a
> standard cell of the same type. They are **never** included by default —
> running the full matrix with `--hard` grows the scenario-id count from 11 to
> 16 (roughly **1.45×**), and each hard cell also costs meaningfully more than
> its standard counterpart. Start with `--scenario feat-hard --hard` (a single
> scenario) rather than a bare `--hard` full-matrix run.

The 5 "heavy" scenario types (`feat`, `fix`, `perf`, `refactor`, `revert`) each
have a `-hard` sibling — `scenarios/{feat,fix,perf,refactor,revert}-hard.ts` —
registered on `scenarios/index.ts`'s `HARD_SCENARIOS` (separate from the
11-scenario `SCENARIOS` core registry; `ALL_SCENARIOS` is their union). A hard
variant's `id` is suffixed `-hard` but its `type` stays the BASE cospec type
(`feat-hard` is `type: 'feat'`), so cospec's artifact-proportionality scoring in
`src/mechanical.ts` treats it exactly like a `feat` change — only the fixture,
prompt, hidden suite, and planted bug differ:

- **Multi-file fixtures** (8-15 files each) with edge-case-rich behavior — real
  state (an inventory ledger, a token-bucket rate limiter), error paths
  (throwing on invalid input), and boundary conditions (exact-capacity checks,
  fencepost-prone loops) — rather than the standard scenarios' single-function
  fixtures.
- **A task prompt requiring changes across 3+ files** — e.g. `feat-hard` adds
  store credit to a checkout flow, touching `types.ts`, `pricing.ts`, and
  `orders.ts`; `fix-hard` has three related bugs, one per file, in a
  bucket/store/limiter split.
- **Larger held-out hidden suites** (8-12 cases, vs. 4-8 for the standard
  scenarios) and their own planted bug, verified with the exact same
  fail-before/pass-after discipline as the standard scenarios (see
  `test/unit/hidden-hard.test.ts` and `test/unit/planted-hard.test.ts` —
  separate files from `hidden.test.ts`/`planted.test.ts` so the core scenarios'
  tighter case-count bounds and "exactly 11" registry invariants stay untouched,
  remaining statements about the core-11 registry alone).

**Never run by default.** `src/matrix.ts`'s `expandMatrix` excludes any
`-hard`-suffixed id from the DEFAULT (no `--scenario` filter) axis unless
`--hard` is passed. An EXPLICIT `--scenario feat-hard` (or any other hard id)
always resolves regardless of `--hard` — only the "all scenarios" default set is
hard-gated:

```bash
mise run bench -- --scenario feat-hard        # one hard cell, no --hard needed
mise run bench -- --hard --scenario feat-hard # equivalent
mise run bench -- --hard                      # full matrix INCLUDING all 5 hard variants
```

## The two arms

The task prompt is **identical** across arms and models; only the tool and the
model/effort vary. The scenario prompt itself is a plain engineering task and
never mentions a spec-driven workflow — see
[Workflow framing](#workflow-framing) for how the agent is told one exists.

- **cospec arm** — the sandbox is initialized by the **working-tree CLI**
  (`apps/cli/src/index.ts … init . --harness claude --yes`), so the generated
  `cospec-*` skills and typed schemas come from the current tree under test.
- **openspec arm** — initialized by the repo's pinned `@fission-ai/openspec`
  1.11.0 binary, resolved **by path** (never `$PATH`), running
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

Scored post-hoc against each arm's sandbox tree. Two of these look similar but
answer different questions, and the summary table reports them in adjacent
columns on purpose so neither is mistaken for the other:

- **arm-native validation** (`native-valid` column) — the tool's OWN validator
  on its OWN output: `cospec validate --strict` for the cospec arm,
  `openspec validate --strict` for the openspec arm. This is each tool's own bar
  for its own output. It is the metric to read as a pass/fail signal.
- **schema conformance** (`conformance*` column;
  `MechanicalMetrics.schemaConformance` in `src/mechanical.ts`) — a post-hoc
  `cospec validate --json --strict` pass over _both_ arms' trees (rule-id hit
  counts), plus artifact proportionality (files present that cospec's type-facts
  do not declare, and declared/required files that are missing). **This is
  explicitly cospec's OWN opinionated rubric, applied after the fact to both
  arms — including the openspec arm, which was never trying to satisfy it.** It
  is reported because it is the only apples-to-apples structural comparison
  available (openspec has no typed schema to reciprocally score cospec's output
  against), not because a high conformance-issue count means the openspec arm's
  output is "broken" or "defective." Read it alongside `native-valid`, never as
  a substitute for it: a cell can have `native-valid: true` (the openspec arm
  validated cleanly by its own rules) and a nonzero conformance count (it does
  not match cospec's schema) at the same time — that is expected, not a
  contradiction.
  - Artifact proportionality is part of this same rubric: over-production is
    measured against cospec's `declared` set, under-production against cospec's
    `apply.requires` floor, so an optional-but-declared artifact is not wrongly
    flagged missing — but again, both are cospec's own sets, applied to both
    arms.
- **task completion** — `tasksAllChecked` from `tasks.md`, plus the scenario's
  own `completed` predicate, which favors real execution (running `bun test` /
  `bun run build` in the sandbox) over string-matching where the fixture has
  runtime behavior.
- **escaped defects** (`escaped‡` column) — see the next section. This is the
  benchmark's PRIMARY defect metric; schema conformance above is reported
  alongside it for structural comparison, not as a substitute.
- **planted bugs** (`plant¶` column) — see "Planted bugs" below. A separate
  verification-discipline signal, not folded into escaped defects.

## Escaped defects (primary defect metric)

Every scenario has a **held-out `bun:test` suite** the agent never sees, at
`packages/bench/scenarios/hidden/<scenarioId>/` — a directory outside every
scenario's `fixtureDir`, so `src/sandbox.ts`'s `createArmSandbox` (which only
ever `cp`s `fixtureDir` into the sandbox) never seeds it. After the agent stops,
`src/mechanical.ts`'s `scoreHiddenTests` copies that suite into the finished
sandbox at `hidden-tests/` (sibling to `src/`) and runs `bun test .` there
against whatever tree the agent actually produced, then parses bun's own
` N pass` / ` N fail` summary line (`parseBunTestSummary`) into
`MechanicalMetrics.hiddenTests: { total, failed } | null` — null (never a
fabricated `{total: 0, failed: 0}`) when the scenario has no suite yet or the
summary couldn't be parsed.

> Suite directories are keyed by scenario **id**, not by `fixtureDir`, so an id
> that collides with an ignore rule gets silently dropped. `build` is the live
> case: both the root `.gitignore` and `.oxlintrc.json`'s `ignorePatterns` carry
> an unanchored `build` entry for build-output directories, which swallowed
> `scenarios/hidden/build/` until explicit negations
> (`!packages/bench/scenarios/hidden/build/` and
> `!packages/bench/scenarios/hidden/build`) were added to each. Any future
> scenario id that shadows an ignore rule needs the same pair of negations.

This is the benchmark's **primary defect metric**, distinct from schema
conformance: a hidden-test failure means the code the arm produced does not do
what the prompt asked, checked mechanically and identically for both arms —
neither arm gets to define the rubric for itself, unlike schema conformance
(which is explicitly cospec's own). Each suite has 4-8 focused cases exercising
edge cases beyond the scenario's own visible acceptance path (empty inputs,
boundary values, error paths, idempotency, or — for tasks whose completion
criterion is structural rather than behavioral, e.g. `docs`/`test`/`chore`/
`style`/`refactor` — a check on the produced artifact's content/shape rather
than on unchanged behavior). Every suite is verified, in
`test/unit/hidden.test.ts`, to report at least one failure against the
scenario's unmodified fixture (the task not done) and zero failures against a
scripted correct reference implementation (see that file's `REFERENCE_FIXES` and
`scenarios/hidden/README.md`'s design notes for the cases where not every
individual test needs to independently discriminate).

`summary.md`'s `escaped‡` column reports `meanFailed/meanTotal` over repeats for
each `(type, arm, model)` group — the count of held-out tests that failed
against the produced code, out of how many ran.

## Planted bugs (verification-discipline signal)

Escaped defects measure whether the produced code does what the TASK PROMPT
asked. A separate question: does a workflow's verification discipline lead the
agent to notice and fix a defect ADJACENT to the task — one the prompt never
mentions, sitting in the same file it was already reading and editing? The 5
"heavy" scenario types (`feat`, `fix`, `perf`, `refactor`, `revert`) each seed
one such latent bug into their fixture, e.g. `fix`'s `src/strings.ts` (whose
task is repairing `truncate`) also ships a sibling `capitalize` function with an
off-by-one (`input.slice(2)` instead of `input.slice(1)`) that the visible suite
never exercises.

Each plant is declared on its `Scenario`
(`plantedBug: {file, description, detector}` in `scenarios/types.ts`) and has
its own held-out `bun:test` detector at `scenarios/planted/<id>/` — outside
every `fixtureDir`, so it is never seeded into the agent's sandbox, mirroring
`scenarios/hidden/`'s discipline exactly. After the agent stops,
`src/mechanical.ts`'s `scorePlantedBug` copies that detector into the finished
sandbox at `planted-check/` (a SEPARATE directory and a SEPARATE `bun test`
invocation from `scoreHiddenTests`), runs it, and parses the result into
`MechanicalMetrics.plantedBugCaught: boolean | null` — `true` when the detector
passed (the plant was noticed and fixed), `false` when it still fails, `null`
when the scenario has no plant or the run was unparseable.

**Not an escaped-defect double-count.** A plant left unfixed is never folded
into `hiddenTests`/`escapedDefectRate` — those measure the task the prompt
actually asked for, and a plant is by construction adjacent to it and never
mentioned. `plantedBugCaught` is its own signal, reported in its own
`summary.md` column (`plant¶`, mean caught-rate per `(type, arm, model)` group,
a dash for scenario types with no plant). Every plant is verified, in
`test/unit/planted.test.ts`, to fail against the fixture as seeded and pass
against a scripted, targeted fix — independent of both the agent/CLI and the
scenario's own actual task — and adding each plant was re-checked against its
scenario's existing visible test suite, completion predicate, and hidden-test
fail-before/pass-after guarantee (see `scenarios/planted/README.md`).

## Quality judge (DeepSeek)

A non-Claude judge (avoiding self-preference) scores **redacted, defensively
truncated** artifact text on a per-axis 0–3 rubric — completeness, internal
consistency, ambiguity (inverted: 3 = crisp), verifiability, traceability — at
temperature 0, k=3 samples averaged. The judge is prompted for brief per-axis
reasoning followed by a delimited final JSON verdict; a sample that hits the
token ceiling (`finish_reason: 'length'`) is discarded rather than parsed from a
truncated fragment. Quality is `null` when the key is unset, there is nothing to
judge, or every sample fails to parse — never a fabricated score.

## Judge backfill (`--judge-report`)

A judge outage (most notably DeepSeek returning HTTP 402 — no account balance —
on this benchmark's first full run) leaves some cells' `quality: null` with a
`judgeError` even though the run itself completed and produced real artifacts.
`--judge-report <reportDir>` re-scores exactly those cells with NO benchmark
agent re-run, mirroring `--review-report`'s standalone-mode structure:

1. Loads `<reportDir>/cells.jsonl` (the row-level source of truth) and, for
   every row where `needsJudgeBackfill` is true — the cell ran and its `quality`
   is exactly `null` — looks up its persisted artifact snapshot at
   `snapshots/<cellKey>.json` (see "Output & redaction contract" below). A row
   that already carries a real quality score is left untouched; a row with no
   persisted snapshot (the agent never produced a change) is counted and logged,
   not silently dropped.
2. Rebuilds the exact judge input `collectArtifactText` would have produced from
   the snapshot's `files` map (`judgeInputFromArtifactFiles` — same
   `ARTIFACT_FILE_ORDER`, same `specs/**/*.md` inclusion, same truncation
   ceiling) and calls the real `judgeArtifacts` against it.
3. Updates the row in place — a successful score clears any stale `judgeError`;
   a repeat failure records a fresh one — and rewrites the WHOLE `cells.jsonl`
   (`writeCellsJsonl`), then regenerates that run's `aggregate.json` and
   `summary.md` from the updated rows, exactly like `--review-report` does for
   its own file pair.

Requires `DEEPSEEK_API_KEY` — there is nothing to backfill scores WITH
otherwise, so a missing key exits 2 rather than silently doing nothing (unlike a
live run, where the judge is simply disabled). `--judge-report` is its own
standalone mode: mutually exclusive with every cell-selecting flag, `--publish`,
`--review-report`, `--publish-from`, and `--resume` — only one standalone mode
may run per invocation.

```bash
mise run bench -- --judge-report packages/bench/reports/2026-07-17T20-01-31-623Z
```

## Repeats and statistical significance

`--repeats` (default 1) runs each matrix cell multiple times, so it is the knob
that determines whether any of the below can say anything about consistency
rather than a single, possibly-unrepresentative sample. `src/stats.ts` is pure,
I/O-free, and unit-tested against synthetic rows (`test/unit/stats.test.ts`) —
it never invokes the agent or the benchmark matrix itself.

- **Repeat spread** (`summary.md`'s "Repeat spread" section) — for every
  `(type, arm, model)` group with `repeats > 1`, reports mean/min/max/stddev
  (sample stddev, n-1 denominator) for duration and cost, so a mean does not
  hide how noisy a cell actually was. Groups with `repeats === 1` render a
  single explicit "nothing to spread over" line rather than a misleading
  min=max=mean row.
- **Paired comparison** (`summary.md`'s "Paired comparison" section) — matches
  cells with the SAME scenario type + model + repeat across the two arms and
  compares cost, duration, and schema-conformance issues pairwise: which arm had
  the lower value on that matched pair, tallied as win/loss/tie across all
  matched repeats for that `(type, model)`. A simple two-sided exact sign test
  (H0: either arm is equally likely to win) accompanies the tally. A group is
  reported as **"not distinguishable at this n"** whenever the two arms' value
  ranges overlap OR there are fewer than 2 matched pairs — the harness never
  asserts a winner off a single repeat's noise. At the common `n=1` case, every
  row states `n=1 — no significance claim` verbatim rather than rendering a bare
  dash or, worse, a spurious verdict.

## Adversarial review (bugs that slipped through)

Escaped defects catch bugs a held-out test can express; some correctness bugs
only a reader would notice. The adversarial review stage measures those: it
reads each cell's produced code diff and counts real correctness bugs that
survived a skeptical second look.

Before a sandbox is torn down, `src/sandbox.ts`'s `captureSandboxDiff` records
the agent's change as a unified diff from the seed commit — tracked edits plus
untracked new files — **excluding** the spec-workflow dirs (`openspec/`,
`.claude/`, `.codex/`, `.opencode/`) and the injected `hidden-tests/`, so the
diff is the arm-agnostic engineering change only. It is written **redacted and
size-capped** to `packages/bench/reports/<ts>/snapshots/<cellKey>.diff`
(`src/report.ts`'s `writeCellDiff`).

`src/review.ts` then reviews that diff:

- **K=2 independent reviewer runs** — a cheap `claude-haiku-4-5-20251001`
  (effort high, read-only tools, low `maxTurns`, small budget) each prompted to
  find real CORRECTNESS bugs (logic errors, off-by-one, unhandled edge cases —
  explicitly NOT style, formatting, docs, test coverage, or spec-workflow
  concerns) and return a strict JSON findings array.
- **Dedup, then refute** — findings are deduped by normalized title + location;
  each unique finding then gets its own **verifier** run (same model) prompted
  to REFUTE it against the diff. Only findings the verifier cannot refute count
  as `MechanicalMetrics.reviewDefects.confirmed` — an unparseable or ambiguous
  verdict refutes, so the confirmed count is never inflated on a parse failure.
- **Arm-blind** — reviewers and verifiers never learn which arm produced a diff:
  the diff and task text are scrubbed of `cospec`/`openspec` identifiers and
  every prompt passes an `assertArmBlind` guard before it is sent. Contaminating
  the reviewer with the arm would invalidate the comparison.

Review is **off by default** (it spawns extra agents and costs money). Enable it
inline with `--review`, or run it **post-hoc** over a finished run with
`--review-report <dir>` — that mode reviews the persisted diffs with no
benchmark agent re-run and rewrites the run's `aggregate.json` + `summary.md` in
place. `summary.md`'s `review§` column reports the mean confirmed review defects
per `(type, arm, model)` group (a dash when review did not run), and the paired
comparison gains a `review defects` metric.

## Resuming a run

A matrix run can be long (dozens to hundreds of cells) and can be interrupted —
`Ctrl-C`, a machine sleep, a crashed agent process. **Interrupted runs lose
nothing**: every cell result is appended to `<runDir>/cells.jsonl` as it
finishes, so `--resume <reportDir>` picks a partial run back up rather than
re-running cells that already completed.

```bash
mise run bench -- --hard --repeats 3 --resume reports/2026-07-17T20-01-31-623Z
```

**Pass the exact same flags as the original run, plus `--resume <dir>`.**
`--resume` composes with every axis flag (`--scenario`/`--arm`/`--model`/
`--repeats`/`--hard`) and with `--review`/`--publish` — it does not change what
matrix is expanded, only where the run's cells and reports land. The caller is
responsible for reproducing the original invocation's axis flags; `expandMatrix`
is a pure function of `(availableIds, filters)`, so the same flags always
produce the same cell set in the same order, which is what makes skip-matching
correct. Passing a narrower or wider set of axis flags on resume is more likely
a mistake than a scenario worth achieving.

What resuming does, in order:

1. Reads `<reportDir>/cells.jsonl` back into `CellResult`s (see `report.ts`'s
   `readCellsJsonl`) and rejects a dir that does not exist or predates the
   `scenarioId` field (see `isStaleSchema`, shared with `--publish-from`'s
   schema check) with an actionable error, rather than resuming from a corrupt
   or too-old report.
2. Expands the requested matrix exactly as a fresh run would, then computes each
   cell's `cellKey` (`scenario__arm__model__rRepeat` — see the "Repeat spread"
   note above: the repeat index IS part of the key, so a partial `--repeats 3`
   run resumes per-repeat, not per-scenario) and skips any cell already present
   in the loaded rows, logging `skipped N already-complete cells`.
3. Runs only the missing cells, appending each result to the SAME `cells.jsonl`
   (never truncated or rewritten) and copying new artifact snapshots/diffs
   alongside the existing ones under `snapshots/`.
4. If `--review` is set, ALSO backfills the adversarial review stage onto
   already-complete cells that have no `reviewDefects` yet (mechanical metrics
   were scored, but review was off, or failed, on the original invocation) —
   reviewing their persisted diff in place, exactly like `--review-report` does
   for a whole past run. A cell that already carries `reviewDefects` is left
   untouched — resuming never re-reviews a cell twice.
5. Regenerates `aggregate.json`/`summary.md` over the FULL set — pre-existing
   rows plus this invocation's fresh ones — so a resumed run's report always
   reads as one complete matrix, never just the tail that was re-run.
   `--publish` renders the committed artifacts from that same full set.

## Publishing

Every report under `packages/bench/reports/<ts>/` is git-ignored and local-only
(see "Output & redaction contract" below). **Publishing** renders two COMMITTED,
tracked artifacts from a run's aggregate — `src/publish.ts`:

- **`packages/bench/RESULTS.md`** — the full human-friendly document: a
  provenance header, then exactly the same per-scenario × arm × model table,
  legend/footnotes, "Repeat spread", and "Paired comparison" sections
  `summary.md` renders (`report.ts`'s `renderSummaryBody`, shared rather than
  duplicated).
- **The root `README.md`'s managed block**, between `<!-- bench:start -->` and
  `<!-- bench:end -->` markers — a compact top-line table, one row per (arm,
  model) collapsed across every scenario (escaped defects, confirmed review
  defects, planted-bug catch rate, mean cost, mean duration —
  `aggregateByArmModel`/`renderCompactArmModelMarkdown`, reusing the exact same
  `reduceGroup` reduction `summary.md`'s per-scenario rows use), the same
  provenance header, and a link out to `RESULTS.md` for the full detail. The
  replace is **idempotent** — re-publishing rewrites only the content between
  the markers, mirroring `scripts/mise-tasks/agents/sync`'s CLAUDE.md
  shared-block pattern. If `README.md` has no markers yet, the block is inserted
  before the first `## License` heading (or appended at the end if there is
  none).

Two flags drive it:

- **`--publish`** — after a live matrix run finishes, publish from that run's
  own results (in addition to writing the usual gitignored report).
- **`--publish-from <reportDir>`** — standalone mode: re-render the publish
  artifacts from an EXISTING report dir's `aggregate.json`, with no agent re-run
  at all. Works with a hand-merged report directory too (e.g.
  `packages/bench/reports/2026-07-16-full-run-merged/`), since it only ever
  reads `{meta, cells}` back off disk. Mutually exclusive with every
  cell-selecting flag, `--publish`, and `--review-report` — it is its own
  standalone mode, like `--review-report`, and only one standalone mode may run
  per invocation.

**Provenance is point-in-time, not a release guarantee.** Both documents open
with the same header: the commit SHA (hyperlinked to
`https://github.com/<org>/<repo>/commit/<sha>`, with org/repo derived from the
`origin` remote at runtime — never hardcoded), the tag name if HEAD is EXACTLY
tagged, the publish date (ISO), the Claude Code version, the model ids + efforts
and arms actually present in the published results, cell/repeat counts, and
judge status. When the working tree was dirty or the branch wasn't `main` at
publish time, an explicit **WARNING** banner says so — and the publish still
happens regardless; the banner is a disclosure, not a gate. This is why the
**canonical publish** is from a clean `main` checkout: `RESULTS.md`/the README
block read as "what cospec looked like at commit X," and that claim is only as
trustworthy as the commit it names. A publish from a dirty branch (e.g. while
developing this very feature) is legitimate for smoke-testing the mechanism, but
its WARNING banner is the harness telling you, honestly, not to treat it as that
release-verified claim.

Every publish passes through the same redaction self-check as every other bench
artifact (see below) before either file is written.

## Output & redaction contract

Reports are written to `packages/bench/reports/<ts>/` (git-ignored): per-cell
`cells.jsonl`, an aggregate `aggregate.json` (raw rows + means, and — per
"Repeats and statistical significance" above — full mean/min/max/stddev
summaries over repeats), a human-readable `summary.md` with the main scenario ×
arm × model table — grouped by SCENARIO ID, not cospec type, so a `-hard`
variant never merges into its base scenario's row (see "Hard-mode variants"
above) — reporting quality, schema conformance, native-valid rate, escaped
defects, confirmed review defects, planted-bug-caught rate, task-done rate,
duration, cost, and tokens, a "Repeat spread" section, and a "Paired comparison"
section, plus a `snapshots/` directory holding each cell's redacted artifact
snapshot (`<cellKey>.json`) and its redacted code diff (`<cellKey>.diff`, the
input to the adversarial review stage). The artifact snapshot is also the input
`--judge-report` (see above) rebuilds a past cell's judge text from, without
re-running any agent. Every object passes a **sentinel self-check before it
touches disk**: reports carry only counts, scores, rule ids, durations,
token/cost telemetry, and redacted artifact/diff text — never an API key, raw
prompt, completion, or fixture-unique string. If any sentinel survives into a
report object, the write throws rather than leak. This mirrors the
[eval's redaction discipline](./eval.md#redaction-contract).

`packages/bench/RESULTS.md` and the root `README.md`'s managed block (see
"Publishing" above) are the only bench artifacts that are NOT git-ignored — they
are the committed, share-with-the-team view of a run, rendered on demand via
`--publish`/`--publish-from` rather than written automatically by every run.
They pass through the exact same sentinel self-check before either file is
written, so a publish carries the same guarantee as every gitignored report:
only counts, scores, telemetry, and provenance — never a key, prompt,
completion, or fixture-unique string.
