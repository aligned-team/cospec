## 1. Operating-root abstraction

- [x] 1.1 Add `Root` + `localRoot` and `openspec store ls --json` typing to
      core/openspec.ts
- [x] 1.2 Add core/root.ts with `resolveRoot`, `configStorePointer`,
      `resolveStore`
- [x] 1.3 Add the `--store` global flag to the CLI dispatcher

## 2. Thread the root through every change command

- [x] 2.1 Make the typed wrapped-call helpers take a `Root`
- [x] 2.2 Update
      new/validate/apply/archive/status/list/instructions/sync-blockers/migrate

## 3. Tests

- [x] 3.1 Unit-test root resolution (local, config pointer,
      references-not-a-root)
- [x] 3.2 Integration-test the full store lifecycle (new → gate → archive →
      fan-out → spec-merge)
