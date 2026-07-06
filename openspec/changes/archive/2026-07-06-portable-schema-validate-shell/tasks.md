## 1. Make the schema-validate task shell-portable

- [x] 1.1 Change `set -euo pipefail` to `set -eu` in the
      `openspec:schema:validate` task in `mise.toml`.
- [x] 1.2 Confirm `mise run openspec:schema:validate` still passes locally and
      the script contains no pipelines that need `pipefail`.
