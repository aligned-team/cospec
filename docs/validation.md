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

## Capability identity and discovery

A capability is identified by its **full path** under `specs/`
(`<area>/<capability>` for a nested layout, or just `<capability>` at the top
level) — not by its outermost directory segment, which previously made both hard
archive gates silent no-ops for a nested `specs/<area>/<capability>/spec.md`
layout. `core/spec-paths.ts` is the one shared discovery util behind this: it
skips dot-directories and symlinked capability directories, follows an
in-capability symlinked `spec.md` while rejecting one that resolves outside its
capability and ignoring a dangling link, fails loudly (rather than silently
dropping the capability) on any readdir error other than `ENOENT`, and sorts
results by id. A `spec.md` sitting directly in `specs/` (no capability
directory) is not a capability at all — it contributes no delta ops and is
ignored, matching OpenSpec 1.7.0's own hard block on that layout — and
`cospec validate --specs` lists nested capabilities by their full id.

Only a file literally named `spec.md` is a change-side delta. Companion markdown
an author keeps alongside it under a change's `specs/` tree (`README.md`,
`notes.md`, `spec-old.md`) is invisible to both
`openspec validate`/`openspec archive` and to `cospec validate` and the two hard
archive gates — parsing it as delta content previously risked a false
`archive/scenario-preservation` refusal or a false post-merge invariant breach.

## Parser tolerances

cospec's delta and living-spec parsers tolerate a leading UTF-8 BOM and CRLF/CR
line endings (both normalized before parsing; reported line numbers are
unaffected), ignore markdown structure inside HTML comments (including a `--!>`
terminator and an unterminated `<!--` that runs to end of file — an author's own
comment inside `## Purpose` still counts as Purpose prose), and mask code fences
using the same rule OpenSpec's own shared fence-masking uses: `~~~` fences are
recognized alongside ` ``` `, and a fence only closes on a matching marker at
least as long as the one that opened it.

## Duplicate diagnostics

Once cospec started delegating to openspec 1.6+'s own overlapping rules (purpose
placeholders, a root-level `specs/spec.md`, a `skip_specs` conflict, scenario
loss on the same requirement in the same file), the merged report de-duplicates:
where cospec's own rule and a delegated rule report the same defect on the same
file, the delegated twin is suppressed and cospec's rule id wins the report. A
delegated issue with no cospec twin is always kept.

## `.openspec.yaml` metadata keys

Two boolean keys, recognized on `LoadedChange.openspecYaml`:

- **`skip_specs`** — an alternative to
  `cospec apply --skip-specs`/`cospec archive --skip-specs` for satisfying the
  `specs` artifact requirement on a spec-bearing type with no deltas this run.
  Precedence: the CLI flag wins over a persisted `skip_specs: true` marker,
  which wins over the structural default (spec-bearing types must show deltas).
  Declaring the marker while real files exist under `specs/` is
  `deltas/skip-specs-conflict` (E) — the marker never makes `specs/` forbidden,
  only optional.
- **`retire_capabilities`** — authorizes openspec 1.8.0+ to delete a
  capability's living `spec.md` when a `REMOVED` operation takes its last
  requirement. Without it, a retiring merge is refused and cospec relays the
  refusal untouched. See [Apply and archive](/reference/commands) and
  [Configuration](https://cospec.aligned.team/reference/configuration) for the
  archive-time behavior this key unlocks.

A key present but not a boolean is `meta/skip-specs-type` /
`meta/retire-capabilities-type` (E). A delta at `specs/spec.md` (no capability
directory) is `deltas/spec-at-specs-root` (E).
