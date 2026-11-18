# Tasks

## 1. Move

- [x] 1.1 Move `EXIT` to `core/exit.ts` and the help renderers to
      `core/help-text.ts`, verbatim, and repoint every importer, and verify
      typecheck and lint pass with no `cli.ts` re-export
- [x] 1.2 Add the registry row to `support-test-scope.test.ts`, and verify it
      fails with one command importing `EXIT` from `cli.ts` again

## 2. Verify

- [x] 2.1 Verify the unit, contract and integration suites and
      `test:pack:standalone` pass unchanged, and measure the selection shares
      before and after. The archive commit follows this one.
