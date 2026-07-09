## Why

`store-aware-commands` (PR #16) merged to `main` with its OpenSpec change left
unarchived — a process mistake. The archive-before-merge rule existed only as a
trailing sentence at the end of workflow step 6 in `.agents/shared.md`, with no
dedicated section covering branch, PR, and merge conventions for agents to find.

## What Changes

- `.agents/shared.md` — add a new "Branch, PR, and merge flow" section
  codifying: no direct commits to `main`; worktree branch + PR with green
  checks; rebase onto `main` with `--force-with-lease`, never merge commits;
  `archive` as the final commit on the PR branch before merge; and the recovery
  path if a change lands unarchived anyway. Step 6 of "The cospec workflow" is
  tightened to point at the new section instead of burying the requirement.
- `CLAUDE.md` / `AGENTS.md` — regenerated via `mise run agents:sync` to pick up
  the shared-block edit.

## Impact

Affects agent-readable guidance only (`.agents/shared.md`, generated
`CLAUDE.md`/`AGENTS.md`). No code, schema, or CLI behavior changes.
