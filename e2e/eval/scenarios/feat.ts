// Scenario A — feat lifecycle (DESIGN §8.4). The model is asked to create and
// fully land a feat change end-to-end; the rubric scores structural outcomes
// only. 30 turns, 10 pts.

import {
  changeFiles,
  changeSchema,
  createSandbox,
  declaredArtifactFiles,
  driveAgent,
  livingSpecText,
  readFileOr,
  resolveChange,
  runCospec,
  teardown,
  type EvalContext,
  type Scenario,
} from '../context.ts'
import { FEAT_RUBRIC } from '../score.ts'

const USER_PROMPT =
  'Using the cospec workflow, create and fully land a `feat` change that adds a ' +
  'greeting endpoint (GET /greeting returning a short greeting message) to the ' +
  'sample project. Author every required artifact, validate with --strict, run ' +
  'apply, implement and check off all tasks, then archive. Keep working until ' +
  '`cospec archive` reports success. (ref: EVAL-FEAT-7Q2)'

const DECLARED = declaredArtifactFiles('feat')

function artifactSetOk(files: readonly string[]): boolean {
  const present = new Set(files)
  const noForbidden = files.every((f) => DECLARED.has(f) || f.startsWith('specs/'))
  const hasRequired =
    present.has('proposal.md') &&
    present.has('blocking-changes.md') &&
    present.has('tasks.md') &&
    files.some((f) => f.startsWith('specs/') && f.endsWith('.md'))
  return noForbidden && hasRequired
}

export const featScenario: Scenario = {
  id: 'feat',
  title: 'feat lifecycle',
  rubric: FEAT_RUBRIC,
  execute: async (ctx: EvalContext) => {
    const sandbox = await createSandbox(ctx.repoRoot)
    try {
      const run = await driveAgent(ctx, sandbox, USER_PROMPT, 30)
      const change = await resolveChange(sandbox)
      const passed: Record<string, boolean> = {}

      const schema = change ? await changeSchema(sandbox, change.dir) : undefined
      passed['schema-feat'] = schema === 'feat'

      const files = change ? await changeFiles(sandbox, change.dir) : []
      passed['artifact-set'] = artifactSetOk(files)

      // A change cannot be archived unless full validation (incl. strict) passed
      // (§5.2 step 2); for a still-active change we re-run it directly.
      if (change?.archived === true) {
        passed['validate-strict'] = true
      } else if (change !== undefined) {
        const v = await runCospec(sandbox, ctx.repoRoot, ['validate', change.slug, '--strict'])
        passed['validate-strict'] = v.exitCode === 0
      } else {
        passed['validate-strict'] = false
      }

      const blockers = change
        ? await readFileOr(sandbox, `${change.dir}/blocking-changes.md`)
        : undefined
      passed['blockers-parse'] =
        blockers !== undefined &&
        /^## Blocked by\s*$/m.test(blockers) &&
        /^## Soft-blocked by\s*$/m.test(blockers)

      passed['apply-clear'] = run.toolCalls.some(
        (c) =>
          c.name === 'run_command' && /^cospec apply\b/.test(command(c.input)) && c.exitCode === 0,
      )

      const tasks = change ? await readFileOr(sandbox, `${change.dir}/tasks.md`) : undefined
      passed['tasks-checked'] =
        tasks !== undefined && /- \[x\] /i.test(tasks) && !/- \[ \] /.test(tasks)

      passed['archive-ok'] = change?.archived === true

      passed['spec-added'] = /^### Requirement:/m.test(await livingSpecText(sandbox))

      return { turns: run.turns, passed, transcript: run.transcript }
    } finally {
      await teardown(sandbox)
    }
  },
}

function command(input: Record<string, unknown>): string {
  return typeof input['command'] === 'string' ? input['command'] : ''
}
