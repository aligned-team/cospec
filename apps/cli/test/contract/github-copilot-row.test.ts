// The `github-copilot` row's facts against the pinned binary (design decision 4): `AI_TOOLS`'
// entry and the command adapter are deep-imported here, in tests only; cospec never calls them
// at runtime. The row's full render and detection are compared with the captured `init` output
// by `harness-matrix.test.ts`; this file pins the fields that test does not name one by one.

import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { openspecPackageDir } from '../../src/core/openspec.ts'
import { adapterFor, commandPath, HARNESS_NAMES } from '../../src/harness/adapters.ts'

const DIST = join(openspecPackageDir(), 'dist')

interface UpstreamTool {
  value: string
  name: string
  skillsDir?: string
  globalSkillsDir?: string
  detectionPaths?: string[]
  requiresIdeRestart?: boolean
  setupNote?: string
}

const { AI_TOOLS } = (await import(join(DIST, 'core/config.js'))) as { AI_TOOLS: UpstreamTool[] }
const { CommandAdapterRegistry } = (await import(
  join(DIST, 'core/command-generation/registry.js')
)) as { CommandAdapterRegistry: { get(id: string): { getFilePath(id: string): string } } }

const UPSTREAM = AI_TOOLS.find((t) => t.value === 'github-copilot')!

describe('the github-copilot row against the pinned AI_TOOLS', () => {
  test.failing("skills root, restart flag and display name are upstream's", () => {
    const row = adapterFor('github-copilot')
    expect(row.displayName).toBe(UPSTREAM.name)
    expect(row.skillsDir).toBe(UPSTREAM.skillsDir)
    expect(row.skillsDir).toBe('.github')
    expect(row.globalSkillsDir).toBeUndefined()
    expect(UPSTREAM.globalSkillsDir).toBeUndefined()
    expect(row.requiresIdeRestart).toBe(true)
    expect(row.requiresIdeRestart).toBe(UPSTREAM.requiresIdeRestart!)
    expect(row.setupNote).toBeUndefined()
    expect(UPSTREAM.setupNote).toBeUndefined()
  })

  test.failing("all seven detection paths, in upstream's order", () => {
    expect(UPSTREAM.detectionPaths).toHaveLength(7)
    expect([...adapterFor('github-copilot').detectionPaths]).toEqual(UPSTREAM.detectionPaths!)
  })

  test.failing("the command path is the adapter's, with opsx read as cospec", () => {
    const row = adapterFor('github-copilot')
    expect(row.commands?.extension).toBe('.prompt.md')
    for (const id of ['propose', 'apply', 'archive', 'bulk-archive', 'explore', 'verify']) {
      const upstream = CommandAdapterRegistry.get('github-copilot').getFilePath(id)
      expect(commandPath(row, id)).toBe(upstream.replace('opsx-', 'cospec-'))
    }
    expect(commandPath(row, 'sync-specs')).toBe('.github/prompts/cospec-sync-specs.prompt.md')
  })

  test.failing("the row sits between gemini and hermes, upstream's slot", () => {
    const names: readonly string[] = HARNESS_NAMES
    const at = names.indexOf('github-copilot')
    expect(names[at - 1]).toBe('gemini')
    expect(names[at + 1]).toBe('hermes')
    const upstream = AI_TOOLS.map((t) => t.value)
    expect(upstream[upstream.indexOf('github-copilot') - 1]).toBe('gemini')
    expect(upstream[upstream.indexOf('github-copilot') + 1]).toBe('hermes')
  })
})
