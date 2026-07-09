// `cospec new <legacy-schema> <slug>` (schema-fork-and-docs-parity §2): a name
// that is not one of the 11 cospec types but resolves as a project/user/
// package ("legacy") schema is delegated to `openspec new change --schema`
// with cospec's own schemaVersion stamp and typed artifact-plan output
// skipped. A name that resolves nowhere still gets today's unknown-type error.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo } from '../fixtures/support.ts'

afterAll(cleanupAll)

let root: string

beforeAll(async () => {
  root = mkTempRepo({ fixture: 'fresh', git: true })
  const init = await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
  expect(init.exitCode).toBe(0)
  const fork = await cospec(['schema', 'fork', 'chore', 'my-custom'], { cwd: root })
  expect(fork.exitCode).toBe(0)
})

describe('cospec new <legacy-schema> <slug>', () => {
  test('delegates to the fork, skips schemaVersion, prints the reduced-guarantees note', async () => {
    const res = await cospec(['new', 'my-custom', 'legacy-new-slug'], { cwd: root })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toMatch(/reduced cospec guarantees/)

    const yamlPath = join(root, 'openspec/changes/legacy-new-slug/.openspec.yaml')
    expect(existsSync(yamlPath)).toBe(true)
    const yaml = readFileSync(yamlPath, 'utf8')
    expect(yaml).toMatch(/schema:\s*my-custom/)
    expect(yaml).not.toMatch(/schemaVersion/)
  })

  test('--json form reports legacy: true and the same note, no artifact plan', async () => {
    const res = await cospec(['new', 'my-custom', 'legacy-new-json', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const parsed = JSON.parse(res.stdout) as {
      change: string
      type: string
      legacy: boolean
      note: string
      artifacts?: unknown
    }
    expect(parsed.change).toBe('legacy-new-json')
    expect(parsed.type).toBe('my-custom')
    expect(parsed.legacy).toBe(true)
    expect(parsed.note).toMatch(/reduced cospec guarantees/)
    expect(parsed.artifacts).toBeUndefined()
  })

  test('a name that is neither a cospec type nor a resolvable legacy schema is still unknown', async () => {
    const res = await cospec(['new', 'totally-unknown-schema', 'some-slug'], { cwd: root })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toMatch(/unknown type/)
    expect(existsSync(join(root, 'openspec/changes/some-slug'))).toBe(false)
  })
})
