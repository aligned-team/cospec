#!/bin/sh
# End-to-end tests for scripts/install/install.sh against a fake release.
#
# Builds a release tree on disk with the same layout as GitHub's
# (latest/download/ and download/v<version>/), one archive per platform whose
# `cospec` is a stub printing "<version> <platform>", plus SHA256SUMS. The
# installer runs for real on this host (real OS/arch/libc detection), so in CI
# the same file proves glibc selection on ubuntu and musl selection on alpine.
#
#   sh scripts/install/test/install-sh.test.sh
#   EXPECT_ASSET=linux-x64-musl sh scripts/install/test/install-sh.test.sh
#
# EXPECT_ASSET, when set, pins the platform token the installer must select.

set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
INSTALLER="$HERE/../install.sh"
WORK=$(mktemp -d 2>/dev/null || mktemp -d -t cospec-install-test)
trap 'rm -rf "$WORK"' EXIT

PLATFORMS='linux-x64 linux-x64-musl linux-arm64 linux-arm64-musl macos-x64 macos-arm64'
RELEASE="$WORK/releases"
PASS=0
FAIL=0

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  else
    shasum -a 256 "$1" | awk '{ print $1 }'
  fi
}

# make_release <dir> <version>
make_release() {
  dir=$1
  version=$2
  mkdir -p "$dir"
  : >"$dir/SHA256SUMS"
  for p in $PLATFORMS; do
    stage="$WORK/stage-$version-$p"
    mkdir -p "$stage"
    printf '#!/bin/sh\necho "%s %s"\n' "$version" "$p" >"$stage/cospec"
    chmod 755 "$stage/cospec"
    printf 'readme\n' >"$stage/README.md"
    tar -czf "$dir/cospec-$version-$p.tar.gz" -C "$stage" .
    printf '%s  %s\n' "$(sha256 "$dir/cospec-$version-$p.tar.gz")" \
      "cospec-$version-$p.tar.gz" >>"$dir/SHA256SUMS"
  done
  # Windows archives are listed too, as in a real release; install.sh must
  # never pick them.
  for p in windows-x64 windows-arm64; do
    printf 'zip' >"$dir/cospec-$version-$p.zip"
    printf '%s  %s\n' "$(sha256 "$dir/cospec-$version-$p.zip")" \
      "cospec-$version-$p.zip" >>"$dir/SHA256SUMS"
  done
}

ok() {
  PASS=$((PASS + 1))
  printf 'ok   - %s\n' "$1"
}
not_ok() {
  FAIL=$((FAIL + 1))
  printf 'FAIL - %s\n' "$1"
  [ -z "${2:-}" ] || printf '       %s\n' "$2"
}

# run_installer <install-dir> [VAR=value ...] — stderr captured in $WORK/log
run_installer() {
  dir=$1
  shift
  env COSPEC_RELEASE_BASE="$RELEASE" COSPEC_INSTALL_DIR="$dir" "$@" \
    sh "$INSTALLER" 2>"$WORK/log"
}

make_release "$RELEASE/latest/download" 0.13.0
make_release "$RELEASE/download/v0.13.0" 0.13.0
make_release "$RELEASE/download/v0.12.0" 0.12.0

# A release whose linux/macos archives were swapped after SHA256SUMS was cut.
make_release "$RELEASE/download/v0.12.1" 0.12.1
for p in $PLATFORMS; do
  printf 'tampered' >>"$RELEASE/download/v0.12.1/cospec-0.12.1-$p.tar.gz"
done

# A release whose SHA256SUMS lists no unix archives at all.
mkdir -p "$RELEASE/download/v0.11.0"
printf '%s  %s\n' 0000 cospec-0.11.0-windows-x64.zip >"$RELEASE/download/v0.11.0/SHA256SUMS"

