# Tasks

## 1. Pin spawned children to the suite zone

- [x] 1.1 Add rows to `apps/cli/test/unit/support-env.test.ts` first and verify
      they fail without the fix -> the first version's rows failed (no `TZ`
      pinned on the spawn env), as bun test leaves `$TZ` unset
- [x] 1.2 Pin `TZ` to the suite's zone with `withSuiteZone()` in `spawn`,
      `runBinary` and `oracleSpawn`, never in `oracleEnv()` (suites assign it
      onto `process.env` and `delete` it, and a Bun `delete` of an assigned `TZ`
      leaves later assignments without effect), and verify `support-env.test.ts`
      passes -> 6 pass, 0 fail
- [x] 1.3 Verify `archive-no-validate.test.ts` rows 2.1-2.3 with a forced split
      (children UTC-12, suite UTC) fail without the fix and pass with it -> 112
      pass / 3 fail (2.1, 2.2, 2.3) before; 115 pass after, under default and
      `TZ=Etc/GMT+12`
- [x] 1.4 Verify no product code, docs, or `.agents/shared.md` change is owed ->
      product's `formatLocalDate` already equals the pinned binary's
      `utils/date.js`; harness-only
- [x] 1.5 Run `mise run check` under UTC and under `TZ=America/Chicago` and
      verify both exit 0 -> both exit 0 (the Chicago run needed a rerun after
      one `bun add` failure in pack smoke under concurrent load; it passes
      alone)
- [x] 1.6 The archive commit follows this one:
      `cospec archive archive-date-rows` as the final commit on the branch
