# Design

## Context

Root causes, each verified against this branch and the pinned binary (probed
under Node in a sandbox with HOME, XDG\_\*, CODEX_HOME and ZDOTDIR redirected):

- **Group refusals are cospec's own text.** `workset.ts:112-120` and
  `store.ts:486-493` answer a missing or unknown subcommand themselves on
  stderr, so `--json` gets no document and `store --bogus`, `store -- --bogus`
  and `workset -- --bogus` get `unknown subcommand '--bogus'`. The binary
  answers all of them itself — `Missing subcommand` for an option-shaped or
  `--`-guarded token (the store group swallows `--bogus`; the workset group
  refuses it as an unknown option only when it is not after `--`),
  `Unknown command` otherwise, one `{status:[…]}` document under `--json`.
- **`workset open` never looks at its argv.** `runWorksetOpen`
  (`workset.ts:88-108`) checks only `--store-path`, so `--json` is dropped and
  every other refusal and remedy prints on the inherited terminal; its env omits
  `OPENSPEC_NO_COMPLETIONS=1`, which `config.ts:342` sets.
- **Doctor's fold is gated.** `checkOpenspecRelationship` returns early unless
  the root is store-backed or `hasReferencesConfig` (`doctor.ts:481-482`), its
  result becomes findings only (the `--json` document is
  `{version, findings, summary}`), `checkConfig`/`hasReferencesConfig` read
  `config.yaml` only (`doctor.ts:284`, `:435`), `foldStatus` copies the binary's
  `fix` verbatim, and the non-call-error remedy is "run `openspec doctor`
  directly" (`doctor.ts:513`). Its own checks use the literal cwd
  (`doctor.ts:595`), so once the resolver walks ancestors a subdirectory run
  reports `initialized` ERROR against a root the binary diagnoses as healthy.
- **Successful relays are byte-for-byte.** `relayRespelled` respells a failed
  answer only (`forward-relay.ts:95-102`), by design of the change that built
  the allowlist; `context.ts:61`, `workset.ts:53-54` and `config.ts:245-250`
  relay a success as written, and `store.ts:265-270` and `:475-478` render the
  payload's `fix` fields unspelled in both modes. `schemas.ts` calls
  `runPassthrough`, which never respells.
- **Config.** `runPiped` renders its envelope even when `forwardCall` returned
  commander's parse rejection (`config.ts:234-273`); `planConfigCall` answers a
  missing subcommand with cospec's one-line usage (`config.ts:155-156`); the
  handover checks only `--store-path` and then either envelopes (`--json`) or
  execs.
- **`--cwd`.** `cli.ts:631` resolves `--cwd` without checking it exists;
  `store`, `config` and `workset` never call the resolver, so `Bun.spawn` fails
  with `posix_spawn '<cospec runtime>' ENOENT`.

## Goals / Non-Goals

**Goals:**

- Every roadmap row 19–21 behaviour and every obligation recorded for this
  change, each with a task and a ledger row (table below).
- No bare `openspec <command>` in any answer `store`, `workset`, `config`,
  `doctor`, `schemas` or `context` prints, except the enumerated residual of a
  live interactive handover session (D11).
- The ten `REACHABLE_OWNED` rows owned by this change leave that list.

**Non-Goals:**

- `instructions`' reference block, `help [command]` and the `spec-driven` schema
  text — `upstream-spellings`.
- The resolver's walk, pointer semantics, `directory not found` refusal and
  generic `{status:[diagnostic]}` document — `root-resolution-parity` (consumed
  here, group 9).
- Per-command `list`/`status`/`validate` JSON shapes — `cli-surface-parity`.
- `doctor.ts`'s harness wiring — `harness-adapter-table`, after this change.

### Obligation map

