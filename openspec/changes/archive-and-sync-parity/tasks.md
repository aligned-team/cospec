# Tasks

Tracks follow design D1, in design D2's order. Contract rows are written first
(T5) as `test.failing`, and each implementing task flips exactly its own rows in
the commit that makes them pass. Every task ends with `mise run check` green and
one conventional commit (subject at most 72 characters, the harness's
Co-Authored-By trailer, never `--no-verify`), with its box ticked in that same
commit. Every probe of the pinned binary runs under the suite's oracle or a
sandboxed HOME/XDG.

## 1. T5 — fixtures and failing contract rows first (`apps/cli/test/contract/{archive-no-validate,sync-specs}.test.ts`)

- [x] 1.1 Add the fixture builders to `test/contract/fixtures.ts` (append only):
      feat v2 changes with resolved verification and done tasks for ADDED (new
      capability), MODIFIED, REMOVED, RENAMED and retired-capability deltas; the
      three verbatim-view differential fixtures (comment-kept scenario,
      commented living scenario, commented living requirement header); the
      bare-`[ ]` verification, incomplete-task, scenario-drop and
      revalidation-only variants (a proposal with no `## Why`, which only
      cospec's typed rules refuse); the namespace folder; ADDED + REMOVED,
      REMOVED-only and REMOVED-only-with-marker on a new capability; the
      symlinked-alias tree; a short-Purpose new capability; a no-delta feat and
      a `chore` change; and the mode-000 archive case. Verify by a smoke row per
      builder that `openspec validate --strict` reads it. Commit
      `test(cli): add archive and sync-specs fixtures`
- [x] 1.2 Write every contract row of verification groups 1–3, 4.1, 5.1,
      6.1–6.4, 7.1, 7.2, 8 and 2.3 in `archive-no-validate.test.ts`, each
      reading the binary's answer at test time through the upstream oracle, and
      the archive key-oracle rows through `support/key-oracle.ts`, adding the
      tasks-gate `fix` to `NAMED_COLLISIONS` with why cospec's value wins. Mark
      each row that fails on this tree `test.failing` and record the failing
      count in the commit body. Verify with `mise run test:contract` green.
      Commit `test(cli): pin archive parity differentials as failing rows`
- [x] 1.3 Write every contract row of verification groups 9–12 and 5.2 in
      `sync-specs.test.ts`, each comparing against `openspec archive -y` on a
      copy (file list and sha256 per file), and all `test.failing` (the command
      doesn't exist yet). Verify with `mise run test:contract` green. Commit
      `test(cli): pin sync-specs differentials as failing rows`

## 2. T2 — `archive/new-spec-non-added` (`apps/cli/src/core/rules/archive.ts`)

- [x] 2.1 Skip REMOVED in the `living === undefined` arm (design D9), with the
      unit table 6.5. Make `archive/rebuilt-spec-invalid` refuse the
      REMOVED-only no-marker case on the skeleton spec once the precondition no
      longer suppresses it, extending the rebuilt check to the skeleton if it
      does not fire there (design D9). Flip rows 6.1, 6.2 and 6.3, and keep 6.4
      green. Verify with those rows and the unit table. Commit
      `fix(validate): let REMOVED on a new capability pass as OpenSpec does`

## 3. T1 — `cospec archive` (`apps/cli/src/commands/archive.ts`, `apps/cli/src/core/scenario-gate.ts`, `apps/cli/src/core/archive-output.ts`)

- [x] 3.1 Move `changeDeltaOps` and the scenario-preservation step into
      `core/scenario-gate.ts` (design D4), unchanged in behavior, with the
      type-level test 3.4. Verify with rows 3.1–3.3 still green and
      `grep -n findScenarioDrops apps/cli/src/commands` empty. Commit
      `refactor(cli): share the scenario-preservation gate`
- [x] 3.2 Add `core/archive-output.ts`'s failure-document builder (design D6),
      `jsonFailurePayload = { archive: null }`, and one document on every
      refusal path, with the unit enumeration 2.5. Flip rows 2.3–2.6. Commit
      `feat(cli): answer every archive refusal with one JSON document`
- [x] 3.3 Refuse a namespace folder before revalidation (design D8). Flip row
      5.1. Commit
      `feat(cli): refuse a namespace folder as OpenSpec archive does`
- [x] 3.4 Add the path-confinement check and the guarded slot `lstat`, and route
      archive-directory reads through the degraded index (design D7). Flip row
      4.1. Run row 4.2 in the Linux container and record its observed output in
      the ledger. Commit
      `fix(cli): answer an unreadable archive directory as OpenSpec does`
- [x] 3.5 Add the Totals/in-sync line reader with unit table 7.3, the success
      document's `archive` and `root` (design D5), the `Specs:` skip reasons,
      `specsSkipReason` and the `already in sync` line (design D10). Flip rows
      2.1, 2.2, 7.1 and 7.2. Commit
      `feat(cli): add OpenSpec's archive and root keys to archive's JSON`
- [x] 3.6 Wire `respellRemedies` into every relay (design D12). Flip rows 8.1
      (archive half) and 8.2 (archive outputs). Commit
      `fix(cli): spell relayed archive remedies as cospec`
- [x] 3.7 Accept `--no-validate` (design D3): skip `validateChange`, forward the
      flag, print the banner. Move the flag from pending to handled in
      `core/command-table.ts` and delete its `parity-pending.yaml` entry in this
      commit. Flip rows 1.1–1.6. Commit
      `feat(cli): accept archive --no-validate and keep every hard gate`

## 4. T3 — `cospec sync-specs` (`apps/cli/src/commands/sync-specs.ts`, `apps/cli/src/core/scratch-root.ts`)

- [x] 4.1 Add `core/scratch-root.ts` (design D11: the scratch layout, the
      symlink-escape check, the pre/post fingerprint, copy-back with deletions
      and pruning, and cleanup in `finally`) with unit rows 11.2 and 11.5.
      Verify with those unit rows. Commit
      `feat(cli): copy a root's spec inputs to a scratch tree and back`
- [x] 4.2 Add `commands/sync-specs.ts` (design D11 steps, wrapped-call
      discipline, text and `--json` output), its `core/command-table.ts` row
      (`json` and `store` accepted, one required `change` positional) and its
      `cli.ts` dispatch entry. Flip rows 9.1–9.4, 10.1, 10.2, 11.1, 11.3, 11.4,
      12.1–12.4, 5.2 and the sync-specs halves of 8.1 and 8.2. Verify with those
      rows and the reachability test green. Commit
      `feat(cli): add sync-specs, archive's merge without the archive`

## 5. T4 — canon (`apps/cli/src/canon/workflows/{sync-specs,archive}.md`, `harness.yaml`)

- [x] 5.1 Rewrite `sync-specs.md`, add the early-sync sentence to `archive.md`,
      update the `sync-specs` description in `harness.yaml` (design D13), and
      run `mise run generate`. Verify with row 13.1 and
      `mise run generate:check` clean. Commit
      `feat(canon): sync specs through cospec sync-specs`

## 6. Docs

- [x] 6.1 Update every page in design D14 to the shipped behavior, record the
      grep in row 13.2, and run `mise run docs:build`. Verify with row 13.2.
      Commit `docs(cli): document archive parity and sync-specs`

## 7. Agent guidance

- [x] 7.1 Add `cospec sync-specs` to `.agents/shared.md`'s workflow section
      (step 6), and update its "JSON documents are additive" paragraph for
      archive and the new named collision (design D14), then
      `mise run agents:sync`. Verify with row 13.3. Commit
      `docs(agents): name sync-specs in the cospec workflow`

## 8. Close-out

- [x] 8.1 Record observed evidence after `->` on every verification row, confirm
      row 14.1 (no `test.failing`/`test.todo` left in the two new test files)
      and row 14.2 (`mise run check` green), and run
      `mise run cospec -- validate archive-and-sync-parity --strict` clean.
      Commit `docs(cli): record archive-and-sync-parity evidence`
- [ ] 8.2 Ask the user to run verification row 13.4 (`mise run eval:e2e` needs
      the human-held DeepSeek key) on the branch head and on `main`, and record
      the scores they report on the row. Verify by the row carrying both runs'
      scores. Commit `docs(cli): record the archive-and-sync-parity eval run`
- [x] 8.3 Rebase onto `main` (`--force-with-lease`, no merge commit), rerun
      `bun install --frozen-lockfile` and `mise run check`, and confirm
      `git log main..HEAD` shows only this change's commits. The archive commit
      follows this one -> 2026-10-05: already rebased onto `80ee3855` (fetch
      showed no new commits); `bun install --frozen-lockfile` reported no
      changes; `mise run check` exit 0 (unit 2025, integration 193, contract
      2678, bench 343, release-test 14, 0 fail); `git log main..HEAD` lists only
      this change's 23 commits
