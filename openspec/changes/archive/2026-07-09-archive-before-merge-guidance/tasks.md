## 1. Author the guidance

- [x] 1.1 Add a "Branch, PR, and merge flow" section to `.agents/shared.md` near
      "The cospec workflow" covering: no direct commits to `main`; worktree
      branch + PR with green checks; rebase with `--force-with-lease`, never
      merge commits; `archive` as the final commit on the PR branch before
      merge; recovery when a change lands unarchived.
- [x] 1.2 Tighten workflow step 6 in `.agents/shared.md` to point at the new
      section instead of burying the before-merge requirement in a trailing
      sentence.

## 2. Propagate and verify

- [x] 2.1 Run `mise run agents:sync` to regenerate `CLAUDE.md` / `AGENTS.md`
      from `.agents/shared.md`. -> Synced CLAUDE.md and AGENTS.md.
- [x] 2.2 Run `mise run agents:check` to confirm no drift remains. -> "All
      shared blocks are in sync." (exit 0)
