## Context

The proposal covers why these three surfaces are being wrapped and what each
gains; the delta specs fix the obligations. What is left to decide is how, and
each decision below turns on a verified fact about either upstream OpenSpec
1.11.0 or cospec's existing wrappers, so the evidence is cited rather than
asserted.

Two constraints dominate. First, `core/passthrough-command.ts` — the helper
every other wrapped read surface uses — appends `root.storeArgs`, a trailing
`--no-color`, and `--json` unconditionally after building its argv. Second,
cospec's piped spawn uses `stdin: 'ignore'` and forces `OPENSPEC_TELEMETRY=0`
and `OPENSPEC_NO_COMPLETIONS=1` in `WRAPPED_ENV`. Both are correct for the
surfaces they were built for and both are actively wrong for `openspec config`,
whose options live on the parent command, whose `--json` exists on one
subcommand only, and three of whose subcommands are interactive.

## Goals / Non-Goals

**Goals:**

- Reach every `openspec config` subcommand without weakening wrapped-call
  discipline, and without cospec ever parsing or writing the global config file.
- Keep `--json` honest: exactly one document per invocation, invented shapes
  versioned, and interactive subcommands refused rather than faked.
- Tell the user, at the moment they write a key, where cospec's own behaviour
  outranks it — without polluting stdout.
- Ship completion for the binary users actually type, sourced from cospec's own
  command table, with a dynamic source that can never corrupt a Tab press.
- Route bug reports to whoever can act on them, with the other tracker one
  explicit flag away.

**Non-Goals:** the proposal's Non-Goals section is the complete list. At the
design level one boundary is worth restating: no shared abstraction is extracted
for the terminal-handover class in this change. `workset open` and the three
interactive config subcommands each keep their own local spawn; the class is a
specified contract and a docs section, not yet a helper. Two call sites do not
justify an abstraction whose third member does not exist.

## Decisions

**A local argv builder for `config`, not the shared passthrough helper.**
Rejected: reaching `config` through `callPassthrough` with per-subcommand
opt-out flags. Every one of the helper's three unconditional appends is fatal
here — `--store` is not a `config` option at all (upstream declares a
parent-level `--scope` instead, and rejects `--store` as unknown), a trailing
`--no-color` is rejected because upstream declares it on the program and only
`show` sets `allowUnknownOption`, and `--json` exists on `list` alone. Adding
three opt-outs to a shared helper to serve one caller makes the helper harder to
reason about for the eight callers that are fine today. `commands/workset.ts`
already establishes the local-runner precedent. `resolveRoot` is not called at
all: config is machine-global, so there is no root to resolve and no store to
thread, and `--store` is refused explicitly rather than absorbed and ignored.

**Two call classes rather than one.** Rejected: piping everything and letting
the interactive subcommands fail. Upstream's `edit` spawns `$EDITOR` with
inherited stdio; `profile` with no preset requires `process.stdout.isTTY` and
runs `@inquirer` menus; `reset --all` without `-y` runs an `@inquirer` confirm.
Under cospec's `stdin: 'ignore'` spawn those either hang or report a TTY error
that is cospec's artefact rather than the user's situation. Handing the terminal
over is the only honest option, and `130` propagates unchanged because upstream
sets it on cancellation and normalising it would lose the distinction between
"cancelled" and "failed".

**Cospec-owned `--json` envelopes for the five subcommands upstream leaves
untyped.** Rejected: passing `--json` through and letting upstream reject it,
and rejected: re-deriving typed values by reimplementing upstream's config
merge. Agents pass `--json` globally; a surface that emits a JSON document for
one subcommand and prose for six is a trap. The cost is that `config get`'s
`value` is the raw printed string — upstream prints objects via compact
`JSON.stringify` and scalars via `String(value)`, and recovering the original
type would mean duplicating its merge logic, which this change refuses to do.
Every invented envelope carries `version: 1` so that switching to a relayed
upstream document later is a version bump, not a silent shape change.
`list --json` stays a verbatim relay for exactly that reason.

