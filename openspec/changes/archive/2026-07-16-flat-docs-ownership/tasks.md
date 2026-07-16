## 1. Restructure flat docs to link out to site-owned facts

- [x] 1.1 `docs/apply-archive.md` — trim exit-code table/step walkthrough/JSON
      shape; add summary + link to `/concepts/apply-and-archive`; keep the "gate
      enforced twice" rationale and the `sync-blockers` pointer
- [x] 1.2 `docs/validation.md` — trim rule registry tables; add link to
      `/reference/validation-rules`; keep composition/delegation prose
- [x] 1.3 `docs/schemas.md` — trim artifact matrix / Surfaces block / per-type
      rationale; add links to `/concepts/types-and-artifacts` and
      `/concepts/verification`; keep canon pointers and customization-tier
      escape-hatch mechanics
- [x] 1.4 `docs/stores.md` — trim near-verbatim duplicate content; add summary +
      link to `/concepts/stores`
- [x] 1.5 `docs/blocking-changes.md` — trim template/example walkthrough; add
      link to `/concepts/blocking-changes`; keep entry-grammar regex and
      `core/blockers.ts` pointer
- [x] 1.6 `docs/harness-integration.md` — trim "what gets written" file tree and
      smoke checklist; add link to `/guide/harness-setup`; keep per-workflow
      behavior descriptions and the managed-file pseudocode
- [x] 1.7 `docs/architecture.md` — trim duplicated failure-mode intro; add link
      to `/concepts/how-it-relates-to-openspec`; keep wrapped-call discipline,
      static-matrix invariant, and module map
- [x] 1.8 Audit `docs/eval.md`, `docs/self-hosting.md`, `docs/release.md` for
      site-owned duplication; confirm none found, leave unchanged

## 2. Verify cross-references stay valid

- [x] 2.1 Grep `CLAUDE.md` and `.agents/shared.md` for references to the edited
      flat docs; confirm none are invalidated by the restructure
- [x] 2.2 Spot-check every new/edited in-repo relative link (`docs/*.md` links
      to other `docs/*.md` files) resolves to an existing file
