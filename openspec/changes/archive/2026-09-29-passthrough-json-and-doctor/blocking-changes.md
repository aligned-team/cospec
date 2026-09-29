# Dependencies

## Blocked by

- [x] `unknown-option-contract` — the command table (`core/command-table.ts`),
      the forward-row relay (`core/forward-relay.ts`), the remedy allowlist
      (`core/remedies.ts`), the upstream oracle
      (`test/contract/support/upstream-oracle.ts`), the reachability and
      remedy-enumeration tests this change measures against _(archived
      2026-09-28)_

## Soft-blocked by

None.

## Notes

`root-resolution-parity` is not archived on this branch, so it cannot be listed
above without failing `blockers/dangling-ref`; the sequencing is recorded here
and in tasks group 9 instead. This change consumes three things it provides: the
shared structural respell helper in `core/passthrough-command.ts` (the field-map
helper `context`'s reference block is respelled through), the resolver's
ancestor walk and `config.yml` pointer read (doctor's subdirectory and
`config.yml` rows compare against it), and the resolver's `directory not found`
answer and `{status:[diagnostic]}` `--json` document for resolver errors (reused
verbatim for `store`/`config`/`workset`'s `--cwd` check). Groups 1–8 do not
depend on it and land first; group 9 runs after this branch rebases onto `main`
once `root-resolution-parity` has merged, so this change's archive — the PR's
last commit — follows that merge.

`upstream-spellings` runs alongside this change. Its files and this change's are
disjoint except five shared ones, edited in separate hunks:
`apps/cli/src/core/command-table.ts` (its rows versus this change's one additive
parser export), `apps/cli/src/core/remedies.ts` (allowlist entries each change
adds), `test/contract/support/remedy-sources.ts` (each change removes its own
`REACHABLE_OWNED` rows), `test/contract/relayed-remedies.test.ts` (its
`instructions` rows versus this change's `context` rows) and the
`Forwarded commands are declared, not re-parsed` requirement of
`cli-option-contract`, which both modify — whichever archives second rebases its
MODIFIED block onto the living text the first one wrote.

`harness-adapter-table` holds its `doctor.ts` wiring track until this change
merges.
