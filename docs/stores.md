# Stores (`--store`)

An OpenSpec **store** (openspec 1.5.0) is a standalone, registered planning
repo: its own `openspec/` tree of specs and changes, versioned and shared over
git like any repo. Stores exist for cross-repo work — one plan that several code
repos implement against, or requirements one team owns and others consume.

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
workset surface is now a **first-class cospec command** — you never drop out to
bare `openspec` for an everyday operation.

- **cospec** owns everything a user runs:
  - the change lifecycle — `new`, `validate`, `apply`, `archive`, `status`,
    `list`, `instructions`, `sync-blockers`, `migrate` — each with `--store`;
  - the store lifecycle — `cospec store setup|register|unregister|remove|list`
    (`ls`)`|doctor`, a first-class wrap that verifies each mutation on disk (it
    trusts the filesystem/registry, never the wrapped exit code) and, on a
    successful `setup`/`register`, **auto-runs
    `cospec init <root> --harness none`** so a new or newly-registered store
    gets cospec's 11 typed schemas in one command (opt out with
    `--no-cospec-init`);
  - the read-only cross-repo brief — `cospec context` (with `--json` and
    `--code-workspace`/`--force`);
  - personal working views — `cospec workset create|list|remove|open`.
- **OpenSpec** still owns the underlying machine registry, the on-disk store
  format, and the `references:` config key (upstream specs surfaced into a code
  repo's `instructions`). cospec spawns the pinned binary for all of it under
  the [wrapped-call discipline](architecture.md); nothing about the registry
  format is reimplemented.

`store`, `context`, and `workset` are disciplined passthroughs (or, for `store`,
first-class wraps): read-only or personal, they carry no cospec gate — they add
wrapped-call rigor (declared exit codes, a stdout deny-list, an observable
post-condition) and, where the root is store-backed, `--store` threading.

## Setup

Creating a store is now a single command — `cospec store setup` registers the
root **and** stamps it with cospec's typed schemas in one step (the auto
`cospec init` that used to be a documented manual second step):

```sh
# 1. Create + register the store, and give it cospec's typed schemas in one go.
#    (Auto-runs `cospec init <root> --harness none` on success — a store is
#    planning-only, so no harness. Pass --no-cospec-init to skip that step.)
cospec store setup platform --path ./platform-store --remote git@github.com:acme/platform-store.git

# 2. Work the store from anywhere by id.
cospec new feat some-epic --store platform
```

To adopt an already-existing OpenSpec root, `cospec store register <path>`
registers it and runs the same auto `cospec init`. `cospec store ls` lists the
registered stores, `cospec store doctor [id]` reports per-store health (git
facts, metadata, root completeness), and `cospec store unregister`/`remove`
inherit OpenSpec's `--yes`/confirmation contract (`unregister` forgets the
registry entry and leaves files on disk; `remove` also deletes the folder).

A code repo can also point at a store by default instead of passing `--store`
every time, via its own `openspec/config.yaml`:

```yaml
schema: feat
store: platform # cospec + openspec resolve commands against this store
references:
  - platform # read-only upstream specs surfaced in instructions
```

## Resolution order

Each command resolves exactly one operating root, mirroring OpenSpec's own
precedence:

1. an explicit `--store <id>` flag;
2. else a `store:` pointer in the local `openspec/config.yaml`;
3. else the local repo at the current directory.

`references:` is read-only context, never a root override — it does not change
where a change is created or gated.

An unregistered `--store` id fails loudly (naming the registered stores) rather
than silently falling back to the local repo, so a typo can never write a change
to the wrong place.

## How it works

Under the hood a resolved `Root` carries three things: the store's on-disk
`base` (cospec's filesystem readers key on it — a store's layout is identical to
a repo's, `<base>/openspec/…`), the `cwd` wrapped calls spawn in, and the
`--store <id>` args every wrapped `openspec` call appends. The store's path is
resolved from the machine registry via `openspec store ls --json`, wrapped with
the same expected-exit / post-condition discipline as every other wrapped call
(see [architecture.md](architecture.md)).
