# Stores (`--store`)

An OpenSpec **store** (openspec 1.11.0) is a standalone, registered planning
repo: its own `openspec/` tree of specs and changes, versioned and shared over
git like any repo. cospec is **store-aware** — every change-lifecycle command
takes a `--store <id>` global flag and runs its full typed workflow against that
store instead of the local repo, and the store lifecycle itself
(`cospec store setup|register|unregister|remove|list|doctor`, plus
`cospec context` and `cospec workset`) is a first-class cospec command, never a
bare `openspec` call.

## Root resolution order

Each command resolves exactly one operating root, in this order:

1. an explicit `--store <id>` flag;
2. else a `store:` pointer in the local `openspec/config.yaml`;
3. else the local repo at the current directory, if `openspec/` exists there;
4. else the machine-global `defaultStore` (`openspec config get defaultStore` —
   a raw value on stdout, no `--json`, exit `1` when unset) as a **fallback**.

`defaultStore` is consulted only after local-root resolution has already failed
— it is never a precedence tier ahead of tiers 1–3, and it can never redirect a
command that's already running inside an existing local `openspec/` repo. It
matters only when you run a cospec command from a directory with no local
`openspec/` tree and no `--store`/`store:` pointer either.

The full user-facing account — setup, the config.yaml `store:` pointer, the
resolution order, `cospec context`/`workset`, and what cospec owns vs. what
OpenSpec owns — is owned by the site:
[Stores](https://cospec.aligned.team/concepts/stores).

```sh
cospec new feat cross-repo-epic --store platform     # authored in the store
cospec apply cross-repo-epic --store platform        # the gate, over the store
cospec archive cross-repo-epic --store platform      # verified move, in the store
```

## How it works (internals)

A resolved `Root` carries three things: the store's on-disk `base` (cospec's
filesystem readers key on it — a store's layout is identical to a repo's,
`<base>/openspec/…`), the `cwd` wrapped calls spawn in, and the `--store <id>`
args every wrapped `openspec` call appends. The store's path is resolved from
the machine registry via `openspec store ls --json`, wrapped with the same
expected-exit / post-condition discipline as every other wrapped call — see
[architecture.md](architecture.md).
