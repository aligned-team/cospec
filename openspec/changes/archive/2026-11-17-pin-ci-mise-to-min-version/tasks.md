# Tasks

## 1. Pin and enforce

- [x] 1.1 `setup-mise` reads `min_version` from `mise.toml` and passes it to
      `jdx/mise-action` as `version`.
- [x] 1.2 Add `scripts/mise-tasks/lock` and the `lock` / `lock:check` tasks
      (`lock:check` in `mise run check`); the CI drift gate runs
      `mise run lock:check`; `mise.lock` joins every path filter that lists
      `mise.toml`; shellcheck covers the script. A run fails unless `mise lock`
      resolved every entry (no warning or error, `0 skipped`), runs with mise's
      hooks off, and each first run downloads to its own temp file before an
      atomic rename.
- [x] 1.3 Regenerate `mise.lock` with `mise run lock` (mise 2026.7.7) and verify
      `mise run lock:check` passes, a second run changes nothing, and the
      installed mise's `mise install` leaves it as is.

## 2. Docs and verification

- [x] 2.1 Update `.agents/shared.md` (then `mise run agents:sync`) and
      `CONTRIBUTING.md` with the rule and the tasks.
- [x] 2.2 Verify shellcheck, actionlint and `mise run check` pass. The archive
      commit follows this one.
