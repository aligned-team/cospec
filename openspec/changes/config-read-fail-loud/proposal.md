# Proposal

## Why

When `openspec/config.yaml` (else `config.yml`) exists but cannot be read or
parsed, cospec reads it as no config and says nothing (reported as #98).
`readProjectConfig` (`core/change.ts`) has a bare `catch { return undefined }`,
the same value it returns for an absent file, so none of its readers can tell a
broken config from a missing one:

- `projectVerificationLayers` feeds the `verification.layers` vocabulary to
  `validate`, `apply`, `archive`, `sync-specs` and `status`/`list`'s
  archive-readiness verdict. With the config broken, a row on a declared layer
  fails as `verification/layer-unknown … @uat is not a known layer`, with a hint
  telling the user to declare the layer the config already declares, and
  `status`/`list` report `archiveReady: false` for that misleading reason.
- `projectConfigSchema`/`defaultProjectSchema` types a change directory with no
  `.openspec.yaml` (in `status`, `list` and nested-change detection). The pinned
  binary's `readProjectConfig` falls back here too, but prints
  `Warning: could not parse <path> (<detail>); ignoring it.` on stderr; cospec's
  copy drops it.
- `cospec doctor`'s `checkConfig` reports every read failure, an `EACCES` or
  `EISDIR` included, as "does not parse as YAML".

Reproduced on `main` @ f8c23d38 in a sandboxed HOME, with a declared `uat` and a
resolved `@uat` row: an unparseable config (`verification: [oops`) and an
unreadable one (a directory named `config.yaml`) both give `status --json`
`archiveReady: false`, `warnings: null`,
`blockedReasons: ["verification/layer-unknown (line 6): @uat is not a known layer"]`,
`validate --strict` exit 1 on `verification/layer-unknown`, and nothing on
stderr. The pinned binary itself prints nothing for `list`, `status`, `validate`
or `show` on such a config when every change carries `.openspec.yaml` (those
paths never read it), and prints its warning once per read when it does read it:
`status --change <bare>` once, `list` once per bare or nested candidate,
`instructions` once.

## What Changes

1. `readProjectConfig` tells absent from broken: a missing file is still no
   config; a file that exists but cannot be read (an errno) or does not parse as
   YAML is a `ProjectConfigError` naming the path and the cause (the first line
   of the error, as the binary words it). Anything else still propagates.
2. Every cospec read of a broken config prints the binary's own line,
   `Warning: could not parse <path> (<detail>); ignoring it.`, on stderr, once
   per invocation.
3. The schema fallback a bare change takes (`projectConfigSchema`) keeps the
   binary's behavior — `spec-driven` — now with that warning.
4. The layer vocabulary fails loud: `projectVerificationLayers` returns the
   read's outcome (`{ layers, unreadable? }`), and a ledger validated while the
   config is unreadable gets a new ERROR, `verification/config-unreadable`,
   naming the file and cause, instead of a `verification/layer-unknown` per
   project-layer row (the vocabulary is unknown, so no row is judged unknown).
   `validate`, `apply`, `archive` and `sync-specs` therefore refuse that change
   with the real cause, and `status`/`list` report `archiveReady: false` with
   that reason in `verification.blockedReasons`.
5. `cospec doctor` reports a config it cannot read as
   `<file> could not be read (<code>)`, and keeps "does not parse as YAML" for a
   parse failure.
6. A malformed but parseable declaration (`verification:` a scalar, `layers:` a
   mapping, a non-string entry) stays lenient, as `verification-layers-config`
   designed it: no layer for that entry, and doctor's `config` WARNING.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `verification-artifact`: "Project-declared layers are read from the config and
  checked by doctor" said an unparseable config SHALL yield no extra layer and
  SHALL NOT fail the gate — the silent fallback this change removes. It now
  separates a missing config (no layers), a broken one (fails every validated
  ledger with `verification/config-unreadable`, with the binary's warning), and
  a malformed declaration (lenient, doctor-warned), with a new scenario.
- `change-progress-reporting`: "Status answers a schema cospec does not type
  from the binary" says a bare change takes its schema "as the binary does"; the
  binary also warns when the config it reads is broken. The requirement now says
  so, with a scenario.

## Impact

- `apps/cli/src/core/change.ts`: `ProjectConfigError`, `readProjectConfig`,
  `projectConfigSchema`, `projectVerificationLayers` (now `ProjectLayers`), and
  the once-per-invocation warning.
- `apps/cli/src/core/rules/verification.ts`, `core/rules/schema-info.ts`,
  `core/verification-verdict.ts`: the rules, `ValidateContext` and the verdict
  take `ProjectLayers`; the new `verification/config-unreadable` rule.
- `apps/cli/src/commands/validate.ts`, `status.ts`, `list.ts`: pass the read's
  outcome through. `apps/cli/src/commands/doctor.ts`: `checkConfig` names a read
  failure.
- Exit codes do not change shape: a validated ledger under a broken config
  already failed (on `layer-unknown`) and now fails on the new rule. New output:
  the stderr warning line, one new rule ID, and doctor's read-failure message.
  No flag, schema or JSON-key change.
- Docs: `apps/docs/concepts/verification.md` (owns the layer vocabulary and how
  the config is read), `reference/validation-rules.md` (the new rule row),
  `reference/commands.md` (the `cospec status` bare-change fallback and the
  `cospec doctor` config check).

## Surfaces

- [x] interactive — `validate`/`apply`/`archive`/`sync-specs` results,
      `status`/`list` output and `doctor` findings change for a project whose
      config is broken.
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
