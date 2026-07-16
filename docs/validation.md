# Validation

`cospec validate` owns change validation. It runs cospec's own rule families
over every change and delegates to `openspec validate` only for spec-bearing
changes with deltas — and even then, cospec's sharper diagnostics run first so
they win the report.

```
cospec validate [name] [--all|--changes|--specs] [--strict] [--json] [--fast]
```

The full rule registry — every stable rule ID, grouped by family, with its level
and what it checks — is owned by the site:
[Validation rule registry](https://cospec.aligned.team/reference/validation-rules).
Rule IDs are stable public API: script against them, grep for them in CI logs,
ignore them by ID if you need to. This page covers how the rule families are
wired together, which is implementation detail the site doesn't need.

## Composition

For each change, cospec resolves the schema from `.openspec.yaml`, then:

1. If the schema is one of the eleven types, it runs the `meta`, `proposal`,
   `blockers`, and `tasks` families always.
2. If the schema forbids specs and a `specs/` file exists →
   `meta/forbidden-artifact`.
3. If the schema declares `verification`
   (`schema.declared.has('verification')`), it runs the `verification` family —
   wired into `runChangeRules()` the same way `deltas`/`archive` are gated on
   `specs`.
4. If the schema declares specs and delta files exist, it runs the `deltas`
   family, then delegates to
   `openspec validate --strict --no-interactive --json` and merges the issues,
   then (unless `--fast`) runs the archive-precondition family.
5. `openspec validate` is **never** invoked for a change whose schema has no
   specs artifact — its hardcoded `CHANGE_NO_DELTAS` rule would false-error.

Living specs (`--specs`) always delegate to `openspec validate --specs` (sound
and schema-independent), with cospec's `specs/purpose-tbd` on top.

cospec may be strictly more conservative than OpenSpec in the archive-
precondition family. A false PASS (cospec ok, `openspec archive` aborts) is a
release blocker — and the runtime archive verifier still catches it, so the user
is never lied to. Parity is enforced by contract tests, never trusted. See
[apply-archive.md](apply-archive.md) for the runtime verifier that backs these
preconditions.
