## Context

`cospec update` resolves a home-scoped harness row's skills root from
`USERPROFILE`/`HOME` (`minimax-code`: `<home>/.minimax/skills`), reads what is
installed there as evidence, and rewrites it when its stamp or body differs from
the canon. `scripts/generate-self` (the body of `mise run generate` and
`generate:check`, which hk's pre-commit and CI call by task name) isolated only
`XDG_CONFIG_HOME`. A host whose real home holds cospec skills written by an
older version (an earlier `cospec init --tools minimax-code` in another project)
therefore got twelve `updated` rows under `$HOME/.minimax/skills`:
`generate:check` exit 1, and `generate` wrote into the real home. Reproduced
with a scratch HOME holding twelve skills stamped `cospec@0.9.0`: check exit 1
with twelve `updated` rows, `update` exit 0 and rewrote all twelve.

This corrects the claim in the archived `test-home-isolation` design ("Generate
stays host-independent by the task") and in `scripts/generate-self`'s comment
and the docs: they were true of the machine-global config (its `delivery` key)
only, not of the home. They also named `profile: core` as the hazard; it is not
one: a profile only picks what a row gets by default and never drops an
installed workflow (verified: a host config of `profile: core` or a one-workflow
custom profile leaves `update --check` at `no drift`, and a deleted non-core
file is still reported `created`). `delivery: commands` is the key that moves
the output, removing the committed skills.

## Decisions

- One empty temporary directory is `HOME`, `USERPROFILE`, `CODEX_HOME` and the
  four XDG directories for the `update` child. A single directory keeps the
  script as small as before and gives a home-scoped row no evidence anywhere it
  could look. Rejected: pointing each variable at its own subdirectory, which
  adds nothing the run reads and invites a variable being forgotten again.
- The fix stays in the task, not the product. `update` reading a user's home is
  the documented behaviour for every other user, so a flag or config key for one
  self-hosted repo would add command-table, reachability and `apps/docs`
  surface.
- The regression test runs the script itself
  (`bash scripts/generate-self update --check` from the repo root) under a
  `homeSandbox()` whose `.minimax` skills are stale. `--check` only: a
  write-mode run in a test could rewrite the working tree of a developer
  mid-change. The write-mode defect is checked by hand in the verification
  ledger.
- Variables `update` does not read today (`CODEX_HOME`, the XDG data/state/cache
  roots, `HOME` while `USERPROFILE` is also set) leave no behavioural trace, so
  a second test runs `scripts/generate-self` around a stand-in `bun` that
  records its environment and requires all seven to name the one scratch
  directory, empty, removed after the run. Removing any one assignment fails a
  test (each of the seven was removed in turn to check).
- The canary is a before/after snapshot (path, size, mtime, content hash) of the
  whole scratch HOME, not a drift message, so a future variable left unisolated
  that only writes (and reports nothing) still fails it.

## Risks / Trade-offs

- A task that needs the account's real `~/.gitconfig` or Bun cache under HOME
  now sees an empty one. `update` runs neither git nor an install; the run's
  transpiler cache is cold per run, which costs well under a second.
- A new home-like variable a future row reads is not covered until it is added
  to the script; the canary test fails by name when it writes there.
