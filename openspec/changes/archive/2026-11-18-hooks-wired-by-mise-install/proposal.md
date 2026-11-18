# Proposal

## Why

`CONTRIBUTING.md` says `bun install`'s postinstall wires the git hooks, but
`package.json` has no postinstall script: `mise install` wires them, through the
`postinstall` hook in `mise.toml` (`hk install --mise`). It also says nothing
about where the hooks live, so it reads as if they come from somewhere outside
the repository, a global git template for instance.

## What Changes

- `CONTRIBUTING.md`: `mise install` wires the hooks (its `postinstall` runs
  `hk install --mise` on every install); hk writes config-based hooks into the
  clone's own `.git/config`, shared by its worktrees, with nothing from the
  global git config; `mise` must be on git's `PATH`; Git 2.54+ joins the
  prerequisites (older Git gets `.git/hooks/` shims).

## Impact

- Contributor setup docs only.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
