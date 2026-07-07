## 1. `set-version` is a formatting no-op after the fix [critical]

- [x] 1.1 @runtime (agent) run `set-version 0.1.0 --root <temp copy>` against a repo already normalized by `format:fix`, then `oxfmt --check` the copy -> all 8 manifests + bun.lock reported "unchanged"; zero non-version diffs

## 2. Pre-commit hook catches JSON/Markdown drift

- [x] 2.1 @integration (agent) hand-mangle a `package.json` array to multi-line in a scratch copy and run the oxfmt step against it -> `oxfmt --check` exited 1 and listed the mangled file under "Format issues found"
