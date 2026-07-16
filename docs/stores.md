# Stores (`--store`)

An OpenSpec **store** (openspec 1.5.0) is a standalone, registered planning
repo: its own `openspec/` tree of specs and changes, versioned and shared over
git like any repo. cospec is **store-aware** — every change-lifecycle command
takes a `--store <id>` global flag and runs its full typed workflow against that
store instead of the local repo, and the store lifecycle itself
(`cospec store setup|register|unregister|remove|list|doctor`, plus
`cospec context` and `cospec workset`) is a first-class cospec command, never a
bare `openspec` call.

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