| Obligation                                                                                                            | Track      | Tasks                        | Ledger       |
| --------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------- | ------------ |
| Row 19 — store/workset missing/unknown subcommand under `--json`; `workset open --json` refused                       | T1, T2     | 2.1, 3.1, 4.1                | 1.1–1.6      |
| Row 20 — doctor folds on every root with upstream's four keys                                                         | T3         | 5.1, 5.2                     | 2.1–2.5      |
| Row 21 — doctor failure hint names `cospec doctor`                                                                    | T3         | 5.4                          | 2.6          |
| context reference block, structural respell via the shared helper                                                     | T6         | 9.3                          | 3.1–3.4      |
| `respellRemedies` wired into store/workset/config/doctor; workset `OPENSPEC_NO_COMPLETIONS=1`                         | T1–T4, T7  | 2.2, 3.2, 4.2, 4.3, 5.2, 6.3 | 4.1–4.6, 6.6 |
| doctor reads `config.yml`; bare `openspec doctor` text                                                                | T3         | 5.3, 5.4                     | 2.3, 2.6     |
| config.ts: `get/path --bogus --json` relays; `--scope global` with no subcommand                                      | T4         | 6.1, 6.2                     | 5.1–5.3      |
| schemas.ts no-root relay respelled                                                                                    | T5         | 9.4                          | 3.5          |
| store.ts missing/unknown `--json` document; `Fix: openspec store …` respelled; `store --bogus` / `-- workset --bogus` | T1, T2     | 3.1, 3.2, 4.1                | 1.1–1.4, 4.1 |
| workset.ts `workset open --json` → `workset_open_json_unsupported`                                                    | T1         | 4.1                          | 1.5, 1.6     |
| terminal-handover pre-validation; residual documented                                                                 | T1, T4, T7 | 2.3, 4.3, 6.4, 7.1, 7.2      | 6.1–6.7      |
| `--cwd <nonexistent>` on store/config/workset                                                                         | T1, T2, T4 | 9.2                          | 7.1, 7.2     |
| doctor from a subdirectory (file-owner defect surfaced by the resolver's walk)                                        | T3         | 9.5                          | 2.7          |

### Parity-pending entries this change removes

None. `apps/cli/test/contract/parity-pending.yaml` holds no entry with
`owner: passthrough-json-and-doctor`, and the command table marks no surface
pending for it: every behaviour here sits on a `forward` row (`store`,
`workset`, `config`, `schemas`) or a table row whose surface is already handled
(`doctor`, `context`). The reachability ledger row (8.1) therefore records the
test green with no entry for this change, as `root-resolution-parity` recorded
its own. The list this change does own is `REACHABLE_OWNED` in
`test/contract/support/remedy-sources.ts`, and it removes exactly these ten rows
(each line is already in `REMEDY_SOURCES` under the id named, so the
classification test stays green):

1–6. `core/references.js` via `context` — `references/clone`,
`references/get-checkout`, `references/fetch`, `references/store-doctor`,
`references/store-doctor-id`, `references/list-rest` (the same six lines stay
listed via `instructions` for `upstream-spellings`). 7.
`core/relationship-health.js` via `context` — `references/store-doctor`. 8.
`commands/workset.js` `Open it any time with: …` — `workset/open-any-time`. 9.
`commands/workset.js` `No worksets saved. Create one with: …` —
`workset/none-saved`. 10. `commands/config.js`
``Config updated. Run `openspec update` …`` — `config/profile-applied`.

With them gone, `OWNERS` loses `passthrough-json-and-doctor` and
`SUCCESS_RELAYS` loses `context`, `workset` and `config`.

## Decisions

**D1 — Group refusals are delegated, never synthesized.** `store.ts` and
`workset.ts` route every argv whose first token is not a subcommand they
dispatch (none, unknown, option-shaped, after `--`) through one helper in
`core/forward-relay.ts` that spawns `<group> [--json] <user argv>` (the `--`
kept), declares exit code `1` and a post-condition that the answer is a
commander parse rejection, a text refusal on stderr alone, or one document whose
`status[0].code` is `unknown_store_subcommand` / `unknown_workset_subcommand` —
whichever `ctx.flags.json` is, because the binary picks the mode from the argv
itself (the store group reads a `--json` among its operands, one after `--`
included, where cospec's flag parsing stops: `store -- --json` answers one
document) — and relays it through `respellRemedies` (the sentences
`store/*-subcommand*`, `store/lifecycle-example*`, `workset/*-subcommand`
already exist). Rejected: cospec-owned envelopes — they would hand-type
upstream's codes, messages and subcommand lists, and drift when the binary does.

**D2 — `workset open --json` is a piped call.** It spawns
`workset open --json <user argv>` piped, declaring exit `1` and a post-condition
that stdout is one document whose `status[0].code` is
`workset_open_json_unsupported` or the answer is a parse rejection (commander
answers `missing required argument 'name'` first, as the binary does). The
binary raises the refusal before it reads a workset, so nothing launches.
Rejected: a cospec document — it would hand-type the message and fix.

**D3 — Doctor's envelope.**
`{version, findings, summary, root, store, references, status}`: the four
upstream keys hold the binary's values for the root (on a wrapped-call
violation, the binary's own failure payload shape
`root: null, store: null, references: []` and `status: []`, plus the existing
WARNING finding). Findings keep their `openspec-<section>-<code>` names; the
`openspec-root` INFO line keeps its current condition (store-backed or
`references:`-declaring), so a healthy plain root's text report is unchanged
unless the binary reports something. When `initialized` fails, the binary's
`no_openspec_root` / `no_root_with_registered_stores` diagnostic stays in
`status` and is not folded. `checkConfig` and the references probe read
`config.yaml` else `config.yml` (upstream's `resolveConfigFilePath` order) and
name the file they read. The WARNING remedy becomes "rerun
`cospec doctor --json` to see OpenSpec's root, store and reference report".
After the rebase onto `root-resolution-parity`, doctor's own checks run against
`root.base` when the resolved root is local (the walk's result), and against the
cwd for a store root (today's `--store` from a bare workspace).

**D4 — The structural respell rule.** A successful answer is respelled only in
its parsed `--json` document, through the shared field-map helper
`root-resolution-parity` adds to `core/passthrough-command.ts`, with two field
kinds: `command` — the whole value is a command, only a leading `openspec `
token is replaced (`members[].fetch`); `sentence` — the value is one of the
binary's diagnostic strings and is passed alone to `respellRemedies`, so only an
allowlisted sentence inside it changes (`…status[].fix`). A failed answer
(exit 1) is respelled as every relay already is: the allowlist over the answer
(`message` and `fix` included). Field maps: context
`{members[].fetch: command, members[].status[].fix: sentence, status[].fix: sentence}`;
doctor
`{root.status[].fix, store.status[].fix, references[].status[].fix, status[].fix: sentence}`;
store
`{status[].fix, stores[].status[].fix, stores[].openspec_root.status[].fix: sentence}`.
cospec's text is rendered from the rewritten document (context: a port of the
binary's `printHumanWorkingSet`; store and doctor: the renderers they already
have). If the helper lands without a `sentence` kind, this change adds it in
`core/passthrough-command.ts` after that change has merged (group 9). Rejected:
regex or line anchors over the binary's text — a store id, a path or a template
can forge any line shape (the ruling that built the allowlist).

**D5 — Text-only success lines.** `workset create`, an empty `workset list` and
`config profile <preset>` have no reference document: their only guidance is one
next-step line. A new `respellLines(text, ids)` in `core/remedies.ts` rewrites a
line only when the whole line (after its indentation) is the named allowlist
sentence with its holes filled — `workset/open-any-time`, `workset/none-saved`,
`config/profile-applied` — so a member path or name that merely contains the
sentence is untouched. That output is the binary's own prose around user names;
nothing a user owns can form a whole line.

**D6 — Context's text needs the declared-reference count.** The binary's
empty-set line depends on `declaredReferenceCount`, which its document omits.
cospec reads it from `root.path`'s `openspec/config.yaml` else `config.yml`,
counting unique ids of string entries and `{id: string}` maps, as the binary's
declaration parser does; an unreadable config counts zero, as the binary's
reader returns none. With `--code-workspace` in text mode, a read-only
`context --json` call renders the listing and a second
`context --json --code-workspace <p> [--force]` call writes, its summary
(`Wrote …`) relayed from stderr or its refusal rendered as the binary's
`Error:`/`Fix:` lines — the binary's own order. In `--json` mode one call does
both, as the binary does (write first).

**D7 — Config.** No subcommand without `--json`: cospec's `config` help
(`commandHelpText` of the `config` row) on stderr, exit 1. With `--json`: the
binary's refusal of `--json` at the config level, relayed through
`relayCommandLevel`. `runPiped` returns the relayed parse rejection
(`isParseRejection`) before any envelope, text on stderr, exit 1. A successful
`profile <preset>` goes through D5. A subcommand the binary does not define
(`config bogus`, `config --scope project bogus`, `config -- --json`) is relayed
through `relayCommandLevel` like an option in that position: commander's
`unknown command` refusal, never cospec's own text. A `config list --json` the
binary refuses before its action (exit 1, nothing on stdout, the reason on
stderr — `--scope project`) is that answer, relayed respelled with exit 1, not
the unparseable document the `--json` enforcement reads it as. The `path`/`get`
envelopes carry a refusal's reason: a failed `path` is
`{version, command, ok: false, message}` and a `get` the binary refused (an
`Error:` line on stderr, its `--scope` check) is
`{version, command, key, ok: false, message}`, `message` the respelled stderr; a
`get` of an unset key keeps `{…, value: null, found: false}`, and beside any
answer the binary gave, its stderr (an unreadable config's
`Warning: Invalid JSON in …, using defaults`) is relayed.

**D8 — Handover pre-validation.** `forward-relay.ts` gains `prevalidateHandover`
built on a new `command-table.ts` export that parses one subcommand surface (the
existing private `parseSurface`), so the refusal text is the table parser's
commander-parity text, checked by a differential against the binary for every
handover leaf. Order per leaf: `--cwd` check → parse refusal (text on stderr,
exit 1, ahead of any `--json` envelope, as commander refuses before any output)
→ `--json` (config: the existing envelope; workset open: D2) → interactivity →
pre-flight → handover. Interactivity is the binary's own test per leaf:
`workset open` ports `isInteractive` (`OPEN_SPEC_INTERACTIVE=0`, `CI` set, or no
TTY on stdin → piped, declaring exit codes `[0, 1]`: with a saved or `--tool`
workspace-file tool the binary opens it from the pipe and exits 0, which is the
command doing its job, and both outcomes are relayed); `config profile` with no
preset tests stdout (no TTY → piped, the binary then refuses with its
interactive-mode-required sentence, respelled); `config reset --all` tests
stdin, as its confirm reads it (no TTY → piped under the handover preload, D15,
declaring exit codes `[0, 1, 130]` and a post-condition that the binary printed
an answer line after its prompt or a failure on stderr; its answer relayed and
its exit code returned as it exits — 130 and `Reset cancelled.` on a closed
input; see D14 for its stdin). `config edit` has no non-interactive branch and
always hands over. Pre-flights, each read-only: `workset open` runs
`workset list --json`, declaring exit codes `[0, 1]`, and answers through the
piped `workset open <argv>` (the binary refuses before it launches anything, its
`invalid_workset_file` diagnostic and `Fix:` respelled) when the list itself
refused — exit 1, or an error in its `status[]` — or the name is not saved, or
no member path is a directory; a member path is a directory only when `stat`
reads it as one, and every `stat` failure that means "not usable as a member
folder" (`ENOENT`, `ENOTDIR`, `ELOOP`, `EACCES`, `EPERM`, `ENAMETOOLONG`, a NUL
byte) is no folder, as the binary's `pathIsDirectory` answers it, never a crash
(any other `stat` error — an I/O error — propagates: the binary's bare `catch`
would call it a missing folder, and cospec catches only the failures it can
name); `config profile` runs a piped `config profile` (stdout not a TTY),
declaring exit code `1` and a refusal on stderr: its interactive-mode-required
refusal clears the handover, and any other refusal (an unreadable config,
`--scope project`'s `Project-local config is not yet implemented`) is relayed,
respelled, without handing over. A pre-flight that answers otherwise is a
wrapped-call violation.

**D9 — New allowlist entries.** The piped non-interactive paths make one
sentence relayable that is today listed as never relayed:
`config/profile-interactive-required` —
``Interactive mode required. Use `openspec config profile core` or set config via environment/flags.``
(`commands/config.js`). Its `REMEDY_SOURCES` row moves from
`notRelayed.PROFILE_HANDOVER` to the new id. `notRelayed.TIP` is rewritten:
every spawn, both handovers included, sets `OPENSPEC_NO_COMPLETIONS=1`.

**D10 — `--cwd`.** `store`, `config` and `workset` check the resolved `--cwd`
before anything else and answer with the resolver's own refusal from
`core/root.ts` (text `cospec: directory not found: <path>`; under `--json` the
resolver's `{status:[diagnostic]}` document), exported there if the resolver
keeps it private. Rows for `context`, `doctor` and `schemas`, which inherit the
resolver's check, assert all six commands agree (group 9).

**D11 — The residual.** After D8, the binary can still print a bare `openspec`
command only inside a live interactive session, on the terminal it was handed:
`config profile`'s menu path (`config/drift-warning`,
``Run `openspec update` in your other projects to apply.``,
`` `openspec update` failed: … ``, `config/profile-applied`, and the lines its
in-process `update` prints, today `notRelayed.UPDATE`), and `workset open` on a
TTY for a saved workset with a surviving member when the tool cannot be resolved
or launched (`workset/tool-alternative`, `workset/tool-rerun`,
`workset/no-tool`, `workset/open-in-code`, `workset/open-alternative`).
`config edit` and `config reset --all` print none. The enumeration is
machine-checked: each such `REMEDY_SOURCES` row carries a
`notRelayed.HANDOVER_SESSION` reason naming the leaf, and the docs state it on
the handover-class passage. The obligation names `exceptions.yaml` as the
record; that file's contract (exactly one entry, the one named exception,
asserted by the reachability test) means a capability cospec never implements,
not text it cannot respell, so this design records the residual in
`remedy-sources.ts` and the docs — which is also how `.agents/shared.md` defines
the two files ("a capability cospec deliberately never implements lives only in
`exceptions.yaml`"; a line no relay respells is listed in `remedy-sources.ts`
with its reason). Task 7.2 follows the orchestrator's ruling on this point.

**D12 — Tests first.** Every differential and regression row lands first as
`test.failing` (group 1) against the oracle (`upstream-oracle.ts`, Node runtime
where a leading `--` matters), and the fix that makes it pass flips it to `test`
in the same commit. The two integration tests that encode the defect
(`doctor-relationship.test.ts` "a local repo … skips the delegated section",
`workset.test.ts` "never threads --json onto the handover exec") are inverted in
group 1 as failing rows. Upstream strings are never hand-typed in a test: every
expected answer is the oracle's for the same argv on the same fixture, with only
the allowlisted respelling applied.

**D13 — `config <leaf> <extra-arg> --json` is cospec-only.** cospec's `--json`
is a global flag on every `config` row, a superset of the binary's, which
declares `--json` on `config list` alone. Given an excess argument and `--json`
(`config edit extra --json`, `config path extra --json`,
`config get a b --json`, …) the binary names `--json` as the unknown option,
where cospec, having taken `--json` as its own, refuses the excess argument as
too many. Both refuse before anything runs, exit `1`, nothing on stdout; the
precedence matrix declares these rows cospec-only and the handover
pre-validation suite pins the binary's half of each.

**D14 — `config reset --all` piped gives the confirm no stdin.** With no TTY on
stdin the piped call runs with `stdin: 'ignore'`, as every piped call does, so
the confirm reads a closed input and cancels (130, `Reset cancelled.`, nothing
reset). That is the binary's answer under Node for an empty stdin and for an
answer already waiting on the pipe (`echo y | …`), which Node discards as input
typed ahead of the prompt (inquirer defers its first render past the buffered
data). Forwarding cospec's stdin was rejected: under Bun that waiting answer
reaches the confirm and resets the global config where the binary cancels. The
cost is one declared divergence — an answer that arrives on the pipe after the
prompt is drawn (`(sleep 1; echo y) | …`), which the binary takes and resets
(exit 0), cospec cancels (exit 130, nothing reset); the contract suite pins both
halves as a cospec-only row.

**D15 — The handover preload.** Every terminal handover (`workset open`,
`config edit`/`profile`/`reset --all`) and the piped `config reset --all` run
the binary as `<execPath> --preload <file> <bin> …`. Under Node the binary's
inquirer prompts answer a closed input (Ctrl-D on a terminal, an ended pipe)
through signal-exit: readline closes, the loop empties, Node emits `exit`
through the `process.emit` signal-exit has patched, its listener rejects the
pending prompt with `ExitPromptError`, and the binary's catch prints its
cancellation line and sets exit 130 in a microtask Node drains before exiting.
Under Bun — which runs every wrapped call, cospec depending on no node —
readline closes the same way (a `close`, no error), but Bun dispatches
`beforeExit`/`exit` natively, never through the patched `process.emit`, and
drains no microtask an `exit` or `beforeExit` listener queues: the prompt is
never rejected and the child exits 0 having printed only the prompt. The preload
(`core/handover-preload.ts`, written content-addressed to cospec's cache beside
the extracted bundle) emits signal-exit's `exit` once on its process-wide
emitter (`Symbol.for('signal-exit emitter')`) from `beforeExit` and schedules
one empty immediate so the rejection's handlers run; the child then prints the
binary's own cancellation line and exits 130, the binary's answer, which the
handover propagates verbatim. The compiled binary's runtime honours `--preload`
under `BUN_BE_BUN=1`; the standalone smoke asserts it on the embedded bundle.

## Risks / Trade-offs

- [The ported context renderer drifts from the binary's] → the differential
  compares cospec's text with the binary's on four fixtures (usable store,
  broken and unregistered references, self-reference only, none declared, and a
  registry-unreadable note), modulo the respelled fields; any in-range change to
  the layout fails it.
- [Two calls for `context --code-workspace` in text mode] → the second call is
  the write the user asked for; the listing may describe a working set a
  concurrent registry edit changed between the calls. Accepted: the binary's own
  listing and write read the registry separately too.
- [Pre-flights add spawns to `workset open` and `config profile`] → one
  read-only piped call each, only on the handover path.
- [Handover pre-validation duplicates commander] → it reuses the table parser
  the table rows already trust, and the differential over every handover leaf
  fails on any mismatch.
- [`upstream-spellings` modifies the same `cli-option-contract` requirement] →
  the later archive rebases its MODIFIED block onto the living text; noted in
  blocking-changes.
- [The field-map helper's shape is not on this branch] → group 9 runs after the
  rebase; D4 names the one extension this change would add.
- [The preload reaches into signal-exit's process-wide emitter] → the key
  (`Symbol.for('signal-exit emitter')`) is signal-exit v4's published global and
  the pinned bundle's; with no emitter the preload does nothing, so an in-range
  binary without it keeps Bun's behaviour, and the pty rows against the binary
  under Node fail on any difference in the cancellation answer.
- [`config get`'s refusal is told from an unset key by an `Error:` line] → the
  binary's action prints nothing on stderr for an unset key but its config
  read's `Warning:` lines, and refuses in its `preAction` hook with `Error:`;
  the contract rows for both answers compare with the binary's.

## Operational surface

No deploy topology changes. Runtime environment of wrapped calls: the
`workset open` handover gains `OPENSPEC_NO_COMPLETIONS=1` beside `BUN_BE_BUN=1`
and `OPENSPEC_TELEMETRY=0`; piped calls keep `WRAPPED_ENV`. New spawns: one
read-only pre-flight per `workset open` / `config profile` handover, one per
group refusal, and a second `context` call for text-mode `--code-workspace`.
Every handover and the piped `config reset --all` carry `--preload <file>`
(D15); cospec writes that one small file, content-addressed, to
`${XDG_CACHE_HOME:-~/.cache}/cospec` beside the extracted bundle. No new binary,
version or architecture; the wrapped binary is still resolved by path and
version-asserted before every handover.

## Integration contract

The wrapped binary's documents this change consumes, all probed at test time
through `test/contract/support/upstream-oracle.ts`, never copied into a test:

- `doctor --json`:
  `{root: {path, source, store_id?, healthy, status[]} | null, store: {id, metadata, status[]} | null, references: [{store_id, root?, status[]}], status[]}`;
  exit 1 with the same keys on a resolution failure.
- `context --json`:
  `{root: {path, source, store_id?, role}, members: [{role, id, path?, fetch?, status[]}], status[]}`;
  a failure payload `{root: null, members: [], status[]}`.
- `store <none|unknown> --json`:
  `{status: [{severity, code: 'unknown_store_subcommand', message, fix}]}`;
  `workset …` the same with `unknown_workset_subcommand`; `workset open --json`:
  `{status: [{…, code: 'workset_open_json_unsupported', target, fix}]}`.
- `workset list --json`:
  `{worksets: [{name, members: [{name, path}]}], status[]}` (pre-flight).
- Diagnostics everywhere: `{severity, code, message, target?, fix?}` — cospec
  rewrites only `fix` on success and `message`/`fix` on failure, and adds no key
  to the binary's objects.
