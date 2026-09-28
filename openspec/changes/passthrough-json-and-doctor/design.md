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
commander parse rejection or one document whose `status[0].code` is
`unknown_store_subcommand` / `unknown_workset_subcommand`, and relays it through
`respellRemedies` (the sentences `store/*-subcommand*`,
`store/lifecycle-example*`, `workset/*-subcommand` already exist). Rejected:
cospec-owned envelopes — they would hand-type upstream's codes, messages and
subcommand lists, and drift when the binary does.

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
`profile <preset>` goes through D5.

**D8 — Handover pre-validation.** `forward-relay.ts` gains `prevalidateHandover`
built on a new `command-table.ts` export that parses one subcommand surface (the
existing private `parseSurface`), so the refusal text is the table parser's
commander-parity text, checked by a differential against the binary for every
handover leaf. Order per leaf: `--cwd` check → parse refusal (text on stderr,
exit 1, ahead of any `--json` envelope, as commander refuses before any output)
→ `--json` (config: the existing envelope; workset open: D2) → interactivity →
pre-flight → handover. Interactivity is the binary's own test per leaf:
`workset open` ports `isInteractive` (`OPEN_SPEC_INTERACTIVE=0`, `CI` set, or no
TTY on stdin → piped); `config profile` with no preset tests stdout (no TTY →
piped, the binary then refuses with its interactive-mode-required sentence,
respelled). `config edit` and `config reset --all` have no non-interactive
branch and always hand over. Pre-flights, each read-only: `workset open` runs
`workset list --json` and, when the name is not saved or no member path is a
directory, answers through the piped `workset open <argv>` (the binary refuses
before it launches anything); `config profile` runs a piped `config profile`
(stdout not a TTY), which the binary answers with its unreadable-config refusal
or its interactive-mode-required refusal and nothing else — the first is
relayed, respelled, without handing over; the second clears the handover. A
pre-flight whose answer is neither is a wrapped-call violation.

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

## Operational surface

No deploy topology changes. Runtime environment of wrapped calls: the
`workset open` handover gains `OPENSPEC_NO_COMPLETIONS=1` beside `BUN_BE_BUN=1`
and `OPENSPEC_TELEMETRY=0`; piped calls keep `WRAPPED_ENV`. New spawns: one
read-only pre-flight per `workset open` / `config profile` handover, one per
group refusal, and a second `context` call for text-mode `--code-workspace`. No
new binary, version or architecture; the wrapped binary is still resolved by
path and version-asserted before every handover.

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
