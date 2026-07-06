## Why

The `openspec:schema:validate` mise task starts with `set -euo pipefail`, but
mise runs task scripts under `/bin/sh` (dash) on the Linux CI runner, which
rejects `set -o pipefail` (`sh: 1: set: Illegal option -o pipefail`). The step
fails immediately in the `ci-openspec` job. It passes on macOS only because that
host's `sh` is bash-compatible. The script contains no pipelines, so `pipefail`
is inert.

## What Changes

- `mise.toml` — change the `openspec:schema:validate` task's `set -euo pipefail`
  to the POSIX-portable `set -eu` (identical behavior; no pipes in the script).

## Impact

- Files: `mise.toml` only. No tool versions, workflows, or other tasks touched.
- Jobs: unblocks the "Validate composed schemas (raw openspec)" step of the
  `ci-openspec` job on Linux runners.
- Secrets/required checks: none affected.
