# Tasks

## 1. Selection by declared readers

- [x] 1.1 Replace the whole-suite rule for non-code files with `selectTests`:
      the import graph, `FS_READERS`, fixture uses, `UNREAD` and
      `GLOBAL_INPUTS`, and verify a docs page selects only the docs table test
      and `support-test-scope.test.ts` passes (40)
- [x] 1.2 Declare every file under `test/` that builds a repository path, and
      verify the discovery check lists exactly them and each glob matches a file

## 2. Docs and verification

- [ ] 2.1 Update `CONTRIBUTING.md` and `.agents/shared.md` (then
      `mise run agents:sync`), and verify the unit, contract and integration
      suites pass whole and this PR's CI is green. The archive commit follows
      this one.
