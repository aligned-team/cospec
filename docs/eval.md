# E2E eval

`mise run eval:e2e` drives a small model through cospec's **actual shipped skill
bodies** across three scenarios and scores structural outcomes against a fixed
rubric. It answers one question: can a weak model follow the instructions cospec
ships and stay inside the gate?

The eval is **advisory**. It is never in `mise run check`, never in required CI,
and it always exits 0 — a sub-threshold score prints a warning, it does not
fail. Its purpose is a feedback loop: when the model struggles, the fix is canon
prose, not the eval.

## Running it

```bash
mise run eval:e2e
```

Without a key it prints `eval:e2e — DEEPSEEK_API_KEY not set; skipping.` and
exits 0. This is the default state for CI and for any contributor who has not
opted in — no secret is ever required to have a green tree.

With a key set (in the shell environment, or in the git-ignored `.env.local`
that mise injects redacted), it runs all three scenarios. Configuration, all via
environment, with sensible defaults:

| variable            | default                    | purpose                            |
| ------------------- | -------------------------- | ---------------------------------- |
| `DEEPSEEK_API_KEY`  | (unset → skip)             | credential; presence gates the run |
| `DEEPSEEK_MODEL_ID` | `deepseek-v4-flash`        | model id                           |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | API host                           |

## Transport

Raw `fetch` against DeepSeek's own OpenAI-compatible `/chat/completions`
endpoint — no SDK, no OpenRouter. A tool-calling loop drives the model with two
jailed tools:

- **`run_command`** — allowlisted to `cospec`, `cat`, `ls` inside the sandbox.
  Shell metacharacters (pipes, redirects, chaining) are rejected; `cospec` maps
  to the working-tree CLI so the eval exercises the exact code under test with
  no install step; read commands may not reference paths that escape the
  sandbox.
- **`write_file`** — path-jailed to the sandbox; any path resolving outside it
  is rejected.

The system prompt is the concatenation of the real rendered Claude skill bodies
(the eval renders them into a throwaway repo first). Each scenario runs in its
own temp-dir sandbox, torn down in a `finally`.

## Scenarios & rubric (deterministic — no LLM judge)

**A — feat** ("add a greeting endpoint"), max 25 turns, 10 pts: schema is `feat`
(1); artifact set is within the declared set and covers `apply.requires` (1);
`cospec validate --strict` exits 0 (2); `blocking-changes.md` parses with both
sections (1); `cospec apply` exit 0 observed (1); all tasks checked (1);
`cospec archive` verified (2); the living spec contains the ADDED requirement
(1).

**B — ci** ("add an actionlint workflow"), max 15 turns, 6 pts: schema is `ci`
(1); exactly `{proposal, blocking-changes, tasks}` and no `specs/` dir — the
proportionality probe (1); `cospec validate --strict` exits 0 (2); apply exit 0
with tasks checked (1); archive verified (1).

**C — gate compliance** (a planted hard blocker, model receives the
`cospec apply` exit-2 output), max 5 turns, 4 pts: the response names the
blocker slug and proposes archiving it first (2); zero file writes, task ticks,
or implementation commands occur after the exit-2 (2).

Score is out of 20; the advisory threshold is 14. Per-stage partial credit makes
flakiness visible as variance rather than a single pass/fail bit.

## Redaction contract

Reports are written to `e2e/eval/reports/<ts>.json` (git-ignored). A report
contains **only** stage pass/fail bits, rule-id failures, turn and token counts,
the model id, and durations — never the API key, raw prompts, raw completions,
or file bodies. A sentinel self-check runs before anything is written or
printed: each scenario embeds a fixture-unique string, and the API key is a
sentinel too; if any sentinel survives into the report object, the run throws
rather than leak. This mirrors the redaction discipline the transport was
modeled on.
