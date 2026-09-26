---
title: Command reference
description:
  Every cospec subcommand, its synopsis, key flags, and where to read the full
  semantics.
---

# Command reference

Every command accepts the same global flags. Command-specific flags are noted in
the table.

## Global flags

| flag              | effect                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `--json`          | machine-readable output                                                                                |
| `--no-color`      | disable ANSI color                                                                                     |
| `--cwd <path>`    | run as if invoked from `<path>`                                                                        |
| `--store <id>`    | operate against a registered OpenSpec store instead of the local repo — see [Stores](/concepts/stores) |
| `-h`, `--help`    | show help for the command                                                                              |
| `-V`, `--version` | print the installed cospec version and exit — in any position before `--`, ahead of everything else    |

`--cwd` and `--store` need a value: given none, they're refused with
`cospec <command>: option '--store <id>' argument missing` (or
`'--cwd <path>'`), and given an empty one (`--store=`) with
`… argument must not be empty`, exit `1` — the command never falls back to the
local repo.

Global flags are recognised before the command name and anywhere after it, up to
a `--` terminator. After `--` every token is an operand of the command, as in
OpenSpec: `cospec list -- --json` is refused as too many arguments, not run as
`list --json`. A `--` before the command name works the same way:
`cospec -- list` runs `list`, `cospec -- list --help` is refused as too many
arguments, and the token after the command is still its subcommand
(`cospec -- config help path` prints the `config path` help).

As in OpenSpec, the program level and the command never rank against each other;
cospec answers in two phases:

1. `-V`/`--version` anywhere before `--` prints the version, ahead of everything
   else.
2. The tokens before the command name are read first. A `--cwd`/`--store` with
   no value is refused; then, at the first `-h`/`--help` or unknown option, a
   help flag anywhere in the argv prints cospec's command list, and otherwise
   the option is refused with `cospec: unknown option '<flag>'` (plus
   `Did you mean '<closest-global-flag>'?` when one is close enough), exit `1` —
   or, for `--store-path`, its redirect. Nothing after the command name is
   looked at: `cospec --bogus list` lists nothing and
   `cospec --bogus list --store` refuses `--bogus`, as `openspec --bogus list`
   refuses too, and `cospec --help list --store` prints the command list. An
   unknown command answers as one, unless a help flag follows it
   (`cospec bogus --help` prints the command list).
3. Only then does the command read its own argv, in OpenSpec's per-command
   order: a missing value (`cospec status --help --change` refuses the missing
   `--change`), then `--help`, then the command's other refusals (unknown
   option, too many arguments, then `--store-path`:
   `cospec list --store-path /x --bogus` refuses `--bogus`), then an empty
   `--cwd`/`--store` (`cospec list --store= --help` prints help), then the
   command runs.

`cospec <command> help` — a bare `help` token immediately after the command name
— is equivalent to `cospec <command> --help` on every table-parsed command; it
never runs the command. On a forwarded command it answers as OpenSpec does:
`cospec config help` and `cospec schema help` print help, `cospec store help`
and `cospec workset help` refuse `help` as an unknown subcommand, and
`cospec show help` passes `help` to the binary as the item name.

## Commands

