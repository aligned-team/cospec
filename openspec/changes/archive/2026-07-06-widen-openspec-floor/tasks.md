## 1. Widen the floor constant

- [x] 1.1 In `apps/cli/src/core/openspec.ts`, set `OPENSPEC_VERSION_FLOOR` to
      `'1.0.0'`.
- [x] 1.2 Update the JSON-shape probe comment (currently "probed against 1.3.1")
      to reflect the floor-through-pin probe now spanning `1.0.0`–`1.5.0`.

## 2. Move boundary assertions to the new floor

- [x] 2.1 In `apps/cli/test/unit/core/openspec.test.ts`, move the
      inclusive-floor and below-floor assertions to `1.0.0` (in-range) and a
      `0.x` version (refused).
- [x] 2.2 In `apps/cli/test/contract/version-tripwire.test.ts`, change the
      below-floor literal from `1.3.0` to a `0.x` version and update the header
      comment's range to `>=1.0.0 <2.0.0`.

## 3. Update docs naming the floor

- [x] 3.1 Replace `>=1.3.1 <2.0.0` with `>=1.0.0 <2.0.0` in `README.md`,
      `apps/cli/README.md`, `docs/architecture.md`, and `.agents/shared.md`.
- [x] 3.2 Run `mise run agents:sync` to regenerate `CLAUDE.md` and `AGENTS.md`.

## 4. Verify

- [x] 4.1 Run `mise run check` — unit, contract, integration, drift, and
      agent-doc gates all green.
