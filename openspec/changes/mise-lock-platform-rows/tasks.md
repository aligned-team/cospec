## 1. Add the drift guard

- [x] 1.1 Add a "mise lockfile drift gate" step running `mise install` then
      `git diff --exit-code mise.lock` to a `setup-mise`-using job in
      `.github/workflows/ci.yml`, and verify `mise run check` (actionlint)
      accepts the file

## 2. Prove both directions

- [x] 2.1 Verify the guard passes on the unmodified checkout:
      `cp mise.lock /tmp/lock.bak && mise install && diff /tmp/lock.bak mise.lock`
      reports zero diff lines
- [x] 2.2 Verify the guard fails on real drift by temporarily bumping a pinned
      tool version in `mise.toml`, observing `git diff --exit-code mise.lock`
      exit non-zero, then reverting the bump

## 3. Record the non-reproduction

- [x] 3.1 Confirm no lockfile regeneration is committed by verifying
      `git diff --stat mise.lock` is empty on the branch
- [x] 3.2 Complete `verification.md` with observed results, including the CI
      runner log line for the guard step
