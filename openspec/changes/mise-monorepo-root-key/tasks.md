## 1. Update the root mise config

- [x] 1.1 Replace `experimental_monorepo_root = true` with
      `monorepo_root = true` in `mise.toml` and verify
      `grep -rn experimental_monorepo_root` finds no matches repo-wide
- [x] 1.2 Raise `min_version` to `"2026.7.7"` in `mise.toml` and verify
      `mise install` exits 0 and `mise cfg ls` loads this repo's `mise.toml`
      with no deprecation warning attributed to it

## 2. Verify the failing test now passes

- [x] 2.1 Run the `e2e/release/set-version.test.ts` suite and verify its
      `expect(stderr).toBe('')` assertion passes
- [x] 2.2 Run `mise run check` and verify the mise-deprecation failure is gone
      from its output

## 3. Record how 2.1/2.2 were observed

- [x] 3.1 Because this worktree is physically nested inside the main checkout at
      `~/repos/sqf/aligned/cospec/`, mise's `monorepo_root` walk-up loads that
      checkout's still-unfixed `mise.toml` and warns about it, which keeps
      `expect(stderr).toBe('')` red locally for reasons this branch cannot fix.
      Verify instead in a flat clone of this branch at a path outside the main
      checkout, and record both results.
