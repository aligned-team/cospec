// Held-out hidden test suite for the `ci` scenario — see
// `packages/bench/scenarios/hidden/README.md` for the copy/import convention.
// Discriminating: the unmodified fixture has no workflow file at all, so
// every structural check fails until one is added correctly. The src/index.ts
// check additionally guards the prompt's explicit "don't touch src/" constraint.

import { expect, test } from 'bun:test'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const WORKFLOW = join(ROOT, '.github/workflows/lint.yml')

/** Lines directly under `jobs:` at exactly 2-space indent, ending in `:` — one per job key. */
function jobKeyLines(yaml: string): string[] {
  const lines = yaml.split('\n')
  const jobsIdx = lines.findIndex((l) => /^jobs:\s*$/.test(l))
  if (jobsIdx === -1) return []
  const out: string[] = []
  for (const line of lines.slice(jobsIdx + 1)) {
    if (/^\S/.test(line)) break // dedented back to a top-level key — jobs: block ended
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(line)) out.push(line.trim())
  }
  return out
}

test('workflow triggers on pull_request', async () => {
  const yaml = await Bun.file(WORKFLOW).text()
  const onIdx = yaml.search(/^on:/m)
  expect(onIdx).toBeGreaterThanOrEqual(0)
  const onBlock = yaml.slice(onIdx, onIdx + 200)
  expect(/pull_request/.test(onBlock)).toBe(true)
})

test('workflow declares exactly one job (single minimal job, per the prompt)', async () => {
  const yaml = await Bun.file(WORKFLOW).text()
  expect(jobKeyLines(yaml)).toHaveLength(1)
})

test('the job declares a runs-on executor (not an empty scaffold)', async () => {
  const yaml = await Bun.file(WORKFLOW).text()
  expect(/runs-on:/.test(yaml)).toBe(true)
})

test('src/index.ts is untouched — ping() still returns "pong"', async () => {
  const mod = (await import('../src/index.ts')) as { ping?: () => string }
  expect(typeof mod.ping).toBe('function')
  expect(mod.ping?.()).toBe('pong')
})
