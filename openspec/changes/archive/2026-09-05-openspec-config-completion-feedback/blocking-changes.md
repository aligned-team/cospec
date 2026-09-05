# Dependencies

## Blocked by

- [x] `openspec-1-11-parity` — bumps the wrapped pin to 1.11.0 (the binary whose
      `config` surface this change wraps and probes in the contract suite), adds
      `OPENSPEC_NO_COMPLETIONS=1` to the spawn env that the config precedence
      notes describe, and lands the `defaultStore` fallback in root resolution
      that `cospec config set defaultStore` becomes the supported way to set
      _(archived 2026-09-02)_

## Soft-blocked by

None.

## Notes

Scanned every directory under `openspec/changes/` (no other active change
exists) and every entry under `openspec/changes/archive/`. No unshipped change
provides anything this one consumes: the three new command modules, the
completion generator, and the `renderCodexRules` allow-list all build on
surfaces that are already on `main`.
