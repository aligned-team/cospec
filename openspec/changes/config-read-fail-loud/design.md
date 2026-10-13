# Design

## Context

cospec reads the project config itself in two places, through one private
helper, `readProjectConfig` (`core/change.ts`), whose bare `catch` returns
`undefined` for an absent file, an errno and a YAML parse error alike:

- `projectConfigSchema` → `defaultProjectSchema`: the schema a change directory
  without `.openspec.yaml` takes, read by `status`, `list` and nested-change
  detection (`looksLikeChange` → `hasSchemaOutput`, under `listChanges`, so
  under nearly every command). This ports upstream's
  `readProjectConfig(root)?.schema`; upstream warns and falls back.
- `projectVerificationLayers`: the `verification.layers` vocabulary, a cospec
  fact upstream has no counterpart for, read by `readValidateContext`
  (`validate`, `apply`, `archive`, `sync-specs`) and by `status`/`list`'s
  verdict.

The pinned binary's `readProjectConfig` catches the same failures but prints
`Warning: could not parse ${configPathForWarnings(root)} (${firstLine}); ignoring it.`
(the absolute config path) and returns `null`. Probed against 1.13.1: `list`,
`status`, `validate` and `show` print nothing on a broken config when every
change carries `.openspec.yaml`, because those paths never read it; `status` on
a bare change prints the line once, `list` once per bare or nested candidate,
`instructions` once. None of them fails on it.

## Goals / Non-Goals

**Goals:**

- A config that exists but cannot be read or parsed is never silently read as no
  config: cospec always says so, naming the file and the cause.
- A verdict that depends on the config's content (the layer vocabulary) fails
  with the real cause instead of a guessed one.
- Doctor names a read failure as a read failure.

**Non-Goals:**

- A malformed but parseable `verification.layers` declaration stays lenient with
  doctor's WARNING (`verification-layers-config`'s design).
- The other config fields upstream validates (`context`, `rules`, `operations`,
  …) and the readers that already port upstream's warnings
  (`core/project-config-read.ts`, `init --language`, `archive`'s inputs).
- Refusing whole commands on a broken config.

## Decisions

1. **Split by who owns the fact.** Making `readProjectConfig` throw all the way
   out would refuse every command that enumerates changes (`listChanges` reads
   the default schema), in repos the binary lists with a warning — a parity
   regression. So the read reports the failure as an outcome (`{ unreadable }`,
   naming the file and the first line of the cause), and each reader decides:
   - `projectConfigSchema`, which mirrors upstream, falls back as upstream does
     and prints upstream's exact line. That is closer to parity than today's
     silence, and matches `cospec new`, whose spec already says "a config
     upstream cannot use falls back with its warning".
   - `projectVerificationLayers`, which only cospec owns, returns the outcome
     (`ProjectLayers`: `{ layers, unreadable? }`) so the rules can fail loud.
   - Rejected: refusing every gate command outright on a broken config. It would
     refuse `validate --specs` and a `ci` change's archive, which do not read
     the vocabulary and which upstream runs.
2. **Fail the ledger, not the command.** The rule runs where the vocabulary is
   used: `verificationRules` emits one `verification/config-unreadable` ERROR
   per validated ledger when `unreadable` is set, and skips
   `verification/layer-unknown` (with the vocabulary unknown, calling `@uat`
   unknown is the misleading message this fixes). Through the existing machinery
   that refuses `validate`/`apply`/`archive`/`sync-specs` for that change and
   puts the reason in `status`'s `blockedReasons`, so `archiveReady` is false
   for the right reason and agrees with `archive`. It fires on every validated
   ledger, not only one with a project-layer row: whether a row is known cannot
   be decided while the vocabulary is unreadable, and a broken config is a
   defect to fix, not to route around.
3. **Warn once per invocation, upstream's words.** The line goes to stderr
   through `printOwnStderrLineOnce`, which records it in the set
   `suppressRelayedStderrLine` already keeps of lines cospec printed itself. So
   `list` over N changes prints it once rather than upstream's once-per-read (an
   internal call count, not a contract), and a command that relays the wrapped
   binary's stderr (`apply`, through `instructions apply`) drops the binary's
   copy instead of printing it a second time. `archive`'s port of upstream's
   config warnings prints through the same function. The path is the absolute
   config path, as upstream prints it. The detail is the error's first line; for
   a read failure that is the errno message
   (`EISDIR: illegal operation on a directory, read`), as upstream's single
   `catch` words it.
4. **What counts as broken, in one place.** `readConfigFile` is the one read
   cospec's readers, doctor and the binary's port all take, so they cannot
   classify a file differently. An errno from `readFileSync` on an existing path
   is a failure carrying its code; a `readFileSync` error with no errno
   propagates. Everything `parseYaml` throws on the text is a failure: a
   `YAMLParseError`, but also the plain `ReferenceError` the library throws for
   an unresolved alias or its alias limit — the binary's one `catch` takes all
   of it, and narrowing to `YAMLError` crashed every command on `foo: *nope`. A
   document that parses but is not a mapping stays "no config" for the schema
   and "no layers" for the vocabulary, as today; doctor already reports it.
5. **Doctor.** `checkConfig` takes the same read and reports an errno as
   `<file> could not be read (<code>)` with a remedy to make it a readable file
   or remove it, and any parse failure as "does not parse as YAML", as before.
6. **The rule's path.** `verification/config-unreadable` is reported on
   `verification.md`, the ledger that cannot be validated: issue paths are
   change-relative, and the config sits outside the change. The message names
   the config by its root-relative POSIX path (`openspec/config.yaml`), on every
   platform.

## Where the fact is owned in docs

`apps/docs/concepts/verification.md` ("Extending the layer vocabulary") owns how
the layers are read: its "read leniently" paragraph now separates the missing,
broken and malformed cases. `reference/validation-rules.md` gains the
`verification/config-unreadable` row. `reference/commands.md`'s `cospec status`
row (the bare-change fallback) and `cospec doctor` row (the config check) note
the warning and the read failure.

## Operational surface

Nothing changes in how cospec deploys or runs. The fix changes how a local
`openspec/config.yaml` read failure is reported: one stderr line, one new rule
ID, and a doctor message. There is no bind address, container, network call or
secret. The `bun run` entry, the npm package and the standalone compiled
binaries behave the same, and the wrapped OpenSpec binary (pinned 1.13.1,
accepted `>=1.0.0 <2.0.0`) is not involved.

## Risks / Trade-offs

- A project with a broken config whose ledgers only use core layers passed
  `validate` before and now fails until the config is fixed. That is the
  intended "fail loud": the config is broken either way.
- The warning is printed once where upstream prints it once per read; output
  that counted upstream's repeats would see one line.
