# Tasks

## 1. Harden the wrapped spawn env

- [x] 1.1 Replace the `WRAPPED_ENV` overlay in `apps/cli/src/core/openspec.ts`
      with a builder that derives the child env from a `process.env` snapshot,
      deletes `FORCE_COLOR`/`COLORTERM`/`CLICOLOR`/`CLICOLOR_FORCE`, then
      applies the pinned
      `NO_COLOR`/`BUN_BE_BUN`/`OPENSPEC_TELEMETRY`/`OPENSPEC_NO_COMPLETIONS`
      keys, and verify `spawnRaw` passes the built env and the exported surface
      still type-checks under `mise run typecheck`
- [x] 1.2 Add the colour-deletion comment naming the Node
      `warnOnDeactivatedColors` behaviour as the non-obvious constraint, and
      verify `mise run lint` and `mise run format:check` pass

## 2. Desensitise the test harness

- [x] 2.1 Apply the same colour-variable deletion to the `spawn` helper in
      `apps/cli/test/fixtures/support.ts` (reusing the builder rather than
      duplicating the list) and verify `mise run test:contract` and
      `mise run test:integration` pass with
      `FORCE_COLOR=3 COLORTERM=truecolor CLICOLOR=1` exported
- [x] 2.2 Confirm the same suites still pass with those variables unset and
      verify via
      `env -u FORCE_COLOR -u COLORTERM -u CLICOLOR mise run test:contract`

## 3. Pin the behaviour and close out

- [x] 3.1 Add a unit test asserting the builder strips all four colour variables
      and keeps the pinned keys, and verify `mise run test` is green
- [x] 3.2 Record every verification.md row with its observed result (or an
      explicit defer) and verify `mise run check` passes end to end
