# Stores (`--store`)

An OpenSpec **store** (openspec 1.13.1) is a standalone, registered planning
repo: its own `openspec/` tree of specs and changes, versioned and shared over
git like any repo. cospec is **store-aware** — every change-lifecycle command
takes a `--store <id>` global flag and runs its full typed workflow against that
store instead of the local repo, and the store lifecycle itself
(`cospec store setup|register|unregister|remove|list|doctor`, plus
`cospec context` and `cospec workset`) is a first-class cospec command, never a
bare `openspec` call.

## Root resolution order

Each command resolves exactly one operating root — a qualifying-ancestor walk
ported from upstream's own resolver, so cospec and bare `openspec` agree on
which root a command targets from any directory:

1. an explicit `--store <id>` flag selects that store outright;
2. else cospec walks upward from the canonical cwd for the nearest `openspec/`
   that has a **planning shape** (`specs/` or `changes/` existing as a
   directory, not a store checkout's own metadata) or, failing that, a config
   file (`config.yaml`, else `config.yml`). A bare `openspec/` with neither is
   skipped — this is what stops a `~/openspec/<id>` store layout from making
   `$HOME` a phantom root;
3. at that ancestor, a planning root always wins (a `store:` pointer inside one
   is ignored, with a one-time stderr warning except on `templates` and
   `schema`); only a config-only `openspec/` follows its pointer — and a
   malformed one there (unparseable YAML, or a non-string `store:` value)
   hard-errors with `invalid_store_pointer` rather than falling through;
4. else, once the walk finds nothing, the machine-global `defaultStore` as the
   last **fallback**, read raw from the global config file at the path
   `openspec config path` prints and parsed as JSON, as upstream's
   `getGlobalConfig()` reads it (no trimming or stringifying; falsy is unset; a
   file that can't be read or parsed — missing, a directory, unreadable, not
   JSON — or a non-object root is unset, and a file that isn't JSON prints
   upstream's `Warning: Invalid JSON in <path>, using defaults` once, except on
   `templates` and `schema`);
5. else, with any stores registered, a hard error naming them
   (`no_root_with_registered_stores`); with none, the cwd is an **implicit**
   root, and each command's own missing-`openspec/` check reports it from there.

Every store selection (steps 1, 3's pointer branch, and 4) is verified on disk —
identity metadata, then root health — before it is used, and announced once on
stderr in human mode by the store banner (never on `templates` or `schema`:
upstream never selects a root for them, so `resolveRoot({ quiet: true })` prints
none of the resolver's lines there), whose user-visible contract the site owns:
[Store verification](https://cospec.aligned.team/concepts/stores#store-verification).

Every command resolves the enclosing root from a subdirectory this way, not only
the exact cwd. `cospec templates` and `cospec schema which|validate|fork|init`
go further and spawn the wrapped call inside the resolved root itself — a
deliberate superset of `openspec`, which reads its own working directory there
and so can't see a project's schemas from a subdirectory. When selection fails
with no explicit `--store`, those two spawn in the invocation cwd instead and
answer as the binary does there (`isCwdFallback`, `passthrough-command.ts`).
Every other wrapped call threads `--store <id>` only for an explicit `--store`;
a pointer- or `defaultStore`-selected root spawns in the invocation cwd instead
and lets the binary re-derive the same root itself, so relayed JSON reports
upstream's own `declared`/`global_default` `root.source`.

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
`<base>/openspec/…`), the `cwd` wrapped calls spawn in, and `storeArgs` — the
`--store <id>` args a wrapped call appends. `storeArgs` is set only for an
explicit `--store` selection (`source: store`); a pointer- or
`defaultStore`-selected root gets `storeArgs: []` and the wrapped call spawns in
`cwd` instead, letting the binary re-derive the same root itself. `templates`
and `schema` never take `storeArgs` at all and instead spawn with
`cwd: root.base` (`spawnInRoot`, `passthrough-command.ts`), since both wrapped
subcommands reject `--store`. The store's path is resolved from the machine
registry via `openspec store ls --json`, wrapped with the same expected-exit /
post-condition discipline as every other wrapped call — see
[architecture.md](architecture.md).
