Run the deterministic apply gate for a change, then implement its tasks. The
gate is a command whose exit code you must obey — never re-derive it by reading
`blocking-changes.md` yourself.

{{ROOT_GUARD}}

## 1. Select the change

If the user named one, use it. Otherwise run `cospec list --json`: if exactly
one active change exists, use it and announce `Using change: <slug>`. When
several active changes exist, choose as **Choosing a change** above says.

## 2. Run the gate

```
cospec apply <slug> --json
```

Obey the exit code:

- **exit 0 — clear.** Read the returned `apply.contextFiles` and `apply.tasks`.
  Work through the pending tasks in order, marking each `- [x]` in `tasks.md`
  only once the behavior the specs and tasks describe is actually implemented —
  a partial or narrowed implementation is not a checked box. Pair every code
  task with its test/verification task. The `gate.synced` list shows blocker
  boxes the command auto-checked because their dependency is already archived —
  trust it over a manual read of the file.

  The same `apply` object may carry `apply.context` and
  `apply.operationGuidance`, the project's own inputs from its config. Treat
  `context` as a required
  prompt-level input. Read and consider it, and apply relevant project facts,
  conventions, and constraints while implementing. Treat `operationGuidance` as
  optional additive advice. Read and consider every entry, and follow entries
  that are applicable and compatible with the built-in workflow.

  Keep both fields separate from the gate, the returned state, tasks, progress,
  `contextFiles`, and the built-in `instruction`. They are not evidence of task
  completion, do not replace the built-in instruction, and do not permit
  bypassing a blocked state. If context conflicts with the built-in instruction,
  an explicit user choice, or a CLI-controlled value, report the conflict and
  preserve the controlling value. If guidance is inapplicable or conflicts with
  those controlling inputs, do not follow it and explain why. Do not copy
  `context` or `operationGuidance` verbatim into implementation files or
  planning artifacts unless the user separately asks for that content. These are
  prompt-level behavior contracts, not enforceable checks.

  If a task needs work beyond what the specs and tasks describe, or you find
  yourself tempted to drop, narrow, defer, or carve an exception out of
  specified behavior to make it fit: stop, name the added scope to the user, and
  ask. Never absorb it silently.

- **exit 2 — blocked.** STOP. `gate.reason` is either `missing-artifacts` or
  `hard-blockers`. Relay each listed item and what it provides. For a hard
  blocker, name the blocking change and suggest implementing and archiving it
  first. Do not work around the gate.
- **exit 3 — soft-blocked.** List each soft blocker and what degrades without
  it. Ask the user to confirm; only then re-run
  `cospec apply <slug> --allow-soft --json`. Never skip silently.

## 3. Finish

When every task is checked, tell the user the change is ready to archive — next
step `[[opsx:if-workflow archive]]/cospec:archive[[opsx:else]]cospec archive <slug>[[opsx:end]]`.
