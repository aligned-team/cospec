# standalone-install Specification

## Purpose

Defines how cospec is installed without Node.js: the checksum-verified
`install.sh`/`install.ps1` release installers, the `cospec install` command, the
platform binaries each release ships, and the Nix flake overlay.

## Requirements

### Requirement: Checksum-verified single-file installers

The repository SHALL ship `scripts/install/install.sh` (macOS, Linux) and
`scripts/install/install.ps1` (Windows) that detect OS, architecture and libc,
download the matching standalone archive from a GitHub release, verify it
against that release's `SHA256SUMS`, and install `cospec` onto the user's path.
A checksum mismatch SHALL abort before anything is installed.

#### Scenario: Linux musl install

- **WHEN** `install.sh` runs on Alpine Linux x64
- **THEN** it selects the `linux-x64-musl` archive, verifies its checksum, and
  `cospec version` reports install type `standalone`

#### Scenario: Tampered archive

- **WHEN** the downloaded archive's SHA-256 differs from `SHA256SUMS`
- **THEN** the installer exits nonzero and writes no binary

#### Scenario: Pinned version

- **WHEN** the installer is run with `COSPEC_VERSION=0.12.0`
- **THEN** it installs that release instead of the latest

### Requirement: Release covers every upstream binary platform

Each release SHALL publish standalone binaries for macOS, Linux glibc, Linux
musl, and Windows on x64 and arm64, with every archive listed in `SHA256SUMS`,
and SHALL attach both installer scripts as release assets.

#### Scenario: Release asset set

- **WHEN** the release workflow completes
- **THEN** the release lists eight platform archives, `SHA256SUMS`,
  `install.sh`, and `install.ps1`

### Requirement: Nix flake overlay

The repository SHALL expose a Nix flake with `packages.default` and
`overlays.default` that build `cospec` from the pinned release, so
`nix run github:aligned-team/cospec -- version` works.

#### Scenario: Overlay consumption

- **WHEN** a flake applies `cospec.overlays.default`
- **THEN** `pkgs.cospec` is available and `cospec --version` matches the flake's
  pinned release

### Requirement: Install command runs the release installer

`cospec install [version]` SHALL download the release's `install.sh` (or
`install.ps1` on Windows) and run it with `COSPEC_VERSION` and
`COSPEC_INSTALL_DIR` passed through, so it is reachable wherever OpenSpec
1.15.0's `install` command is.

#### Scenario: Pinned install

- **WHEN** a user runs `cospec install 0.12.0`
- **THEN** the release installer runs with `COSPEC_VERSION=0.12.0`
