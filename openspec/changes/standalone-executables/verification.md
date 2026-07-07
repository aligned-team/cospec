## 1. Bun-less standalone binary dispatches a real subcommand [critical]

- [x] 1.1 @e2e (agent) compile host binary and with bun stripped from PATH run `cospec --version` + `cospec list` -> version prints ("0.1.0") and `list` dispatches ("No active changes"), exit 0
- [x] 1.2 @e2e (agent) confirm `bun build --compile` bundles every command module via the static import map -> reports "bundle 114 modules" (was 3 before the fix)

## 2. Node-only npm install runs the launcher + platform binary

- [x] 2.1 @runtime (agent) build the host platform package, `npm install` main + platform tarballs with bun stripped from PATH, run `cospec --version`, `list`, `init`, and `new` (wrapped openspec via BUN_BE_BUN self-spawn) -> `mise run test:pack:standalone` passes (13 asserts): Node-only install, version 0.1.0, init scaffolds embedded-canon schemas, `new` creates a change through the real wrapped openspec, exit 0
- [~] 2.2 @manual (human) install the published package on a bun-less machine and run `cospec --version` -> defer: needs a published release + separate host; covered locally by PATH-stripped row 2.1 until first live release

## 3. set-version stamps every manifest + optional-dependency pin

- [x] 3.1 @integration (agent) run `mise run test:release` -> 11/11 pass: all seven platform package versions and the main optionalDependencies pins land at target, bun.lock pins repinned, root untouched, idempotent

## 4. Cross-platform assets + libc portability

- [x] 4.1 @e2e (agent) cross-compile all release targets from this host and assemble every release archive + platform npm tarball with SHA256SUMS -> all targets compiled (Mach-O x64/arm64, ELF gnu + musl, PE32+); archives named cospec-0.1.0-<os>-<arch>[-musl].{tar.gz,zip} with binary at root; npm tarballs contain package/bin/cospec + package.json
- [x] 4.2 @runtime (agent) run the linux glibc and musl builds across Debian, Ubuntu, and Alpine containers (docker) -> glibc build: OK on Debian/Ubuntu, fails Alpine; musl build: fails Debian (musl loader missing), needs libstdc++/libgcc on Alpine — proves bun musl is NOT static and forces the gnu/musl libc split (and moves the release native --version check to the gnu leg)
- [~] 4.3 @manual (human) `mise use github:aligned-team/cospec` on a real release autodetects the per-platform asset -> defer: needs a published GitHub release with the renamed assets + SHA256SUMS
- [~] 4.4 @e2e (agent) full release matrix run in CI (7 legs, both artifacts each, publish order platforms-then-main) -> defer: only exercisable by dispatching the release workflow; per-leg assembly logic verified locally via row 4.1
