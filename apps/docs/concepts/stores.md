---
title: Stores
description:
  What an OpenSpec store is, how cospec resolves its operating root, and the
  split between what cospec owns and what OpenSpec owns.
---

# Stores

An OpenSpec **store** is a standalone, registered planning repo: its own
`openspec/` tree of specs and changes, versioned and shared over git like any
repo. Stores exist for cross-repo work — one plan that several code repos
implement against, or requirements one team owns and others consume.

cospec is **store-aware**: every change-lifecycle command takes a `--store <id>`
global flag and runs its full typed workflow — schemas, the `apply` gate, the
verified `archive`, the blocking-changes ledger — against that store instead of
the local repo. Nothing about the workflow changes; only the operating root
does.

```sh
cospec new feat cross-repo-epic --store platform     # authored in the store
cospec validate cross-repo-epic --store platform --strict
cospec apply cross-repo-epic --store platform        # the gate, over the store
cospec archive cross-repo-epic --store platform      # verified move, in the store
cospec status --store platform                        # list/status against the store
```

## What cospec owns vs. what OpenSpec owns

cospec wraps OpenSpec; it does not reimplement the store registry or its
resolution semantics. But every store-management, cross-repo-context, and
workset surface is a **first-class cospec command** — you never have to drop out
to bare `openspec` for an everyday operation:

- **cospec** owns everything a user runs:
  - the change lifecycle — `new`, `validate`, `apply`, `archive`, `status`,
    `list`, `instructions`, `sync-blockers`, `migrate` — each with `--store`;
  - the store lifecycle — `cospec store setup|register|unregister|remove|list`
    (`ls`)`|doctor`, which verifies each mutation on disk rather than trusting
    the wrapped exit code, and, on a successful `setup`/`register`, **auto-runs
    `cospec init <root> --harness none`** so a new or newly-registered store
    gets cospec's eleven typed schemas in the same command (opt out with
    `--no-cospec-init`);
  - the read-only cross-repo brief — `cospec context` (with `--json` and
    `--code-workspace`/`--force`);
  - personal working views — `cospec workset create|list|remove|open`.
- **OpenSpec** still owns the underlying machine registry, the on-disk store
  format, and the `references:` config key (upstream specs surfaced into a code
  repo's instructions). cospec spawns the pinned binary for all of it, under the
  same
  [disciplined-passthrough](/reference/commands#read-only-and-personal-commands)
  rigor as every other wrapped call; nothing about the registry format itself is
  reimplemented.

`store`, `context`, and `workset` carry no cospec gate — they're read-only or
personal, not change-lifecycle steps — but they still get wrapped-call rigor
(declared exit codes, a stdout deny-list, an observable post-condition) and,
where the root is store-backed, the same `--store` threading as everything else.

## Setup

Creating a store is a single command — `cospec store setup` registers the root
**and** stamps it with cospec's typed schemas in one step:

```sh
# Create + register the store, and give it cospec's typed schemas in one go.
# (Auto-runs `cospec init <root> --harness none` on success — a store is
# planning-only, so no harness. Pass --no-cospec-init to skip that step.)
cospec store setup platform --path ./platform-store --remote git@github.com:acme/platform-store.git

# Work the store from anywhere by id.
cospec new feat some-epic --store platform
```

To adopt an already-existing OpenSpec root instead of creating one,
`cospec store register <path>` registers it and runs the same auto
`cospec init`. `cospec store ls` lists the registered stores,
`cospec store doctor [id]` reports per-store health (git facts, metadata, root
completeness — folded automatically into plain `cospec doctor` too, see below),
and `cospec store unregister`/`remove` inherit OpenSpec's confirmation contract
(`unregister` forgets the registry entry and leaves files on disk; `remove` also
deletes the folder).

A code repo can also point at a store by default instead of passing `--store`
every time, via its own `openspec/config.yaml`:

```yaml
schema: feat
store: platform # cospec + openspec resolve commands against this store
references:
  - platform # read-only upstream specs surfaced in instructions
```

The full key reference for `openspec/config.yaml` lives on
[Configuration](/reference/configuration).

## Resolution order

Each command resolves exactly one operating root, mirroring OpenSpec's own
precedence:

1. an explicit `--store <id>` flag;
2. else a `store:` pointer in the local `openspec/config.yaml`;
3. else the local repo at the current directory.

`references:` is read-only context, never a root override — it does not change
where a change is created or gated.

An unregistered `--store` id fails loudly rather than silently falling back to
the local repo, so a typo can never write a change to the wrong place:

```
cospec: unknown store 'bogus-id' — register it with 'cospec store register <path>' or check 'cospec store ls'. Registered stores: platform
```

::: tip Not a gate result This is a usage/resolution error, not a blocked gate —
it exits `1`, the same code as any other unhandled failure, not the `2`
`apply`/`archive` use for a blocked change. Don't script against it as if it
were a gate outcome; see [Apply and archive](/concepts/apply-and-archive) for
the codes that are. :::

## Cross-repo context and worksets

Two more store-domain surfaces are first-class `cospec` commands, not gated
change-lifecycle steps:

- **`cospec context [--json] [--code-workspace <path>] [--force]`** — a
  read-only brief of the current working set across a repo and its `references:`
  stores: which stores are in play, and what they contribute.
  `--code-workspace <path>` additionally writes a multi-root VS Code workspace
  file; cospec checks that the file actually landed on disk before reporting
  success, rather than trusting the wrapped exit code alone.
- **`cospec workset create|list|remove|open`** — personal, local working views
  over a store or repo. `create`/`list`/`remove` behave exactly like their
  `openspec` counterparts, relayed verbatim. `open` is different in kind: it
  hands the terminal over to whatever editor or agent session the workset points
  at — inherited stdio, the child's exact exit code, no `--json` (the wrapped
  binary itself rejects `--json` on `open`). Worksets never take a `--store`
  flag at all — they're local views, not store operations — so `cospec workset`
  never threads `--store` the way every other command on this page does.

## `cospec doctor` also checks store health

Plain `cospec doctor` — no `--store` needed — automatically folds in OpenSpec's
own relationship diagnostics whenever the operating root is store-backed or
declares `references:`: root-relationship health from `openspec doctor`, and,
for a store-backed root, the same git/metadata facts `cospec store doctor`
reports, as `openspec-*` findings alongside cospec's own checks. This is
additive and read-only — it never repairs anything, only surfaces what's already
there. See the `doctor` row on [Commands](/reference/commands) for the full
finding set.

## How it works

Under the hood a resolved root carries three things: the store's on-disk base
path (cospec's filesystem readers key on it — a store's layout is identical to a
repo's), the working directory every wrapped `openspec` call spawns in, and the
`--store <id>` args appended to that call. The working directory never changes
even under `--store` — only the base path and the appended store args do — so
relative-path flags you pass elsewhere on the command line still resolve against
your actual shell location, not the store's.