**Notes on stderr, and only for the two keys cospec actually overrides.**
Rejected: annotating every key, and rejected: printing nothing.
`OPENSPEC_TELEMETRY=0` in `WRAPPED_ENV` is a hard override above config, so
`config set telemetry.enabled true` genuinely cannot re-enable telemetry for
anything cospec runs; and upstream's own success line for a profile change tells
the user to run `openspec update`, which in a cospec repo is wrong advice. Those
two are misleading in a way a user cannot discover. `defaultStore` is not
annotated — cospec honours it, as a fallback below local-root resolution — and
neither is any other key. stderr keeps stdout at exactly one JSON document.

**Native completion generated from cospec's `COMMANDS`, not upstream's
generator.** Rejected: passing `openspec completion` through, and rejected:
excluding the surface. Upstream's installer writes a completion function for the
`openspec` binary into the user's rc file, whose dynamic completions shell out
to `openspec __complete` — installing a permanent instruction to call bare
`openspec` into a dotfile, which no printed warning undoes. Excluding completion
leaves an everyday gap on the binary users type. cospec already owns a complete
static command table, so generating from it is both cheaper and more accurate.
The one fragile part is extracting per-command flags from each entry's
pre-formatted help string; that extraction is a pure function with a snapshot
test over the real table, so a new command or flag that the extractor cannot see
turns red in CI instead of quietly vanishing from completion.

**`__complete` fails silently, on both streams.** Rejected: printing a
diagnostic. This is upstream's design and it is right — a Tab press that prints
an error into the middle of a command line is worse than a Tab press that
completes nothing. `types` is served from `COSPEC_TYPES` with no spawn;
`schemas` is deliberately not a completion source unless the wrapped `schemas`
command is confirmed to emit `--json`, because parsing a text table for
completion candidates is not worth the fragility.

**`feedback` is native, with `--upstream` as the explicit escape.** Rejected:
defaulting to upstream's tracker, and rejected: excluding the command. A cospec
user usually cannot tell whether a bug is cospec's or OpenSpec's; cospec
maintainers can. Defaulting to `Fission-AI/OpenSpec` would route cospec bug
reports to a project that cannot fix them and did not ask for them. The native
path follows upstream's shape — grapheme-aware title truncation, `gh` and
`gh auth status` gates, manual-URL fallback at exit 0 — minus `--label`, whose
only purpose upstream is to be retried when the repo does not define the label.
Dropping the flag deletes the whole failure mode. `--upstream` uses a raw
version-asserted spawn rather than `passthroughOpenspec` because upstream exits
with gh's own arbitrary status, which no `expect.exitCodes` allow-list can
enumerate honestly; that exception is stated in the spec rather than hidden.

**Registration lands last, in one owner.** `cli.ts` and `harness/adapters.ts`
are the only shared files, and `COMMAND_MODULES` imports must be literal — a
computed import breaks the compiled standalone binary silently, which is why the
pack smoke test grows a case per new command. Registering a name in `COMMANDS`
before its module exists makes the command report "not yet implemented", so the
four entries and four imports land together, after the three command modules.

## Operational surface

Nothing here binds a port or ships a container; the operational surface is a
local CLI plus two child processes.

- **Runtime and arches.** No new runtime. The three commands ship inside the
  existing Bun-compiled `cospec` binary and the published npm package, on the
  same platform matrix as today. The pack smoke test runs all three from the
  compiled standalone binary with no `node_modules`, because `COMMAND_MODULES`
  imports must stay literal for the bundler to see them.
- **Wrapped binary versions.** `config` and `feedback --upstream` call the
  resolved wrapped OpenSpec (dev/CI pinned 1.11.0, accepted `>=1.0.0 <2.0.0`),
  by resolved path, version-asserted before every spawn including the handover
  ones. Where a surface postdates the accepted floor, cospec relays upstream's
  own unknown-command error and the fact is documented as a per-surface runtime
  minimum; the floor is not raised.
- **Child processes.** Class A config calls and `feedback --upstream` are piped
  spawns with `stdin: 'ignore'`. Class B config calls inherit all three streams
  and own the terminal until the child exits. `gh` is spawned with array argv
  and `shell: false`. No invocation passes user text through a shell.
- **Required secrets.** None held by cospec. `cospec feedback` authenticates
  only through the user's own `gh` credentials, checked via `gh auth status` and
  never read, printed, or stored by cospec. With no authenticated `gh` the
  command degrades to a printed URL at exit 0 rather than prompting for a token.
