// Group 10 — `cospec instructions verification --change <slug>` (DESIGN §1.1,
// §8): confirms the artifact is reachable through the thin openspec passthrough
// for every type that declares it required, and that the rendered template +
// instruction reflect that type's per-type required-row fact.

import { afterAll, describe, expect, test } from 'bun:test'

import { cleanupAll, cospec, mkTempRepo } from '../fixtures/support.ts'

afterAll(cleanupAll)

async function initRepo(): Promise<string> {
  const root = mkTempRepo({ fixture: 'fresh', git: true })
  await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
  return root
}

interface ArtifactInstructionsJson {
  changeName: string
  artifactId: string
  schemaName: string
  outputPath: string
  instruction: string
  template: string
}

describe('cospec instructions verification', () => {
  const cases: { type: string; slug: string; layerHint: string }[] = [
    { type: 'feat', slug: 'add-widget', layerHint: '@e2e' },
    { type: 'fix', slug: 'fix-widget', layerHint: '@regression' },
    { type: 'perf', slug: 'speed-widget', layerHint: '@benchmark' },
    { type: 'refactor', slug: 'reshape-widget', layerHint: '@equivalence' },
  ]

  for (const { type, slug, layerHint } of cases) {
    test(`renders the ${type} verification template and instruction`, async () => {
      const root = await initRepo()
      const created = await cospec(['new', type, slug], { cwd: root })
      expect(created.exitCode).toBe(0)

      const res = await cospec(['instructions', 'verification', '--change', slug, '--json'], {
        cwd: root,
      })
      expect(res.exitCode).toBe(0)
      const json = JSON.parse(res.stdout) as ArtifactInstructionsJson
      expect(json.artifactId).toBe('verification')
      expect(json.outputPath).toBe('verification.md')
      expect(json.template).toContain('## 1.')
      expect(json.template).toMatch(/-\s\[ \]\s1\.1\s@/)
      expect(json.instruction).toContain(layerHint)
    })
  }
})

// `cospec instructions archive` (OpenSpec 1.7 parity, W9): a read-only artifact
// like every other one here — never aliased to `cospec archive` — routed
// through the same disciplined-passthrough plumbing (`passthroughOpenspec` /
// `callPassthrough`) as `show`/`context`/`workset`, so it gets the one-JSON-
// document invariant and exit-code normalization for free.
describe('cospec instructions archive', () => {
  test('relays the wrapped archive-inputs payload (--json)', async () => {
    const root = await initRepo()
    const created = await cospec(['new', 'feat', 'add-widget'], { cwd: root })
    expect(created.exitCode).toBe(0)

    const res = await cospec(['instructions', 'archive', '--change', 'add-widget', '--json'], {
      cwd: root,
    })
    expect(res.exitCode).toBe(0)
    const json = JSON.parse(res.stdout) as { changeName: string }
    expect(json.changeName).toBe('add-widget')
  })

  test('relays the human-readable form too (no --json)', async () => {
    const root = await initRepo()
    const created = await cospec(['new', 'feat', 'add-widget'], { cwd: root })
    expect(created.exitCode).toBe(0)

    const res = await cospec(['instructions', 'archive', '--change', 'add-widget'], { cwd: root })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('Archive Inputs: add-widget')
  })

  test('an unknown change relays the wrapped exit-1 failure rather than throwing', async () => {
    const root = await initRepo()
    const res = await cospec(['instructions', 'archive', '--change', 'does-not-exist', '--json'], {
      cwd: root,
    })
    expect(res.exitCode).toBe(1)
  })
})
