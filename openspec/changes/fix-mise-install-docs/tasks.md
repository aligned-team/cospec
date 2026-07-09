## 1. Document the mise cooldown and exact-version-pin behavior

- [x] 1.1 In `README.md`, add a note under the
      `mise use github:aligned-team/cospec` snippet (Quick start → mise)
      explaining mise's github-backend `minimum_release_age` cooldown and
      recommending an exact 3-part version pin (e.g. `@0.4.0`) to fetch a
      release cut in the last day or so. -> done: added blockquote note directly
      under the snippet.
- [x] 1.2 In `apps/cli/README.md`, add the equivalent note under its copy of the
      `mise use github:aligned-team/cospec` snippet (Install → Via mise). ->
      done: same blockquote note added.
- [x] 1.3 In `docs/release.md`, extend the existing mise paragraph (the one
      ending "...verifies it against `SHA256SUMS`") with the cooldown note and
      make explicit that mise only matches exact 3-part tags
      (`v{major}.{minor}.{patch}`) — partial versions like `@0.4` do not
      resolve. -> done: appended a paragraph covering both the exact-tag
      requirement and the cooldown.
- [x] 1.4 Verify wording against live mise behavior: re-run
      `mise use github:aligned-team/cospec@0.4.0` (expect immediate resolution,
      no cooldown warning) and
      `MISE_VERBOSE=1 mise use github:aligned-team/cospec` (expect the
      `minimum_release_age` WARN) to confirm the added notes match observed
      behavior. -> confirmed:
      `mise use --dry-run github:aligned-team/cospec@0.4.0` resolves immediately
      (already installed, no cooldown warning);
      `MISE_VERBOSE=1 mise     ls-remote github:aligned-team/cospec` shows
      `WARN 2 newer     github:aligned-team/cospec releases hidden by minimum_release_age`
      and lists only 0.1.1/0.2.0/0.2.1 — matches the added doc wording exactly.
- [x] 1.5 Run `mise run docs:build` to confirm the docs site still builds
      cleanly (README/docs/release.md changes don't touch VitePress-rendered
      content directly, but this is the standard drift check for this repo). ->
      done: `mise run docs:build` succeeded (see verification below).
