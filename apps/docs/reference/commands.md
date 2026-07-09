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

| flag                               | effect                             |
| ---------------------------------- | ---------------------------------- |
| `--json`                           | machine-readable output            |
| `--no-color`                       | disable ANSI color                 |
| `--cwd <path>`                     | run as if invoked from `<path>`    |
| `-h`, `--help`                     | show help for the command          |
| `-V`, `--version` (top-level only) | print the installed cospec version |

## Commands

| command                                          | synopsis                                                                                                                                                                               | key flags                                                                                              | see                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `cospec init [path]`                             | Scaffold `openspec/`, the eleven typed schemas, and harness files. Idempotent.                                                                                                         | `--yes`, `--force`, `--harness <list>`, `--gate` / `--no-gate`, `--remove-opsx`                        | [Installation](/guide/installation)                                |
| `cospec update`                                  | Regenerate managed files (schemas, harness files) from canon.                                                                                                                          | `--check` (drift gate, exits nonzero on drift, changes nothing), `--force`                             | [Installation](/guide/installation)                                |
| `cospec doctor`                                  | Read-only health check: wrapped-OpenSpec version, schema/harness drift, dangling slash/skill refs, `config.yaml` validity, changes stuck on an old `schemaVersion`.                    | —                                                                                                      | [How it relates to OpenSpec](/concepts/how-it-relates-to-openspec) |
| `cospec new <type> <slug>`                       | Create a typed change and print its artifact plan. Also accepts `cospec new "<type>: <description>"`.                                                                                  | `--description <text>`                                                                                 | [Types and artifacts](/concepts/types-and-artifacts)               |
| `cospec migrate <slug>`                          | Opt-in: stamp a change created under an older `schemaVersion` to the current one, scaffolding a fully-deferred `verification.md` where the type requires it. Never runs automatically. | —                                                                                                      | [Verification](/concepts/verification)                             |
| `cospec validate [name]`                         | Validate one or all changes and specs against cospec's rules.                                                                                                                          | `--strict` (promote warnings to errors), `--all`, `--changes`, `--specs`, `--fast`, `--no-interactive` | [Types and artifacts](/concepts/types-and-artifacts)               |
| `cospec status --change <slug>`                  | Per-artifact completion, the blocker gate state, and archive-readiness for one change.                                                                                                 | `--change <slug>`                                                                                      | [Apply and archive](/concepts/apply-and-archive)                   |
| `cospec list`                                    | List active changes with type, gate state, task progress, and archive-readiness columns.                                                                                               | `--blocked` (only changes with a non-clear gate)                                                       | [Apply and archive](/concepts/apply-and-archive)                   |
| `cospec instructions <artifact> --change <slug>` | Print the authoring instructions for one artifact of a change (e.g. `proposal`, `verification`, `tasks`).                                                                              | `--change <slug>`, `--allow-soft`                                                                      | [Workflow](/guide/workflow)                                        |
| `cospec apply <slug>`                            | The gate: check blockers and required artifacts before you implement.                                                                                                                  | `--allow-soft` (proceed past a soft block)                                                             | [Apply and archive](/concepts/apply-and-archive)                   |
| `cospec archive <slug>`                          | Validate, gate on tasks and verification, archive via OpenSpec, verify the move on disk, and fan out blocker sync.                                                                     | `--skip-specs`, `--force-incomplete`                                                                   | [Apply and archive](/concepts/apply-and-archive)                   |
| `cospec sync-blockers`                           | Check off blocking-changes entries whose target has shipped, across all active changes.                                                                                                | `--check` (report only, no writes), `--change <slug>`                                                  | [Blocking changes](/concepts/blocking-changes)                     |

`cospec check-commit` is a hidden commit-msg hook entrypoint (advisory only,
never blocks a commit) and isn't part of the everyday command surface.

::: tip Exit codes `apply` and `archive` use the same four-code contract
(`0`/`1`/`2`/`3`) across every gated command. The full table lives on
[Apply and archive](/concepts/apply-and-archive) — read it once, not per
command. :::

For anything that's the wrapped binary's own job — the delta format, OpenSpec's
glossary, or its own commands — see
[OpenSpec's command reference](https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md).
