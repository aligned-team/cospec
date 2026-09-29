# Tasks

## 1. Regression tests first

- [ ] 1.1 Reproduce the row's flake 20× in a Linux container and on macOS and
      verify the before rates are recorded in the ledger
- [ ] 1.2 Add the preload mechanism regression row to `handover-preload.test.ts`
      and verify it fails against the current preload in the container

## 2. Fix

- [ ] 2.1 Route `console.log`/`console.error` through the process streams in the
      handover preload and verify the regression row passes
- [ ] 2.2 Make `resetPiped`'s post-condition require one of the binary's answer
      sentences as stdout's last line and verify the reset rows pass
- [ ] 2.3 Loop the contract row 20× in the container and verify 0/20 failures

## 3. Docs and gate

- [ ] 3.1 Update `docs/architecture.md` and
      `apps/docs/reference/configuration.md` for the preload's console routing
      and verify `mise run docs:build`
- [ ] 3.2 Run
      `env -u FORCE_COLOR -u NO_COLOR -u COLORTERM -u CLICOLOR mise run check`
      and verify it is green
