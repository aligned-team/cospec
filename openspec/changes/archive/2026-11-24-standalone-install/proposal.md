# Proposal

## Why

Split from #100. OpenSpec 1.15.0 adds an `install` command that installs its
standalone build, and the 1.15.0 parity change leaves that command as the last
entry in `parity-pending.yaml`, owned by this change. Until cospec has its own
`install`, a user coming from OpenSpec cannot reach the surface, and a cospec
installed through npm or mise has no first-party route to the single-file
standalone binary that runs without Node.js.

The standalone binary also has no checksum-verified way in. Releases already
ship archives, but a user downloads and unpacks one by hand, Windows on Arm and
Nix users have no target at all, and the musl archives are never executed in CI.
Distribution should cover every upstream binary platform and verify what it
installs.

## What Changes

- **`cospec install [version]`** — new command. It downloads the release's
  `install.sh` (or `install.ps1` on Windows) and runs it with `COSPEC_VERSION`
  and `COSPEC_INSTALL_DIR` passed through, so cospec is reachable wherever
  OpenSpec 1.15.0's `install` is. A standalone cospec reinstalls in the
  directory it runs from; a package-manager copy is never removed, but the
  command that removes it is printed. The installer's output goes to the
  terminal, so `--json` and `--store` are refused. This drains `install`, the
  last entry in `parity-pending.yaml`, so the file is `[]` again.
- **Single-file install** — `install.sh` (macOS/Linux) and `install.ps1`
  (Windows) download the matching standalone binary from the GitHub release and
  verify it against `SHA256SUMS` before installing. Releases already ship Linux
  musl x64/arm64 archives; this adds Windows arm64 (`bun-windows-arm64` and its
  npm platform package) so every upstream binary platform is covered. A Nix
  flake exposes `overlays.default` and `packages.default`.
- **Release workflow** — an alpine smoke job for the musl archives, a Windows
  smoke job, the installer scripts and an asset-set check on the release, and a
  follow-up commit that pins the flake to the release it just published.
- **CI** — `install` and `nix` change filters with `ci-install-sh`,
  `ci-install-ps1` and `ci-nix` jobs behind `ci-gate`; `test:install` joins
  `mise run check`.
- **Version upgrade hint** — `cospec version --check` names `cospec install` as
  a standalone install's upgrade command again (the parity change leaves it
  unnamed until the command exists).
- **Docs** — the command reference gains a `cospec install` row and names
  `install` in the `--json` and `--store` refusal lists; the installation guide,
  `docs/release.md` and the README install sections cover the scripts and the
  flake.

## Capabilities

### New Capabilities

- `standalone-install`: the checksum-verified `install.sh`/`install.ps1`
  installers, the `cospec install` command, the Windows arm64 release target,
  and the Nix flake overlay.

### Modified Capabilities

- `embedded-openspec`: the "OpenSpec 1.15.0 pin" requirement returns to
  `parity-pending.yaml` being empty, now that `install` is implemented.

## Impact

- `apps/cli/src/commands/install.ts` (new), its row in
  `apps/cli/src/core/command-table.ts` and its module in `apps/cli/src/cli.ts`;
  `upgradeCommand('standalone')` in `apps/cli/src/commands/version.ts`.
- `apps/cli/test/contract/{parity-pending.yaml,reachability.test.ts,support/remedy-sources.ts}`
  and `parity-docs-loader.test.ts` return to an empty pending list, with
  `standalone-install` kept in `KNOWN_OWNERS`; new
  `apps/cli/test/integration/install.test.ts`; `version`, `command-table` and
  `completions` unit tests.
- `.github/workflows/release.yml` (Windows arm64 target and npm platform
  package, alpine and Windows smoke jobs, installer assets, flake pin) and
  `.github/workflows/ci.yml` (installer and Nix jobs); new
  `scripts/install/install.sh` and `install.ps1` with their tests, `flake.nix`,
  `flake.lock`, `nix/**`, and `scripts/mise-tasks/release/flake-pin`; the
  `win32-arm64` entry in `scripts/mise-tasks/release/set-version`, its e2e test
  and `apps/cli/bin/cospec.js`; `apps/cli/npm/win32-arm64/package.json` and its
  optional dependency in `apps/cli/package.json` and `bun.lock`.
- `mise.toml` (`release:flake-pin`, `test:install`, `test:install:ps1`,
  `test:flake`; `test:install` in `check`), and `.agents/shared.md` with its
  `CLAUDE.md`/`AGENTS.md` sync: the four task rows, the repository-layout lines
  for the installers (`scripts/` now lists `install.sh`/`install.ps1`) and the
  flake (a new `flake.nix, nix/` line), and the `install` counterpart wording.
- Docs: `apps/docs/reference/commands.md`, `apps/docs/guide/installation.md`,
  `apps/docs/concepts/how-it-relates-to-openspec.md`, `docs/release.md`,
  `docs/architecture.md`, `README.md` and `apps/cli/README.md`.
- No BREAKING changes. A release now has eight platform archives, and the npm
  launcher accepts Windows on Arm.
- One manual step before the first release that includes it: publish a
  placeholder `@aligned-team/cospec-win32-arm64` to npm and add its trusted
  publisher (`docs/release.md`, "Adding a platform package").

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [x] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
