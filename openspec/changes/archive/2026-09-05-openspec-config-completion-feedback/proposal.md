## Why

`openspec-1-11-parity` closed every everyday OpenSpec surface except three, and
named them in its own Non-Goals: `config`, `completion`, and `feedback`. Until
they are wrapped, `CLAUDE.md`'s standing rule — never call bare `openspec` — is
unenforceable in practice, because a user who wants to inspect the
machine-global config, install shell completion, or file a bug has no cospec
command to reach for and must drop out to the wrapped binary the repo forbids
naming.

The gap is not only cosmetic. cospec's own `WRAPPED_ENV` forces
`OPENSPEC_TELEMETRY=0` and `OPENSPEC_NO_COMPLETIONS=1` on every wrapped call,
and cospec generates its harness files from cospec canon rather than from
OpenSpec's `profile`/`workflows`/`delivery` keys — so several global config keys
are genuinely misleading when read through a cospec repo, and nothing tells the
user so. `defaultStore`, meanwhile, is a key cospec already _reads_ during root
resolution but offers no way to set. Wrapping `config` is what lets cospec state
that precedence out loud. `init` and `update` stay cospec-native by design and
are not part of this change.

## What Changes

- Add `cospec config` as a disciplined passthrough over `openspec config`, split
  into two call classes. **Class A** (`path`, `list`, `get`, `set`, `unset`,
  `reset --all -y`, `profile <preset>`) is a piped `passthroughOpenspec` call
  with `expect.exitCodes = [0, 1]`, because upstream sets exit 1 for ordinary
  negative results (missing key, invalid key) that are results to relay, not
  wrapped-call violations. **Class B** (`edit`, `profile` with no preset,
  `reset --all` without `-y`) is a terminal handover with inherited stdio and a
  verbatim child exit code, including `130` on prompt cancellation — upstream
  spawns `$EDITOR` and runs `@inquirer` menus, which cannot survive cospec's
  piped `stdin: 'ignore'` spawn.
- `cospec config` deliberately does **not** route through
  `core/passthrough-command.ts`. That helper appends `root.storeArgs`, a
  trailing `--no-color`, and `--json` unconditionally; upstream's `config` has
  no `--store` (it has a parent-level `--scope`) and supports `--json` on `list`
  only. (A trailing `--no-color` is accepted — commander resolves the
  program-level flag from a leaf — but cospec's spawn already prefixes one, so
  appending a second is redundant.) `commands/config.ts` gets a local argv
  builder instead, the way `commands/workset.ts` already does, and never calls
  `resolveRoot` at all — OpenSpec's config is machine-global, not root-scoped.
- Give `cospec config` a one-JSON-document contract on every subcommand, not
  just the one upstream supports: `list --json` relays upstream's document
  verbatim, and `path`/`get`/`set`/`unset`/`reset` emit cospec-owned
  `version: 1` envelopes. `--json` against a Class B subcommand is refused with
  an envelope and exit 1 rather than faked.
- Print two stderr notes (stderr, so `--json` stdout stays exactly one document)
  where cospec's own behaviour overrides or bypasses the key just written: after
  a successful `set telemetry.enabled`, that cospec forces
  `OPENSPEC_TELEMETRY=0` on every wrapped call so the setting affects bare
  `openspec` runs only; and after a successful
  `profile`/`set profile|workflows|delivery`, that cospec's harness files come
  from cospec canon via `cospec update`, not `openspec update`.
- Reject `cospec config --store <id>` with exit 1 and a named message rather
  than silently ignoring an absorbed global flag that cannot apply.
- Add `cospec completion [bash|zsh|fish]`, generated natively from cospec's own
  exported `COMMANDS` table and `GLOBAL_OPTIONS` — print-to-stdout only, no side
  effects, shell auto-detected from `$SHELL` when omitted. Passing upstream's
  generator through is rejected on principle: its installer writes a completion
  function for the `openspec` binary into the user's shell rc, whose dynamic
  completions shell out to bare `openspec` — a permanent instruction in a
  dotfile to do the one thing this repo forbids.
- Add a hidden `cospec __complete <changes|specs|types>` that emits
  tab-separated id and description lines and exits **1 silently** on any
  failure, with no output on either stream, so a failure can never corrupt a Tab
  press.
- Add `cospec feedback "<message>" [--body <text>]`, filing at
  `aligned-team/cospec` via `gh issue create` with array argv and no shell, and
  `cospec feedback --upstream` relaying the wrapped `openspec feedback` (which
  files at `Fission-AI/OpenSpec`) with a stderr note naming the destination.
  Defaulting to upstream would route cospec bug reports to a project that cannot
  fix them; excluding the surface leaves an `openspec` command unanswered.
- Extend the Codex prefix-rule allow-list with the read-only additions only —
  `config get`, `config list`, `config path`, `completion`, `__complete` —
  leaving `config set|unset|reset|edit|profile` and `feedback` unapproved for
  the same reason `archive` is already omitted: they mutate machine-global state
  or file a public issue.
- No breaking changes: every addition is a new subcommand or a new flag, and no
  existing command's behaviour, exit codes, or output changes.

## Non-Goals

- `cospec completion install`/`uninstall`. Rc-file mutation with backups,
  idempotency, and a matching uninstaller is the bulk of upstream's completion
  code and earns its own change if users ask; docs ship copy-paste one-liners
  instead.
