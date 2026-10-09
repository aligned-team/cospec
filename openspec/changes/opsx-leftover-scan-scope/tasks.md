# Tasks

## 1. Baseline

- [x] 1.1 Confirm `harness-receipt-and-doctor-scope` (#63) is an ancestor of
      this branch and `cospec apply opsx-leftover-scan-scope` exits 0, and
      verify the two defects reproduce on this baseline (a nested-worktree opsx
      leftover is listed/removed; a real OpenCode opsx leftover is not detected)
      -- verify by running both probes by hand before writing tests

## 2. Leftover scan does not cross a nested worktree boundary

- [x] 2.1 Add a `test.failing` unit row proving a real openspec-authored
      leftover inside a `.claude/worktrees/<name>/` directory carrying its own
      `.git` is listed by `findOpsxFiles` today (the regression row) and verify
      it fails against the unmodified source
- [x] 2.2 Add a boundary check to `leftoverScanFiles`' walk (a directory holding
      its own `.git` entry is never descended into) and flip 2.1's row to a
      passing `test` -- verify `bun test` passes and a sibling leftover outside
      any nested worktree is still found

## 3. OpenCode command leftovers are detected by their own shape

- [x] 3.1 Add `test.failing` unit rows proving a real-shape OpenCode opsx
      leftover (description-only frontmatter, body carrying the literal
      `` `openspec list --json` `` reference) is NOT detected by
      `isOpsxMarkdown`/`findOpsxFiles`/`checkOpsx` today, and that a
      user-authored file at the same path shape with the same frontmatter shape
      but no body marker is correctly left alone already -- verify the first row
      fails and the second already passes against the unmodified source
- [x] 3.2 Give `isOpsxMarkdown` the new `(relpath, text)` signature and
      OpenCode-shape branch, update `findOpsxFiles`' call site, and point
      `doctor.ts`'s `checkOpsx` at the shared `isOpsxMarkdown` instead of its
      own duplicated provenance check; flip 3.1's failing row to `test` --
      verify `bun test` passes and the existing row-3.2 OpenCode fixture
      (`harness-receipt-and-doctor-scope`'s hand-made `name: "OPSX: …"` file,
      which proves the legacy command path is still walked) is unchanged and
      still passes
- [x] 3.3 Add a contract row that runs the real pinned binary's
      `init --tools opencode` in a sandboxed temp repo, then runs
      `cospec init --remove-opsx` and asserts the generated OpenCode files are
      removed -- verify it passes against the pinned 1.13.1 binary

## 4. Docs

- [x] 4.1 Update `docs/harness-integration.md`'s leftover-scan section with the
      nested-worktree boundary and the OpenCode detection shape -- verify by
      reading the rendered page section
- [x] 4.2 Update `apps/docs`' harness-setup and commands pages wherever they
      describe `--remove-opsx` / doctor's `opsx-leftover` finding -- verify
      `mise run docs:build` succeeds

## 5. Gate

- [x] 5.1 `mise run check` green (lint, format, typecheck, unit, integration,
      contract, bench, generate:check, agents:check, vendor check, validate-all,
      schema:validate) -- verify by the task's own exit code
- [x] 5.2 `cospec validate opsx-leftover-scan-scope --strict` clean and every
      verification ledger row `[x]` with an observed result or
      `[~] defer:     <reason>` -- verify by reading the ledger

- [ ] 5.3 `cospec archive opsx-leftover-scan-scope` -- the archive commit
      follows this one

## 6. Review-finding fixes (round 2)

- [x] 6.1 Add the guard-lead-carrying user fixture at the never-generated id
      `opsx-status.md` (plus a same-body real-id control) to
      `doctor-rows.test.ts` -- verify it fails when the id allowlist is relaxed
      to `opsx-[^/]+`
- [x] 6.2 Extract `walkProjectFiles` into `harness/scan-walk.ts` and route the
      leftover scan, `harnessMarkdownFiles` and `checkStaleSidecars` through it,
      with unit rows for a nested worktree and a symlinked root -- verify they
      fail against the unmodified walks and pass after

## 7. Review-finding fixes (round 3)

- [x] 7.1 Apply the nested-checkout test to a scan root and to the real path it
      resolves to (`isInsideNestedCheckout` in `harness/scan-walk.ts`), with
      `scan-walk.test.ts` and `doctor.test.ts` rows for an embedded-clone root,
      a symlinked root into a nested worktree and a symlinked `openspec` --
      verify they fail against the unfixed walker and pass after
- [x] 7.2 Give `removeOpsxFiles` the same test before every delete and prune,
      with `init.test.ts` rows for a symlinked `.agents/skills` into a worktree
      and an embedded `.claude` clone -- verify the nested file survives
- [x] 7.3 State the root-level boundary in `docs/harness-integration.md`, the
      harness-setup page and the spec/design, then rerun the gate -- verify by
      `mise run check` exit code
