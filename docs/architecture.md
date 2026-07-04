# Architecture

cospec is a wrapper. It owns no spec-format logic of its own that OpenSpec
already implements correctly — it constrains, validates, and verifies OpenSpec
`1.3.1`, and closes the specific failure modes that make raw OpenSpec unsafe to
hand to an agent.

## The wrapping boundary

cospec spawns OpenSpec; it never imports it.

- **Resolution by path, never `$PATH`.** `core/openspec.ts` resolves the binary
  with `Bun.resolveSync('@fission-ai/openspec/package.json', import.meta.dir)`
  and spawns `bun <pkgdir>/bin/openspec.js <args>` with `--no-color` and `cwd`
  set to the target repo. The runtime copy is the pinned package dependency of
  `apps/cli`, not whatever happens to be on the developer's `$PATH`.
- **Never `import` the package.** Importing OpenSpec's root runs
  `program.parse()` as a side effect. Deep-importing its `dist/*` internals is
  also forbidden — those are not a stable interface.
- **Version assertion.** Before the first wrapped call in a process, cospec
  asserts `openspec --version === '1.3.1'` (the `EXPECTED_OPENSPEC_VERSION`
  constant). A mismatch exits 1 with a refusal message and a
  `COSPEC_ALLOW_OPENSPEC_DRIFT=1` override for the brave. The dep pin, the
  constant, and the version tripwire contract test are asserted mutually equal,
  so a bump breaks the test suite first.

## The wrapped-call discipline

Every call site into OpenSpec declares three things:

1. **Expected exit codes** — the set that counts as success for this call.
2. **A stdout deny-list** — patterns that mean failure even at exit 0, e.g.
   `/\bAborted\b/`, `/\bArchive cancelled\b/`, `/\bSkipped\b/` where applicable.
3. **An observable post-condition** — a filesystem or JSON-shape check that
   proves the call did what it claimed.

The rule behind all three: **trust post-conditions, never exit codes alone.**
OpenSpec can exit 0 and still have done nothing (see below). A wrapped call
without a registered post-condition is a review-blocking omission.

## The failure modes cospec defends against

cospec exists because three OpenSpec behaviors are hazardous when an agent is
driving.

### 1. `openspec validate` false-errors on schemas without deltas

OpenSpec has a hardcoded `CHANGE_NO_DELTAS` rule: a change with no spec deltas
fails validation. But a `ci` or `docs` change legitimately has no deltas. cospec
runs its own rule families over every change and only delegates to
`openspec validate` for changes whose schema declares a `specs` artifact and
that actually have delta files — so the one suppressed check is suppressed only
where satisfying it is definitionally wrong. See [validation.md](validation.md).

### 2. `openspec archive` exits 0 but silently aborts

When a delta cannot merge (a MODIFIED target that does not exist, a zero-op
delta), OpenSpec prints `Aborted` and **exits 0 without moving the change**. An
agent trusting the exit code would believe the change shipped. cospec's archive
verifier (see [apply-archive.md](apply-archive.md)) checks the filesystem
directly — the change directory must be gone and a dated archive entry must
exist — and reports the abort honestly. Archive preconditions are also checked
at validate time, moving the failure left.

### 3. OpenSpec's generated files reference skills it never generates

OpenSpec's own scaffolding points at `openspec-sync-specs` /
`openspec-continue-change` skills that its generator does not emit — dangling
references that confuse agents. cospec ships all six workflows (`propose`,
`continue`, `apply`, `archive`, `sync-specs`, `explore`) from a single canon
source, and every generated body references only skills the same generator run
emits. A unit test greps the rendered output for dangling references, and
`cospec doctor` enforces the same guard on an installed repo.

## Single source of truth

`apps/cli/src/canon/**` is the only hand-authored schema and workflow content.
Schemas are composed at runtime by `core/schema-compose.ts`; harness files by
`harness/render.ts`. There is no checked-in intermediate `assets/` layer. The
reviewable composed outputs are the golden snapshot files in the unit tests and
this repo's own committed `openspec/schemas/**` and harness directories, both
drift-gated by `generate:check`.

## Module map

```
apps/cli/src/
├── index.ts / cli.ts       argv dispatch, global flags, lazy command import
├── commands/               one file per subcommand
├── core/
│   ├── openspec.ts         spawn wrapper, version assert, post-condition registry
│   ├── change.ts           change discovery, .openspec.yaml, archive index
│   ├── report.ts           the Issue model + text/JSON renderers (frozen interface)
│   ├── managed-files.ts    generatedBy/contentHash protocol + manifest
│   ├── blockers.ts         blocking-changes.md parser, sync, lint
│   ├── deltas.ts           delta parser + archive-precondition checks
│   ├── tasks.ts / proposal.ts
│   ├── schema-compose.ts   canon → schema.yaml + templates per type
│   └── rules/              one module per rule family
├── harness/                per-harness adapters, render, settings merge
└── canon/                  artifacts, types, workflows, gate templates
```
