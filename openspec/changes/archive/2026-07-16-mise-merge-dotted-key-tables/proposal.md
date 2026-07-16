## Why

`apps/cli/src/harness/mise-merge.ts` additively merges the commit-gate
`mise.toml` template into a user's existing `mise.toml`. When a target table
(e.g. `[tools]`) exists only in dotted-key form — `tools.node = "20"` with no
literal `[tools]` header, a common and perfectly valid mise idiom — the semantic
check (`asTable`/`navigate` over `Bun.TOML.parse` output) correctly sees the
table as present, but the text-scanning insertion locator (`tableBodyEnd`, which
only recognizes a literal `[header]` line) cannot find where to insert the
missing keys. `applyMerge` silently drops the edit
(`if (at === null) continue`), `verifyCandidate` then fails because the intended
keys never landed, and `mergeMiseToml` falls back to status `'unparseable'`. The
CLI then reports "mise.toml is not valid TOML" for a file that is perfectly
valid TOML — a misleading diagnosis, and the gate config silently fails to merge
into any project whose `mise.toml` uses this idiom for `[tools]`, `[settings]`,
`[env]`, `[hooks]`, or a dotted `[tasks."cospec:*"]` table.

## What Changes

- When a target table exists only as dotted keys (no literal `[header]` line),
  the merge locates the last existing dotted-key assignment that belongs to that
  table (tracking header context while scanning, since dotted keys resolve
  relative to whichever table — or root — the scanner is currently inside) and
  inserts the missing keys in dotted form immediately after it (e.g.
  `tools.hk = "1"`), instead of silently dropping the edit. TOML forbids
  reopening a table already defined via dotted keys with a `[header]` block, so
  the new keys are never appended as a header block for an already-dotted table.
- If a table's existing dotted-key form cannot be reliably located in the raw
  text (an edge case outside the common idiom), the merge no longer claims the
  file is invalid TOML. It falls back to a scoped snippet for that table's keys
  with an honest status/message that names the actual reason (the table uses
  dotted-key form), and continues merging every other independently-mergeable
  table normally.
- The literal `'unparseable'` status and its message are reserved for cases
  where the existing file genuinely fails to parse as TOML.

## Capabilities

### New Capabilities

None — this fix has no capability additions.

### Modified Capabilities

None — no living spec describes `mergeMiseToml`'s status/message semantics; only
the implementation was wrong.

## Impact

- `apps/cli/src/harness/mise-merge.ts` — insertion locator, `applyMerge`, and
  the `unparseable` fallback path.
- `apps/cli/test/unit/harness/mise-merge.test.ts` — new dotted-key cases.
- `apps/docs/guide/installation.md` — update only if the fallback's user-facing
  status/message text changes.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
