# Schemas

cospec ships eleven schemas — one per conventional-commit type. A change's type
is its schema, recorded as `schema: <type>` in `.openspec.yaml` and written by
`cospec new`. There are no name prefixes and no parallel metadata.

## The six canonical artifacts

Every schema is composed from the same six hand-authored artifacts. Types differ
only in which artifacts they declare and require, and in which instruction
variant they use.

| artifact           | generates             | role                                                      |
| ------------------ | --------------------- | --------------------------------------------------------- |
| `proposal`         | `proposal.md`         | Why / What Changes / (Capabilities) / (Surfaces) / Impact |
| `blocking-changes` | `blocking-changes.md` | cross-change dependency ledger                            |
| `specs`            | `specs/**/*.md`       | delta specs (ADDED/MODIFIED/REMOVED/RENAMED)              |
| `design`           | `design.md`           | Context / Goals / Decisions / Risks                       |
| `verification`     | `verification.md`     | per-behavior acceptance-evidence ledger (machine-parsed)  |
| `tasks`            | `tasks.md`            | numbered checkbox groups tracked during apply             |

`quality.md` and `rollout.md` were considered and rejected as vendor-coupled or
duplicative of `verification`/`design`. Teams that want more use
`openspec/config.yaml` (`context`/`rules`) or fork a schema.

### `verification` — the acceptance-evidence ledger

`verification` closes the "green CI, broken behavior" gap: every observable
behavior gets a group, and every row names the **layer** it must be exercised
at, **who** runs it, and the **recorded evidence**. It reuses the checkbox lexer
(`## N. Group` / `- [ ] N.M …`), the same house grammar as `tasks.md`, rather
than introducing YAML frontmatter.

```
## 1. <behavior description> [critical]
- [ ] 1.1 @e2e (agent) drive the real flow end to end -> <expected/observed>
- [~] 1.2 @manual (human) exercise the interactive surface -> defer: <reason>
```

- **Group** `## N. <text>` — one observable behavior; optional trailing
  `[critical]` marks a behavior whose breakage ships a broken product.
- **Row state** `[ ]` planned, `[x]` verified-with-evidence, `[~]` deferred
  (requires `defer: <reason>`).
- **`@<layer>`** — a closed vocabulary:
  `@unit @integration @e2e @manual @runtime @regression @equivalence @benchmark @eval`.
  Extend per project via `openspec/config.yaml` (`verification.layers`); an
  unknown token is fail-closed (`verification/layer-unknown`).
- **`(<owner>)`** — optional, `(agent)` or `(human)`. Default: `@manual` ⇒
  `(human)`, everything else ⇒ `(agent)`. A `(human)`/`@manual` row is flagged
  in reports as CI-uncatchable.
- **` -> <result>`** is required on every row; a checked (`[x]`) row's result
  must be non-empty (`verification/evidence-required`) — that is what makes
  "recorded evidence before archive" mechanical.

Each type that requires `verification` has a distinct required-row fact — `feat`
needs a non-`@unit` row on every `[critical]` group, `fix` needs an
`@regression` row, `perf` needs both `@benchmark` and `@equivalence`, `refactor`
needs `@equivalence`. See [validation.md](validation.md) for the full rule
table.

### `proposal` → `## Surfaces`

Every type except `chore`/`docs`/`style`/`test` gains a closed, all-optional
`## Surfaces` checkbox block in its proposal template:

```
## Surfaces
- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology
- [ ] integration — a third-party/external contract
- [ ] agent-behavior — prompts, tools, model routing, agent output shape
```

These are the only four tokens the block accepts (`proposal/surfaces-vocab`).
Checking a flag never hard-requires anything — it soft-promotes a `verification`
row or a `design` section (see [validation.md](validation.md)
`meta/surface-unmet`, `design/*`). An unchecked block changes nothing; the four
no-surface light types omit the block entirely.

## The artifact matrix

Each type declares each artifact in one of four states:

- **R** (required) — declared and in `apply.requires`; mechanically gated.
- **O** (optional) — declared, not in `apply.requires`; instructions and
  templates are available and `status` shows it, but `apply` does not gate on
  it.
- **O(trig)** (optional, soft-promoted) — declared, not in `apply.requires`, but
  a checked `## Surfaces` flag turns its absence into an exit-3 soft blocker at
  `apply` (`--allow-soft` clears it) and a WARNING at `validate` (ERROR under
  `--strict`). Never a hard require — the static matrix never changes shape at
  gate time.
- **F** (forbidden) — not declared; `cospec validate` raises
  `meta/forbidden-artifact` if the file exists.

