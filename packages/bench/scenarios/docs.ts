// `docs` scenario — document an existing, unchanged function: a JSDoc comment
// plus a README usage section.

import { spawnIn } from '../src/sandbox.ts'
import type { Scenario } from './types.ts'

const PROMPT =
  'The exported `slugify` function in src/slugify.ts has no documentation: ' +
  "no JSDoc comment above it, and README.md doesn't mention it at all. Add " +
  'a JSDoc comment describing its parameter and return value, and add a ' +
  '`## slugify` section to README.md with a one-line description and an ' +
  "example call showing its output. Don't change slugify's implementation. " +
  '(bench-ref: BENCH-DOCS-SLUGIFY)'

const JSDOC_ABOVE_SLUGIFY = /\/\*\*[\s\S]*?\*\/\s*export (function slugify|const slugify)/

export const docsScenario: Scenario = {
  id: 'docs',
  type: 'docs',
  title: 'docs: document slugify',
  prompt: PROMPT,
  fixtureDir: 'fixtures/docs',
  maxTurns: 30,
  completed: async ({ sandbox, readFile }) => {
    const src = await readFile('src/slugify.ts')
    if (src === undefined || !JSDOC_ABOVE_SLUGIFY.test(src)) return false

    const readme = await readFile('README.md')
    if (readme === undefined || !/##[^\n]*slugify/i.test(readme)) return false

    const result = await spawnIn(['bun', 'test'], sandbox)
    return result.exitCode === 0
  },
}
