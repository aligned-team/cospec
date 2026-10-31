{
  description = "cospec: OpenSpec change management, sized to your conventional-commit type";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      # Version + per-system archive hashes of the release this flake wraps.
      # Rewritten after every release by `mise run release:flake-pin`.
      release = builtins.fromJSON (builtins.readFile ./nix/release.json);
      systems = builtins.attrNames release.assets;
      forAllSystems = nixpkgs.lib.genAttrs systems;
      cospecFor = pkgs: pkgs.callPackage ./nix/package.nix { inherit release; };
    in
    {
      overlays.default = final: _prev: { cospec = cospecFor final; };

      packages = forAllSystems (
        system:
        let
          cospec = cospecFor nixpkgs.legacyPackages.${system};
        in
        {
          inherit cospec;
          default = cospec;
        }
      );

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = nixpkgs.lib.getExe self.packages.${system}.default;
          meta.description = "Run cospec";
        };
      });
    };
}
