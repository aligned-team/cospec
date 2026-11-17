# Tasks

## 1. Lockfile

- [x] 1.1 Add the cocogitto `platforms.linux-arm64-musl` entry to `mise.lock`
      byte for byte as the drift gate's `git diff` printed it on PR #102's CI
      run (mise v2026.11.9), and verify `git diff` shows exactly that 6-line
      hunk and nothing else. The archive commit follows this one.
