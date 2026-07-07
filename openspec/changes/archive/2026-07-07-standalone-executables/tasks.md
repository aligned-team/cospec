## 1. Make the compiled binary dispatch subcommands

- [x] 1.1 Replace the computed-path command import in `apps/cli/src/cli.ts` with
      a static `import()` registry so `bun build --compile` bundles every
      command module (the compiled binary previously ran only
      `--version`/`--help`).
- [x] 1.2 Compile the host binary and confirm a real subcommand dispatches with
      bun stripped from PATH.

## 2. Standalone runtime completeness

- [x] 2.0 Embed the canon assets (`with { type: 'file' }` registry in
      `apps/cli/src/canon/embedded.ts`) so `cospec init`/`update` work inside
      the compiled binary, and route the wrapped openspec spawn through
      `process.execPath` + `BUN_BE_BUN=1` with executable/cwd-based package
      resolution so wrapped commands run with no bun installed.

## 2b. Runtime-agnostic launcher

- [x] 2.1 Rewrite `apps/cli/bin/cospec.js` as a dependency-free launcher:
      resolve the platform package via `createRequire`/`require.resolve`, exec
      the binary, passthrough argv + stdio, propagate exit code and signals, and
      print a clear supported-platforms error when no platform package is
      installed.

## 3. Per-platform packages + main manifest

- [x] 3.1 Add `apps/cli/npm/<platform>/package.json` templates for the seven
      platforms (Linux libc-split into -gnu/-musl after empirically disproving
      the static-musl premise via docker) with correct `os`/`cpu`/`libc` and
      `files` = the binary only.
- [x] 3.2 Update `apps/cli/package.json`: `optionalDependencies` pins, drop
      `src` from `files`, de-bun-lock `engines`.

## 4. Release pipeline + set-version

- [x] 4.1 Extend `.github/workflows/release.yml` to assemble the platform npm
      packages, rename GitHub release archives for mise github-backend
      autodetection, and pack + publish all eight packages (platforms first,
      main last) with a Node-only bun-less install smoke.
- [x] 4.2 Extend `scripts/mise-tasks/release/set-version` to stamp every
      platform manifest and the main package's optional-dependency pins.

## 5. Tests

- [x] 5.1 Add a bun-less pack smoke: build the host platform package with
      `bun build --compile`, install main + platform tarballs with `npm` (bun
      stripped from PATH), run `cospec --version` + a real subcommand.
- [x] 5.2 Extend `e2e/release/set-version.test.ts` for the platform manifests +
      optional-dependency pins.

## 6. Docs

- [x] 6.1 Update root + `apps/cli` README quickstarts (mise + package managers).
- [x] 6.2 Update `docs/release.md` for the eight-package set and asset naming.
