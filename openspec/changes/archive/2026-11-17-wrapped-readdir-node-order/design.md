# Design

## Context

OpenSpec builds several lists straight from `fs.readdir`. Under Node, libuv's
Unix `uv__fs_scandir` calls `scandir(3)` with `strcmp` as the comparator (libuv
1.51.0, the version Node 22.23.2 ships), so every non-recursive listing comes
back sorted by the bytes of each name; libuv's Windows `fs__scandir` does not
sort. Bun — 1.3.14 and 1.4.4 alike, measured on macOS — returns the filesystem's
own order on every `readdir` form. cospec runs the binary under Bun, so the two
orders meet only where the filesystem keeps the names sorted. APFS and ext4
store them by hash, so the contract rows that compare cospec with the binary
under Node pass or fail by the runner's hash seed.

## Decisions

- **A preload, not a relay rewrite.** Sorting lines in cospec's relay would mean
  recognising lists in free text, which the remedy discipline forbids, and would
  miss the lists OpenSpec only acts on (spec discovery feeding a validation).
  Making the binary's own `readdir` answer as Node's fixes every list at the
  source, for both the project copy and the embedded bundle.
- **Patch through `require()`, before any ESM import.** Measured on Bun 1.3.14
  and 1.4.4: patching `require('node:fs')` reaches every import form only when
  no `import` of `node:fs` has run yet — Bun builds a builtin's ES-module
  namespace from its CommonJS exports on first import and never re-syncs it
  (`module.syncBuiltinESMExports()` is a no-op), and `Bun.plugin` refuses to
  override a builtin (`module()`), and its `onResolve` never sees one. So the
  preload is CommonJS that requires `fs`, and it goes first on the argv, ahead
  of the handover preload.
- **Byte order, the way `strcmp` compares.** Names are compared as their UTF-8
  bytes (`Buffer.compare`), not as UTF-16 code units, so a name outside the
  Basic Multilingual Plane sorts where Node puts it. Buffer results compare
  directly; `Dirent`s compare by `name`.
- **Windows unchanged.** Node does not sort there, so the preload installs
  nothing on `win32`.
- **Recursive reads pass through.** Node's recursive `readdir` is a
  breadth-first walk over sorted per-directory reads; the pinned dist never asks
  for one. A contract row enumerates the dist's directory listings and fails a
  pin that reaches for a recursive `readdir`, `opendir` or `fs.glob`, rather
  than the preload half-covering them.
- **One preload writer.** The handover preload's content-addressed cache write
  and temp-dir fallback become a shared writer that both preloads use.

## Risks / Trade-offs

- [A future Bun imports `node:fs` as an ES module before preloads run] → the
  preload would silently stop reaching namespace imports. The unit row runs
  every import form the dist uses against Node's order on the pinned Bun, so a
  runtime bump that breaks it fails the suite.
- [Names that are not valid UTF-8] → `readdir` returns them already decoded with
  replacement characters, so their original bytes cannot be compared; such names
  sort by the decoded form. OpenSpec rejects them as change names anyway.
- [A second file in cospec's cache] → the same location, writer and fallback as
  the handover preload, which the configuration page documents.

## Integration contract

The contract is OpenSpec's own output under Node: the listing order it prints is
part of what cospec relays byte for byte. The oracle runs the pinned binary
under Node (`{ runtime: 'node' }`) and the differential row compares it with
cospec on a directory whose filesystem order is not byte order, so the row
discriminates on any runner rather than by hash seed.