# ── latest ────────────────────────────────────────────────────────────────
D="$WORK/latest"
if run_installer "$D"; then
  out=$("$D/cospec")
  selected=$(sed -n 's/^cospec-install: selected asset cospec-0\.13\.0-\(.*\)\.tar\.gz$/\1/p' "$WORK/log")
  if [ "${out%% *}" = 0.13.0 ] && [ -n "$selected" ] && [ "$out" = "0.13.0 $selected" ]; then
    ok "latest: installs 0.13.0 and the binary from the selected asset ($selected)"
  else
    not_ok 'latest: wrong binary installed' "out='$out' selected='$selected'"
  fi
  if [ -n "${EXPECT_ASSET:-}" ]; then
    if [ "$selected" = "$EXPECT_ASSET" ]; then
      ok "host detection selects $EXPECT_ASSET"
    else
      not_ok "host detection selects $EXPECT_ASSET" "selected '$selected'"
    fi
  fi
  case "$selected" in
    linux-*-musl | linux-x64 | linux-arm64 | macos-x64 | macos-arm64) ok 'selected asset is a unix archive' ;;
    *) not_ok 'selected asset is a unix archive' "$selected" ;;
  esac
  if [ -x "$D/cospec" ]; then
    ok 'installed binary is executable'
  else
    not_ok 'installed binary is executable'
  fi
else
  not_ok 'latest: installer exited nonzero' "$(cat "$WORK/log")"
fi

# ── pinned version (with and without a leading v) ───────────────────────────
for pin in 0.12.0 v0.12.0; do
  D="$WORK/pinned-$pin"
  if run_installer "$D" COSPEC_VERSION="$pin" && [ "$("$D/cospec" | cut -d' ' -f1)" = 0.12.0 ]; then
    ok "COSPEC_VERSION=$pin installs 0.12.0"
  else
    not_ok "COSPEC_VERSION=$pin installs 0.12.0" "$(cat "$WORK/log")"
  fi
done

D="$WORK/pinned-latest"
if run_installer "$D" COSPEC_VERSION=latest && [ "$("$D/cospec" | cut -d' ' -f1)" = 0.13.0 ]; then
  ok 'COSPEC_VERSION=latest installs the latest release'
else
  not_ok 'COSPEC_VERSION=latest installs the latest release' "$(cat "$WORK/log")"
fi

# ── tampered archive: nonzero exit, no binary written ───────────────────────
D="$WORK/tampered-fresh"
if run_installer "$D" COSPEC_VERSION=0.12.1; then
  not_ok 'tampered archive: installer must fail'
else
  if grep -q 'checksum mismatch' "$WORK/log"; then
    ok 'tampered archive: exits nonzero with a checksum mismatch'
  else
    not_ok 'tampered archive: mismatch message' "$(cat "$WORK/log")"
  fi
  if [ -e "$D/cospec" ] || [ -n "$(ls -A "$D" 2>/dev/null)" ]; then
    not_ok 'tampered archive: nothing written to the install dir' "$(ls -A "$D")"
  else
    ok 'tampered archive: nothing written to the install dir'
  fi
fi

D="$WORK/tampered-existing"
mkdir -p "$D"
printf 'previous' >"$D/cospec"
if run_installer "$D" COSPEC_VERSION=0.12.1; then
  not_ok 'tampered archive over an existing install: installer must fail'
elif [ "$(cat "$D/cospec")" = previous ] && [ "$(ls -A "$D")" = cospec ]; then
  ok 'tampered archive: existing binary left untouched'
else
  not_ok 'tampered archive: existing binary left untouched' "$(ls -A "$D")"
fi

# ── unlisted platform ──────────────────────────────────────────────────────
D="$WORK/unlisted"
if run_installer "$D" COSPEC_VERSION=0.11.0; then
  not_ok 'release without this platform: installer must fail'
else
  ok 'release without this platform: exits nonzero'
fi

# ── missing release ─────────────────────────────────────────────────────────
D="$WORK/missing"
if run_installer "$D" COSPEC_VERSION=9.9.9; then
  not_ok 'missing release: installer must fail'
else
  ok 'missing release: exits nonzero'
fi

# ── file:// through curl (the network download path) ────────────────────────
if command -v curl >/dev/null 2>&1; then
  D="$WORK/file-url"
  if env COSPEC_RELEASE_BASE="file://$RELEASE" COSPEC_INSTALL_DIR="$D" COSPEC_VERSION=0.12.0 \
    sh "$INSTALLER" 2>"$WORK/log" && [ "$("$D/cospec" | cut -d' ' -f1)" = 0.12.0 ]; then
    ok 'file:// release base downloads through curl'
  else
    not_ok 'file:// release base downloads through curl' "$(cat "$WORK/log")"
  fi
else
  printf 'skip - curl not installed; file:// download path not exercised\n'
fi

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
