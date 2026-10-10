// design D11 (task 10.1): the tasks instruction the wrapped binary serves for a new change
// tells the agent that archiving is not a task. The default (feat) and an override type (fix)
// both take the path through schema-compose, so both are asserted.

import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test'

import { cleanupAll, cospec, mkTempRepo } from '../fixtures/support.ts'

afterAll(cleanupAll)

setDefaultTimeout(120_000)

const PARAGRAPH =
  'Archiving is not a task: `cospec archive` validates the change and moves it, and a task ' +
  'describing it can only be completed by the step that refuses it while the change is open. ' +
  "End the list at the last implementation or documentation task. Where the repo's flow lands " +
  'the archive as a commit after the last task, end that task\'s description with "The archive ' +
  'commit follows this one" so it can be ticked before the archive.'

async function newChange(type: string, slug: string): Promise<string> {
  const root = mkTempRepo({ fixture: 'fresh', git: true })
  const init = await cospec(['init', '--yes', '--harness', 'claude', '--no-gate'], { cwd: root })
  expect(init.exitCode).toBe(0)
  const created = await cospec(['new', type, slug], { cwd: root })
  expect(created.exitCode).toBe(0)
  return root
}

describe('cospec instructions tasks serves the archive paragraph (design D11, task 10.1)', () => {
  for (const type of ['feat', 'fix']) {
    test(`${type}: the tasks instruction of a new change carries the paragraph`, async () => {
      const slug = `tasks-${type}`
      const root = await newChange(type, slug)
      const run = await cospec(['instructions', 'tasks', '--change', slug, '--json'], {
        cwd: root,
      })
      expect(run.exitCode).toBe(0)
      const doc = JSON.parse(run.stdout) as { instruction: string }
      expect(doc.instruction.replace(/\s+/g, ' ')).toContain(PARAGRAPH)
    })
  }
})
