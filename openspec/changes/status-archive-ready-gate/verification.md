# Verification

## 1. archiveReady follows the verification gate in status [critical]

- [x] 1.1 @regression (agent) run issue #67's repro script against the built CLI from this branch, failing before the fix -> before the fix `status --json` said `archiveReady:true`, text `archive-ready: yes`, `list` showed the marker while `archive` refused; after the fix `archiveReady:false` with `blockedReasons:["3 row(s) still unresolved (bare [ ])"]`, text `archive-ready: no`, `list` row has no marker, `archive` exit 1 (logs repro-before/after)
- [x] 1.2 @unit (agent) `computeStatus` on a `fix` change with a bare `[ ]` row -> `computeStatus` unit test in test/unit/commands/archive-ready.test.ts: false with blockedReasons `1 row(s) still unresolved (bare [ ])`; failed before the fix (isArchiveReady import missing, flag true)
- [x] 1.3 @unit (agent) the same change with every row `[x]` or `[~] ... -> unit test: every row `[x]`/`[~] defer`gives`archiveReady: true`, blockedReasons `[]`
- [x] 1.4 @unit (agent) the same change with a row that does not parse -> unit test: row with no layer/owner gives `archiveReady: false`, reason `1 row(s) do not parse`
- [x] 1.5 @integration (agent) a v1 `feat` change with no `verification.md`, and a `chore`/`docs` change -> unit tests (v1 fix without verification.md, ci change) and integration fixtures `v1-no-verification`, `ci-change` all true; existing schema-versioning grandfathering test green in `mise run check`

- [x] 1.6 @unit (agent) a `fix` change whose ledger has `[~] ... -> nope`, an empty `## 2.` group, or no `@regression` row -> unit tests in test/unit/commands/archive-ready.test.ts: `archiveReady: false`, one `blockedReasons` entry each (`verification/deferred-reason (line 6)`, `verification/structure (line 7)`, `verification/reproduces-bug`); a row that does not parse is still the single `1 row(s) do not parse`; a surface-promoted warning does not block
- [x] 1.7 @regression (agent) the review finding's repro (`[~] ... -> nope`, empty group) against `status`, `list` and `archive` -> integration fixtures `deferred-no-reason`, `empty-group`, `evidence-missing`, `no-regression-row`: status, status --all and list all false, archive exit 1 on the `verification/*` rule, and every `verification/*` rule archive names is in status's `blockedReasons`

## 2. list agrees with status

- [x] 2.1 @integration (agent) `cospec list` and `cospec status` over the unresolved, malformed, resolved, v1 and `chore`/`docs` fixtures -> test/integration/archive-ready.test.ts: status, status --all, list JSON and text agree on all six fixtures (unresolved, malformed, no file, resolved, v1, ci); failed for unresolved before the fix
- [x] 2.2 @integration (agent) property over the fixtures: every change reporting `archiveReady: true` -> same file, one test per fixture: archiveReady true implies archive exit 0 and no `archive/verification-incomplete`; not ready implies refusal (malformed row refused earlier by `verification/row-grammar`); 7 pass

## 3. Docs and gates

- [x] 3.1 @manual (agent) read `apps/docs/reference/commands.md` status and list rows -> commands.md status row defines archiveReady (artifacts, tasks, gate, verification incl. ledger validation errors; not scenario-preservation or validation errors outside verification.md); list row points to it; both carry a BREAKING value note; `mise run docs:build` exit 0
- [x] 3.2 @integration (agent) `mise run check`, `mise run docs:build`, `cospec validate status-archive-ready-gate --strict` -> `mise run check` exit 0 (2316 unit, 252 integration, contract, pack, bench, release tests, 0 fail); `docs:build` exit 0; `validate status-archive-ready-gate --strict` passed
