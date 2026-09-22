# Proposal: task-marker-coverage

## Why

`CHECKBOX_LIKE` in `apps/cli/src/core/tasks.ts` and
`apps/cli/src/core/verification.ts` is `/^\s*[-*]\s*\[[^\]]*\]/`, which
recognises only `-` and `*` bullets. A task or verification row written with any
other CommonMark list marker — `+ [ ] 1.1 x`, `1. [ ] 1.1 x`, `1) [x] 1.1 x` —
matches neither the conforming grammar (`TASK_VALID`, `ROW_PREFIX`) nor the
checkbox-like detector, so `parseTasks` and `parseVerification` record it as
neither an item nor a malformed line: it disappears from the parse entirely.

Both parsers feed hard archive gates. `cospec archive` filters
`parsedTasks.items` for unchecked work, and `computeVerificationVerdict` counts
only parsed rows and blocks only on parsed malformed rows. A `tasks.md` whose
remaining work is written with `+` bullets therefore archives with no
incomplete-task refusal, and a `verification.md` written entirely with `+`
bullets reports `0/0 verified` and clears `archive/verification-incomplete`.
That is a false archive PASS on two hard gates, which `CLAUDE.md` names a
release blocker. Upstream OpenSpec fixed the same class in its own tracker at
1.13.1 (`TASK_LINE_PATTERN` in `src/utils/task-progress.ts`), so at the next pin
bump cospec would also start contradicting the wrapped binary out loud.

## What Changes

- Widen both `CHECKBOX_LIKE` detectors to CommonMark's full list-marker set
  (`-`, `*`, `+`, `N.`, `N)`), with upstream's link-bullet guard so
  `- [Some doc](./doc.md)` is not mistaken for a checkbox.
- Keep `TASK_VALID` and `ROW_PREFIX` unchanged: the canonical cospec form stays
  `- [ ] N.M ...`. A widened line is therefore reported as a loud
  `tasks/checkbox-grammar` / `verification/row-grammar` ERROR with a
  `corrected:` hint, never counted as a second accepted grammar.
- Extend `correctTask` so its marker-stripping `replace` covers the widened set,
  keeping the `corrected:` hint right for `+` and ordered-list lines.
- Net effect: every previously silent drop becomes a validation ERROR, and the
  two hard archive gates refuse instead of passing.

## Capabilities

### Modified Capabilities

- `change-progress-reporting`: task accounting must not silently drop a
  checkbox-like task line written with a non-canonical list marker.
- `verification-artifact`: the ledger's row grammar must not silently drop a
  checkbox-like row written with a non-canonical list marker.

## Impact

- `apps/cli/src/core/tasks.ts` — `CHECKBOX_LIKE`, `correctTask`.
- `apps/cli/src/core/verification.ts` — `CHECKBOX_LIKE`.
- `apps/cli/test/unit/parsers/tasks.test.ts`,
  `apps/cli/test/unit/parsers/verification.test.ts` — marker coverage and
  link-bullet guard cases.
- Archive gate regression coverage for the two hard gates.
- `docs/validation.md` and `apps/docs/reference/validation-rules.md` — the
  widened detector set for both rule ids.
- No flag, exit code, JSON shape, or OpenSpec pin moves.

## Surfaces

No surface is flagged: this change adds no command, flag, output shape, exit
code, external contract, or agent-facing prose. Its only user-visible effect is
that two existing validation rules now fire on input they previously dropped
silently.

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
