# Verification

## 1. The contract shards [critical]

- [ ] 1.1 @runtime (agent) this PR's CI on GitHub's `ubuntu-latest` runner (`pull_request`) -> `ci-contract-timings` finds no recorded durations yet, so the four `ci-contract` shards cut the whole contract suite (the change edits `apps/cli/mise.toml`) by file count and run their files one at a time, together each of the 51 files once; `ci-bun` runs the unit and integration files one at a time; `ci-gate` waits on the shards and is green
- [x] 1.2 @integration (agent) bun 1.4.4's `--shard=<n>/4` over the whole contract suite with `--timings` seeded from the last sequential CI run's per-file durations (`profiles.test.ts`'s split by its describes), each shard recording what it ran under a filter that matches no test -> each of the 51 files in exactly one shard -> shards of 17, 14, 9 and 11 files, 605, 691, 780 and 498 s of CI time; 51 of 51 files, none twice
- [x] 1.3 @integration (agent) bun 1.4.4's `--update-timings` under `--shard` with explicit `./` targets, and the `actions/cache` restore source at the pinned v6.1.0 -> a shard records only its own files, relative to `apps/cli`; a missing `--timings` path is skipped; a `lookup-only` restore names the entry it matched -> `next/<n>.json` created holding `test/contract/glob.test.ts` and its shard-mate only; the missing path read as nothing; the cut keeps neighbouring paths together (`glob` and `hard-reality` against `nested-detector` and `version-tripwire`); `NullStateProvider` maps the matched key to `cache-matched-key` before the `lookup-only` branch

## 2. Recorded durations

- [~] 2.1 @runtime (agent) `main`'s push run after the merge: its shards record their files' durations, `ci-contract-timings-save` stores them, and the next run's shards restore that one entry and cut by it -> defer: only a push to `main` records durations, so this is observable only once this PR has merged

## 3. Local runs and selection

- [x] 3.1 @unit (agent) `run-changed.ts`'s `parseArgs` and `bunTestArgs` -> suites run with `--parallel` and `--timeout 30000` by default; `--no-parallel` drops `--parallel`; everything after `--` reaches `bun test` as it is, a suite name included; a suite named only after `--` is no suite -> support-test-scope 44 pass
- [x] 3.2 @integration (agent) the six `profiles-*` files under `--parallel`, and `support-test-scope.test.ts` (`FS_READERS` lists exactly the files that build a repository path) -> the same 110 tests `profiles.test.ts` had pass -> 110 pass, 0 fail, in 165 s against about 8 minutes for the one file; support-test-scope 41 pass before the runner rows
- [x] 3.3 @integration (agent) `mise run test:contract` locally, 12 cores -> the whole suite passes -> 3235 pass, 0 fail across 51 files in 481 s
