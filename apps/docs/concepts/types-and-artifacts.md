---
title: Types and artifacts
description:
  The eleven cospec schemas, the six canonical artifacts, the full requirement
  matrix, and how Surfaces flags soft-nudge extra work.
---

# Types and artifacts

cospec ships eleven schemas, one per
[conventional-commit](https://www.conventionalcommits.org/) type. A change's
type _is_ its schema — `cospec new <type> <slug>` stamps it into the change's
`.openspec.yaml` as `schema: <type>`. There are no name prefixes, no parallel
taxonomy to keep in sync.

Every schema is composed from the same six hand-authored artifacts. Types differ
only in which artifacts they declare, which of those are mechanically required,
and which instruction variant (full or lite) they use.

| artifact           | file                  | role                                                                                                                |
| ------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `proposal`         | `proposal.md`         | Why / What Changes / (Capabilities) / (Surfaces) / Impact                                                           |
| `blocking-changes` | `blocking-changes.md` | cross-change dependency ledger                                                                                      |
| `specs`            | `specs/**/*.md`       | delta specs — see [OpenSpec's delta format](https://github.com/Fission-AI/OpenSpec/blob/main/docs/writing-specs.md) |
| `design`           | `design.md`           | Context / Goals / Decisions / Risks                                                                                 |
| `verification`     | `verification.md`     | per-behavior acceptance-evidence ledger                                                                             |
| `tasks`            | `tasks.md`            | numbered checkbox groups tracked during `apply`                                                                     |

`verification` is covered in full — its row grammar, layer vocabulary, and
per-type required-row rules — on [Verification](/concepts/verification). This
page owns the matrix that decides _whether_ a type has one.

## The artifact matrix

Each type declares each artifact in one of four states:

- **R** (required) — declared, and named in `apply.requires`; `apply`
  mechanically gates on it.
- **O** (optional) — declared, and its instructions/templates are available, but
  `apply` does not gate on it.
- **O(trig)** (optional, soft-promoted) — declared, not in `apply.requires`, but
  a checked `## Surfaces` flag turns its absence into an exit-code-3 soft
  blocker at `apply` (clear it with `--allow-soft`) and a WARNING at `validate`
  (ERROR under `--strict`). It never becomes a hard requirement — the matrix's
  shape never changes at gate time, only what `apply` is willing to wave
  through.
- **F** (forbidden) — not declared for this type at all; `cospec validate`
  raises `meta/forbidden-artifact` if the file exists anyway.

| type       | proposal | blocking-changes | specs | design | verification | tasks |
| ---------- | -------- | ---------------- | ----- | ------ | ------------ | ----- |
| `feat`     | R (full) | R (full)         | **R** | O      | **R**        | R     |
| `fix`      | R (full) | R (full)         | O     | O      | **R**        | R     |
| `perf`     | R (full) | R (full)         | O     | O      | **R**        | R     |
| `refactor` | R (full) | R (full)         | O     | **R**  | **R**        | R     |
| `revert`   | R (full) | R (full)         | O     | F      | O(trig)      | R     |
| `build`    | R (lite) | R (lite)         | F     | F      | O(trig)      | R     |
| `ci`       | R (lite) | R (lite)         | F     | F      | O(trig)      | R     |
| `chore`    | R (lite) | R (lite)         | F     | F      | F            | R     |
| `docs`     | R (lite) | R (lite)         | F     | F      | F            | R     |
| `style`    | R (lite) | R (lite)         | F     | F      | F            | R     |
| `test`     | R (lite) | R (lite)         | F     | F      | F            | R     |

`tasks` is required everywhere and always tracked by `apply`. Optional artifacts
never gate — you can still author them
(`cospec instructions <artifact> --change <slug>` works for any declared
artifact), they just don't block `apply` or `archive` if left out.

## `## Surfaces` — the soft-nudge block

Every type except the four no-surface light types (`chore`, `docs`, `style`,
`test`) gets a closed, all-optional `## Surfaces` checkbox block in its proposal
template:

```markdown
## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology
- [ ] integration — a third-party/external contract
- [ ] agent-behavior — prompts, tools, model routing, agent output shape
```

These four tokens are the only ones the block accepts. Checking a flag never
hard-requires anything by itself — it soft-promotes an otherwise-optional
`verification` row or `design` section into the soft-blocker set at `apply`.
Leaving every box unchecked changes nothing.

::: tip For `revert` / `build` / `ci`, checking any `## Surfaces` flag (or, for
build/ci, specifically `deploy`) is what nudges `verification` from O(trig) into
a soft blocker. A flag-free change of one of these types stays a genuinely
two-minute ceremony. :::

The full exit-code semantics for `apply` — including how a soft blocker (exit 3)
differs from a hard blocker (exit 2) — live on
[Apply and archive](/concepts/apply-and-archive).

## Per-type rationale

- **`feat`** is the only type gated on `specs` — a new feature that changes no
  capability's spec is almost always mis-typed. Its `verification` requirement
  also gates on a "verified the wrong layer" rule: a `[critical]` behavior group
  whose only evidence row is `@unit` doesn't count.
- **`fix`** leaves `specs` optional but requires `verification` with a mandatory
  regression row — a fix whose defect the suite never actually exercised is
  worthless. Add a spec delta only when the bug meant the _living spec_ itself
  was wrong.
- **`perf`** requires `verification` rows that prove behavior twice: one row
  tied to a benchmark, one proving the speedup didn't change behavior.
- **`refactor`** is the only type that requires `design` — it must also prove an
  invariant: the existing suite passes unchanged.
- **`revert` / `build` / `ci`** stay light by covenant: `verification` is
  soft-promoted only if you check a `## Surfaces` flag, never hard-required.
- **`chore` / `docs` / `style` / `test`** forbid `verification` outright. These
  types have no runtime behavior surface to exercise — a `test` change is its
  own verification, a `style` change is "no semantic diff." Forbidding rather
  than merely making optional is what protects the two-minute covenant for these
  four; they also omit `## Surfaces` entirely.

## Schema versioning and grandfathering

Every schema carries a `version`, currently `2` (bumped from `1` when
`verification` was introduced). `cospec new` stamps a change's `.openspec.yaml`
with the schema version current at creation time; changes created before
`verification` existed have no stamp and are treated as `schemaVersion: 1`.

`apply` and `archive` compute their required-artifact set from
`(type, schemaVersion)`, filtered to artifacts that existed at that schema
version — so a `schemaVersion: 1` `feat` or `fix` change is never retroactively
gated on `verification`. No in-flight change gets blocked by a schema expansion
after the fact.

`cospec validate` emits a non-blocking INFO naming `cospec migrate` for any
change still on `schemaVersion: 1`. Running `cospec migrate <slug>` scaffolds a
deferred `verification.md` (every row marked
`[~] defer: pre-v2 change, verified out-of-band`) and bumps the change's stamp
to the current version. `cospec doctor` lists every change still sitting on an
old schema version. Nothing runs this automatically — migration is opt-in, one
change at a time.

For the customization tiers available on top of the eleven built-in schemas —
`openspec/config.yaml` rules, and forking a schema as an escape hatch — see
[Configuration reference](/reference/configuration).
