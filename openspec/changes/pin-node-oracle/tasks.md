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

- [ ] 2.1 Make `oracle()` in `upstream-oracle.ts` spawn
      `[process.execPath, <bin>, ...argv]` with `buildWrappedSpawnEnv` over
      `oracleEnv(root)`, keeping `{ runtime: 'node' }`, and verify with a
      contract row that the oracle's child sees the product's wrapped env
- [ ] 2.2 Move every `runtime: 'node'` call site to the default except the rows
      whose argv starts with `--`, document each remaining use, and verify the
      three affected contract files pass
- [ ] 2.3 Run the whole contract suite and verify every row that changed outcome
      is either updated with probe evidence (cospec and the binary-under-Bun
      agree) or reported as a product finding with its owning PR

## 3. Errno rows

- [ ] 3.1 Make every errno-message compare in the contract and unit suites
      assert the errno code and the path (or normalise the syscall token), and
      verify the rows pass
- [ ] 3.2 Note the errno-message brittleness in the archived
      `root-resolution-parity` `design.md` and `verification.md`, and verify
      `mise run cospec-validate-all` still passes

## 4. Docs and gate

- [ ] 4.1 Update `docs/architecture.md` and `.agents/shared.md` where they state
      how the oracle runs, run `mise run agents:sync`, and verify
      `mise run agents:check` passes
- [ ] 4.2 Run `mise run check` with color forcing unset and verify it exits 0
