# Schemas

cospec ships eleven schemas — one per conventional-commit type. A change's type
is its schema, recorded as `schema: <type>` in `.openspec.yaml` and written by
`cospec new`. There are no name prefixes and no parallel metadata.

## The five canonical artifacts

Every schema is composed from the same five hand-authored artifacts. Types
differ only in which artifacts they declare and require, and in which
instruction variant they use.

| artifact           | generates             | role                                          |
| ------------------ | --------------------- | --------------------------------------------- |
| `proposal`         | `proposal.md`         | Why / What Changes / (Capabilities) / Impact  |
| `blocking-changes` | `blocking-changes.md` | cross-change dependency ledger                |
| `specs`            | `specs/**/*.md`       | delta specs (ADDED/MODIFIED/REMOVED/RENAMED)  |
| `design`           | `design.md`           | Context / Goals / Decisions / Risks           |
| `tasks`            | `tasks.md`            | numbered checkbox groups tracked during apply |

Not shipped at launch: `rollout.md`, `quality.md`, `verification.md`. Teams that
want more use `openspec/config.yaml` (`context`/`rules`) or fork a schema.

## The artifact matrix

Each type declares each artifact in one of three states:

- **R** (required) — declared and in `apply.requires`; mechanically gated.
- **O** (optional) — declared, not in `apply.requires`; instructions and
  templates are available and `status` shows it, but `apply` does not gate on
  it.
- **F** (forbidden) — not declared; `cospec validate` raises
  `meta/forbidden-artifact` if the file exists.

| type       | proposal | blocking-changes | specs | design | tasks | `apply.requires`                          |
| ---------- | -------- | ---------------- | ----- | ------ | ----- | ----------------------------------------- |
| `feat`     | R (full) | R (full)         | **R** | O      | R     | proposal, blocking-changes, specs, tasks  |
| `fix`      | R (full) | R (full)         | O     | O      | R     | proposal, blocking-changes, tasks         |
| `perf`     | R (full) | R (full)         | O     | O      | R     | proposal, blocking-changes, tasks         |
| `refactor` | R (full) | R (full)         | O     | **R**  | R     | proposal, blocking-changes, design, tasks |
| `revert`   | R (full) | R (full)         | O     | F      | R     | proposal, blocking-changes, tasks         |
| `build`    | R (lite) | R (lite)         | F     | F      | R     | proposal, blocking-changes, tasks         |
| `ci`       | R (lite) | R (lite)         | F     | F      | R     | proposal, blocking-changes, tasks         |
| `chore`    | R (lite) | R (lite)         | F     | F      | R     | proposal, blocking-changes, tasks         |
| `docs`     | R (lite) | R (lite)         | F     | F      | R     | proposal, blocking-changes, tasks         |
| `style`    | R (lite) | R (lite)         | F     | F      | R     | proposal, blocking-changes, tasks         |
| `test`     | R (lite) | R (lite)         | F     | F      | R     | proposal, blocking-changes, tasks         |

## Per-type rationale

- **feat is gated on specs.** A new feature that changes no capability's spec is
  almost always mis-typed. Requiring the delta forces the spec to stay honest.
- **fix specs are optional.** Create them only when the bug means the living
  spec itself was wrong (a MODIFIED requirement with the corrected content plus
  a regression scenario). If only the implementation was wrong, no delta.
- **perf keeps behavior identical.** The proposal must include a `## Benchmarks`
  section with a before/after row naming the metric and how it was measured. If
  a requirement changes, it is a `feat` or `fix`, not a `perf`.
- **refactor requires design and allows only RENAMED specs.** Structure
  decisions are the load-bearing artifact, so `design.md` is required. Any
  ADDED/MODIFIED/REMOVED delta means the work is not a refactor.
- **revert requires a citation.** The proposal must include a `## Reverts`
  section naming a backticked archived change slug and/or a 7–40-hex commit
  hash. If the reverted change carried spec deltas, write the inverse deltas so
  living specs match reality.
- **The light types** (`build`, `ci`, `chore`, `docs`, `style`, `test`) forbid
  specs and design and use the lite proposal/blocking instructions — three short
  artifacts, no ceremony.

## The requires graph

Artifacts build in dependency order:

- `blocking-changes`, `specs`, `design` each require `proposal`.
- `tasks` requires `proposal`, plus `specs` where specs is required (feat), plus
  `design` where design is required (refactor).

Optional artifacts are never in another artifact's `requires` — that would
deadlock the next-artifact computation. Every schema sets
`apply.tracks: tasks.md`.

## Customization tiers

Three strictly separated tiers:

1. **cospec-managed** — `openspec/schemas/**`, harness files, and gate files.
   Regenerated by `cospec update` and protected by the managed-file protocol
   (see [harness-integration.md](harness-integration.md)). Never hand-edit;
   header comments point you to the right customization channel.
2. **user-owned** — `openspec/config.yaml` (`context` plus per-artifact `rules`,
   which OpenSpec injects into instructions natively) and all change and spec
   content. Never rewritten by cospec.
3. **escape hatch** — `openspec schema fork <type> <custom-name>` plus
   per-change `--schema`. cospec treats non-eleven schemas as **legacy**:
   structural checks only, OpenSpec-delegated validation, and a `doctor` note
   about reduced guarantees. cospec never manages forked schemas.

**Documented limitation:** `config.yaml` `rules` are keyed by artifact id
repo-wide — they cannot vary per type. Per-type guidance lives only in the
schema instruction prose. If you need genuinely different rules per type, fork
the schema.
