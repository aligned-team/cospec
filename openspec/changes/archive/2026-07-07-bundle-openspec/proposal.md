## Why

The standalone compiled `cospec` binary is not self-contained: it resolves the
wrapped `@fission-ai/openspec` CLI only from a project's `node_modules`, so a
`mise use github:aligned-team/cospec` install (no `node_modules`, no bun, no
npm) can run `cospec --version`, `list`, and `init`, but the moment it needs a
real wrapped call (`new`, `validate`, `apply`, `archive`) it fails with "add it
to the project: npm i -D @fission-ai/openspec". That caveat contradicts the
promise of a single-file binary that carries its own bun runtime — the same
binary already self-spawns as bun via `BUN_BE_BUN=1`, so it can just as well run
an embedded copy of openspec.

We embed the pinned openspec CLI, bundled to a single JS file at build time,
directly in the compiled binary via the established `{ type: 'file' }` canon
pattern, and extract-and-run it at runtime when no in-range project copy is
present. A `mise`-only install then works with zero extra steps, and a project
that installs its own openspec still uses that copy (users keep the pin
override).

## What Changes

- A build step bundles the pinned `@fission-ai/openspec` bin into one
  self-contained JS file (`bun build --target=bun --minify`), committed as a
  generated/drift-gated vendored asset and embedded in the compiled binary.
- Wrapped-openspec resolution gains a second source: when the project's
  `node_modules` copy is absent, cospec extracts the embedded bundle to a
  per-version cache dir (write-once, atomic) and spawns it via
  `process.execPath` + `BUN_BE_BUN=1`.
- The extraction step is a wrapped-call post-condition of its own (bundle file
  exists at the expected path and byte length).
- The README "mise-only additionally needs npm i -D @fission-ai/openspec" caveat
  is deleted; docs record the new resolution order.

## Capabilities

### New Capabilities

- `embedded-openspec`: the compiled binary carries the pinned openspec CLI as an
  embedded single-file bundle and can extract and run it with no `node_modules`,
  no bun, and no npm — the standalone install runs every wrapped call. Wrapped
  resolution order becomes (1) in-range project `node_modules` copy, else (2)
  the embedded bundle; the version assertion and wrapped-call discipline are
  preserved.

### Modified Capabilities

None.

## Impact

- `apps/cli/src/core/openspec.ts` — resolution order + embedded fallback.
- New `apps/cli/src/core/openspec-embedded.ts` — embed + extract.
- New `apps/cli/src/vendor/openspec.bundle.js.tpl` — generated vendored bundle
  (drift-gated); ignored by lint/format/tsc.
- New `scripts/mise-tasks/vendor/openspec` + `mise.toml` task `vendor:openspec`
  (+ `--check`) wired into `check`.
- `apps/cli/test/integration/pack-standalone.test.ts` — assert the standalone
  binary runs a wrapped call with NO openspec in `node_modules`.
- `README.md`, `docs/architecture.md`, `docs/release.md` — remove the caveat,
  document resolution order; the bundle is platform-independent JS built once
  (not per release leg).
- No dependency version change; the OpenSpec pin (1.5.0) is unchanged.

## Surfaces

- [x] interactive — the `cospec` CLI UX (the standalone install now runs wrapped
      commands instead of erroring).
- [x] deploy — the compiled-binary artifact and its runtime
      resolution/extraction topology change.
- [ ] integration — no third-party contract changes (same pinned openspec).
- [ ] agent-behavior — unchanged.
