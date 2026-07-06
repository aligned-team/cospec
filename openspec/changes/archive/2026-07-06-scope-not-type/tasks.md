## 1. Commitlint rule

- [x] 1.1 Remove `chore` from `commitlint.config.mjs` scope-enum
- [x] 1.2 Add an inline local plugin rule `scope-not-type` (error) that fails
      when scope === type, with a message to omit the scope
- [x] 1.3 Verify `echo 'chore(chore): x' | bunx commitlint` fails
- [x] 1.4 Verify `echo 'chore: archive foo' | bunx commitlint` passes
- [x] 1.5 Verify `echo 'fix(ci): y' | bunx commitlint` passes
- [x] 1.6 Confirm `apps/cli/src/commands/check-commit.ts` only does the advisory
      type-vs-schema heuristic and does not validate scopes (leave it unchanged
      if so)

## 2. Documentation

- [x] 2.1 Update CONTRIBUTING.md "Commit format" section: scope names an area,
      is omitted when there is no meaningful area, and must never repeat the
      type; archive commits are `chore: archive <slug>`

## 3. Verification

- [x] 3.1 `mise run check` green
