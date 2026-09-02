## Why

cospec pins `@fission-ai/openspec` at 1.5.0 and every gate, parser, and contract
test in the repo was probed against that binary. Upstream has since shipped six
minors (1.6.0 → 1.11.0) that change behaviour cospec depends on:
`openspec archive` no longer double-prefixes an already-dated change id and
stamps a **local** date rather than a UTC one, spec discovery became recursive
over nested capability directories, the archive JSON grew a `warnings` array,
`.openspec.yaml` gained `skip_specs` and `retire_capabilities`, the global
config gained `defaultStore`, `openspec instructions` gained an `archive`
artifact, `openspec validate` gained `--archived`, `openspec status` gained
`--all`, and the shared `opsx` skill output moved to `.agents/skills/`. Every
one of those either sits under a cospec surface that silently disagrees with the
wrapped binary today, or is a surface cospec users must currently drop out to
bare `openspec` to reach — the thing `CLAUDE.md` says never to do.

Three of the gaps are live defects at the **current** pin, independent of the
bump: `cospec archive` computes its post-move target directory from
`new Date().toISOString()` (UTC), so in any timezone ahead of UTC a successful
archive is reported as a FAILURE; `apps/cli/src/core/deltas.ts` toggles
code-fence state on a naive `/^\s*```/` match with no `~~~`/fence-length
handling and no BOM, CRLF, or HTML-comment tolerance, so a spec that documents
markdown inside a four-backtick block inverts in-fence state for the rest of the
file and silently disarms both hard archive gates; and every generated OpenCode
command drops its arguments because cospec never injects `$ARGUMENTS`, while
four canon workflow bodies instruct `AskUserQuestion` — a Claude-only tool —
into Codex and OpenCode skills that have no such tool. Catching cospec up to
1.11.0 is the right vehicle for all of it: the pin bump is what makes the new
surfaces reachable, and it is what forces the honest contract re-probe that
turns the parser and archive-naming defects from theory into recorded evidence.

## What Changes

- Bump the wrapped-OpenSpec pin from 1.5.0 to 1.11.0 (`apps/cli/package.json`,
  `mise.toml`/`mise.lock`, `PINNED_OPENSPEC_VERSION`, the vendored embedded
  bundle and its third-party notices) and re-probe the whole contract suite
  against the real binary, rewriting every test narrative the new binary
  falsifies rather than weakening an assertion to make it pass. The accepted
  range stays `>=1.0.0 <2.0.0` — `OPENSPEC_VERSION_FLOOR` is **not** raised.
- Fix `cospec archive`'s post-move verification to stamp a **local** date the
  way upstream does, and to tolerate both the pre-1.7 double-date-prefixed and
  the 1.7+ verbatim archive directory names so the fix is correct across the
  whole accepted range.
- Relay the wrapped archive's non-blocking warnings (note loss, retirement
  hints) on the **success** path, in the human summary and as a `warnings[]`
  array in `cospec archive --json`. They are discarded today.
- Harden the delta/living-spec parser: strip a UTF-8 BOM, normalise CRLF, port
  upstream's `buildCodeFenceMask` semantics (`~~~` fences; a closing fence must
  match the opening marker and be at least as long), and mask HTML comments in
  place without shifting reported line numbers.
- Add a shared `core/spec-paths.ts` that discovers spec files recursively,
  derives a capability from the file's **parent** directory (so
  `specs/<area>/<capability>/spec.md` resolves to `<capability>`, not `<area>`),
  resolves in-capability symlinks while rejecting links that escape their
  capability, skips dangling links, swallows only `ENOENT`, and sorts by id.
  Both hard archive gates and `cospec validate` consume it; a root-level
  `specs/spec.md` becomes a named cospec ERROR.
- Recognise `.openspec.yaml`'s `skip_specs` and `retire_capabilities` keys.
  `skip_specs` becomes a persisted equivalent of `cospec archive --skip-specs`
  and an escape hatch the apply gate honours, with precedence running CLI flag
  first, then the persisted marker, then the structural artifact matrix, and an
  ERROR when the marker is declared alongside files under `specs/`.
  `retire_capabilities` stops the post-archive spot check reporting a
  deliberately retired capability as an "invariant breach".
- Add `cospec status --all`, a cospec-native sweep over every active change that
  never aborts on one bad change; add `cospec validate --archived` as a pure
  delegation; list `archive` in `cospec instructions`' artifact set and route
  the generic instructions branch through `passthroughOpenspec` so it gets the
  one-JSON-document invariant and exit-code normalisation every other
  passthrough already has.
- Add `defaultStore` as a **fallback** consulted only after local-root
  resolution fails — matching upstream's `root-selection.ts`, never as a
  precedence tier above `localRoot` — so cospec and bare `openspec` agree on
  which root a command targets.
- Teach `cospec init --remove-opsx` and `cospec doctor`'s `opsx-leftover` check
  to scan `.agents/skills/`, where openspec has written its shared skills since
  1.8.0. Scan only: `.agents/` is not a cospec output target.
- Ship the 12th workflow, `/cospec:update`, whose deferral note in
  `docs/harness-integration.md` names this pin bump as its trigger; inject
  `$ARGUMENTS` into generated OpenCode commands that take positional input;
  replace `AskUserQuestion` with runtime-neutral prose; and pass over the canon
  workflow and artifact-instruction bodies for re-read-from-disk, scope honesty,
  explore consent gating, bulk-archive cancel routing, sole-change auto-select,
  capability-retirement procedure, and store-relative (`<planningHome.root>`)
  spec paths.
- Suppress a delegated diagnostic in the merged validate report when cospec's
  own rule already fired for the same file and defect (purpose placeholder,
  root-level `specs/spec.md`, scenario loss) so the bump does not double-report.
- Reconcile `cospec apply --json`'s task counts with the 1.8+
  `openspec instructions apply --json` payload, which now counts nested sub-task
  checkboxes; cospec's `core/tasks.ts` counts only top-level rows, so after the
  bump one `--json` document would carry two disagreeing counts.
- No breaking changes: every CLI addition is a new flag or a new subcommand
  value, and every gate change either fixes a false result or widens an existing
  escape hatch behind an explicit marker.

## Non-Goals

Three items are real gaps this bump exposes but are deliberately deferred to
their own future release, each for its own reason:

1. **A broader harness matrix.** cospec has only ever generated for
   `claude`/`codex`/`opencode` — a closed `HarnessName` union — while OpenSpec
   itself now targets 30+ tools. Widening cospec's own set is a product
   decision, not a parity item; the cheapest first step, when it happens, is
   OpenSpec's vendor-neutral `agents` target, which writes to the shared
   `.agents/skills/` root this change already teaches cospec's leftover scan to
   read (never to write).
2. **Moving cospec's Codex output to `.agents/skills`, following upstream.**
   Upstream moved its own Codex output there from 1.8.0 on; cospec's stays at
   `.codex/skills` paired with `.codex/rules/cospec.rules`. A real migration —
   with backward compatibility for existing `.codex/` installs, run via
   `cospec update` — needs its own change once a harness actually needs the
   shared root.
3. **Disciplined passthroughs for `config`, `completion`, and `feedback`.**
   These are the only everyday OpenSpec surfaces this change leaves unwrapped.
   `init`/`update` are the deliberate exception, by design: passing them through
   to `openspec init`/`openspec update` would write the opsx files cospec's own
   leftover scan flags and offers to remove, so they stay cospec-native.
   `config`/`completion`/`feedback` have no such conflict and are
   straightforward follow-up candidates — left out here to keep this change's
   surface to what the 1.11.0 bump actually requires.

## Capabilities

### New Capabilities

- `spec-parsing-and-discovery`: how cospec reads spec and delta markdown and
  finds capability spec files — BOM/CRLF/fence/HTML-comment tolerance, recursive
  nested capability discovery with parent-directory capability derivation,
  symlink confinement, the root-level `specs/spec.md` ERROR, the
  placeholder-`Purpose` rule, and suppression of delegated duplicates when a
  native cospec rule already reported the same defect.
- `change-metadata-keys`: recognition and semantics of `.openspec.yaml`'s
  `skip_specs` and `retire_capabilities` keys — precedence against the
  `--skip-specs` CLI flag, the conflict ERROR, and their effect on the apply
  gate and the post-archive spot check.
- `change-progress-reporting`: `cospec status --all`'s multi-change sweep and
  the agreement between cospec's own task accounting and the wrapped
  `openspec instructions apply --json` payload re-emitted in
  `cospec apply --json`.
- `opsx-migration-detection`: which directories cospec scans for leftover
  vanilla-openspec artifacts, including `.agents/skills/`, and the shape-based
  ownership test that keeps `cospec init --remove-opsx` from deleting files it
  does not own.

### Modified Capabilities

- `archive-integrity`: the scenario-preservation gate now reads living specs
  through the shared nested-aware discovery and the hardened parser; archive
  adds local-date target verification, success-path warning relay, and
  retirement-aware spot checking.
- `store-awareness`: root resolution gains a `defaultStore` fallback after
  local-root resolution fails.
- `harness-workflows`: workflow parity extends to the 1.11.0 `opsx` set (adding
  `update`), generated OpenCode commands carry `$ARGUMENTS`, and the adapted
  workflow bodies drop harness-specific tool names.
- `openspec-read-passthroughs`: `cospec instructions` becomes a disciplined
  passthrough and lists `archive` among its artifacts.
- `openspec-list-validate-extensions`: `cospec validate` gains `--archived`.

## Impact

- New files: `apps/cli/src/core/spec-paths.ts`,
  `apps/cli/src/canon/workflows/update.md`, and the matching unit, contract, and
  integration tests for each work unit.
- Modified (pin/wrapped layer): `apps/cli/package.json`, `bun.lock`,
  `mise.toml`, `mise.lock`, `apps/cli/src/core/openspec.ts` (pin constant,
  `OPENSPEC_NO_COMPLETIONS=1` in the spawn env, stale dead type declarations),
  `apps/cli/src/vendor/openspec.bundle.js.tpl`,
  `apps/cli/THIRD-PARTY-LICENSES.md`.
- Modified (behaviour):
  `apps/cli/src/commands/{archive,validate,status, instructions,apply,init,doctor}.ts`,
  `apps/cli/src/core/{deltas,change,root, tasks}.ts`,
  `apps/cli/src/core/rules/{meta,archive,specs,deltas,index}.ts`,
  `apps/cli/src/cli.ts`, `apps/cli/src/harness/{adapters,render}.ts`.
- Modified (canon → regenerated): `apps/cli/src/canon/workflows/*`,
  `apps/cli/src/canon/artifacts/{specs,proposal,tasks,design}/meta.yaml`,
  `apps/cli/src/canon/types/feat.yaml`, and everything `mise run generate` emits
  — `openspec/schemas/**`, `.claude/**`, `.codex/**`, `.opencode/**`. The
  OpenCode command diff is large by construction.
- Dependency: `@fission-ai/openspec` `1.5.0` → `1.11.0`, exact-pinned in both
  the manifest and the mise tool pin, with `mise.lock` regenerated for every
  platform entry. `posthog-node` leaves the tree upstream, so the third-party
  notices file shrinks — expected, not drift.
- Runtime minimums to document rather than enforce:
  `cospec instructions archive` needs a wrapped openspec ≥1.7.0 and
  `cospec validate --archived` needs ≥1.9.0. Both relay the wrapped "unknown
  subcommand/flag" error cleanly below that, so the floor stays at 1.0.0.
- Docs: every `1.5.0` literal across `docs/`, `apps/docs/`, and `README.md`
  moves to `1.11.0`; the workflow count moves 11 → 12 (the **schema** count
  stays 11); command-reference rows gain `--all`, `--archived`, `--diff`,
  `instructions archive`, and archive's `warnings[]`; `.agents/shared.md` is
  updated and `mise run agents:sync` re-run.
- No migration: existing changes, specs, and archived changes are unaffected,
  and no `schemaVersion` bump is implied.

## Surfaces

- [x] interactive — new `cospec status --all` and `cospec validate --archived`
      flags, a new `instructions archive` artifact value, and new archive
      warning output change the CLI's user-visible surface.
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — the whole change hangs off a six-minor bump of the wrapped
      `@fission-ai/openspec` binary; every gate, passthrough, and post-condition
      must be re-proved against the real 1.11.0 binary, not a stub.
- [x] agent-behavior — a 12th generated workflow (`/cospec:update`),
      `$ARGUMENTS` injection into OpenCode commands, and a prose pass over the
      canon workflow and artifact-instruction bodies change what every rendered
      harness tells an agent to do.
