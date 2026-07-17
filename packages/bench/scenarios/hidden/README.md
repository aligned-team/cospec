# Hidden (held-out) test suites

One `bun:test` suite per scenario id, living **outside** `scenarios/fixtures/`
on purpose: `src/sandbox.ts`'s `createArmSandbox` only ever copies a scenario's
`fixtureDir` into the agent's sandbox, so nothing under this directory is ever
seeded — the agent never sees these tests while doing the task.

`src/mechanical.ts`'s `scoreHiddenTests` copies a scenario's `hidden/<id>/` into
the FINISHED sandbox (at `hidden-tests/`, sibling to `src/`) after the agent run
completes, then runs `bun test .` there and parses the pass/fail summary. This
is the benchmark's mechanical, tool-neutral escaped-defect signal — see
`docs/bench.md`'s "Escaped defects" section for the full rationale and report
wiring.

## Import convention

Every test file here assumes it will be copied to `<sandbox>/hidden-tests/`, one
level below the fixture root, and imports source relative to that:
`../src/<file>.ts`, `../package.json`, etc. — never a bare path relative to this
directory's real location in the repo (which sits at `scenarios/hidden/<id>/`,
two levels from `scenarios/fixtures/<id>/`). Because of this, these files are
**excluded** from the package's `tsconfig.json` (see its `exclude`) — `tsgo`
cannot resolve their runtime-only import paths from their real on-disk location,
and `bun test` (used both by the harness at score-time and by
`test/unit/hidden.test.ts`'s fail-before/pass-after verification) is the only
thing that ever actually executes them.

## Where a function doesn't exist yet on the unmodified fixture

Scenarios whose task adds a new export (`feat`) use a dynamic
`await import('../src/....ts')` and access the export off the resulting
namespace object, rather than a static named import — a static import of a
binding an ES module doesn't (yet) export throws at module-link time and fails
the whole file in one lump, which still counts as a failure but loses per-test
granularity. The dynamic form fails each affected `test()` block individually
instead.

## Design note: not every case discriminates before/after on its own

For behavior-preserving task types (`refactor`, `style`, `chore`, `docs`,
`test`), the completion criterion is structural (a file exists / a pattern
changed) rather than behavioral — the underlying behavior was already correct
before the task and must stay correct after. Those suites mix a
structural/content check that DOES fail on the unmodified fixture with a few
behavior-regression checks that guard against the agent breaking something while
doing the structural change (which is the actual risk a "hidden test" is there
to catch for that task shape). For behavior-changing types (`feat`, `fix`,
`perf`, `revert`, `build`, `ci`), every case is written to fail on the
unmodified fixture and pass on a correct implementation — verified both
directions in `test/unit/hidden.test.ts` via a scripted reference fix per
scenario.
