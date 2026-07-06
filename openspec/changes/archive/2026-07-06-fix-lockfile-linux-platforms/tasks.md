## 1. Populate Linux platform assets in mise.lock

- [x] 1.1 Run `mise lock --platform linux-x64,linux-arm64,macos-arm64` to add
      URLs + checksums for the six aqua tools at their pinned mise.toml
      versions.
- [x] 1.2 Remove the stale `[[tools.hk]]` bare-alias block (v1.45.0) that the
      lock step did not replace; confirm no v1.45.0 URLs remain.
- [x] 1.3 Verify every aqua tool has a `platforms.linux-x64` entry and that tool
      versions are unchanged from mise.toml (hk 1.48.0, not 1.45.0).
- [x] 1.4 Run `mise install --locked` locally to confirm the lockfile resolves
      with no "No lockfile URL found" error, then `mise run check`.
