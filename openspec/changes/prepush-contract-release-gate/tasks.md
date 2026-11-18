# Tasks

## 1. Hooks, release and selection

- [ ] 1.1 Add `contract` to the pre-push `test:changed` step, and verify
      `hk validate` passes and a push runs it
- [x] 1.2 Restore `release.yml` to its form before `scope-checks-to-changes`,
      add the `ci-gate` step to `bump`, drop `ci.yml`'s `workflow_call`, and
      verify actionlint passes and the gate's query reads real `main` commits
- [x] 1.3 Drop `profiles.test.ts`'s `cli.ts` import and narrow its
      `SOURCE_READERS` entry, and verify `support-test-scope.test.ts` passes

- [x] 1.4 Select from what a commit or push changes: the staged files, and each
      pushed ref's diff from what the remote has (hk's `hook_args` and
      `hook_stdin`), with the runner selecting by file list; verify a stacked
      branch's push, a fast-forward with a deletion, a force push, a ref
      deletion and a remote with none of the history

## 2. Docs

- [x] 2.1 Restore `docs/release.md` with the gate, update `CONTRIBUTING.md` and
      `.agents/shared.md` (then `mise run agents:sync`), and verify
      `agents:check` and `format:check` pass. The archive commit follows this
      one.
