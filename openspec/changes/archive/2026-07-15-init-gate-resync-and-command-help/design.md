## Context

`cospec init` has three repo states (A fresh / B existing-no-openspec / C
existing-openspec) and one gate-scaffolding path (`scaffoldGate`, §7) that is
supposed to be idempotent and additive on every re-run. PR #24 added the
additive `mergeMiseToml` merge specifically so that re-running `init` against a
repo that already has a `mise.toml` folds in any new gate contributions instead
of clobbering the file. That merge is only reachable through `scaffoldGate`, and
`scaffoldGate` is only called when `gateEnabled` is true. `gateEnabled`'s
default (`init.ts:243-247`) is `state === 'A'` — true only on a brand-new repo —
so every state-C re-init (by far the common case: a repo that already ran
`cospec init` once) defaults to `false` and never reaches the merge PR #24
built, regardless of whether that repo's `mise.toml` already carries the gate.
The root cause is a default that encodes "first run" intent (`state === 'A'`)
where the intent should instead be "does this repo have the gate already" — a
fact recoverable from the filesystem, not the repo's freshness.

The three other defects in this change are smaller and independent of that root
cause: an unreported write in the same function (`scaffoldGate`'s
existing-`mise.toml` branch drops a `'created'` merge result on the floor
instead of recording it in `written`), a help renderer (`commandHelpText`) that
was written once against a single global-options block and never extended per
command, and a dispatcher that treats `--help` as the only spelling of "show
help," so a bare `help` positional silently falls through to `resolveTarget` as
a scaffold target.

## Decisions

- **Detect "gate already adopted" by parsing `mise.toml`'s `tasks` table, not by
  re-deriving it from repo state.** `gateAlreadyPresent(cwd)` reads `mise.toml`
  (if present) with `Bun.TOML.parse` (parse-only, matching `mise-merge.ts`'s
  existing posture) and returns true iff the `tasks` table has any key starting
  with `"cospec:"`. This is the same shape of fact `mergeMiseToml` already
  computes key-by-key; a dedicated boolean predicate keeps `run()`'s default
  expression readable and avoids running the full merge just to decide whether
  to run the merge. Rejected alternative: encoding "gate adopted" as a marker
  file or `config.yaml` field — rejected because it would require a migration
  for every repo that adopted the gate before this fix, whereas parsing
  `mise.toml` for its own tasks is retroactively true for every existing adopter
  with no state to migrate.
- **New default resolution order: `--gate` → true; `--no-gate` → false; state A
  → true; else `gateAlreadyPresent(target)`.** Explicit flags always win
  (unchanged). State A (fresh repo, no `mise.toml` to inspect yet) keeps
  defaulting to on, matching the documented "gate on by default for new repos"
  story. Every other state now defaults to whatever the repo's own `mise.toml`
  says, so a repo that never opted in stays opt-in (no surprise
  `hk.pkl`/`commitlint.config.mjs` appearing) and a repo that did opt in stays
  synced on every re-init without needing to remember `--gate` forever.
- **A missing gate is a printed hint, never a silent no-op.** When
  `gate === undefined` (no flag, not state A, `gateAlreadyPresent` false) and a
  `mise.toml` exists, `printReceipt` prints one line naming `cospec init --gate`
  as the fix. `--json` keeps `gate: null` — the existing, already-documented
  shape for "no gate this run" — rather than adding a new field for a hint that
  has no machine-actionable payload beyond "gate is null"; a caller who cares
  can already branch on `gate === null`.
- **The `help`-token guard is enforced twice: dispatcher and command.** The
  dispatcher (`cli.ts`) treats a bare `help` immediately after the command name
  as `--help` for every command, which is the general fix and covers every
  current and future command uniformly. `init.ts`'s own `resolveTarget`
  additionally rejects a bare `help` positional before any write, as a
  command-local backstop — `init` is the one command whose accidental positional
  argument mutates the filesystem (scaffolds a directory), so it gets defense in
  depth rather than relying solely on the dispatcher never regressing.
- **`CommandEntry` grows `usage`/`options` as plain pre-formatted strings, not a
  structured flag schema.** Each command's flags already live in that command's
  own arg-parsing code and in `apps/docs/reference/commands.md`; introducing a
  shared typed flag schema to drive both `--help` and docs generation is a
  larger, separately-scoped refactor. Pre-formatted strings keep this fix
  mechanical (copy the accurate flag text next to each `COMMANDS` entry) and
  reviewable line-by-line against `commands.md`.

## Risks / Trade-offs

- [Risk] `gateAlreadyPresent`'s "any `cospec:` task key" heuristic could
  false-negative on a hand-rolled `mise.toml` that renamed its gate tasks. →
  Mitigation: the same heuristic already governs `mergeMiseToml`'s
  `cospecAlreadyPinned`-style checks elsewhere in the gate path; a repo that
  diverges this far from the template already gets `conflict`/`unparseable`
  handling with a paste-ready snippet, so the failure mode is "prints a hint you
  can ignore," not silent breakage.
- [Risk] Flipping the state-C default to "on when adopted" changes observable
  `--json` output (`gate` goes from always-`null` to sometimes-populated) for
  any script parsing today's state-C `cospec init --json`. → Mitigation: the
  `gate` field's shape is unchanged (same `written`/`snippets`/`mise` object
  already emitted for state A); only the conditions under which it is non-null
  change, and only in the direction of reporting a merge that was already
  supposed to happen per PR #24's intent. Documented in
  `apps/docs/guide/installation.md`.
- [Risk] Two enforcement points (dispatcher + `resolveTarget`) for the same
  `help` rule could drift if one is edited without the other. → Mitigation: both
  are covered by dedicated unit tests (`cli.test.ts`, `init.test.ts`) asserting
  the same observable outcome (exit 1 / no-op) from each entry point.

## Operational surface

This change has no runtime service, container, or network topology to describe —
it only changes the local `cospec` CLI's file-scaffolding and help-rendering
behavior, invoked synchronously by a developer or agent inside their own
worktree.

- **Bind address**: not applicable — no server or listener is introduced.
- **Container vs runner**: not applicable — `cospec init` remains a synchronous
  local process writing files under the target repo root.
- **Required secrets**: none — no new credentials, tokens, or environment
  variables are read or written.
- **Connection limits**: not applicable — no network connections are introduced.
- **Binary versions/arches**: unaffected — the OpenSpec wrapped-binary pin
  (`>=1.0.0 <2.0.0`, dev/CI pinned 1.5.0) is untouched; no new binary or arch
  dependency is added.
