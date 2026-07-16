## 1. Dotted-key table locator

- [x] 1.1 Add a header-context-tracking scanner in
      `apps/cli/src/harness/mise-merge.ts` that finds the insertion point for a
      target table's dotted-key form (last matching `key = value` /
      `a.b = value` line, resolved relative to the currently open `[header]`
      context)
- [x] 1.2 Wire the new locator into `applyMerge`: when `tableBodyEnd` (the
      literal-header locator) returns `null`, try the dotted-key locator before
      dropping the edit, and insert missing keys in dotted form (e.g.
      `tools.hk = "1"`) rather than opening a `[header]` block
- [x] 1.3 When the dotted-key locator also can't place a table, degrade that
      table's keys to a scoped, honestly-labeled snippet/message (never the
      blanket "mise.toml is not valid TOML") while still merging every other
      independently-locatable table
- [x] 1.4 Emit the inserted dotted key relative to whichever table context was
      open at the insertion point (not root-relative) — an insertion point found
      inside an already-open `[header]` (e.g. `[tasks]` with a relative
      `"cospec:validate".description` subkey) must not double-nest under that
      header

## 2. Regression tests

- [x] 2.1 Add a regression case to
      `apps/cli/test/unit/harness/mise-merge.test.ts` for a dotted-only
      `[tools]` table (`tools.node = "20"`, no `[tools]` header) that FAILS
      before this fix (asserts today's wrong `'unparseable'` status/message) and
      PASSES after (asserts `'merged'`/`'conflict'` with every missing gate key
      inserted in dotted form and the merged output re-parsing)
- [x] 2.2 Add a case mixing dotted keys for one table with a literal `[header]`
      for another in the same file, asserting both merge correctly
- [x] 2.3 Add a case for a dotted `[tasks."cospec:validate"]`-style table
      defined via dotted keys, asserting the missing task key(s) insert in
      dotted form
- [x] 2.4 For any locator-miss fallback path retained per design.md Decision 2,
      add a case asserting the reported status/message names the real reason
      (dotted-key table) and never says "not valid TOML"
- [x] 2.5 Add a regression case for a target subkey found under an open
      `[header]` context (e.g. `[tasks]` with a relative
      `"cospec:validate".description` subkey, no root-level dotted prefix) that
      FAILS before the 1.4 fix (root-relative emission double-nests under the
      open header, so the intended key never lands and status falls back to
      `'unparseable'`) and PASSES after (context-relative emission lands the key
      at the intended path, content re-parses)

## 3. Docs and init-level check

- [x] 3.1 Re-read `apps/docs/guide/installation.md`'s mise.toml merge
      description against the fixed behavior; update only if the user-facing
      status/message text changed
- [x] 3.2 Check `apps/cli/test/unit/init/init.test.ts` and
      `apps/cli/test/integration/init.test.ts` for any test asserting the old
      "not valid TOML" wording on a dotted-key fixture, and update it to the
      corrected wording/status
