# Tasks

## 1. Regression test

- [ ] 1.1 Add exactly-one-JSON-document assertions to the embedded-bundle test
      in `pack-standalone.test.ts` (a passthrough and the bundle's `new change`
      call) and verify they fail before the fix

## 2. Fix

- [ ] 2.1 Build the vendored bundle through a transform that removes OpenSpec's
      main-module self-run block and fails when it is not found exactly once,
      and verify with a direct bundle run
- [ ] 2.2 Regenerate the committed bundle with `mise run vendor:openspec` and
      verify `vendor:openspec:check` passes
- [ ] 2.3 Verify the regression test passes and `mise run check` plus
      `mise run test:pack` are green
