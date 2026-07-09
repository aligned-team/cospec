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

cospec wraps OpenSpec; it does not reimplement store management. The split:

- **OpenSpec** owns the store lifecycle and read-only cross-repo context —
  `openspec store setup|register|ls`, `openspec context`, `openspec workset`,
  and the `references:` config key (upstream specs surfaced into a code repo's
  `instructions`). These are local/read-only and carry no cospec gate, so run
  them with the native `openspec` CLI.
- **cospec** owns everything that touches a change: `new`, `validate`, `apply`,
  `archive`, `status`, `list`, `instructions`, `sync-blockers`, `migrate` — each
  with `--store`.

## Setup

```sh
# 1. Create + register the store (OpenSpec).
openspec store setup platform --path ./platform-store --remote git@github.com:acme/platform-store.git

# 2. Give the store cospec's typed schemas (init by path — a store is an
#    existing-openspec repo, so this only adds schemas; use --harness none
#    since a store is planning-only).
cospec init ./platform-store --harness none

# 3. Work the store from anywhere by id.
cospec new feat some-epic --store platform
```

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
