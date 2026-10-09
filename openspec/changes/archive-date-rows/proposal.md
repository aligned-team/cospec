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

- `apps/cli/test/fixtures/support.ts`: `envWithoutColorForcing()` and
  `oracleEnv()` pin `TZ` to the suite's own zone, so every spawned child
  (cospec, the pinned binary, the oracle) stamps dates in the zone the test's
  expected date is computed in. An explicit `TZ` from a caller still wins.
- `apps/cli/test/unit/support-env.test.ts`: rows proving a child spawned through
  the helpers sees the suite's zone, including a zone assigned to
  `process.env.TZ` after startup.

## Impact

Test harness only. Rows 2.1-2.3 of `archive-no-validate.test.ts` (and every
other row expecting an in-process date) pass at any hour in any machine zone. No
product code, docs, or released behavior changes.
