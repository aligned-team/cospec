# Tasks

## 1. Regression tests first

- [x] 1.1 Reproduce the row's flake 20× in a Linux container and on macOS and
      verify the before rates are recorded in the ledger
- [x] 1.2 Add the preload mechanism regression row to `handover-preload.test.ts`
      and verify it fails against the current preload in the container

## 2. Fix

- [x] 2.1 Route `console.log`/`console.error` through the process streams in the
      handover preload and verify the regression row passes
- [x] 2.2 Make `resetPiped`'s post-condition require one of the binary's answer
      sentences as stdout's last line and verify the reset rows pass
- [x] 2.3 Loop the contract row 20× in the container and verify 0/20 failures
- [x] 2.4 Make the preload's console writes ignore a stream whose reader has
      gone, as Node's console does, and verify the closed-stdout/stderr unit and
      contract rows fail before and pass after
- [x] 2.5 Route every console method the pinned binary calls (`log`, `info`,
      `debug`, `warn`, `error`) through the stream Node's console writes it to,
      and verify the dist-enumeration and Node-routing contract rows fail before
      and pass after
- [x] 2.6 Pin a handover's raw terminal bytes (`config edit`, no editor, its
      uncoloured error lines) against the binary under Node, and verify the row
      fails with Bun's native `console.error`

## 3. Docs and gate

- [x] 3.1 Update `docs/architecture.md` and
      `apps/docs/reference/configuration.md` for the preload's console routing,
      its ignored gone reader and its uncoloured error lines, and verify
      `mise run docs:build`
- [x] 3.2 Run
      `env -u FORCE_COLOR -u NO_COLOR -u COLORTERM -u CLICOLOR mise run check`
      and verify it is green
