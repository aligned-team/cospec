## 1. Fix verification-gate misdescription in verification.md

- [x] 1.1 Re-verify ground truth against `apps/cli/src/core/verification.ts`
      (`computeVerificationVerdict`) and `apps/cli/src/commands/archive.ts`
      (verification-incomplete and scenario-preservation gate blocks). ->
      confirmed at verification.ts:260-292 (`unresolved` counts every
      `state === 'planned'` row, no critical filter) and archive.ts:183-213
      (verification-incomplete gate) / archive.ts:242-268 (scenario-preservation
      gate reads only spec deltas vs. living specs, never `verification.md`).
- [x] 1.2 Rewrite the "How archive gates on it" section of
      `apps/docs/concepts/verification.md` so `archive/verification-incomplete`
      is described as blocking on any unresolved `[ ]` row (not only
      `[critical]` groups) and `archive/scenario-preservation` is described as
      an unrelated spec-delta scenario-thinning gate that does not read this
      ledger. Link to `/concepts/apply-and-archive` as the canonical owner of
      full gate mechanics. -> done; section rewritten in
      apps/docs/concepts/verification.md (lines 76-87).
- [x] 1.3 Grep the rest of `apps/docs/` (excluding the built `.vitepress/dist/`
      output) for the same `[critical]`-only or ledger-conflation error and
      confirm no other page — including `concepts/apply-and-archive.md`,
      `reference/validation-rules.md`, `guide/workflow.md`, and
      `concepts/how-it-relates-to-openspec.md` — echoes it. -> ran
      `grep -rn "critical.*group\|every.*critical" apps/docs --include="*.md"`
      excluding dist/; apply-and-archive.md, validation-rules.md, and
      workflow.md already state the gates correctly (any unresolved row,
      spec-delta-only scenario check); no source-doc echo of the bug found.
- [x] 1.4 Run `mise run docs:build` and confirm it exits 0. -> exit 0, "build
      complete in 2.32s."