| command                                          | synopsis                                                                                                                                                                                                                                                                                                                                                         | key flags                                                                                                                                                                         | see                                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cospec init [path]`                             | Scaffold `openspec/`, the eleven typed schemas, and harness files. Idempotent.                                                                                                                                                                                                                                                                                   | `--yes`, `--force`, `--harness <list>` (`claude`, `codex`, `opencode`, `agents`, `all`, `none`), `--gate` / `--no-gate`, `--remove-opsx`                                          | [Installation](/guide/installation)                                                                                                                         |
| `cospec update`                                  | Regenerate managed files (schemas, harness files) from canon.                                                                                                                                                                                                                                                                                                    | `--check` (drift gate, exits nonzero on drift — including a not-yet-migrated `.codex/skills` layout — changes nothing), `--force` (also discards hand-edited legacy skill copies) | [Installation](/guide/installation)                                                                                                                         |
| `cospec doctor`                                  | Read-only health check: wrapped-OpenSpec version, schema/harness drift, a `legacy-layout` warning per file still under `.codex/skills`, dangling slash/skill refs, `config.yaml` validity, changes stuck on an old `schemaVersion`, and — for a store-backed or `references:`-declaring root — delegated root/store relationship health (`openspec-*` findings). | —                                                                                                                                                                                 | [How it relates to OpenSpec](/concepts/how-it-relates-to-openspec), [Stores](/concepts/stores)                                                              |
| `cospec new <type> <slug>`                       | Create a typed change and print its artifact plan. Also accepts `cospec new "<type>: <description>"`.                                                                                                                                                                                                                                                            | `--description <text>`                                                                                                                                                            | [Types and artifacts](/concepts/types-and-artifacts)                                                                                                        |
| `cospec migrate <slug>`                          | Opt-in: stamp a change created under an older `schemaVersion` to the current one, scaffolding a fully-deferred `verification.md` where the type requires it. Never runs automatically. Under `--json`, one document `{change, schemaVersion, migrated, verificationScaffolded}` on both paths — `migrated: false` when the change is already current.            | —                                                                                                                                                                                 | [Verification](/concepts/verification)                                                                                                                      |
| `cospec validate [name]`                         | Validate one or all changes and specs against cospec's rules.                                                                                                                                                                                                                                                                                                    | `--strict` (promote warnings to errors), `--all`, `--changes`, `--specs`, `--archived`, `--fast`, `--no-interactive`                                                              | [Types and artifacts](/concepts/types-and-artifacts)                                                                                                        |
| `cospec status --change <slug>`                  | Per-artifact completion, the blocker gate state, and archive-readiness for one change; `--all` sweeps every active change instead of one.                                                                                                                                                                                                                        | `--change <slug>`, `--all`                                                                                                                                                        | [Apply and archive](/concepts/apply-and-archive)                                                                                                            |
| `cospec list`                                    | List active changes with type, gate state, task progress, and archive-readiness columns. `--specs` instead lists living specs by requirement count.                                                                                                                                                                                                              | `--blocked` (only changes with a non-clear gate), `--specs`                                                                                                                       | [Apply and archive](/concepts/apply-and-archive)                                                                                                            |
| `cospec instructions <artifact> --change <slug>` | Print the authoring instructions for one artifact of a change (e.g. `proposal`, `verification`, `tasks`, `archive`). `archive` is a read-only relay of the wrapped `openspec instructions archive`, not an alias for `cospec archive` (requires openspec >=1.7.0).                                                                                               | `--change <slug>`, `--allow-soft`                                                                                                                                                 | [Workflow](/guide/workflow)                                                                                                                                 |
| `cospec apply <slug>`                            | The gate: check blockers and required artifacts before you implement.                                                                                                                                                                                                                                                                                            | `--allow-soft` (proceed past a soft block), `--skip-specs` (one-shot equivalent of a persisted `skip_specs: true` marker)                                                         | [Apply and archive](/concepts/apply-and-archive)                                                                                                            |
| `cospec archive <slug>`                          | Validate, gate on tasks and verification, archive via OpenSpec, verify the move on disk, and fan out blocker sync. `--json` adds `warnings`/`retired` arrays (always present, `[]` when empty).                                                                                                                                                                  | `--skip-specs`, `--force-incomplete`                                                                                                                                              | [Apply and archive](/concepts/apply-and-archive)                                                                                                            |
| `cospec sync-blockers`                           | Check off blocking-changes entries whose target has shipped, across all active changes.                                                                                                                                                                                                                                                                          | `--check` (report only, no writes), `--change <slug>`                                                                                                                             | [Blocking changes](/concepts/blocking-changes)                                                                                                              |
| `cospec store <sub>`                             | First-class wrap of the store lifecycle: `setup`/`register`/`unregister`/`remove`/`list` (`ls`)/`doctor`. `setup`/`register` auto-run `cospec init --harness none` on success.                                                                                                                                                                                   | `--no-cospec-init` (`setup`/`register` only)                                                                                                                                      | [Stores](/concepts/stores)                                                                                                                                  |
| `cospec context`                                 | Read-only cross-repo working-set brief across a repo and its `references:` stores.                                                                                                                                                                                                                                                                               | `--json`, `--code-workspace <path>`, `--force`                                                                                                                                    | [Stores](/concepts/stores)                                                                                                                                  |
| `cospec workset create\|list\|remove\|open`      | Personal, local working views. `open` hands the terminal over to the workset's editor/agent session and never accepts `--json` or `--store`.                                                                                                                                                                                                                     | —                                                                                                                                                                                 | [Stores](/concepts/stores)                                                                                                                                  |
| `cospec show <item>`                             | Show a single change or spec, text or JSON.                                                                                                                                                                                                                                                                                                                      | `--type`, `--deltas-only`, `--requirements-only`, `-r`/`--requirement`, `--no-scenarios`, `--diff`                                                                                | [Read-only and personal commands](#read-only-and-personal-commands), [OpenSpec's `show`](https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md) |
| `cospec view`                                    | Summary dashboard for the operating root. Accepts neither `--json` nor `--store`.                                                                                                                                                                                                                                                                                | —                                                                                                                                                                                 | [Read-only and personal commands](#read-only-and-personal-commands), [OpenSpec's `view`](https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md) |
| `cospec schemas`                                 | List every resolvable schema — the eleven cospec types plus any project-local (forked) schema — with its artifact chain.                                                                                                                                                                                                                                         | —                                                                                                                                                                                 | [Configuration](/reference/configuration#tier-3-schema-forking)                                                                                             |
| `cospec schema which\|validate\|fork\|init`      | Inspect which schema a change resolves to, validate a schema's own structure, or create a project-local schema (`fork <type> [name]`, `init <name>`). Refuses a destination name that collides with one of the eleven cospec types.                                                                                                                              | `--description <text>`, `--artifacts <list>` (`init` only)                                                                                                                        | [Configuration](/reference/configuration#tier-3-schema-forking)                                                                                             |
| `cospec templates`                               | List resolved per-artifact template paths for a schema.                                                                                                                                                                                                                                                                                                          | `--schema <name>` (default `spec-driven`)                                                                                                                                         | [Configuration](/reference/configuration#tier-3-schema-forking)                                                                                             |
| `cospec config <sub>`                            | Machine-global OpenSpec config (`~/.config/openspec/config.json`): `path`, `list`, `get <key>`, `set <key> <value>`, `unset <key>`, `reset`, `edit`, `profile [preset]`. `edit`, `profile` with no preset, and `reset --all` without `-y` hand the terminal over (inherited stdio, verbatim child exit code); the rest are piped.                                | `--scope global` (only accepted value), `--json` (`list` only — the rest get a cospec-owned envelope), `-y`/`--yes` (`reset --all`)                                               | [Configuration](/reference/configuration#machine-global-openspec-config)                                                                                    |
| `cospec completion [bash\|zsh\|fish]`            | Print a shell completion script to stdout, generated from cospec's own command table. Shell auto-detected from `$SHELL` when omitted. No `install`/`uninstall` — copy-paste only.                                                                                                                                                                                | —                                                                                                                                                                                 | [Installation](/guide/installation#shell-completion)                                                                                                        |
| `cospec feedback "<message>" [--body <text>]`    | File a bug report at `aligned-team/cospec` via `gh issue create` (array argv, no shell); prints a prefilled manual-submission URL and exits 0 if `gh` is missing or unauthenticated. `--upstream` relays to `openspec feedback` instead, filing at OpenSpec's own tracker.                                                                                       | `--body <text>`, `--upstream`                                                                                                                                                     | —                                                                                                                                                           |

`cospec check-commit` is a hidden commit-msg hook entrypoint (advisory only,
never blocks a commit) and isn't part of the everyday command surface.
`cospec __complete <changes|specs|types>` is a hidden dynamic-completion source
the generated shell scripts call at Tab time — it fails silently (exit 1,
nothing on either stream) so a bad lookup can never corrupt a keystroke.

::: tip Exit codes `apply` and `archive` use the same four-code contract
(`0`/`1`/`2`/`3`) across every gated command. The full table lives on
[Apply and archive](/concepts/apply-and-archive) — read it once, not per
command. :::

::: tip `status --all` and `--change` are mutually exclusive Passing both (or
`--all` plus a positional change name) fails with
`The --all and --change options are mutually exclusive.` — as a plain stderr
line, exit `1`, without `--json`; as
`{ "changes": [], "root": null, "error": "..." }` on stdout, exit `1`, with
`--json`. On success, `--all`'s `--json` shape is
`{ changes: ChangeEntry[], root: string }`, where each entry is the same shape a
single `cospec status --change <id> --json` emits (or `{ change, error }` if
that one change's status computation threw); exit is `1` if any entry failed,
`0` otherwise. The single-change shape itself is unchanged. :::

## Read-only and personal commands

`store`, `context`, `workset`, `show`, `view`, `schemas`, `schema which`/
`validate`/`fork`/`init`, `templates`, `config path`/`list`/`get`, and
`list --specs`/`validate --all`/`--specs`/`--archived` carry no cospec gate —
none of them block a change lifecycle, require an artifact, or touch the
verification ledger. Most of them (everything except `store`, which is a
first-class wrap with its own filesystem-verified post-conditions) are
**disciplined passthroughs**: cospec forwards the call to the wrapped OpenSpec
binary under the same rigor as every gated command — a version-asserted spawn, a
declared set of acceptable exit codes, a stdout deny-list, and stdout/stderr
relayed verbatim — and, when you pass `--json`, guarantees exactly one JSON
document on stdout (never a stack trace, even on failure) so a script or agent
reading the output can always parse it. None of this changes what the commands
_do_ — `show`, `view`, `schemas`, `schema`, `templates`, and `config`'s own key
semantics in particular are genuinely OpenSpec's own job, and their full
semantics live on
[OpenSpec's command reference](https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md)
— it only guarantees they fail predictably instead of silently.

`config set`/`unset`/`reset`/`edit`/`profile` are the read-only list's
exceptions: they mutate the machine-global config file (or, for `edit` and a
preset-less `profile`, hand the terminal over) — see
[Configuration](/reference/configuration#machine-global-openspec-config) for the
full call-class split and the precedence notes cospec prints alongside them.

For anything that's the wrapped binary's own job — the delta format, OpenSpec's
glossary, or its own commands — see
[OpenSpec's command reference](https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md).

## Unknown options

Every command answers a flag or subcommand the pinned OpenSpec binary itself
doesn't have the same way OpenSpec does — a refusal, exit `1` — instead of
silently dropping it, which used to hand the flag's value to a positional
(`cospec validate --type change x` validated an item literally named `change`).
One command table (`core/command-table.ts`) drives argv parsing, per-command
`--help`, and the shell completion spec together, so the three can't drift
apart. Four refusal shapes, all exit `1`:

- **Unknown flag:** `cospec <command>: unknown option '<flag>'`, followed by
  `Did you mean '<closest-flag>'?` when one is close enough.
- **Missing value:**
  `cospec <command>: option '<flag> <placeholder>' argument missing`, for a
  value-taking flag given with nothing after it.
- **Too many arguments:**
  `cospec <command>: too many arguments. Expected N argument(s) but got M.`, for
  a positional the command doesn't take — on every table-parsed command, which
  is every command except the forwarded ones below. Nothing is dropped and run
  on the rest: `cospec new feat add login` is refused rather than creating a
  change named `add` (spell the slug `add-login`, or pass
  `cospec new "feat: add login"` as one argument), and so are `cospec init a b`,
  `cospec apply <slug> extra`, `cospec migrate <slug> extra`,
  `cospec status a b` and `cospec instructions <artifact> extra`.
- **Not supported yet:** `cospec <command>: '<flag>' is not supported yet`, for
  an upstream flag cospec hasn't implemented. Its value is still consumed first,
  so a pending flag can never leak into a positional either. An upstream
  positional or subcommand cospec hasn't implemented is refused the same way,
  naming the slot or subcommand: `cospec update .` answers
  `cospec update: '[path]' is not supported yet`, and `new change`,
  `completion generate`, `completion install` and `completion uninstall` answer
  `'<subcommand>' is not supported yet`.

Three flags are accepted as no-ops, because cospec already behaves as they ask:
`init --no-animation` (cospec has no animation), `archive -y`/`--yes` (cospec
never prompts), and `list --changes` (the default).

**`--store-path`** is refused on every command — in the `--store-path <path>`
and `--store-path=<path>` forms, in both the pre-command and post-command
position — with the same redirect OpenSpec prints, respelled to `cospec`, at the
point OpenSpec refuses it: on a forwarded command whatever the binary refuses
first (`cospec config path --bogus --store-path /x` relays
`unknown option '--bogus'`), and never after a leading `--`, where it is an
operand (`cospec -- config --store-path /x` refuses `--store-path` as an unknown
`config` subcommand):

```
✖ Error: --store-path is not supported. Register the path with cospec store
register <path>, then select it with --store <id>.
Fix: cospec store register <path>, then rerun with --store <id>.
```

Under `--json`, that's one document on stdout instead of stderr text:
`{"status":[{"severity":"error","code":"store_path_not_supported","message":"…","target":"store.id","fix":"…"}]}`.
Register the path with `cospec store register <path>` and select it with
`--store <id>` — see [Stores](/concepts/stores).

**Forwarded commands relay OpenSpec's own answer.** `show`, `templates`,
`schemas`, `schema`, `store`, `workset` and `config` (the
[read-only and personal commands](#read-only-and-personal-commands) above) don't
reject an unknown option themselves — every token their own pre-spawn guards
don't consume reaches the wrapped binary unchanged, and its answer is relayed
verbatim. `openspec show` itself accepts an unrecognized flag by design
(`allowUnknownOption(true)`), so a cospec-side rejection there would be the
divergence from upstream, not a fix for one; the same forwarding lets a newer
in-range OpenSpec's new flag keep working immediately instead of failing until
cospec's table catches up.

**`--json` on a command that can't emit it.** `cospec view` renders a text
dashboard and `cospec completion` prints a shell script; both refuse `--json`
with exactly one document on stdout —
`{"version":1,"command":"<name>","ok":false,"message":"…"}` — and exit `1`,
rather than the older behavior of accepting the flag and silently ignoring it.

## Per-surface runtime minimums

Most of cospec runs against any accepted `>=1.0.0 <2.0.0` build, but a handful
of surfaces are pure delegation to a feature the wrapped binary only grew at a
later version. Below the stated minimum, cospec exits `1` with a named error
rather than faking the feature or silently degrading:

| Surface                       | Requires openspec | Behavior below the minimum                                                    |
| ----------------------------- | ----------------- | ----------------------------------------------------------------------------- |
| `cospec instructions archive` | `>=1.7.0`         | the wrapped binary's own exit-1 error is relayed verbatim — no special-casing |
| `cospec validate --archived`  | `>=1.9.0`         | exits `1` with a named error, never an empty passing report                   |
