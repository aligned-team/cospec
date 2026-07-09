## Why

`cospec schema fork`/`init` currently refuse at exit 1 with a message that tells
npm consumers to "edit the canon and run `mise run generate`" — advice that is
impossible outside this repo, since only cospec's own source tree has a canon.
Every other layer of cospec already anticipates project-local ("legacy") schemas
— `resolveSchema` classifies them, `validate`/`apply`/ `archive` all have a
legacy branch that keeps cospec's schema-agnostic hard gates (tasks,
scenario-preservation, filesystem-move, blocker fan-out) while delegating
typed-artifact checks to OpenSpec's own Zod validation of the fork's artifact
graph, and `doctor`'s remedy text and `docs/schemas.md` tier 3 already advertise
forking as the supported escape hatch. Only the command that would create a fork
refuses to be the tool that does it, and the surfaces that reference forking are
stale or actively wrong (pointing at bare `openspec`, which the project's
route-through-cospec rule forbids). Separately, `apps/docs` (the public
VitePress site) has had zero updates since PR #19 landed first-class
`store`/`context`/`workset`/`show`/`view`/`schemas`/ `schema`/`templates`
commands and `list --specs` — the public docs still claim store/context/workset
"stay OpenSpec's job," which is now false.

This change closes both gaps in one pass: it lets `cospec schema fork`/`init`
create project-local schemas that ride the existing legacy lane (Option (b) from
the schema-customization decision — full typed-fork inheritance is rejected as
incoherent since cospec's gates read hardcoded facts, not the schema file), with
a guard that refuses to let a fork/init overwrite one of the 11 canon schema
names; and it brings `apps/docs` current with everything PR #19 shipped, so the
public site stops contradicting the code.

## What Changes

- `cospec schema fork <type> [name]` and `cospec schema init <name>` are wired
  as disciplined passthroughs to `openspec schema fork`/`init` instead of
  refusing at exit 1. A cospec-side guard parses the destination schema name
  (fork: `[name] || <source>-custom`; init: `<name>`) and refuses with exit 1
  and guidance before ever spawning the wrapped binary if that name is one of
  the 11 `COSPEC_TYPES` — this protects every canon `schema.yaml` from being
  overwritten by a fork/init.
- `cospec new <name> <slug>` accepts a resolvable legacy schema name (not just
  the 11 cospec types): it delegates to
  `openspec new change <slug> --schema <name>`, verifies the written
  `.openspec.yaml` schema pointer, skips the cospec-only `schemaVersion` stamp
  and the typed artifact-plan output, and prints a "legacy schema — reduced
  cospec guarantees" note. A name that is neither a cospec type nor a resolvable
  legacy schema still gets today's unknown-type error.
- Three stale/contradictory messages are corrected to route through cospec and
  be accurate for downstream (npm) consumers: the composed `schema.yaml` header
  (`schema-compose.ts`), the `meta/openspec-yaml` unknown-type hint (`meta.ts`),
  and the `doctor` legacy-schema remedy (`doctor.ts`) all say
  `cospec schema fork <type> <name>` instead of bare `openspec schema fork`; the
  old "edit the canon" block message in `schema.ts` is removed.
- `docs/schemas.md` tier 3 documents the fork/init workflow, the reserved-name
  guard, the legacy lane's guarantees (openspec-delegated structural validation
  of the fork's own artifact graph; cospec's tasks/scenario/ filesystem/fan-out
  gates; no typed proposal/verification/surface/blocker gate), and the template
  gap (config.yaml context/rules is additive prose only — it cannot override a
  template or replace an instruction; that requires a fork).
- `.agents/shared.md`'s customization summary is updated to match, and
  `mise run agents:sync` regenerates the derived agent docs.
- `apps/docs` (public site) is brought current with PR #19: `concepts/stores.md`
  and `concepts/how-it-relates-to-openspec.md` drop the now-false "store
  lifecycle stays OpenSpec's job" claim (store setup/register now auto-run
  `cospec init --harness none` unless `--no-cospec-init` is passed);
  `reference/commands.md` gains rows for `store`/`context`/`workset`/`show`/
  `view`/`schemas`/`schema`/`templates` and documents `list --specs`; a new
  "Read-only and personal commands" subsection in `commands.md` explains why
  those commands carry no cospec gate and what the disciplined-passthrough
  guarantee is; `doctor`'s relationship/store-health delegation is documented on
  the `doctor` row and cross-referenced from `stores.md`.

## Capabilities

### New Capabilities

- `schema-customization`: resolving, guarding, and delegating project-local
  ("legacy") OpenSpec schemas through `cospec schema fork`/`init` and
  `cospec new <legacy-schema> <slug>`, without weakening any guarantee for the
  11 canon cospec types.

### Modified Capabilities

(none — the apps/docs updates in Scope B document already-shipped behavior from
a prior change and add no new runtime capability; they are tracked in
`tasks.md`/`verification.md` rather than a spec delta.)

## Impact

- `apps/cli/src/commands/schema.ts` — fork/init wired to `runPassthrough`,
  reserved-name guard added, stale block message removed.
- `apps/cli/src/commands/new.ts` — legacy-schema branch added to type
  resolution.
- `apps/cli/src/core/schema-compose.ts` — composed-header text corrected (all 11
  golden `schema.yaml` headers change; regenerate with `mise run generate`).
- `apps/cli/src/core/rules/meta.ts` — unknown-type hint text corrected.
- `apps/cli/src/commands/doctor.ts` — legacy-schema remedy text corrected.
- `docs/schemas.md`, `.agents/shared.md` — customization-tier docs updated;
  `apps/docs/concepts/stores.md`,
  `apps/docs/concepts/how-it-relates-to-openspec.md`,
  `apps/docs/reference/commands.md` — public-site docs brought current with PR
  #19.
- Tests: `apps/cli/test/integration/schema-inspect.test.ts` (fork/init success
  - reserved-name refusal), a new contract test exercising a forked-schema
    change through new→validate→apply→archive against the real pinned binary, a
    `doctor` test asserting a fork resolves as legacy INFO, a new integration
    test for `cospec new <legacy-schema> <slug>`, and golden-fixture refresh for
    `apps/cli/test/unit/schemas/golden/*.schema.yaml`.
- No breaking changes: the 11 canon types are identified by exact name against
  the frozen `COSPEC_TYPES` allowlist, and every gate/rule/archive decision is
  driven from hardcoded facts (`TYPE_ARTIFACTS`/`TYPE_FACTS`/
  `enforcedApplyRequires`), never the `schema.yaml` body, so nothing here can
  weaken a canon type's enforcement.

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
