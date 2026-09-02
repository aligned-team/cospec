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

| flag                               | effect                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `--json`                           | machine-readable output                                                                                |
| `--no-color`                       | disable ANSI color                                                                                     |
| `--cwd <path>`                     | run as if invoked from `<path>`                                                                        |
| `--store <id>`                     | operate against a registered OpenSpec store instead of the local repo — see [Stores](/concepts/stores) |
| `-h`, `--help`                     | show help for the command                                                                              |
| `-V`, `--version` (top-level only) | print the installed cospec version                                                                     |

`cospec <command> help` — a bare `help` token immediately after the command name
— is equivalent to `cospec <command> --help`; it never runs the command.

## Commands

| command                                          | synopsis                                                                                                                                                                                                                                                                                         | key flags                                                                                                                 | see                                                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cospec init [path]`                             | Scaffold `openspec/`, the eleven typed schemas, and harness files. Idempotent.                                                                                                                                                                                                                   | `--yes`, `--force`, `--harness <list>`, `--gate` / `--no-gate`, `--remove-opsx`                                           | [Installation](/guide/installation)                                                                                                                         |
| `cospec update`                                  | Regenerate managed files (schemas, harness files) from canon.                                                                                                                                                                                                                                    | `--check` (drift gate, exits nonzero on drift, changes nothing), `--force`                                                | [Installation](/guide/installation)                                                                                                                         |
| `cospec doctor`                                  | Read-only health check: wrapped-OpenSpec version, schema/harness drift, dangling slash/skill refs, `config.yaml` validity, changes stuck on an old `schemaVersion`, and — for a store-backed or `references:`-declaring root — delegated root/store relationship health (`openspec-*` findings). | —                                                                                                                         | [How it relates to OpenSpec](/concepts/how-it-relates-to-openspec), [Stores](/concepts/stores)                                                              |
| `cospec new <type> <slug>`                       | Create a typed change and print its artifact plan. Also accepts `cospec new "<type>: <description>"`.                                                                                                                                                                                            | `--description <text>`                                                                                                    | [Types and artifacts](/concepts/types-and-artifacts)                                                                                                        |
| `cospec migrate <slug>`                          | Opt-in: stamp a change created under an older `schemaVersion` to the current one, scaffolding a fully-deferred `verification.md` where the type requires it. Never runs automatically.                                                                                                           | —                                                                                                                         | [Verification](/concepts/verification)                                                                                                                      |
| `cospec validate [name]`                         | Validate one or all changes and specs against cospec's rules.                                                                                                                                                                                                                                    | `--strict` (promote warnings to errors), `--all`, `--changes`, `--specs`, `--archived`, `--fast`, `--no-interactive`      | [Types and artifacts](/concepts/types-and-artifacts)                                                                                                        |
| `cospec status --change <slug>`                  | Per-artifact completion, the blocker gate state, and archive-readiness for one change; `--all` sweeps every active change instead of one.                                                                                                                                                        | `--change <slug>`, `--all`                                                                                                | [Apply and archive](/concepts/apply-and-archive)                                                                                                            |
| `cospec list`                                    | List active changes with type, gate state, task progress, and archive-readiness columns. `--specs` instead lists living specs by requirement count.                                                                                                                                              | `--blocked` (only changes with a non-clear gate), `--specs`                                                               | [Apply and archive](/concepts/apply-and-archive)                                                                                                            |
| `cospec instructions <artifact> --change <slug>` | Print the authoring instructions for one artifact of a change (e.g. `proposal`, `verification`, `tasks`, `archive`). `archive` is a read-only relay of the wrapped `openspec instructions archive`, not an alias for `cospec archive` (requires openspec >=1.7.0).                               | `--change <slug>`, `--allow-soft`                                                                                         | [Workflow](/guide/workflow)                                                                                                                                 |
| `cospec apply <slug>`                            | The gate: check blockers and required artifacts before you implement.                                                                                                                                                                                                                            | `--allow-soft` (proceed past a soft block), `--skip-specs` (one-shot equivalent of a persisted `skip_specs: true` marker) | [Apply and archive](/concepts/apply-and-archive)                                                                                                            |
| `cospec archive <slug>`                          | Validate, gate on tasks and verification, archive via OpenSpec, verify the move on disk, and fan out blocker sync. `--json` adds `warnings`/`retired` arrays (always present, `[]` when empty).                                                                                                  | `--skip-specs`, `--force-incomplete`                                                                                      | [Apply and archive](/concepts/apply-and-archive)                                                                                                            |
| `cospec sync-blockers`                           | Check off blocking-changes entries whose target has shipped, across all active changes.                                                                                                                                                                                                          | `--check` (report only, no writes), `--change <slug>`                                                                     | [Blocking changes](/concepts/blocking-changes)                                                                                                              |
| `cospec store <sub>`                             | First-class wrap of the store lifecycle: `setup`/`register`/`unregister`/`remove`/`list` (`ls`)/`doctor`. `setup`/`register` auto-run `cospec init --harness none` on success.                                                                                                                   | `--no-cospec-init` (`setup`/`register` only)                                                                              | [Stores](/concepts/stores)                                                                                                                                  |
| `cospec context`                                 | Read-only cross-repo working-set brief across a repo and its `references:` stores.                                                                                                                                                                                                               | `--json`, `--code-workspace <path>`, `--force`                                                                            | [Stores](/concepts/stores)                                                                                                                                  |
| `cospec workset create\|list\|remove\|open`      | Personal, local working views. `open` hands the terminal over to the workset's editor/agent session and never accepts `--json` or `--store`.                                                                                                                                                     | —                                                                                                                         | [Stores](/concepts/stores)                                                                                                                                  |
| `cospec show <item>`                             | Show a single change or spec, text or JSON.                                                                                                                                                                                                                                                      | `--type`, `--deltas-only`, `--requirements-only`, `-r`/`--requirement`, `--no-scenarios`, `--diff`                        | [Read-only and personal commands](#read-only-and-personal-commands), [OpenSpec's `show`](https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md) |
| `cospec view`                                    | Summary dashboard for the operating root. Accepts neither `--json` nor `--store`.                                                                                                                                                                                                                | —                                                                                                                         | [Read-only and personal commands](#read-only-and-personal-commands), [OpenSpec's `view`](https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md) |
| `cospec schemas`                                 | List every resolvable schema — the eleven cospec types plus any project-local (forked) schema — with its artifact chain.                                                                                                                                                                         | —                                                                                                                         | [Configuration](/reference/configuration#tier-3-schema-forking)                                                                                             |
| `cospec schema which\|validate\|fork\|init`      | Inspect which schema a change resolves to, validate a schema's own structure, or create a project-local schema (`fork <type> [name]`, `init <name>`). Refuses a destination name that collides with one of the eleven cospec types.                                                              | `--description <text>`, `--artifacts <list>` (`init` only)                                                                | [Configuration](/reference/configuration#tier-3-schema-forking)                                                                                             |
| `cospec templates`                               | List resolved per-artifact template paths for a schema.                                                                                                                                                                                                                                          | `--schema <name>` (default `spec-driven`)                                                                                 | [Configuration](/reference/configuration#tier-3-schema-forking)                                                                                             |

`cospec check-commit` is a hidden commit-msg hook entrypoint (advisory only,
never blocks a commit) and isn't part of the everyday command surface.

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
`validate`/`fork`/`init`, `templates`, and `list --specs`/`validate --all`/
`--specs`/`--archived` carry no cospec gate — none of them block a change
lifecycle, require an artifact, or touch the verification ledger. Most of them
(everything except `store`, which is a first-class wrap with its own
filesystem-verified post-conditions) are **disciplined passthroughs**: cospec
forwards the call to the wrapped OpenSpec binary under the same rigor as every
gated command — a version-asserted spawn, a declared set of acceptable exit
codes, a stdout deny-list, and stdout/stderr relayed verbatim — and, when you
pass `--json`, guarantees exactly one JSON document on stdout (never a stack
trace, even on failure) so a script or agent reading the output can always parse
it. None of this changes what the commands _do_ — `show`, `view`, `schemas`,
`schema`, and `templates` in particular are genuinely OpenSpec's own job, and
their full semantics live on
[OpenSpec's command reference](https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md)
— it only guarantees they fail predictably instead of silently.

For anything that's the wrapped binary's own job — the delta format, OpenSpec's
glossary, or its own commands — see
[OpenSpec's command reference](https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md).

## Per-surface runtime minimums

Most of cospec runs against any accepted `>=1.0.0 <2.0.0` build, but a handful
of surfaces are pure delegation to a feature the wrapped binary only grew at a
later version. Below the stated minimum, cospec exits `1` with a named error
rather than faking the feature or silently degrading:

| Surface                       | Requires openspec | Behavior below the minimum                                                    |
| ----------------------------- | ----------------- | ----------------------------------------------------------------------------- |
| `cospec instructions archive` | `>=1.7.0`         | the wrapped binary's own exit-1 error is relayed verbatim — no special-casing |
| `cospec validate --archived`  | `>=1.9.0`         | exits `1` with a named error, never an empty passing report                   |
