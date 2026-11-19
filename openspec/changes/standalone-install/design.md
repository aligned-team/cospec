# Design

## Context

Split from #100. This change stacks on `openspec-1-15-parity`, which leaves
`parity-pending.yaml` holding one entry, `install` (owner `standalone-install`),
and, because a top-level command has no table row to mark pending, ships no
`install` row and no `COMMAND_MODULES` line. It also leaves
`upgradeCommand('standalone')` as `null`. `reachability.test.ts` fails until
`install` resolves exactly once, so adding the row and draining the entry land
in one commit.

Releases today ship seven standalone archives, and the two musl archives are
never executed in CI. `cospec version` already tells a standalone install from
an npm, mise or source one (`currentInstall` in `commands/version.ts`), which
`cospec install` reuses to decide where to install and what to tell the user.

## Goals / Non-Goals

**Goals:**

- Make the standalone binary installable with one checksum-verified command on
  macOS, Linux (glibc and musl), and Windows (x64 and arm64), and through Nix.
- Reach upstream's `install` command with a cospec spelling that runs the same
  installer the docs give, so there is one install path to test and audit.

**Non-Goals:**

- Self-upgrade of a running binary beyond reinstalling it in place.
- A Homebrew tap, a `.deb`/`.rpm`, or code signing; none is needed for parity.
- Removing a package-manager copy: `cospec install` prints the command and
  leaves the removal to the user, as upstream does.

## Decisions

1. **`cospec install` runs the release installer; it does not reimplement it.**
   It fetches `install.sh` (`install.ps1` on Windows) from the latest release,
   or from `COSPEC_INSTALLER_BASE`, and runs it with the requested version and
   install directory in the environment. The installer URL reaches the shell as
   an argument (or an environment variable), never as command text, and on macOS
   and Linux the script is saved to a temporary file first so a failed download
   can never look like a successful run. A standalone cospec defaults
   `COSPEC_INSTALL_DIR` to the directory it runs from, so it replaces itself.
   The row refuses `--json` (the installer's output is the terminal's) and
   `--store` (the command never reads a root). _Rejected:_ downloading and
   verifying the archive inside cospec, which would duplicate the checksum logic
   in a second language and leave the documented one-liner untested by the
   command.

2. **The installer source is overridable only to a trusted place.**
   `COSPEC_INSTALLER_BASE` must be https, or http to `localhost`, `127.0.0.1` or
   `[::1]`; the host is parsed, never prefix-matched, and a user part is
   refused. The installer and the archives it verifies come from one place, so a
   cleartext remote could swap both. The override exists so tests serve a fake
   installer without touching the network. _Rejected:_ no override (tests would
   need the network), and an unrestricted override (a man-in-the-middle could
   replace the script and the checksums together).

3. **Installers are POSIX `sh` and PowerShell with no dependencies.** They
   verify with `sha256sum` or `shasum -a 256` (Windows: `Get-FileHash`), install
   to `$COSPEC_INSTALL_DIR` (default `~/.local/bin` or
   `%LOCALAPPDATA%\cospec\bin`), and never run `sudo`. A checksum mismatch
   aborts before anything is written. _Rejected:_ a Homebrew tap only, which
   leaves Linux musl and Windows uncovered.

4. **The Nix flake wraps the release binary.** It uses `fetchurl` with hashes
   that the release workflow pins per version, in a follow-up commit once the
   release is live, because the archive hashes only exist after the tag is cut.
   _Rejected:_ building from source with Bun inside the Nix sandbox, which needs
   network for dependency resolution and gives up reproducibility.

5. **Release assets are a public contract.** Archive names
   `cospec-<version>-<os>-<arch>[-musl].{tar.gz,zip}`, plus `SHA256SUMS` in
   `sha256sum` format that also lists both installer scripts, are what the
   installers and the flake read. The release workflow asserts the whole asset
   set (eight archives, `SHA256SUMS`, `install.sh`, `install.ps1`) before it
   publishes.

6. **`install` is kept as a known owner.** The pending entry is deleted, but
   `standalone-install` stays in `KNOWN_OWNERS` in `reachability.test.ts`,
   because that file keeps every past owner (`tool-matrix`, `github-copilot`,
   `completion-install`, `workflow-profiles`). _Rejected:_ deleting it to match
   #100 byte for byte, which would break the file's own convention.

## Operational surface

- **Binaries and architectures:** releases go from seven to eight standalone
  archives (macos x64/arm64, linux glibc x64/arm64, linux musl x64/arm64,
  windows x64/arm64). The musl archives already ship (`bun-linux-*-musl`) but
  are never executed in CI today; they gain a smoke run in an `alpine` container
  job. Windows arm64 needs Bun's `bun-windows-arm64` compile target (confirmed
  on the pinned Bun before task 2.1), a new `win32-arm64` npm platform package,
  and its own trusted-publisher entry on npm.
- **CI runtime:** the musl smoke job runs in a container on the existing Linux
  runner. No new secrets are needed. Release keeps OIDC trusted publishing; it
  adds the Windows arm64 archive, its npm platform package, and the installer
  scripts as assets. `ci-install-sh` runs on Ubuntu and Alpine, `ci-install-ps1`
  on Windows, and `ci-nix` where Nix is installed, all behind `ci-gate`.
- **Installer runtime:** needs network to `github.com` release assets only. It
  binds no ports and stores no credentials.

## Integration contract

- **GitHub release assets:** the asset contract in decision 5, consumed by both
  installers, the flake, and `cospec install`.
- **Wrapped OpenSpec:** `cospec install` never spawns the binary's own
  `install`; the remedy-enumeration test classifies upstream's `install`
  sentences as not relayed, with the reason that `commands/install.ts` is
  native.

## Risks / Trade-offs

- [Installer piped into `sh` is a supply-chain surface] → It verifies checksums
  before writing, is short enough to audit, and the docs show a
  download-inspect-run alternative.
- [`cospec install` runs a script it downloads] → It is the script the docs
  already tell users to pipe into a shell, fetched over https, and the same
  checksum check guards the binary it installs.
- [Windows arm64 is built but cannot be run on a hosted runner here] → The
  release's Windows smoke job runs the x64 build, `install.ps1` is covered by
  Pester for both architectures, and the manual Windows check stays open in the
  verification ledger.
- [The Nix flake is pinned only after a release is live] → The flake on `main`
  always wraps the latest release; a user who needs one release locks to the pin
  commit.
