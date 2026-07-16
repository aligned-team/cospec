## Context

`mergeMiseToml` detects whether a template table (`[settings]`, `[env]`,
`[tools]`, `[hooks]`, each `[tasks."cospec:*"]`) already exists in the user's
file two different ways, and the two disagree on dotted-key tables:

- **Semantic check** (`asTable(navigate(parsed, path))` over `Bun.TOML.parse`
  output): dotted keys like `tools.node = "20"` produce the same nested object
  shape as a literal `[tools]\nnode = "20"`, so this check correctly reports the
  table as present either way.
- **Text-scanning insertion locator** (`tableBodyEnd`, via `tableHeaderInside`):
  only recognizes a literal `[tools]` header line. For a dotted-only table it
  finds no header, returns `null`, and the insertion is silently dropped in
  `applyMerge` (`if (at === null) continue`).

The drop is silent by design (a defensive fallback for a locator miss), but its
downstream effect is wrong: `verifyCandidate` re-parses the candidate, sees the
intended keys never landed, and returns `false`. `mergeMiseToml` then reports
`status: 'unparseable'` — a message that means "this file is not valid TOML" —
for a file that parsed successfully in Step 1. Dotted-key tables are a common,
idiomatic way to write mise.toml (mise's own docs use both forms
interchangeably), so this silently disables the gate merge for a non-trivial
share of real `mise.toml` files.

## Goals / Non-Goals

**Goals:**

- When a target table exists only as dotted keys, insert missing keys in dotted
  form at the right place instead of dropping the edit.
- Never re-open a dotted-only table with a `[header]` block (TOML forbids
  redefining a table that way — attempting it would just reproduce the same bug
  one level down, since it re-triggers the same verify-then-fallback path).
- Eliminate the false "mise.toml is not valid TOML" diagnosis in every case,
  including the residual fallback for locator misses that fall outside the
  scoped fix.

**Non-Goals:**

- Re-serializing the whole file (out of scope — the module is explicitly
  parse-only + targeted text insertion so user formatting/comments survive).
- Handling every theoretically-legal TOML nesting of dotted keys (e.g. a target
  table shadowed by same-named dotted keys under an unrelated `[other]`
  context). The scoped fix below covers the idiom described in the bug report
  and the common case migrated to (including a target table reached under an
  open `[header]` context, not only at root — see Decision 1 and Risks below).
  Locator misses — no insertion point found at all — degrade to an honest
  scoped-conflict fallback, never the false "invalid TOML" message. A candidate
  that is placed but then fails the Step 4 parse-verify safety net (a genuinely
  pathological file outside this fix's scope) still degrades to the blanket
  `'unparseable'` status, unchanged from today's behavior for that residual case
  — accepted as out of scope here, not claimed to be fixed.

## Decisions

1. **Insert dotted-form keys after the last existing dotted-key line for that
   table, scanning with header-context tracking, rather than appending a
   `[header]` block.** Rejected alternative: append a `[tools]` header block at
   EOF whenever the text locator can't find a literal header. Rejected because a
   table already defined via dotted keys cannot be legally reopened with a
   `[header]` — `Bun.TOML.parse` throws on the resulting candidate, which
   `verifyCandidate` would catch, sending the merge right back to
   `'unparseable'`. Inserting in the same syntactic form the table already uses
   is the only form that stays valid TOML.

   The locator walks the raw lines tracking which table (or root) is currently
   open per the last-seen `[header]`/`[[header]]` line, and treats a
   `key = value` (or `a.b = value`) line as contributing to the target `path`
   when the line's own dotted-key path, resolved relative to the current open
   table, matches `path` as a prefix. The insertion point is immediately after
   the last such line. This covers the reported idiom (root-level
   `tools.node = "20"`) and the mixed dotted+literal case.

2. **A locator miss falls back to a scoped, honestly-labeled snippet for that
   table only — never the blanket `'unparseable'` status.** Rejected
   alternative: keep today's behavior (whole-file `'unparseable'`) for any table
   the locator can't place. Rejected because it re-labels a correctly-parsed
   file as invalid, misdirects users into checking TOML syntax that was never
   wrong, and (today) throws away every other independently-mergeable table's
   additions along with it. The fallback keeps the additive posture: tables the
   locator _can_ place still merge; only the table it can't place degrades to a
   scoped snippet whose message names the real reason (dotted-key table,
   insertion point not determined) instead of "not valid TOML". `'unparseable'`
   is reserved for its literal meaning: `Bun.TOML.parse` actually threw.

3. **No new `MiseMergeResult.status` value.** The existing `'conflict'`
   status/shape (partial `content` + scoped `snippet`) already expresses "some
   keys applied, some keys need manual attention with an explanation at
   `snippet`" — reusing it for the residual locator-miss case avoids growing the
   public result union for a fallback path, and every caller already handles
   `'conflict'` correctly. The distinguishing detail is the snippet/message
   text, not the status enum.

## Risks / Trade-offs

- [Risk] Header-context tracking for dotted keys is new scanning logic and could
  misplace an insertion in a pathological file (e.g. dotted keys interleaved
  with unrelated same-named nested tables). → Mitigation: the locator's match is
  always emitted _relative to_ the table context open at the insertion point
  (`toDottedLine`'s `context` parameter — never root-relative), which is what
  makes an insertion land at the intended path instead of nesting one level too
  deep under an open `[header]`; a fixture with a `[tasks]` header and a
  relative dotted subkey regression-tests this (`mise-merge.test.ts` #15b). On
  top of that, `verifyCandidate` (Step 4) re-parses and checks every intended
  key landed with the intended value before any candidate is accepted; if a
  pathological file still confounds the locator, the candidate fails
  verification and the merge degrades to the blanket `'unparseable'` status for
  that file — never wrong TOML written to disk, though not the scoped per-table
  fallback (that fallback covers "no insertion point found," reached via
  `failedTables`, a different code path from "verification failed").
- [Risk] Widening what counts as a valid table locator changes which merges that
  previously silently failed (as `'unparseable'`) now silently succeed as
  `'merged'`. → Mitigation: this is the intended fix, not a side effect; new
  unit tests assert the merged output re-parses and contains every gate key for
  the dotted-only, mixed, and dotted-`[tasks]` cases named in the bug report.
