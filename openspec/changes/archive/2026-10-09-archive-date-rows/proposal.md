# Proposal

## Why

`bun test` runs the suite process in UTC unless `TZ` is set, while a spawned
child inherits the machine's own zone, so the contract rows that expect an
archive slot computed in-process (`formatLocalDate()`) disagree with the slot
cospec and the pinned binary stamp whenever the two zones are on different
calendar days (19:00-24:00 America/Chicago). Both products stamp the local date,
as the binary's `formatLocalDate` does; the defect is in the harness, which
hands children a zone the suite never used.

## What Changes

- `apps/cli/test/fixtures/support.ts`: `withSuiteZone()` pins `TZ` to the
  suite's own zone where a child is spawned (`spawn`, `runBinary`, and the
  oracle's `oracleSpawn`), so every child (cospec, the pinned binary, the
  oracle) stamps dates in the zone the test's expected date is computed in. An
  explicit `TZ` from a caller still wins. It is applied at the spawn, never
  inside `oracleEnv()`: several suites assign an `oracleEnv` onto `process.env`
  and later `delete` its keys, and in Bun a `delete` of an assigned `TZ` leaves
  later `TZ` assignments without effect, which broke the zone-skewing rows of
  `archive-gotchas.test.ts` in the full contract run.
- `apps/cli/test/unit/support-env.test.ts`: rows proving a child spawned through
  the helpers sees the suite's zone (including one assigned to `process.env.TZ`
  mid-suite), that a caller's `TZ` wins, and that the sandbox envs carry no
  `TZ`.

## Impact

Test harness only. Rows 2.1-2.3 of `archive-no-validate.test.ts` (and every
other row expecting an in-process date) pass at any hour in any machine zone. No
product code, docs, or released behavior changes.
