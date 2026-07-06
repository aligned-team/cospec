## Why

The accepted runtime floor was set to `1.3.1` on the assumption that the
custom-schema system landed in the 1.3 line. An empirical probe disproves that:
the `schema` command and the `config.yaml`-based schema/config resolution cospec
depends on have existed since `1.0.0`, and cospec's full contract + integration
suites pass unchanged against every `1.x` release from `1.0.0` through the
`1.5.0` pin. Widening the floor to the lowest provable version (`1.0.0`) lets
cospec wrap any 1.x openspec a consumer already has installed, instead of
forcing an upgrade to 1.3.1+.

## What Changes

- `OPENSPEC_VERSION_FLOOR` moves from `1.3.1` to `1.0.0`; the accepted range
  becomes `>=1.0.0 <2.0.0`. The `1.5.0` dev/CI pin and the `<2.0.0` ceiling are
  unchanged.
- Boundary assertions and unit/contract tests that encode the old floor move to
  the new one (below-floor refusal now targets a `0.x` version).
- Prose naming `>=1.3.1 <2.0.0` as the floor updates to `>=1.0.0 <2.0.0`.

## Impact

- `apps/cli/src/core/openspec.ts` — the `OPENSPEC_VERSION_FLOOR` constant and
  the JSON-shape probe comment.
- `apps/cli/test/unit/core/openspec.test.ts`,
  `apps/cli/test/contract/version-tripwire.test.ts` — floor-boundary assertions.
- Docs: `README.md`, `apps/cli/README.md`, `docs/architecture.md`,
  `.agents/shared.md` (regenerates `CLAUDE.md` / `AGENTS.md` via `agents:sync`).
- No manifest or lockfile change: the `1.5.0` dependency pin stays exact.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
