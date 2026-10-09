# Proposal

## Why

`verification.layers` in `openspec/config.yaml` is documented (the configuration
reference, the verification concept page, the `verification/layer-unknown` rule
row, the `verification-artifact` spec's "Project-extended layer is accepted"
scenario, and the rule's own hint) as the way a project extends the closed
`@<layer>` vocabulary, but cospec never reads it.
`ValidateContext.verificationLayers` and the rule that honours it exist, yet
`readValidateContext` — the only producer of a `ValidateContext` — never fills
it in. A row tagged with a project-declared layer such as `@uat` or `@staging`
therefore still fails closed with `verification/layer-unknown`, in `validate`,
`apply`, `archive` and `sync-specs` alike (reported as #68).

Reproduced on `main` @ c7621e5d with the issue's script in a sandbox: a config
declaring `verification: { layers: [uat] }` and a `@uat` row exits 1 with
`verification.md:7  verification/layer-unknown  @uat is not a known layer`.

## What Changes

1. `readValidateContext` fills `verificationLayers` from the project config
   (`openspec/config.yaml`, else `config.yml`, as `projectConfigSchema` reads
   it), in both the normal and the `archive_unreadable` fallback context.
2. The reader is lenient and never throws: a missing or unparseable file, a
   `verification:` that is not a mapping, a `layers:` that is not a list, and
   non-string, empty or whitespace-bearing entries (which the row parser could
   never produce as a layer token) all yield no extra layers for that entry. A
   leading `@` is stripped (the docs write tokens as `@<layer>`), and an entry
   that repeats a core or earlier layer is harmless.
3. `cospec doctor` emits a `config` WARNING when `verification.layers` is
   present but malformed (`verification` not a mapping, `layers` not a list, or
   an entry that is not a usable token), so a typo no longer fails closed in
   silence.
4. `verification/layer-unknown`'s hint names the project-declared layers when
   there are any, so the hint's "extend via ..." sentence reflects the
   vocabulary actually in force.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `verification-artifact`: one requirement added — a project-declared layer is
  read leniently from the config and a malformed declaration is reported by
  `cospec doctor`, not silently ignored. The existing requirement and its
  "Project-extended layer is accepted" scenario already state the intended
  behavior; this change makes the code meet them.

## Impact

- `apps/cli/src/core/change.ts`: `parseVerificationLayers` (pure) and
  `projectVerificationLayers(base)`, next to `projectConfigSchema`.
- `apps/cli/src/commands/validate.ts`: `readValidateContext` passes
  `verificationLayers` in both returned contexts.
- `apps/cli/src/commands/doctor.ts`: `checkConfig` warns on a malformed
  declaration.
- `apps/cli/src/core/rules/verification.ts`: the `layer-unknown` hint lists the
  declared layers when present.
- No flag, schema, exit-code or JSON-key changes. The only output that changes
  shape is text-level: a project that declares layers sees them in the
  `layer-unknown` hint, and doctor gains one WARNING for a malformed block. Rows
  that previously failed `layer-unknown` for a declared layer now pass.
- Docs: `apps/docs/concepts/verification.md` (owns the vocabulary and its
  extension), with `reference/configuration.md`, `reference/validation-rules.md`
  and the `cospec doctor` row of `reference/commands.md` kept in line.

## Surfaces

- [x] interactive — `cospec validate`/`apply`/`archive` results and
      `cospec doctor`'s findings change for a project that declares layers.
- [ ] deploy
- [ ] integration
- [ ] agent-behavior
