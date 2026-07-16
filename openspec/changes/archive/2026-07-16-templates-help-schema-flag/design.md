## Context

Root cause: `apps/cli/src/cli.ts`'s `COMMANDS` table is the single source for
per-command `--help` text (see `apps/cli/src/cli.ts` around the `templates`
entry). PR #25 ("complete per-command help") added `options` to every
passthrough command's entry except `templates`, so its `--schema <name>` flag —
real in `apps/cli/src/commands/templates.ts` and already documented on the docs
site — never renders in `--help`.

## Decisions

- Add an `options` string to the `templates` `COMMANDS` entry, matching the
  formatting of sibling passthrough entries (`schema`, `show`):
  `--schema <name>   Schema whose templates to list (default: spec-driven)`.
- No parsing/behavior change to `templates.ts` itself — it already forwards
  `--schema` verbatim to the wrapped `openspec templates` call. This is a
  help-text-only fix.

## Operational surface

Not applicable. This change edits a static string table consumed only by the
CLI's own `--help` renderer; there is no bind address, container/runner
topology, secret, connection limit, or binary version affected. No process
topology changes.

## Risks / Trade-offs

- [Risk] A future command could regress the same way (real flag added to a
  command module without updating its `COMMANDS.options`) → Mitigated by the
  regression test added in this change, which asserts `--schema` appears in
  `templates --help` output specifically, plus the audit task confirming no
  other entry currently has the same gap.
