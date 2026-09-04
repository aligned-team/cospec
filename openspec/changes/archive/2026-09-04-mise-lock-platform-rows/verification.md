## 1. Lockfile drift is caught in CI [critical]

- [~] 1.1 @runtime read the guard step's log on the real `ubuntu-latest` GitHub Actions runner -> defer: no real GitHub Actions run available in this session. Closest available proxy run: in a flat clone of this branch (outside the main checkout, so no inherited ancestor config), the guard's exact command pair `mise install` then `git diff --exit-code mise.lock` exited 0, and `mise run check` in that same clone exited 0 with every suite green. The actual `ubuntu-latest` runner log for the "mise lockfile drift gate" step must still be read on the PR's first CI run.
- [x] 1.2 @integration (agent) bumped `bun` from `1.3.14` to `1.3.13` in `mise.toml` (no lockfile regen), ran `mise install && git diff --exit-code mise.lock` -> exit 1, diff showed `mise.toml` version line changed and 44 lines of `mise.lock` bun platform-checksum rows removed; reverted both files with `git checkout -- mise.lock mise.toml`, confirmed `git status --porcelain` shows no diff on either file afterward.
- [x] 1.3 @integration (agent) on the unmodified checkout ran `cp mise.lock /tmp/lock.bak && mise install && diff /tmp/lock.bak mise.lock` -> zero diff lines (only hk hook install messages on stdout, no lockfile change), so the guard does not fire spuriously.

## 2. No collateral CI change

- [x] 2.1 @integration (agent) ran `git status --porcelain` -> only `.github/workflows/ci.yml` was modified by this change (plus pre-existing untracked/unrelated `.gitignore` edit and openspec change dirs from sibling changes, not touched here); `mise.lock` unchanged.
- [x] 2.2 @integration (agent) ran `mise exec -- actionlint .github/workflows/ci.yml` -> exit 0, no findings, on the edited workflow with the new "mise lockfile drift gate" step in the `ci-bun` job.
