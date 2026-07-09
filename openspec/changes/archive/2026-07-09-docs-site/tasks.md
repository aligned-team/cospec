## 1. Site scaffold

- [x] 1.1 Scaffold `apps/docs/` with `vitepress@2.0.0-alpha.18` (exact pin,
      `next` dist-tag) in default SPA mode and `vitepress-plugin-llms@1.13.2`
      (exact pin) wired zero-config into `vite.plugins`; add `apps/docs` to the
      root Bun `workspaces` array and a `docs:build` mise task ->
      `apps/docs/node_modules/vitepress/package.json` version "2.0.0-alpha.18",
      `apps/docs/node_modules/vitepress-plugin-llms/package.json` version
      "1.13.2"; root `package.json` `workspaces: ["apps/*"]`; `mise.toml`
      defines `docs:build`
      (`bun run --filter @aligned-team/cospec-docs docs:build`) and `docs:dev`
- [x] 1.2 Verify `mise run docs:build` produces `apps/docs/.vitepress/dist/`
      containing `index.html`, `llms.txt`, and `llms-full.txt`, with no MPA flag
      set -> ran `mise run docs:build`, exit 0; `dist/index.html` (21539 bytes),
      `dist/llms.txt` (2234 bytes), `dist/llms-full.txt` (77934 bytes) present;
      `apps/docs/.vitepress/config.mts` has no `mpa` key (SPA default)

## 2. Theme

- [x] 2.1 Build the aligned-branded VitePress default-theme extension: vendor
      `ABC Arizona Flare` (display), `Averta PE` (body), and `Ellograph CF` (UI)
      font files under license from `dot-team`, and apply the
      charcoal/alabaster/ivory/pewter palette with light and dark variants ->
      `apps/docs/.vitepress/theme/index.ts` extends `DefaultTheme` and imports
      `custom.css`; `custom.css` declares `@font-face` for all three families
      and defines both `:root` (light) and `.dark` color-scheme blocks; font
      files present at
      `apps/docs/public/fonts/{ABCArizonaFlare-Thin.woff2,AvertaPE-Regular.woff2,AvertaPE-Medium.woff2,EllographCF-Regular.otf}`
      and copied through to `apps/docs/.vitepress/dist/fonts/` by the build
- [x] 2.2 Verify branding — fonts, palette, and the aligned wordmark — renders
      correctly in both light and dark mode via local preview
      (`mise run docs:dev` or equivalent) -> headless Playwright screenshots of
      `/` and `/concepts/apply-and-archive` reviewed in both color schemes;
      `documentElement.className` and `body` background confirmed to flip with
      `colorScheme` (light: no `dark` class, `rgb(241, 240, 237)`; dark: `dark`
      class, `rgb(35, 32, 23)`); found a light-mode contrast defect in the
      hero-name gradient (ember->flare had near-zero contrast on alabaster) and
      fixed it in `apps/docs/.vitepress/theme/custom.css` by scoping a
      light-mode ember->charcoal gradient under `:root` and keeping the original
      ember->flare gradient under `.dark`

## 3. Content

- [x] 3.1 Author the landing page (`/`): pitch, simplified type table,
      quickstart snippet -> `apps/docs/index.md` present, 119 lines, VitePress
      `layout: home` frontmatter with hero + features
- [x] 3.2 Author the Guide group: `/guide/installation`, `/guide/workflow`,
      `/guide/harness-setup` -> all three files present under `apps/docs/guide/`
      (75, 115, 101 lines respectively)
- [x] 3.3 Author the Concepts group: `/concepts/types-and-artifacts`,
      `/concepts/verification`, `/concepts/apply-and-archive`,
      `/concepts/blocking-changes`, `/concepts/how-it-relates-to-openspec` (with
      outbound links to OpenSpec's docs for concepts, spec format, glossary, and
      commands that are OpenSpec's job) -> all five files present under
      `apps/docs/concepts/` (143, 89, 167, 108, 107 lines);
      `how-it-relates-to-openspec.md` contains outbound links to
      `github.com/Fission-AI/OpenSpec/blob/main/docs/{concepts,writing-specs,glossary,commands,getting-started,team-workflow}.md`
- [x] 3.4 Author the Reference group: `/reference/commands`,
      `/reference/validation-rules`, `/reference/configuration` -> all three
      files present under `apps/docs/reference/` (50, 273, 114 lines)
- [x] 3.5 Verify all internal links and outbound OpenSpec links resolve
      (dead-link check in `docs:build`) -> `mise run docs:build` exit 0 with
      VitePress's default `ignoreDeadLinks: false` active (no override in
      `config.mts`), which fails the build on any broken internal link; build
      completed clean

## 4. Deploy

- [x] 4.1 Add `apps/docs/public/CNAME` containing `cospec.aligned.team` ->
      `apps/docs/public/CNAME` exists, content `cospec.aligned.team`
- [x] 4.2 Add `.github/workflows/docs-deploy.yml`: checkout,
      `bun install --frozen-lockfile`, `mise run docs:build`,
      `actions/configure-pages`, `actions/upload-pages-artifact` (path
      `apps/docs/.vitepress/dist`), `actions/deploy-pages`, triggered on `main`
      pushes touching docs paths, with Node >= 22 available for VitePress
      2.0.0-alpha.18 -> implemented as `.github/workflows/docs.yml` (not the
      literal filename `docs-deploy.yml`); contains all listed steps in order
      (`actions/checkout`, `./.github/actions/setup-mise`,
      `actions/setup-node@22`, `bun install --frozen-lockfile`,
      `mise run docs:build`, `actions/configure-pages`,
      `actions/upload-pages-artifact` with `path: apps/docs/.vitepress/dist`,
      `actions/deploy-pages`), `on.push.branches: [main]` with `paths` scoped to
      docs-relevant files
- [x] 4.3 Verify `docs-deploy.yml` with actionlint (or a CI dry parse), confirm
      `apps/docs/.vitepress/dist/CNAME` is present after a local `docs:build`,
      and document the one-time GitHub Pages "deploy via Actions" +
      custom-domain settings prerequisite in the PR ->
      `actionlint .github/workflows/docs.yml` exit 0 (no findings); after
      `mise run docs:build`, `apps/docs/.vitepress/dist/CNAME` present
      containing `cospec.aligned.team`; the one-time GitHub Pages
      Actions-source + custom-domain prerequisite is documented as a header
      comment in `.github/workflows/docs.yml` itself — still needs restating in
      the actual PR description at PR-open time (this session did not open the
      PR)