- PowerShell completion.
- Wrapping `openspec init`/`openspec update`. Cospec-native by design — passing
  them through would write the opsx files cospec's own leftover scan flags.
- Project-local config scope. Upstream exits 1 with
  `Project-local config is not yet implemented`; cospec relays that verbatim and
  adds nothing.
- Re-implementing upstream's config key validation, value coercion, or its
  prototype-pollution guard. cospec never reads or writes
  `~/.config/openspec/config.json` itself and grows no config file of its own.
- Changing `WRAPPED_ENV`. `OPENSPEC_TELEMETRY=0` and `OPENSPEC_NO_COMPLETIONS=1`
  stay forced; `config set telemetry.enabled` is documented as affecting bare
  `openspec` runs rather than honoured by making cospec's wrapped calls
  configurable.
- Changing `core/passthrough-command.ts`'s trailing `--no-color` append. The
  suspected hazard here (that upstream rejects a trailing copy on every leaf but
  `show`) was probed against the pinned binary and does not exist: `config`'s
  subcommands, `schemas`, and `templates` all accept it. Contract rows record
  that, and nothing is changed on the shared helper.

## Capabilities

### New Capabilities

- `openspec-config-passthrough`: `cospec config`'s two call classes, its argv
  shaping rules (no `storeArgs`, no redundant trailing `--no-color`, `--scope`
  hoisted ahead of the subcommand, `--json` only on `list`), its `--json`
  envelope shapes, the `--store` refusal, and the precedence notes cospec prints
  where its own forced environment or canon-managed harness overrides the key
  just written.
- `cospec-shell-completion`: `cospec completion`'s generated bash/zsh/fish
  scripts derived from cospec's own command table, shell detection and its
  failure modes, and the hidden `cospec __complete` dynamic source with its
  silent-failure contract.
- `cospec-feedback`: `cospec feedback`'s native issue-filing flow against
  `aligned-team/cospec` — title/body/provenance shaping, the `gh` availability
  and authentication gates, the manual-submission fallback that exits 0, the
  `--json` document — and the `--upstream` verbatim relay to OpenSpec's tracker.

### Modified Capabilities

- `openspec-read-passthroughs`: the terminal-handover contract that today
  describes only `cospec workset open` becomes a named class whose members
  include `cospec config edit|profile|reset`, fixing its obligations (inherited
  stdio, `shell: false`, verbatim child exit code including `130`, no `--json`,
  no `RunExpectation`) for every command that joins it.

## Impact

- New files: `apps/cli/src/commands/config.ts`,
  `apps/cli/src/commands/completion.ts`, `apps/cli/src/commands/complete.ts`,
  `apps/cli/src/commands/feedback.ts`,
  `apps/cli/src/core/completions/{spec,bash,zsh,fish}.ts`, plus unit,
  integration and contract tests for each.
- Modified: `apps/cli/src/cli.ts` (four `COMMANDS` entries — `config`,
  `completion`, `feedback`, and a hidden `__complete` — and four literal
  `COMMAND_MODULES` imports; a computed import silently breaks the compiled
  standalone binary), `apps/cli/src/harness/adapters.ts` (`renderCodexRules`
  allow-list), and `.codex/rules/cospec.rules` as regenerated output of
  `mise run generate`.
- Tests: `apps/cli/test/integration/pack-standalone.test.ts` gains coverage for
  the three new commands so the literal-import bundling trap stays guarded.
- External dependency at runtime, not at build time: `gh` for `cospec feedback`.
  Absent or unauthenticated `gh` is a supported path, not an error — it prints a
  prefilled issue URL and exits 0. Tests stub `gh` on `PATH`; no test touches
  the network.
- Runtime minimum to resolve before implementation: cospec accepts wrapped
  OpenSpec `>=1.0.0 <2.0.0`, and if `config` postdates 1.0.0 it gains a row in
  the per-surface runtime-minimums table and relays upstream's own
  unknown-command error rather than faking the feature. Root resolution is
  unaffected either way — `readDefaultStore` already tolerates exit 1.
- Docs: `apps/docs/reference/commands.md` (three command rows plus the read-only
  prose list, marking the mutating config subcommands as the exceptions),
  `apps/docs/reference/configuration.md` (a new machine-global section owning
  the precedence table, the two notes, and the envelope shapes),
  `apps/docs/guide/installation.md` (per-shell completion snippets),
  `docs/architecture.md` (the two config passthrough exceptions and the
  terminal-handover class), and `.agents/shared.md` followed by
  `mise run agents:sync`.
- No migration: no `schemaVersion` bump, no change to existing changes, specs,
  or archived changes.

## Surfaces

- [x] interactive — three new user-typed commands, a new interactive
      terminal-handover class (`config edit|profile`), shell completion for the
      binary people actually type, and new stderr advisory notes.
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — the config surface is a contract against the real pinned
      OpenSpec binary (parent-level `--scope`, `--store` rejection, `--json` on
      `list` only), and `cospec feedback` shells out to an external `gh` binary
      and GitHub's issue API.
- [x] agent-behavior — the Codex prefix-rule allow-list grows five read-only
      entries, and `cospec __complete` becomes a new machine-readable surface
      agents and shells consume.
