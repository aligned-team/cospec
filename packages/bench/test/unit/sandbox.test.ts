import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { captureSandboxDiff, spawnIn } from '../../src/sandbox.ts'

const roots: string[] = []

async function seededRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-bench-sandbox-'))
  roots.push(dir)
  await spawnIn(['git', 'init', '-q'], dir)
  await spawnIn(['git', 'config', 'user.email', 'bench@aligned.team'], dir)
  await spawnIn(['git', 'config', 'user.name', 'cospec-bench'], dir)
  writeFileSync(join(dir, 'src.ts'), 'export const original = 1\n')
  await spawnIn(['git', 'add', '-A'], dir)
  await spawnIn(['git', 'commit', '-q', '-m', 'seed', '--allow-empty'], dir)
  return dir
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

describe('captureSandboxDiff', () => {
  test('captures tracked modifications and untracked new files from the seed commit', async () => {
    const dir = await seededRepo()
    writeFileSync(join(dir, 'src.ts'), 'export const original = 2\n') // tracked edit
    writeFileSync(join(dir, 'added.ts'), 'export const added = true\n') // untracked new file
    const diff = await captureSandboxDiff(dir)
    expect(diff).toContain('src.ts')
    expect(diff).toContain('-export const original = 1')
    expect(diff).toContain('+export const original = 2')
    expect(diff).toContain('added.ts')
    expect(diff).toContain('+export const added = true')
  })

  test('excludes the spec-workflow dirs and the injected hidden-test suite', async () => {
    const dir = await seededRepo()
    for (const d of ['openspec', '.claude', '.codex', '.opencode', 'hidden-tests']) {
      mkdirSync(join(dir, d, 'nested'), { recursive: true })
      writeFileSync(join(dir, d, 'nested', 'leak.ts'), `export const from = '${d}'\n`)
    }
    writeFileSync(join(dir, 'real-change.ts'), 'export const real = 1\n')
    const diff = await captureSandboxDiff(dir)
    expect(diff).toContain('real-change.ts')
    for (const d of ['openspec', '.claude', '.codex', '.opencode', 'hidden-tests']) {
      expect(diff).not.toContain(`from = '${d}'`)
    }
  })

  test('an untouched tree (only excluded dirs present) yields an empty diff', async () => {
    const dir = await seededRepo()
    mkdirSync(join(dir, 'openspec'), { recursive: true })
    writeFileSync(join(dir, 'openspec', 'proposal.md'), '## Why\n')
    const diff = await captureSandboxDiff(dir)
    expect(diff.trim()).toBe('')
  })
})
