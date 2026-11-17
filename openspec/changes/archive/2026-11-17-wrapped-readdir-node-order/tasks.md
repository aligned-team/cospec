# Tasks

## 1. Regression test

- [x] 1.1 Add a contract differential row: change directories created so the
      filesystem returns them out of byte order, `cospec instructions` against
      the pinned binary under Node; verify it fails before the fix.

## 2. The preload

- [x] 2.1 Extract the handover preload's content-addressed cache writer into a
      shared helper, and add `core/readdir-preload.ts`: CommonJS that sorts
      `readdirSync`, callback `readdir` and `promises.readdir` by the bytes of
      each name (not on Windows, not for recursive reads).
- [x] 2.2 Run every wrapped call behind it, first on the argv: `spawnRaw` and
      `preloadedArgv`; update `json-envelope.test.ts`'s spawn stub and assert no
      wrapped spawn lacks it.
- [x] 2.3 Unit-test the preload against Node across every import form the dist
      uses, and its sorting on entries a stand-in `fs` hands it unsorted, so the
      proof holds on a filesystem that already lists byte order.
- [x] 2.4 Add the contract guard over the pinned dist's directory listings,
      reading each call's arguments through a balanced scan that skips strings,
      templates, regular expressions and comments.
- [x] 2.5 Verify the regression row now passes, the compiled binary lists in
      upstream's order, and `mise run check` passes.

## 3. Docs

- [x] 3.1 Document the preload: a rule in
      `apps/docs/concepts/how-it-relates-to-openspec.md`, the cache file in
      `apps/docs/reference/configuration.md`, and the mechanism in
      `docs/architecture.md`. The archive commit follows this one.
