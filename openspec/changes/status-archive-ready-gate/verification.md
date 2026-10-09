# Verification

## 1. archiveReady follows the verification gate in status [critical]

- [ ] 1.1 @regression (agent) run issue #67's repro script against the built CLI from this branch, failing before the fix -> `status --json` reports `archiveReady: false` with `blockedReasons` non-empty, text says `archive-ready: no`, `list` omits the `archive-ready` marker, and `archive` refuses
- [ ] 1.2 @unit (agent) `computeStatus` on a `fix` change with a bare `[ ]` row -> `archiveReady: false` and `blockedReasons` non-empty
- [ ] 1.3 @unit (agent) the same change with every row `[x]` or `[~] ... -> defer: ...` -> `archiveReady: true`
- [ ] 1.4 @unit (agent) the same change with a row that does not parse -> `archiveReady: false`
- [ ] 1.5 @integration (agent) a v1 `feat` change with no `verification.md`, and a `chore`/`docs` change -> `archiveReady` still true

## 2. list agrees with status

- [ ] 2.1 @integration (agent) `cospec list` and `cospec status` over the unresolved, malformed, resolved, v1 and `chore`/`docs` fixtures -> same `archiveReady` value and marker for each change
- [ ] 2.2 @integration (agent) property over the fixtures: every change reporting `archiveReady: true` -> `cospec archive` does not fail with `archive/verification-incomplete`

## 3. Docs and gates

- [ ] 3.1 @manual (agent) read `apps/docs/reference/commands.md` status and list rows -> they name what `archiveReady` covers and what it does not
- [ ] 3.2 @integration (agent) `mise run check`, `mise run docs:build`, `cospec validate status-archive-ready-gate --strict` -> all pass
