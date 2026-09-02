# Dependencies

## Blocked by

<!-- Every provider this change consumes is already archived; nothing active in -->
<!-- openspec/changes/ blocks it. The shipped entries below record which -->
<!-- archived change owns each prerequisite so the audit trail survives. -->

- [x] `bump-openspec-1-5` — established the pin-bump procedure this change
      repeats: the `PINNED_OPENSPEC_VERSION` constant, the mise tool pin, the
      `version-tripwire` contract test, and the "re-probe honestly, never weaken
      an assertion" rule that governs the 1.11.0 re-probe _(archived
      2026-07-06)_
- [x] `widen-openspec-floor` — set `OPENSPEC_VERSION_FLOOR` to `1.0.0` and the
      accepted range `>=1.0.0 <2.0.0` this change deliberately keeps, which is
      why every gate fix here must be range-tolerant rather than 1.11-specific
      _(archived 2026-07-06)_
- [x] `bundle-openspec` — the vendored embedded bundle
      (`apps/cli/src/vendor/openspec.bundle.js.tpl`), `vendor:openspec` and its
      drift gate, which the pin bump must regenerate _(archived 2026-07-07)_
- [x] `store-aware-commands` — `Root`/`resolveRoot`/`--store` and
      `root.storeArgs` in `apps/cli/src/core/root.ts`, the resolution ladder the
      `defaultStore` fallback extends _(archived 2026-07-09)_
- [x] `openspec-parity` — `passthroughOpenspec` and
      `core/passthrough-command.ts`, which `cospec instructions` is rerouted
      through and which `cospec validate --archived` delegates with _(archived
      2026-07-09)_
- [x] `workflow-parity` — the eleven-workflow canon set, `harness.yaml`,
      `embedded.ts`, and the explicit `/opsx:update` deferral note that names
      this pin bump as its trigger _(archived 2026-07-09)_

## Soft-blocked by

None.

## Notes

- No active change exists in `openspec/changes/` other than this one, so there
  is no unarchived provider to wait on.
- This change provides nothing another in-flight change is waiting on; the
  follow-ups it defers (name-identity scenario-drop detection, store
  git-tracking drift in `doctor`, `operations.*.guidance` config reading,
  removal of the dead `openspecStatus`/`openspecList` helpers) are recorded in
  `design.md` as separate future changes, not as siblings.
