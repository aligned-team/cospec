// `ci` scenario — add a GitHub Actions workflow. A `ci` change must not touch
// application source (canon: `ci` forbids specs/design and the type's own
// instructions warn against modifying app source), so the fixture ships a
// tiny src/ tree specifically so an over-eager agent has something to
// (incorrectly) touch — the completion predicate only checks the workflow.

import type { Scenario } from './types.ts'

const PROMPT =
  'Add a GitHub Actions workflow at `.github/workflows/lint.yml` that runs ' +
  "actionlint against this repo's own workflow files on every pull request. " +
  "Keep it to a single minimal job — this is a CI-only change, so don't " +
  'touch `src/`. (bench-ref: BENCH-CI-ACTIONLINT)'

export const ciScenario: Scenario = {
  id: 'ci',
  type: 'ci',
  title: 'ci: add an actionlint workflow',
  prompt: PROMPT,
  fixtureDir: 'fixtures/ci',
  maxTurns: 70,
  completed: async ({ readFile }) => {
    const workflow = await readFile('.github/workflows/lint.yml')
    return workflow !== undefined && /actionlint/i.test(workflow)
  },
}
