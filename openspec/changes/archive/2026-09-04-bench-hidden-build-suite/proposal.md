## Why

`packages/bench/test/unit/hidden.test.ts` fails because
`packages/bench/scenarios/hidden/build/` does not exist: the root `.gitignore`'s
unanchored `build/` rule silently swallowed the suite when the rest of the
hidden suites landed, so the `build` scenario — already specified by
`packages/bench/scenarios/build.ts` — is the one scenario with no held-out
tests.

## What Changes

- Add a `!packages/bench/scenarios/hidden/build/` negation to `.gitignore`, next
  to the existing `!openspec/schemas/build/` negation, so the directory can be
  tracked at all.
- Add `packages/bench/scenarios/hidden/build/build.test.ts` with 4 cases against
  the `fixtures/build-script` fixture: `bun run build` exits 0, `dist/index.js`
  is emitted, the built bundle still produces the fixture's expected
  `formatGreeting('world')` output, and `package.json`'s `scripts.build` is
  present and non-empty.
- Imports follow the hidden-suite convention (`../src/...`, `../package.json`,
  `../dist/...`), since the harness copies the directory to
  `<sandbox>/hidden-tests/`.

## Impact

- `.gitignore`, `packages/bench/scenarios/hidden/build/build.test.ts`.
- `packages/bench/test/unit/hidden.test.ts` goes green: its registry-integrity
  check (4–8 `test(` cases per suite) and its fail-before/pass-after check
  against `REFERENCE_FIXES.build` both gain a `build` entry to exercise.
- No new behavior is specified — the `build` scenario and its reference fix
  already exist; this only backfills its escaped-defect signal.
