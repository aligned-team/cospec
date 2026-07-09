## 1. New Stores concept page

- [x] 1.1 Add `apps/docs/concepts/stores.md`, adapted from `docs/stores.md` into
      public-docs voice: what a store is, the resolution order (flag → config
      `store:` → local repo, with the `references:` non-override caveat), the
      cospec-owns/OpenSpec-owns split, the unregistered-store error message
      verbatim with its exit code, and the cwd-never-changes note. -> page
      written; content verified against `apps/cli/src/core/root.ts`,
      `docs/stores.md`, and a live CLI run (see 4.1).
- [x] 1.2 Register the new page in `apps/docs/.vitepress/config.mts`'s Concepts
      sidebar. -> added `{ text: 'Stores', link: '/concepts/stores' }` after
      "Blocking changes".
- [x] 1.3 Verify: `mise run docs:build` exits 0 (no dead link to the new page or
      from it). -> `mise run docs:build` exit 0; `llmstxt` processed
      `concepts/stores.md` with no warnings referencing it.

## 2. Reference pages

- [x] 2.1 `apps/docs/reference/commands.md` — add `--store <id>` to the
      global-flags table, linking to the new Stores page. -> row added between
      `--cwd <path>` and `-h, --help`.
- [x] 2.2 `apps/docs/reference/configuration.md` — add a short pointer under
      Tier 2 to the `store:` config-yaml key, linking out rather than restating
      resolution order. -> paragraph added after the `verification.layers` note
      in Tier 2.

## 3. Concept and guide cross-links

- [x] 3.1 `apps/docs/concepts/how-it-relates-to-openspec.md` — add a short
      store-awareness note near the ownership-boundary content, plus a "See
      also" link to Stores. -> paragraph added after the "None of this
      touches..." paragraph; `/concepts/stores` appended to "See also".
- [x] 3.2 `apps/docs/guide/workflow.md` — add a one-sentence pointer that every
      step also accepts `--store <id>`. -> sentence added after the
      worked-example intro paragraph.

## 4. Verification pass

- [x] 4.1 Confirm the unregistered-`--store` error message and exit code claimed
      in the new page against an actual CLI run (not just source reading). ->
      ran `cospec --store bogus-store-xyz new feat smoke-test-store` in this
      worktree. Observed exit code `1`, matching `EXIT.failure` in
      `apps/cli/src/cli.ts`, with the "unknown store" message naming the
      registered stores exactly as the page describes. Page text uses the
      generic form (`bogus-id` / `platform`) for a clean docs example rather
      than this worktree's actual registered store.
- [x] 4.2 `mise run docs:build` — dead-link gate passes. -> exit 0, confirmed
      after `oxfmt` reformatting too.
- [x] 4.3 `mise run cospec -- validate docs-v030-sync --strict` passes. ->
      `0 errors, 0 warnings — validation passed`.
