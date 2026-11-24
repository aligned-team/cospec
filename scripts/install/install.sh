#!/bin/sh
# cospec installer for macOS and Linux.
#
#   curl -fsSL https://github.com/aligned-team/cospec/releases/latest/download/install.sh | sh
#
# Downloads the standalone cospec binary for this OS/arch/libc from a GitHub
# release, verifies it against that release's SHA256SUMS, and installs it.
# Nothing is written to the install directory unless the checksum matches.
# Never uses sudo.
#
# Environment:
#   COSPEC_VERSION       install this release (e.g. 0.12.0) instead of the latest
#   COSPEC_INSTALL_DIR   install directory (default: $HOME/.local/bin)
#   COSPEC_RELEASE_BASE  release root (default:
#                        https://github.com/aligned-team/cospec/releases); an
#                        absolute local directory with the same
#                        latest/download/ and download/v<version>/ layout is
#                        also accepted, for mirrors and air-gapped installs
#
# POSIX sh only; needs curl or wget, tar, and sha256sum or shasum.

set -eu

REPO_RELEASES='https://github.com/aligned-team/cospec/releases'

say() { printf 'cospec-install: %s\n' "$*" >&2; }
die() {
  say "error: $*"
  exit 1
}

# The release asset token for this host: <os>-<arch>[-musl].
detect_platform() {
  os=$(uname -s)
  arch=$(uname -m)
  case "$os" in
    Darwin) os=macos ;;
    Linux) os=linux ;;
    *) die "unsupported OS '$os' (use install.ps1 on Windows)" ;;
  esac
  case "$arch" in
    x86_64 | amd64) arch=x64 ;;
    aarch64 | arm64) arch=arm64 ;;
    *) die "unsupported architecture '$arch'" ;;
  esac
  # A shell running under Rosetta reports x86_64 on Apple silicon; prefer the
  # native binary.
  if [ "$os" = macos ] && [ "$arch" = x64 ] &&
    [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then
    arch=arm64
  fi
  suffix=''
  # The glibc and musl builds are not interchangeable (neither is static).
  if [ "$os" = linux ] && is_musl; then suffix='-musl'; fi
  printf '%s-%s%s\n' "$os" "$arch" "$suffix"
}

is_musl() {
  ldd_out=$(ldd --version 2>&1 || true)
  case "$ldd_out" in
    *musl*) return 0 ;;
    *GLIBC* | *'GNU libc'* | *glibc*) return 1 ;;
  esac
  for loader in /lib/ld-musl-*; do
    [ -e "$loader" ] && return 0
  done
  return 1
}

has_lib() {
  for dir in /usr/lib /lib /usr/local/lib; do
    [ -e "$dir/$1" ] && return 0
  done
  return 1
}

# fetch <url-or-path> <dest>
fetch() {
  case "$1" in
    /*)
      [ -f "$1" ] || die "not found: $1"
      cp "$1" "$2"
      ;;
    *)
      if command -v curl >/dev/null 2>&1; then
        curl -fsSL --proto '=https,file' -o "$2" "$1" || die "download failed: $1"
      elif command -v wget >/dev/null 2>&1; then
        wget -q -O "$2" "$1" || die "download failed: $1"
      else
        die 'need curl or wget to download'
      fi
      ;;
  esac
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{ print $1 }'
  else
    die 'need sha256sum or shasum to verify the download'
  fi
}

main() {
  base=${COSPEC_RELEASE_BASE:-$REPO_RELEASES}
  base=${base%/}
  version=${COSPEC_VERSION:-}
  [ "$version" != latest ] || version=''
  version=${version#v}
  install_dir=${COSPEC_INSTALL_DIR:-${HOME:?HOME is not set}/.local/bin}

  platform=$(detect_platform)
  ext=tar.gz

  if [ -n "$version" ]; then
    release_url="$base/download/v$version"
  else
    release_url="$base/latest/download"
  fi

  tmp=$(mktemp -d 2>/dev/null || mktemp -d -t cospec-install)
  staged=''
  trap 'rm -rf "$tmp"; [ -z "$staged" ] || rm -f "$staged"' EXIT
  trap 'exit 130' INT TERM

  fetch "$release_url/SHA256SUMS" "$tmp/SHA256SUMS"

  # SHA256SUMS names every archive, so it also tells us the latest version
  # without a GitHub API call. Lines are `<hex>  <name>` (or `<hex> *<name>`).
  # The suffix match is exact, so `linux-x64` never matches `linux-x64-musl`.
  line=$(awk -v suffix="-$platform.$ext" '
    { name = $2; sub(/^\*/, "", name) }
    name ~ /^cospec-/ && substr(name, length(name) - length(suffix) + 1) == suffix { print $1, name; exit }
  ' "$tmp/SHA256SUMS")
  [ -n "$line" ] || die "no $platform archive listed in $release_url/SHA256SUMS"
  expected=${line%% *}
  asset=${line#* }
  found_version=${asset#cospec-}
  found_version=${found_version%"-$platform.$ext"}
  if [ -n "$version" ] && [ "$found_version" != "$version" ]; then
    die "SHA256SUMS for v$version lists $asset, not version $version"
  fi

  say "selected asset $asset"
  fetch "$release_url/$asset" "$tmp/$asset"

  actual=$(sha256_of "$tmp/$asset")
  if [ "$actual" != "$expected" ]; then
    die "checksum mismatch for $asset (expected $expected, got $actual); nothing installed"
  fi
  say "checksum OK ($actual)"

  mkdir -p "$tmp/extract"
  tar -xzf "$tmp/$asset" -C "$tmp/extract"
  [ -f "$tmp/extract/cospec" ] || die "$asset has no cospec binary at its root"

  mkdir -p "$install_dir"
  # Stage inside the target directory so the final rename is atomic and an
  # existing binary is replaced only by a complete, verified one.
  staged="$install_dir/.cospec.install.$$"
  cp "$tmp/extract/cospec" "$staged"
  chmod 755 "$staged"
  mv -f "$staged" "$install_dir/cospec"

  say "installed cospec $found_version to $install_dir/cospec"
  # The musl build links libstdc++ and libgcc dynamically; stock Alpine lacks
  # both, and the binary then fails with "Error relocating ... symbol not found".
  case "$platform" in
    *-musl)
      if ! has_lib libstdc++.so.6 || ! has_lib libgcc_s.so.1; then
        say 'note: the musl build needs libstdc++ and libgcc (Alpine: apk add libstdc++ libgcc)'
      fi
      ;;
  esac
  case ":${PATH:-}:" in
    *":$install_dir:"*) ;;
    *) say "note: $install_dir is not on your PATH; add it to your shell profile" ;;
  esac
}

main "$@"