- **Filesystem writes.** `cospec completion` writes nothing — no rc file, no
  completion directory. `cospec config` writes only through the wrapped binary,
  into the machine-global OpenSpec config; cospec never opens that file itself.
  Tests that exercise a write sandbox `XDG_CONFIG_HOME` and `HOME` into a temp
  dir, which propagates because `WRAPPED_ENV` spreads `process.env`.
- **Network.** Only `cospec feedback` reaches the network, and only through
  `gh`. Every automated test stubs `gh` on `PATH`; the single real submission is
  a `@manual` row.
- **Forced environment.** Every wrapped spawn, handover included, carries
  `OPENSPEC_TELEMETRY=0` and `OPENSPEC_NO_COMPLETIONS=1`, so neither telemetry
  nor upstream's first-run completions tip can surface from a cospec run. That
  is exactly what the `telemetry.enabled` stderr note exists to disclose.

## Integration contract

Three external contracts are in play, each pinned to an observable rather than
to an exit code.

- **Wrapped `openspec config` CLI shape.** `--scope` is a parent-command option
  and must be emitted between `config` and the subcommand; `--store` does not
  exist on this command; `--no-color` is a program-level option that only `show`
  tolerates in trailing position; `--json` exists on `list` alone. Class A
  declares `expect.exitCodes = [0, 1]` because upstream uses exit 1 for ordinary
  negative results. A contract test against the real pinned binary pins each of
  these, including the trailing-`--no-color` rejection, so an upstream change
  breaks a test rather than a user's command.
- **`gh` CLI.** cospec depends on
  `gh issue create --repo <slug> --title <t> --body <b>` accepting array argv
  and printing the created issue URL on stdout, and on `gh auth status`
  distinguishing authenticated from not. No `--label` is passed, so the repo
  needs no label definition. gh's exit status is relayed rather than
  interpreted, and gh's stderr is relayed verbatim.
- **Shell completion protocol.** The generated scripts are the contract cospec
  offers to bash, zsh, and fish: static command and flag candidates rendered at
  generation time, plus dynamic slots that call `cospec __complete <source>` and
  read tab-separated id/description lines. That source's failure mode is part of
  the contract — exit 1, both streams empty — because a shell reads whatever it
  is given. Script syntax is verified per shell (`bash -n`, `zsh -n`,
  `fish --no-execute`) rather than assumed.

Not reconciled here, deliberately: cospec does not adopt OpenSpec's config
schema as its own. The `profile`/`workflows`/`delivery` keys stay upstream's,
describing upstream's generated files; cospec's harness output stays
canon-derived, and the stderr note is what keeps the two from being confused.

## Risks / Trade-offs

- [The contract test writes to the developer's real global config] → the config
  contract test sandboxes `XDG_CONFIG_HOME` **and** `HOME` into a temp dir.
  `WRAPPED_ENV` spreads `process.env`, so the sandbox propagates to the child.
  This is mandatory, not a nicety: an unsandboxed `config set` in a test mutates
  the machine.
- [cospec invents JSON shapes upstream may later define differently] → every
  invented envelope carries `version: 1`, `list --json` stays a verbatim relay,
  and the documented migration is to relay upstream's document and bump the
  version once upstream supports `--json` on those subcommands.
- [The flag extractor is a regex over a help string] → the snapshot unit test
  over the real `COMMANDS` table turns any unparseable entry into a CI failure
  rather than a silently shorter completion script.
- [`config`, `completion`, or `feedback` may postdate the accepted 1.0.0 floor]
  → resolved before the config module lands: if any surface postdates it, it
  gains a per-surface runtime-minimum row in the docs and relays upstream's own
  unknown-command error, and the floor is not raised. Root resolution is safe
  either way because `readDefaultStore` already tolerates exit 1.
- [`gh` in tests reaching the network] → every automated row stubs `gh` on
  `PATH` in a temp dir; the single real submission is a `@manual` row.
- [The trailing-`--no-color` hazard exists on other passthroughs today] → out of
  scope, but not left as folklore: a contract row proves the wrapped binary
  rejects a trailing `--no-color` on `config get`, which is the evidence the
  follow-up `fix` change starts from.
