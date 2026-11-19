# Tasks

## 1. Installers

- [x] 1.1 Add `scripts/install/install.sh` and `install.ps1` with checksum
      verification, the `test:install`, `test:install:ps1` and `test:flake` mise
      tasks (`test:install` in `mise run check`), and the installer section of
      `apps/docs/guide/installation.md`; verify with the alpine/ubuntu container
      runs of `install-sh.test.sh` asserting the selected asset name, the
      corrupted-archive test, and Pester tests for `install.ps1` asset selection
      (x64, arm64) and checksum refusal

## 2. Windows arm64 and the release workflow

- [x] 2.1 Add the `bun-windows-arm64` target and its `win32-arm64` npm platform
      package (`apps/cli/npm/win32-arm64`, the launcher mapping in
      `bin/cospec.js`, `set-version` and its e2e test), an alpine smoke job for
      the existing musl archives, a Windows smoke job, and the installer assets
      and asset-set check in `release.yml`; verify with `mise run test:release`,
      `bun install --frozen-lockfile`, an actionlint-clean `release.yml`, and a
      local replay of the workflow's build and publish steps (it has no dry-run
      mode) listing eight archives, `SHA256SUMS` and both installers
- [x] 2.2 Add the `install` and `nix` change filters and the `ci-install-sh`,
      `ci-install-ps1` and `ci-nix` jobs to `ci.yml` behind `ci-gate`, and
      document the release and platform-package steps in `docs/release.md`;
      verify with actionlint and ShellCheck over the workflow and scripts

## 3. Nix flake

- [x] 3.1 Add `flake.nix` with `packages.default` and `overlays.default`, its
      `nix/` package, pin file and consumer flake, `flake.lock`, and the
      `release:flake-pin` task with its `release.yml` job; verify with
      `nix run .# -- --version` and a consumer flake that applies
      `overlays.default` and builds `pkgs.cospec`

## 4. The `cospec install` command

- [x] 4.1 Add `commands/install.ts`, its `COMMAND_TABLE` row (no `--json`, no
      `--store`) and `COMMAND_MODULES` line, and the `install` entries in the
      `command-table`, `completions` and `version` unit tests; verify with
      `mise run test` and `mise run typecheck`
- [x] 4.2 Add `test/integration/install.test.ts`, which serves a fake installer
      from a local server through `COSPEC_INSTALLER_BASE` under a temporary home
      and asserts the version and install directory it receives, the exit code
      and message of a failing installer, and every refusal (a bad version, a
      non-local http or userinfo base, `--json`, `--store`, an extra operand)
      before any request; verify with `mise run test:integration`
- [x] 4.3 Document `cospec install` in `apps/docs/reference/commands.md` (a row,
      and `install` in the `--json` and `--store` refusal lists),
      `docs/architecture.md`,
      `apps/docs/concepts/how-it-relates-to-openspec.md`,
      `apps/docs/guide/installation.md`, and both READMEs; verify with
      `mise run docs:build`

## 5. Drain the last pending surface

- [x] 5.1 Empty `parity-pending.yaml` and restore the empty-pending assertions
      in `reachability.test.ts` and `parity-docs-loader.test.ts` (keeping
      `standalone-install` in `KNOWN_OWNERS`), the `notRelayed.INSTALL` reason,
      the `pending()` comment, and `upgradeCommand('standalone')` returning
      `'cospec install'`; verify with `mise run test:contract` on the
      reachability, remedy-enumeration and parity-docs-loader suites
- [x] 5.2 Add the installer, flake and flake-pin tasks, the two
      repository-layout lines (`scripts/` naming `install.sh`/`install.ps1`, and
      a `flake.nix, nix/` line for the Nix package and overlay), and the
      `install` counterpart wording to `.agents/shared.md`, run
      `mise run agents:sync`, and run `mise run check`; verify exit 0. The
      archive commit follows this one
