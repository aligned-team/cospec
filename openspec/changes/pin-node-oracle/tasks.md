# Tasks

## 1. Pin node

- [x] 1.1 Pin `node = "22.23.2"` in `mise.toml` (the Node `ci-bun` runs: the
      ubuntu-24.04 20260920.314 image default, since `ci-bun` has no
      `setup-node` step) and lock it with `mise lock node`, and verify
      `git diff mise.lock` adds only `[[tools.node]]` rows, a following
      `mise install` leaves `mise.lock` byte-identical, and
      `mise exec -- node --version` prints `v22.23.2` -> `mise install` alone
      wrote only the `[[tools.node]]` version/backend stanza (no platform rows,
      which CI's linux-x64 drift gate would then add); `mise lock node` added
      the 11 platform rows every other tool carries (+48 lines, nothing else
      touched); the next `mise install` left `mise.lock` byte-identical (`cmp`);
      `mise exec -- node --version` printed `v22.23.2`; the linux-x64 and
      darwin-arm64 checksums match nodejs.org's `SHASUMS256.txt`

## 2. Run the oracle under Bun

- [x] 2.1 Make `oracle()` in `upstream-oracle.ts` spawn
      `[process.execPath, <bin>, ...argv]` with `buildWrappedSpawnEnv` over
      `oracleEnv(root)`, keeping `{ runtime: 'node' }`, and verify with a
      contract row that the oracle's child sees the product's wrapped env ->
      `oracleSpawn` builds the command, cwd and env; the new
      `test/contract/upstream-oracle.test.ts` (5 pass) pins the command
      (`process.execPath`, the package bin, argv untouched), the env
      (`buildWrappedSpawnEnv(oracleEnv(root))`: every `WRAPPED_ENV` key set,
      every color-forcing key absent even when the parent exports them), that
      `{ runtime: 'node' }` swaps only the interpreter, that a color-forcing
      parent leaves the binary's stderr empty, and that Bun drops a leading `--`
      (`-- --version` prints `1.13.1`) where Node delivers it (exit 1,
      `unknown command '--version'`). `root-sandbox.ts` routes through
      `oracle()`, so it needed no change
- [x] 2.2 Move every `runtime: 'node'` call site to the default except the rows
      whose argv starts with `--`, document each remaining use, and verify the
      three affected contract files pass -> 22 call sites moved (17 in
      `relayed-remedies.test.ts`, 5 in `root-resolution.test.ts` ledgers 5.22
      and 5.25); the one remaining use is `precedence-matrix.test.ts`'s
      `runUpstream`, now `{ runtime: 'node' }` only when `argv[0] === '--'`,
      documented in its header comment and JSDoc; all three files pass in the
      full contract run (1639 pass, 0 fail)
- [x] 2.3 Run the whole contract suite and verify every row that changed outcome
      is either updated with probe evidence (cospec and the binary-under-Bun
      agree) or reported as a product finding with its owning PR -> on macOS the
      full suite under the Bun oracle, before any errno-row change, was 1639
      pass, 0 fail: no row changed outcome (the added
      `OPENSPEC_NO_COMPLETIONS`/`BUN_BE_BUN` keys flipped nothing). Linux,
      probed in an `oven/bun:1.3.14` container as a non-root user: the binary
      under Bun answers the ledger-5.22 store `openspec/` mode-000 cell with
      `EACCES: permission denied, statx '<store>/openspec/config.yaml'`, while
      cospec's resolver says `stat` (`nodeStatMessage`, owned by
      `root-resolution-parity`, merged in #52) — a product finding, reported,
      and absorbed by 3.1's syscall normalisation, not by changing either side

## 3. Errno rows

- [x] 3.1 Make every errno-message compare in the contract and unit suites
      assert the errno code and the path (or normalise the syscall token), and
      verify the rows pass -> `test/fixtures/errno.ts` `errnoShape` (code,
      syscall with `statx` read as `stat`, first quoted path; throws on anything
      else), pinned by `test/unit/errno-shape.test.ts` (5 pass); used by
      `root.test.ts` ledger 5.23 (8 rows; the stat row also asserts no `statx`),
      and `root-resolution.test.ts` ledger 5.21's registry rows and 5.22's
      raw-failure compares (the text rows keep their one-line lead exact through
      `errnoLine`). The remaining `EACCES`/`ENOTDIR` strings in
      `commands.test.ts` and `forward-relay.test.ts` are fixed inputs to pure
      relay rewrites, not runtime output, so they stay. The four files: 879
      pass, 0 fail
- [x] 3.2 Note the errno-message brittleness in the archived
      `root-resolution-parity` `design.md` and `verification.md`, and verify
      `mise run cospec-validate-all` still passes -> design D9 amendment (the
      brittleness, the pin, the oracle runtime, the errno rows, and the Linux
      `statx` divergence) and amendments on ledger rows 5.22 and 5.23;
      `cospec-validate-all` 0 errors, 0 warnings

## 4. Docs and gate

- [x] 4.1 Update `docs/architecture.md` and `.agents/shared.md` where they state
      how the oracle runs, run `mise run agents:sync`, and verify
      `mise run agents:check` passes -> neither stated it before; added a
      wrapping-boundary bullet to `docs/architecture.md` and three sentences to
      shared.md's Tests discipline; `agents:sync` rewrote `CLAUDE.md` and
      `AGENTS.md`; `agents:check` "All shared blocks are in sync." No
      user-facing behaviour changed, so `apps/docs` is untouched
- [x] 4.2 Run `mise run check` with color forcing unset and verify it exits 0 ->
      `env -u FORCE_COLOR -u NO_COLOR -u COLORTERM -u CLICOLOR mise run     check`
      exit 0: unit 1553, contract 1639, integration 167, bench 339, release-test
      14, all 0 fail
