# A downstream flake that consumes cospec only through `overlays.default`.
#
#   nix build ./nix/test/consumer --override-input cospec "path:$PWD" --no-write-lock-file
#
# (run from the repo root; `mise run test:flake` does exactly this). The check
# fails unless `pkgs.cospec` exists after applying the overlay and its
# `cospec --version` matches the release the cospec flake pins.
{
  inputs = {
    cospec.url = "github:aligned-team/cospec";
    nixpkgs.follows = "cospec/nixpkgs";
  };

  outputs =
    { cospec, nixpkgs, ... }:
    let
      release = builtins.fromJSON (builtins.readFile "${cospec}/nix/release.json");
      forAllSystems = nixpkgs.lib.genAttrs (builtins.attrNames release.assets);
      check =
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            overlays = [ cospec.overlays.default ];
          };
        in
        pkgs.runCommand "cospec-overlay-consumer" { } ''
          actual="$(${pkgs.cospec}/bin/cospec --version)"
          if [ "$actual" != "${release.version}" ]; then
            echo "pkgs.cospec --version printed '$actual', expected '${release.version}'" >&2
            exit 1
          fi
          echo "pkgs.cospec $actual" > $out
        '';
    in
    {
      packages = forAllSystems (system: {
        default = check system;
      });
      checks = forAllSystems (system: {
        default = check system;
      });
    };
}
