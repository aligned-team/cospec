# Tasks

## 1. Remove ask rules

- [x] 1.1 Delete the `permissions.ask` array from `.claude/settings.json`,
      keeping `permissions.allow` unchanged, and verify the file is valid JSON
      (`jq . .claude/settings.json`) with no `ask` key
      (`jq 'has("ask")' <<< "$(jq .permissions .claude/settings.json)"` returns
      `false`) -> valid JSON, `has("ask")` returned `false`
- [x] 1.2 Run `mise run format:fix` and verify `.claude/settings.json` still has
      no `ask` key and `git diff` shows no unrelated formatting churn staged ->
      ran; only `.claude/settings.json` and new `openspec/changes/` files
      touched

## 2. Verify

- [x] 2.1 Run `mise run check` and verify it is fully green (no doc or shared.md
      updates were needed — no statement about ask rules existed to become
      false) -> `mise run check` exited 0, all suites passing