| type       | proposal | blocking-changes | specs | design | **verification** | tasks | `apply.requires`                                        |
| ---------- | -------- | ---------------- | ----- | ------ | ---------------- | ----- | ------------------------------------------------------- |
| `feat`     | R (full) | R (full)         | **R** | O      | **R**            | R     | proposal, blocking-changes, specs, verification, tasks  |
| `fix`      | R (full) | R (full)         | O     | O      | **R**            | R     | proposal, blocking-changes, verification, tasks         |
| `perf`     | R (full) | R (full)         | O     | O      | **R**            | R     | proposal, blocking-changes, verification, tasks         |
| `refactor` | R (full) | R (full)         | O     | **R**  | **R**            | R     | proposal, blocking-changes, design, verification, tasks |
| `revert`   | R (full) | R (full)         | O     | F      | O(trig)          | R     | proposal, blocking-changes, tasks                       |
| `build`    | R (lite) | R (lite)         | F     | F      | O(trig)          | R     | proposal, blocking-changes, tasks                       |
| `ci`       | R (lite) | R (lite)         | F     | F      | O(trig)          | R     | proposal, blocking-changes, tasks                       |
| `chore`    | R (lite) | R (lite)         | F     | F      | F                | R     | proposal, blocking-changes, tasks                       |
| `docs`     | R (lite) | R (lite)         | F     | F      | F                | R     | proposal, blocking-changes, tasks                       |
| `style`    | R (lite) | R (lite)         | F     | F      | F                | R     | proposal, blocking-changes, tasks                       |
| `test`     | R (lite) | R (lite)         | F     | F      | F                | R     | proposal, blocking-changes, tasks                       |

Only the **verification** column and the four `apply.requires` rows for
feat/fix/perf/refactor changed from the five-artifact matrix. Every other cell
is unchanged. `TYPE_ARTIFACTS` in `apps/cli/src/core/rules/type-facts.ts`
mirrors this table by hand; a matrix-parity test
(`apps/cli/test/unit/schemas/matrix-parity.test.ts`) asserts it is
byte-identical to what `schema-compose.ts` composes from canon, across all 11
types × 6 artifacts — closing the "two hand-mirrored matrices, no cross-check"
risk this expansion doubled down on.

## Per-type rationale

- **feat is gated on specs and on verification's `critical-real-layer` rule.** A
  new feature that changes no capability's spec is almost always mis-typed. A
  `[critical]` behavior group whose only row is `@unit` is exactly the "verified
  the wrong layer" failure mode (mocked auth, unhydrated islands, orphaned
  wiring) this rule exists to catch.
- **fix specs are optional; verification's `reproduces-bug` rule is not.** A fix
  whose defect the suite never actually exercised is worthless — the required
  `@regression` row forces failing-before/passing-after evidence. Create a spec
  delta only when the bug means the living spec itself was wrong.
- **perf keeps behavior identical and now proves it twice.** The proposal still
  needs `## Benchmarks`; verification's `equivalence` rule additionally requires
  both a `@benchmark` row (ties to the benchmark) and a separate `@equivalence`
  row (the speedup did not change behavior).
- **refactor requires design, allows only RENAMED specs, and proves the
  invariant.** `design.md` is required and gains a mandatory `## Seam ownership`
  section; verification's `invariant` rule requires an `@equivalence` row (the
  existing suite passes unchanged) — the tokenmania seam-drift failure mode.
- **revert / build / ci soft-promote verification, never require it.** These
  stay light by covenant; checking `## Surfaces` `deploy` (build/ci) or any flag
  (revert) nudges verification into the soft-blocker set at apply, but a
  flag-free change stays a two-minute, verification-free ceremony.
- **chore / docs / style / test forbid verification entirely.** These types have
  no runtime behavior surface to exercise — a `test` change is its own
  verification, `style` is "no semantic diff." Forbidding (not "optional") is
  what protects the covenant; these four also omit `## Surfaces`.

## The requires graph

Artifacts build in dependency order (`ARTIFACT_ORDER`:
`proposal, blocking-changes, specs, design, verification, tasks`):

- `blocking-changes`, `specs`, `design`, `verification` each require `proposal`.
- `tasks` requires `proposal`, plus `specs` where specs is required (feat), plus
  `design` where design is required (refactor). **`tasks` does NOT require
  `verification`** — "the plan exists before implementation" property comes from
  `verification` being in `apply.requires`, exactly as it already does for
  `blocking-changes`; an extra `requires` edge would only over-constrain
  authoring order.

Optional artifacts are never in another artifact's `requires` — that would
deadlock the next-artifact computation. Every schema sets
`apply.tracks: tasks.md`.

## Schema versioning and grandfathering

The composer stamps `version: 2` into every schema (bumped from `1` when
`verification` was introduced). `cospec new` stamps the change's
`.openspec.yaml` with `schemaVersion: 2`; a change created before this expansion
has no stamp and is treated as `schemaVersion: 1`.

`apply` and `archive` both compute `enforcedApplyRequires(type, schemaVersion)`
— the static `apply.requires` set above, filtered to artifacts whose
`introducedAt(artifact, type)` is `<= schemaVersion`. `verification` is
`introducedAt = 2` for feat/fix/perf/refactor and `1` for everything else, so a
`schemaVersion: 1` change is never gated on `verification` — no in-flight change
is retroactively blocked by this expansion. `cospec validate` emits a
non-blocking `meta/schema-outdated` INFO naming `cospec migrate` for any change
still on `schemaVersion: 1`. `cospec migrate <slug>` scaffolds a deferred
`verification.md` (`[~] defer: pre-v2 change, verified out-of-band` on every
row) and bumps the stamp to 2; `cospec doctor` lists changes still on
`schemaVersion: 1`. Nothing runs this automatically — migration is opt-in, one
change at a time.

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
