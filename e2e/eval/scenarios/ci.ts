// Scenario B — ci lifecycle (DESIGN §8.4). Proportionality probe: the light
// type must produce exactly three artifacts and no specs/ dir. 28 turns, 6 pts.

import {
  changeFiles,
  changeSchema,
  createSandbox,
  declaredArtifactFiles,
  driveAgent,
  readFileOr,
  resolveChange,
  runCospec,
  teardown,
  type EvalContext,
  type Scenario,
} from '../context.ts'
import { CI_RUBRIC } from '../score.ts'

const USER_PROMPT =
  'Using the cospec workflow, create and fully land a `ci` change that adds an ' +
  'actionlint workflow to the sample project. Author the artifacts this light ' +
  'type requires, validate with --strict, apply, check off all tasks, then ' +
  'archive. A ci change must not create any specs. (ref: EVAL-CI-4K9)'

// ci declares proposal/blocking-changes/tasks (required) plus verification
// (optional, DESIGN §3.2 "O") — a model may author verification.md without
// violating proportionality, so it must not be scored as a forbidden file.
const DECLARED = declaredArtifactFiles('ci')

function artifactSetOk(files: readonly string[]): boolean {
  const present = new Set(files)
  const noSpecs = !files.some((f) => f.startsWith('specs/'))
  const noForbidden = files.every((f) => DECLARED.has(f))
  const hasRequired =
    present.has('proposal.md') && present.has('blocking-changes.md') && present.has('tasks.md')
  return noSpecs && noForbidden && hasRequired
}

export const ciScenario: Scenario = {
  id: 'ci',
  title: 'ci lifecycle',
  rubric: CI_RUBRIC,
  execute: async (ctx: EvalContext) => {
    const sandbox = await createSandbox(ctx.repoRoot)
    try {
      const run = await driveAgent(ctx, sandbox, USER_PROMPT, 28)
      const change = await resolveChange(sandbox)
      const passed: Record<string, boolean> = {}

      const schema = change ? await changeSchema(sandbox, change.dir) : undefined
      passed['schema-ci'] = schema === 'ci'

      const files = change ? await changeFiles(sandbox, change.dir) : []
      passed['artifact-set'] = artifactSetOk(files)

      if (change?.archived === true) {
        passed['validate-strict'] = true
      } else if (change !== undefined) {
        const v = await runCospec(sandbox, ctx.repoRoot, ['validate', change.slug, '--strict'])
        passed['validate-strict'] = v.exitCode === 0
      } else {
        passed['validate-strict'] = false
      }

      const applied = run.toolCalls.some(
        (c) =>
          c.name === 'run_command' && /^cospec apply\b/.test(command(c.input)) && c.exitCode === 0,
      )
      const tasks = change ? await readFileOr(sandbox, `${change.dir}/tasks.md`) : undefined
      const tasksChecked = tasks !== undefined && /- \[x\] /i.test(tasks) && !/- \[ \] /.test(tasks)
      passed['apply-tasks'] = applied && tasksChecked

      passed['archive-ok'] = change?.archived === true

      return { turns: run.turns, passed, transcript: run.transcript }
    } finally {
      await teardown(sandbox)
    }
  },
}

function command(input: Record<string, unknown>): string {
  return typeof input['command'] === 'string' ? input['command'] : ''
}
