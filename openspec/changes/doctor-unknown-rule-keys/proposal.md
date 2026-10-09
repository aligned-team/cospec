# Proposal

## Why

A mistyped key under `rules:` in `openspec/config.yaml` (`proposals` for
`proposal`) silently drops that whole rule list. The wrapped binary checks rule
keys against artifact ids only while generating instructions, and reports a
mismatch as one stderr line that agents and CI never see; `cospec doctor`, which
is documented to check `config.yaml` validity, parses the file but never looks
at `rules`, so it reports a clean bill of health.

Doctor's delegated call to the binary never runs instruction generation, so the
binary's warning cannot reach `foldWrappedStderr` either. The check has to be
cospec's own, in `checkConfig`.

## What Changes

- `cospec doctor` emits one `WARNING` (`check: config`) per key under `rules:`
  that is not an artifact id: it names the key, lists the known ids, suggests
  the closest id when one is within edit distance 2, and says the key's rules
  are currently ignored. Warnings do not change the exit code.
- Known ids are the union of cospec's six built-in artifact ids and every
  artifact id declared by a project schema under
  `openspec/schemas/*/schema.yaml`, so a forked or custom schema's own artifact
  ids are valid keys.
- A `rules:` that is absent or not a mapping produces no finding. A project
  schema that cannot be read or parsed makes the known-id set incomplete, so no
  key is flagged against it; doctor reports that schema's problem once instead
  of guessing.
- No JSON or text shape changes: the new finding is an ordinary entry in the
  existing `findings` array with the existing `check: config` value. Not
  BREAKING.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- `apps/cli/src/commands/doctor.ts` (`checkConfig` and a helper).
- `apps/cli/test/unit/init/doctor.test.ts` (new rows).
- `apps/docs/reference/configuration.md` (owns the `rules` fact) and the
  `cospec doctor` row of `apps/docs/reference/commands.md`.
- Closes aligned-team/cospec#69.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
