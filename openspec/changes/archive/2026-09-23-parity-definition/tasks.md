# Tasks

## 1. Reword the misleading sentences

- [x] 1.1 Reword the "thin, opinionated wrapper" sentence and the "cospec never
      replaces OpenSpec" wrapping-facts sentence in `.agents/shared.md`, and
      verify with `git diff .agents/shared.md`
- [x] 1.2 Reword the "every everyday OpenSpec surface" sentence in
      `.agents/shared.md`'s Engineering discipline section, and verify with
      `git diff .agents/shared.md`
- [x] 1.3 Run `mise run agents:sync` to propagate to `CLAUDE.md`/`AGENTS.md`,
      and verify with `mise run agents:check`
- [x] 1.4 Reword the matching "cospec never replaces OpenSpec" sentence in
      `README.md`, and verify with `git diff README.md`
- [x] 1.5 Reword the "cospec never replaces OpenSpec" heading and the "every
      everyday OpenSpec surface" sentence in
      `apps/docs/concepts/how-it-relates-to-openspec.md`, and verify with
      `git diff apps/docs/concepts/how-it-relates-to-openspec.md`
- [x] 1.6 Reword the "Wraps real OpenSpec, never replaces it" feature title and
      details in `apps/docs/index.md`, and verify with
      `git diff apps/docs/index.md`

## 2. Validate the docs site and full gate

- [x] 2.1 Run `mise run format:fix` and verify a clean `mise run format:check`
- [x] 2.2 Run `mise run docs:build` and verify it exits 0
- [x] 2.3 Run `mise run agents:check` and verify it reports all shared blocks in
      sync
- [x] 2.4 Run
      `env -u FORCE_COLOR -u NO_COLOR -u COLORTERM -u CLICOLOR mise run check`
      and verify it exits 0
