# Design

## Context

The proposal lists the 1.13.2–1.15.0 delta and the specs define each behaviour.
This design covers the constraints that shape how the work lands:

- `reachability.test.ts` fails a pin bump until every new upstream surface
  resolves to the command table, an alias, or a pending entry tagged with an
  owning change. `parity-pending.yaml` is `[]` today.
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

## Decisions

1. **Bump first and drain through `parity-pending.yaml`.** The first commit
   moves the pin and registers every newly exposed surface as pending with
   `owner: openspec-1-15-parity`. Each later commit implements one surface and
   deletes its entry in the same commit. Archive requires the file to be `[]`
   again. _Rejected:_ implementing everything before the bump. Without the
   pinned dist, the surfaces cannot be probed or contract-tested.

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
   commands root. Amp shares `.agents/skills` through the existing
   `.cospec-target` single-writer rule. The Kilo move uses the row's
   `legacyCommandPaths` with name-matched patterns only.

7. **Installers are POSIX `sh` and PowerShell with no dependencies.** They
   verify with `sha256sum` or `shasum -a 256` (Windows: `Get-FileHash`), install
   to `$COSPEC_INSTALL_DIR` (default `~/.local/bin` or
   `%LOCALAPPDATA%\cospec\bin`), and never run `sudo`. _Rejected:_ a Homebrew
   tap only, which leaves Linux musl and Windows uncovered.

8. **The Nix flake wraps the release binary.** It uses `fetchurl` with hashes
   that the release workflow pins per version. _Rejected:_ building from source
   with Bun inside the Nix sandbox, which needs network for dependency
   resolution and gives up reproducibility.

9. **The archive task gate uses the schema-aware resolver.** Archive reads
   tracked task files through the same `apply.tracks` resolver as `status` and
   `apply`, replacing the fixed `tasks.md` path, so a custom glob cannot let an
   unchecked task archive.

10. **Glob stack follows the pin.** 1.15.0 replaces `fast-glob` with
    `tinyglobby`, `picomatch`, and `brace-expansion`. `core/glob.ts` is
    re-ported over the same packages at the versions the pin resolves, and
    `test/contract/glob.test.ts` is the gate. CLAUDE.md's `fast-glob` rule is
    updated in the same commit.

11. **The completion budget is advisory.** It is measured by the bench harness
    and reported in CI, never a gate, because wall-clock budgets on shared
    runners are noisy. The functional guarantee (no telemetry, lazy modules) is
    a unit test.

## Operational surface

- **Binaries and architectures:** releases go from seven to eight standalone
  archives (macos x64/arm64, linux glibc x64/arm64, linux musl x64/arm64,
  windows x64/arm64). The musl archives already ship (`bun-linux-*-musl`) but
  are never executed in CI today; they gain a smoke run in an `alpine` container
  job. Windows arm64 needs Bun's `bun-windows-arm64` compile target (confirmed
  on the pinned Bun before task 8.2), a new `win32-arm64` npm platform package,
  and its own trusted-publisher entry on npm.
- **CI runtime:** the musl smoke job runs in a container on the existing Linux
  runner. No new secrets are needed. Release keeps OIDC trusted publishing; it
  adds the Windows arm64 archive, its npm platform package, and the installer
  scripts as assets.
- **Installer runtime:** needs network to `github.com` release assets only. It
  binds no ports and stores no credentials.
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
- **GitHub release assets:** archive names
  `cospec-<version>-<os>-<arch>[-musl].{tar.gz,zip}`, plus `SHA256SUMS` in
  `sha256sum` format, are a public contract for the installers and the flake.
- **Tool layouts:** each new row's paths are copied from the 1.15.0 dist's
  `AI_TOOLS` and command adapters and checked by the existing "Every pinned tool
  id is a harness" contract test.

## Risks / Trade-offs

- [Unknown-key and 500-char warnings turn existing trees red under `--strict`] →
  They match 1.15.0 exactly. Release notes call them out, and this repo's own
  tree is fixed in the same branch.
- [The branch is large and long-lived] → Decision 1 keeps every commit green.
  Task groups are ordered so each one is independently reviewable.
- [A native `view` diverges from upstream's look] → The JSON and row facts are
  oracle-checked, and only presentation differs, by design.
- [Installer piped into `sh` is a supply-chain surface] → It verifies checksums
  before writing, is short enough to audit, and the docs show a
  download-inspect-run alternative.
- [The npm registry is unavailable] → `--check` degrades to `unavailable`,
  exit 0.
