## Why

cospec has no public-facing documentation site; the flat `docs/` tree is
contributor-oriented and unpublished. A focused site at `cospec.aligned.team`
makes the tool installable and learnable by users outside the repo.

## What Changes

- New `apps/docs/` VitePress `2.0.0-alpha.18` site (exact pin, installed via the
  `next` dist-tag) in default SPA mode — not MPA — so the default theme's local
  search and nav interactivity work out of the box; extends the default theme
  with an aligned-branded look (fonts vendored from the `dot-team` license: ABC
  Arizona Flare for display, Averta PE for body, Ellograph CF for UI labels;
  charcoal/alabaster/ivory/pewter palette).
- `vitepress-plugin-llms@1.13.2` (exact pin) wired zero-config into
  `vite.plugins` for `llms.txt`/`llms-full.txt` generation, since VitePress 2
  has no built-in `llms.txt` support.
- An 11-page content set in three sidebar groups plus a landing page, adapted
  from the existing contributor docs and linking out to OpenSpec's own docs for
  anything that is OpenSpec's job:
  - Landing (`/`): the "sized to your commit type" pitch, simplified type table,
    quickstart.
  - **Guide**: Installation, The workflow, Agent harness setup.
  - **Concepts**: Commit types & the artifact matrix, The verification ledger,
    The apply gate & verified archive, Blocking changes, How cospec relates to
    OpenSpec.
  - **Reference**: Command reference, Validation rules, Configuration &
    customization.
- `apps/docs/public/CNAME` containing `cospec.aligned.team` for the custom
  domain — VitePress copies `public/` verbatim into `dist/`, so `base` stays
  `/`.
- New `.github/workflows/docs-deploy.yml` custom GitHub Pages workflow
  (checkout, `bun install`, `mise run docs:build`, `actions/configure-pages`,
  `actions/upload-pages-artifact`, `actions/deploy-pages`) triggered on `main`
  pushes touching docs paths.
- Root workspace/mise wiring: `apps/docs` added to the Bun `workspaces` array
  and a `docs:build` mise task; existing `ci.yml`/`release.yml` untouched.

## Impact

- New public readers at `https://cospec.aligned.team`; existing `docs/*.md`
  stays in place (contributor docs), with the public site sourcing/adapting the
  user-facing parts. Maintainer-only material (`docs/release.md`,
  `docs/eval.md`, `docs/self-hosting.md` bootstrap mechanics,
  `architecture.md`'s internal module map) stays out of the public site.
- CI: one new deploy workflow requiring Node >= 22 (VitePress 2.0.0-alpha.18's
  floor) alongside Bun; GitHub Pages must be configured to deploy via Actions
  with the custom domain set once in repo settings.
- Docs build introduces two new exact-pinned dependencies
  (`vitepress@2.0.0-alpha.18`, `vitepress-plugin-llms@1.13.2`) with no formal
  peer-version contract between them — re-verify compatibility on any future
  VitePress alpha bump.
