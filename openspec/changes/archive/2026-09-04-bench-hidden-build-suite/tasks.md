## 1. Untrack-proof the suite directory

- [x] 1.1 Add `!packages/bench/scenarios/hidden/build/` to `.gitignore` beside
      the `!openspec/schemas/build/` negation, with a comment naming the
      unanchored `build/` rule, and verify
      `git check-ignore -v packages/bench/scenarios/hidden/build/build.test.ts`
      reports no match
- [x] 1.2 Add `!packages/bench/scenarios/hidden/build` to `.oxlintrc.json`'s
      `ignorePatterns` beside the same unanchored `build` entry, and verify
      `oxlint packages/bench/scenarios/hidden/build/build.test.ts` actually
      lints the file rather than reporting "No files found to lint"

## 2. Write the held-out suite

- [x] 2.1 Add `packages/bench/scenarios/hidden/build/build.test.ts` with the
      four cases from the proposal using the `../` hidden-suite import
      convention, and verify `grep -c '^test('` on the file reports 4
- [x] 2.2 Confirm every case fails on the unmodified `fixtures/build-script`
      fixture and passes after `REFERENCE_FIXES.build`, verified by the
      fail-before/pass-after assertions in
      `packages/bench/test/unit/hidden.test.ts` for scenario id `build`

## 3. Verify end to end

- [x] 3.1 Run `mise run test` and verify
      `packages/bench/test/unit/hidden.test.ts` passes in full, including its
      registry-integrity case-count check
- [x] 3.2 Run `git status --short packages/bench/scenarios/hidden/build/` and
      verify the new file is tracked rather than ignored
