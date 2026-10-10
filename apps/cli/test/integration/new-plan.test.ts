// `cospec new <type> <slug>` prints the typed artifact plan. The plan line must name every
// artifact the type requires before apply (issue #71), and stay consistent with `--json`.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { cleanupAll, cospec, mkTempRepo } from '../fixtures/support.ts'

afterAll(cleanupAll)

let root: string

beforeAll(async () => {
  root = mkTempRepo({ fixture: 'fresh', git: true })
  const init = await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
  expect(init.exitCode).toBe(0)
})

const VERIFYING = ['feat', 'fix', 'perf', 'refactor']
const NO_VERIFICATION = ['chore', 'docs', 'style', 'test']

describe('cospec new artifact plan', () => {
  for (const type of VERIFYING) {
    test(`${type} plan line lists verification before tasks`, async () => {
      const res = await cospec(['new', type, `plan-${type}`], { cwd: root })
      expect(res.exitCode).toBe(0)
      const line = res.stdout.split('\n').find((l) => l.startsWith('Artifacts:')) ?? ''
      expect(line).toMatch(/verification → tasks$/)
    })
  }

  for (const type of NO_VERIFICATION) {
    test(`${type} plan line does not mention verification`, async () => {
      const res = await cospec(['new', type, `plan-${type}`], { cwd: root })
      expect(res.exitCode).toBe(0)
      const line = res.stdout.split('\n').find((l) => l.startsWith('Artifacts:')) ?? ''
      expect(line).toBe('Artifacts: proposal → blocking-changes → tasks (3 short artifacts)')
    })
  }

  test('--json summary names every required artifact', async () => {
    for (const type of [...VERIFYING, ...NO_VERIFICATION]) {
      const res = await cospec(['new', type, `plan-json-${type}`, '--json'], { cwd: root })
      expect(res.exitCode).toBe(0)
      const { artifacts } = JSON.parse(res.stdout) as {
        artifacts: { required: string[]; summary: string }
      }
      for (const id of artifacts.required) expect(artifacts.summary).toContain(id)
    }
  })
})
