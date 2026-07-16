## 1. Root and CLI README fixes

- [x] 1.1 Remove stale "(Publishing soon; the commands below are the shape of
      it.)" parenthetical from `README.md`
- [x] 1.2 Bump `mise use github:aligned-team/cospec@0.4.0` example to `@0.5.2`
      in `README.md`
- [x] 1.3 Remove stale "Publishing soon." line from `apps/cli/README.md`
- [x] 1.4 Bump `@0.4.0` example to `@0.5.2` in `apps/cli/README.md`

## 2. Docs site install + quickstart

- [x] 2.1 Add a "Via mise" subsection first in
      `apps/docs/guide/installation.md`, before the package-manager methods,
      documenting `mise use github:aligned-team/cospec` + `cospec init`, the
      self-contained binary via mise's github backend (no JS runtime needed),
      and the `minimum_release_age` cooldown caveat with the exact-pin
      workaround (`mise use github:aligned-team/cospec@0.5.2`)
- [x] 2.2 Add a mise tab (first) to the quickstart code-group in
      `apps/docs/index.md`, consistent with installation.md

## 3. Flat docs version pins

- [x] 3.1 Bump `@0.4.0` example pin to `@0.5.2` in `docs/release.md:49`
- [x] 3.2 Replace `cospec@0.1.0` in `docs/harness-integration.md:110` with a
      version-placeholder form consistent with current usage

## 4. Verification

- [x] 4.1 Check `.agents/shared.md` for drift (expected: no update needed — no
      workflow change)
- [x] 4.2 Run `mise run docs:build` to confirm the site builds
- [x] 4.3 Run `mise run check` before committing
