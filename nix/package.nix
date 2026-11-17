# cospec from a published GitHub release binary (see flake.nix).
#
# The release archive is fetched with the SHA-256 that release.json copies from
# the release's SHA256SUMS. Nothing is built from source: the binary is a
# `bun build --compile` executable whose JavaScript payload is embedded in the
# file itself.
{
  lib,
  stdenv,
  fetchurl,
  autoPatchelfHook,
  release,
}:
let
  system = stdenv.hostPlatform.system;
  asset =
    release.assets.${system}
      or (throw "cospec: no release binary for ${system} (available: ${lib.concatStringsSep ", " (builtins.attrNames release.assets)})");
in
stdenv.mkDerivation {
  pname = "cospec";
  inherit (release) version;

  src = fetchurl {
    url = "https://github.com/aligned-team/cospec/releases/download/v${release.version}/${asset.name}";
    sha256 = asset.sha256;
  };

  sourceRoot = ".";

  # The Linux release binary is linked against the FHS glibc loader; point it
  # at the Nix store's instead.
  nativeBuildInputs = lib.optionals stdenv.hostPlatform.isLinux [ autoPatchelfHook ];
  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [ stdenv.cc.cc.lib ];

  dontConfigure = true;
  dontBuild = true;
  # strip would discard the embedded JavaScript payload.
  dontStrip = true;

  installPhase = ''
    runHook preInstall
    install -Dm755 cospec $out/bin/cospec
    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    actual="$($out/bin/cospec --version)"
    if [ "$actual" != "${release.version}" ]; then
      echo "cospec --version printed '$actual', expected '${release.version}'" >&2
      exit 1
    fi
    runHook postInstallCheck
  '';

  meta = {
    description = "OpenSpec change management, sized to your conventional-commit type";
    homepage = "https://cospec.aligned.team";
    license = lib.licenses.mit;
    mainProgram = "cospec";
    platforms = builtins.attrNames release.assets;
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
}
