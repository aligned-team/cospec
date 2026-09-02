# Planted latent bugs

A latent bug seeded ADJACENT to a scenario's task subject — never inside it — in
a majority of fixtures (the 5 "heavy" types: `feat`, `fix`, `perf`, `refactor`,
`revert`). The task prompt never mentions it; it measures whether a workflow's
verification discipline leads the agent to notice and fix a nearby defect it was
never asked to touch, e.g. while reading the file it was asked to edit.

Each plant is declared on its `Scenario`
(`plantedBug: {file, description, detector}` in `scenarios/types.ts`) and has a
dedicated `bun:test` detector here at `scenarios/planted/<id>/`, mirroring
`scenarios/hidden/`'s never-seeded discipline: this directory sits outside every
scenario's `fixtureDir`, so `src/sandbox.ts`'s `createArmSandbox` never seeds it
into the agent's sandbox.

## Mechanism

`src/mechanical.ts`'s `scorePlantedBug` copies `scenarios/planted/<id>/` into
the FINISHED sandbox at `planted-check/` (sibling to `src/`) after the agent
stops, runs `bun test .` there, and parses the pass/fail summary into
`MechanicalMetrics.plantedBugCaught: boolean | null` — `true` when the
detector's `bun test` run reports zero failures (the plant was fixed), `false`
when it reports at least one failure (the plant is still present, or the agent
broke something else in the same file), and `null` when the scenario has no
plant, or the summary couldn't be parsed.

## Deliberately separate from escaped defects

A plant left unfixed is NOT folded into `MechanicalMetrics.hiddenTests` /
`escapedDefectRate` — the primary escaped-defect signal measures whether the
code the arm produced does what the TASK PROMPT asked; a planted bug is, by
construction, adjacent to the prompt and never mentioned by it. Counting it
against the same tally would double-count the same tree against two different
questions. `plantedBugCaught` is reported as its own signal (see
`docs/bench.md`'s "Planted bugs" section) — a defect-adjacent-to-the-task metric
distinct from a defect-in-the-task metric.

## Import convention

Same as `scenarios/hidden/`: every detector file here assumes it is copied to
`<sandbox>/planted-check/`, one level below the fixture root, and imports source
relative to that — `../src/<file>.ts`, never a bare path relative to this
directory's real on-disk location (`scenarios/planted/<id>/`, two levels from
`scenarios/fixtures/<id>/`). These files are excluded from the package's
`tsconfig.json` for the same reason `scenarios/hidden/**` is: `tsgo` cannot
resolve their runtime-only import paths in place, and `bun test` (at score-time,
and in `test/unit/planted.test.ts`'s fail-before/pass-after verification) is the
only thing that ever executes them.

## Verifying both directions

Every plant is verified, in `test/unit/planted.test.ts`, to fail (>0 failures)
against the fixture as seeded, and pass (0 failures) once a scripted, targeted
reference fix (independent of the agent/CLI, and independent of the fixture's
own actual task) is applied — see that file's `PLANTED_FIXES`.
