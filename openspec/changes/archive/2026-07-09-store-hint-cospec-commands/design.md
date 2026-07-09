## Context

`resolveStore` in `apps/cli/src/core/root.ts` throws a hint-bearing error when
`--store <id>` names a store not in the machine registry. The hint text predates
PR #19, which added `cospec store register` and `cospec store ls` as first-class
commands wrapping the bare `openspec` subcommands of the same name. The error
text was never updated, so it still tells the user to run the wrapped binary
directly — inconsistent with CLAUDE.md's "route through cospec" discipline and
confusing for users who only have `cospec` on `$PATH`.

## Goals / Non-Goals

**Goals:**

- Point the error hint at the `cospec` equivalents.
- Sweep for and fix any sibling occurrences in `apps/cli/src`.
- Keep `docs/`/`apps/docs` in sync with the released error text.

**Non-Goals:**

- Changing the error's control flow, exit code, or when it fires.
- Touching messages that deliberately reference the wrapped `openspec` binary
  because no `cospec` equivalent exists (e.g. the legacy-schema hint in
  `status.ts` and the raw-inspection hint in `doctor.ts`, both of which point at
  additional detail only the wrapped binary's own output provides).

## Decisions

- Rewrite only the string literal in `resolveStore`; no behavioral change, so
  this is a pure text fix at the `fix` schema's lightest treatment.
- Grep the sweep by literal `openspec ` substring inside `apps/cli/src` rather
  than trying to enumerate every command, since the codebase is small enough for
  an exhaustive text sweep to be reliable and auditable.

## Risks / Trade-offs

- [Risk] Sweeping too aggressively could rewrite a comment or message that
  intentionally names the wrapped binary (contract-test labels, JSDoc
  documenting the wrapped call). → Mitigation: only user-facing runtime strings
  shown to a human were changed; JSDoc/comments and internal call labels (e.g.
  `openspec.ts`'s `label` for spawn tracing) were left alone.

## Operational surface

No deploy/runtime topology change. This fix touches only a string literal
printed to stderr by a CLI process already running locally; no bind address,
container, secret, or binary-version surface is affected.
