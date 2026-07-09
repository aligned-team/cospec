---
name: cospec-apply-change
description: Run the apply gate for a change and implement its tasks, obeying the gate's exit code.
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.5.0
  contentHash: sha256:6bea0576ce5e31709933b7412fe889e6ea8f75ac24c7732a36bf32cfd9cb6983
---

Run the deterministic apply gate for a change, then implement its tasks. The
gate is a command whose exit code you must obey — never re-derive it by reading
`blocking-changes.md` yourself.

## 1. Select the change

If the user named one, use it. Otherwise run `cospec list --json` and pick, or
ask.

## 2. Run the gate

```
cospec apply <slug> --json
```

Obey the exit code:

- **exit 0 — clear.** Read the returned `apply.contextFiles` and `apply.tasks`.
  Work through the pending tasks in order, marking each `- [x]` in `tasks.md` as
  you complete it. Pair every code task with its test/verification task. The
  `gate.synced` list shows blocker boxes the command auto-checked because their
  dependency is already archived — trust it over a manual read of the file.
- **exit 2 — blocked.** STOP. `gate.reason` is either `missing-artifacts` or
  `hard-blockers`. Relay each listed item and what it provides. For a hard
  blocker, name the blocking change and suggest implementing and archiving it
  first. Do not work around the gate.
- **exit 3 — soft-blocked.** List each soft blocker and what degrades without
  it. Ask the user to confirm; only then re-run
  `cospec apply <slug> --allow-soft --json`. Never skip silently.

## 3. Finish

When every task is checked, tell the user the change is ready to archive — next
step `/cospec:archive`.
