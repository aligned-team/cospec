// `style` scenario — reformat to the project's own documented style guide
// with no behavior change. NOTE: src/format.ts is deliberately seeded
// violating THIS repo's oxfmt conventions too (double quotes, semicolons) —
// that is the bug under test, not a defect in this fixture. It is expected to
// fail this repo's own `oxfmt --check` until the agent (or a human) fixes it
// in the sandbox copy; the fixture itself is intentionally never reformatted.

import { spawnIn } from '../src/sandbox.ts'
import type { Scenario } from './types.ts'

const PROMPT =
  "src/format.ts violates this project's documented style rules in " +
  'STYLE.md (single quotes, no semicolons, trailing commas in multiline ' +
  'literals). Reformat src/format.ts to comply — style only, do not change ' +
  'any behavior; the tests in src/format.test.ts must keep passing exactly ' +
  'as-is. (bench-ref: BENCH-STYLE-FORMAT)'

export const styleScenario: Scenario = {
  id: 'style',
  type: 'style',
  title: 'style: reformat to STYLE.md',
  prompt: PROMPT,
  fixtureDir: 'fixtures/style',
  maxTurns: 30,
  completed: async ({ sandbox, readFile }) => {
    const src = await readFile('src/format.ts')
    if (src === undefined) return false
    if (/"/.test(src)) return false
    if (/;/.test(src)) return false
    if (!/,\s*\n\s*}/.test(src)) return false

    const result = await spawnIn(['bun', 'test'], sandbox)
    return result.exitCode === 0
  },
}
