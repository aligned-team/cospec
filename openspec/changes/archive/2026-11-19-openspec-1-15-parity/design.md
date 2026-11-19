# Design

## Context

The proposal lists the 1.13.2–1.15.0 delta and the specs define each behaviour.
This design covers the constraints that shape how the work lands:

- `reachability.test.ts` fails a pin bump until every new upstream surface
  resolves to the command table, an alias, or a pending entry tagged with an
  owning change. This change leaves one entry, `install`, owned by
  `standalone-install`, the change stacked on it that implements the command.
- `remedy-enumeration.test.ts` fails until every new bare-`openspec` sentence in
  the pinned dist is classified in `remedies.ts` or `remedy-sources.ts`.
- The key oracle fails on any upstream `--json` key cospec drops.
- `no-tool-branches.test.ts` forbids tool-id literals in `commands/`.
- Gates must read what the archive reads (`rules/views.ts`).

## Goals / Non-Goals

**Goals:**

- Land the bump and all parity work on one branch, keeping `mise run check`
  green at every commit.
- Keep a native implementation wherever cospec owns the fact (gate state,
  ledger, commit type, install type), and use a disciplined passthrough
  everywhere else.

**Non-Goals:**

- Upstream's `update` self-upgrade offer stays in `exceptions.yaml`.
- Upstream's docs-site preview server (#2110) and its `braces` dependency audit
  (#2103) are upstream-internal and touch no surface cospec exposes.
- Windows `EPERM` archive staging and the `.openspec-archive.lock` device-id fix
  are inherited by delegation. cospec only has to keep its own on-disk post-
  condition tolerant of the recovered layout.
- `cospec install`, the standalone installers, the Windows arm64 target and the
  Nix flake are owned by `standalone-install`; `parity-pending.yaml` and
  reachability's `KNOWN_OWNERS` name it. Until it lands, a top-level command has
  no table row to mark pending, so the `install` row is absent rather than
  marked, and `cospec version` names no upgrade command for a standalone install
  (`upgradeCommand('standalone')` is `null`, as `source`'s already is).
- The `__complete` startup budget is owned by `complete-startup-budget`.

## Decisions

1. **Bump first and drain through `parity-pending.yaml`.** The first commit
   moves the pin and registers every newly exposed surface as pending with
   `owner: openspec-1-15-parity`. Each later commit implements one surface and
   deletes its entry in the same commit. This change drains every entry it owns;
   the one left, `install`, belongs to `standalone-install`, which drains it.
   _Rejected:_ implementing everything before the bump. Without the pinned dist,
   the surfaces cannot be probed or contract-tested.

2. **`cospec version` is native, not a passthrough.** It reports facts only
   cospec knows (its own install type, embedded vs package resolution), then
   merges `openspec version --json` keys through `mergeUpstream` from one
   delegated call. The document keeps upstream's `schemaVersion`/`version`/
   `install`/`update` shape describing cospec, and puts wrapped-binary facts
   under a separate `openspec` key. Install type is detected from
   `process.execPath` and the package path: the compiled binary,
   `node_modules/.bin` under a global prefix, the npx/bunx cache, a mise install
   dir, or a source checkout. Every install except source runs the same compiled
   binary (the npm launcher spawns it from the platform package, and mise
   fetches the release archive), so `process.execPath` alone cannot tell them
   apart: the npm launcher marks its spawn with an environment variable, the
   mise and npm-cache cases are matched by path prefix, and `standalone` is only
   the fallback. `--check` reads
   `https://registry.npmjs.org/@aligned-team/cospec/latest` with a 3 s timeout,
   through an endpoint override (`COSPEC_REGISTRY_URL`) so tests drive a local
   fixture instead of the live registry. _Rejected:_ the GitHub releases API,
   whose unauthenticated rate limit fails in CI and on shared NAT.

3. **`cospec view` becomes a native renderer.** This replaces the living "Show
   and view are disciplined read-only passthroughs" requirement's view clause
   through a MODIFIED delta; `show` stays a passthrough. It builds from one
   `status --all --json`-equivalent pass, which already holds gate,
   verification, and `archiveReady`, plus one delegated `list --json` for the
   archived section. Rows use a fixed 48-column name field. _Rejected:_
   post-processing upstream's text dashboard. That means respelling free text,
   which `remedies.ts` forbids, and it cannot add columns safely.

4. **Task counts stay the binary's, proven by differential.** The 1.15.0 binary
   counts every checkbox; 1.14.1 keeps post-archive steps out of the count by
   writing them as plain bullets under `## Workflow follow-up`, not by a parser
   rule. cospec's parser is unchanged and a differential test runs both parsers
   over a fixture matrix that includes that section. A disagreement is a false
   PASS or BLOCK at archive, so the test is a release gate.

5. **New rules use stable IDs.** The document rules `specs/requirement-too-long`
   and `deltas/dropped-text` register in `rules/views.ts` on the verbatim view
   with fixtures. `change/unknown-metadata-key` and `config/rules-item-type`
   read YAML, not a spec view, so they get ordinary unit and contract fixtures
   instead. Requirement length is measured on the description text the binary
   measures, which excludes scenarios.

6. **Each tool is a table row; each dialect is a `harness/` serializer.**
   EasyCode's TOML commands and AtomCode's `args:` frontmatter become
   serializers or dialects. A tool is skills-only exactly when the 1.15.0 dist
   registers no command adapter for it (`dsh` and `grok` per the proposal;
   `warp`, `gsd` and `veai` are re-probed in task 6.1), and such a row sets no
   commands root. Amp and GSD share `.agents/skills` through the existing
   `.cospec-target` single-writer rule, ranked by the pinned binary's `AI_TOOLS`
   order (`SHARED_ROOT_UPSTREAM_ORDER` in `harness/shared-root.ts`). Whether a
   row is `skills-invocable` is a row flag (`codex`, `warp`), and a row-level
   commands `preamble` carries Continue's already-active paragraph. The Kilo
   move uses the row's `legacyCommandPaths` with name-matched patterns only.

7. **The archive task gate uses the schema-aware resolver.** Archive reads
   tracked task files through the same `apply.tracks` resolver as `status` and
   `apply`, replacing the fixed `tasks.md` path, so a custom glob cannot let an
   unchecked task archive.

8. **Glob stack follows the pin.** 1.15.0 replaces `fast-glob` with
   `tinyglobby`, `picomatch`, and `brace-expansion`. `core/glob.ts` is re-ported
   over the same packages at the versions the pin resolves, and
   `test/contract/glob.test.ts` is the gate. CLAUDE.md's `fast-glob` rule is
   updated in the same commit.

## Operational surface

- **`version --check`:** one outbound HTTPS GET to the npm registry, 3 s
  timeout, never under `__complete`, and skipped when
  `COSPEC_NO_UPDATE_CHECK=1`.
- **Interactive surfaces:** `view`, `list --archived`, `version`, and
  `update --dry-run` honour `--no-color`, `NO_COLOR`, zero-width TTY, `CI`, and
  `OPEN_SPEC_INTERACTIVE=0` (no redraw).

## Integration contract

- **Wrapped OpenSpec 1.15.0:** cospec consumes `version --json`,
  `list --archived|--all --json`, `instructions apply --json` (`tasks[]`
  `sourcePath`/`line`, the tasks-complete guidance), `status --json`
  (`actionContext.allowedEditRoots`), and `show --json` (`name`). Archive keeps
  its single human-mode delegation: `archive_retirement_cleanup_failed` is
  classified from that call's output plus the verified on-disk move and emitted
  in cospec's own archive document. Every consumed key is oracle-checked.
  Collisions go into `NAMED_COLLISIONS` with a reason, and only where cospec's
  value must win (`version`).
- **Remedy text:** new 1.14/1.15 sentences naming `openspec <command>` are
  classified in `remedies.ts` (respelled) or `remedy-sources.ts`.
- **npm registry:** `GET /@aligned-team/cospec/latest`, reading `version` only.
- **Tool layouts:** each new row's paths are copied from the 1.15.0 dist's
  `AI_TOOLS` and command adapters and checked by the existing "Every pinned tool
  id is a harness" contract test.

## Risks / Trade-offs

- [Unknown-key and 500-char warnings turn existing trees red under `--strict`] →
  They match 1.15.0 exactly. Release notes call them out. This repo's own tree
  is fixed underneath this change by `shorten-long-requirements` (requirement
  length) and `change-stamp-x-prefix` (the stamp), and the legacy
  `schemaVersion` stamp stays a known key, so grandfathered changes pass.
- [The branch is large and long-lived] → Decision 1 keeps every commit green.
  Task groups are ordered so each one is independently reviewable.
- [A native `view` diverges from upstream's look] → The JSON and row facts are
  oracle-checked, and only presentation differs, by design.
- [The npm registry is unavailable] → `--check` degrades to `offline`, exit 0.
