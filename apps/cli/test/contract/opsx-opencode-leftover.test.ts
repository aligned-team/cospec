// opsx-leftover-scan-scope row 3.4: the real pinned 1.13.1 binary's own OpenCode
// opsx leftover (frontmatter with only `description`, no `name`, no `metadata`)
// is detected and removed by `cospec init --remove-opsx`, and a hand-written
// user file at the same path shape with no body marker survives it.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, openspec, writeFiles } from '../fixtures/support.ts'

afterAll(cleanupAll)

describe("the real pinned binary's OpenCode opsx leftover vs. a user file at the same path shape", () => {
  test('cospec init --remove-opsx removes the real leftover and leaves the user file', async () => {
    const root = mkTempRepo({ git: true })

    // Generate the real thing with the pinned binary itself.
    const initRes = await openspec(['init', '--tools', 'opencode', '--no-animation'], root)
    expect(initRes.exitCode).toBe(0)
    const realCommand = join(root, '.opencode/commands/opsx-propose.md')
    const realSkill = join(root, '.opencode/skills/openspec-propose/SKILL.md')
    expect(existsSync(realCommand)).toBe(true)
    expect(existsSync(realSkill)).toBe(true)

    // A user's own file at the same path shape: description-only frontmatter,
    // but no `openspec list --json` reference in the body — never a leftover.
    writeFiles(root, {
      '.opencode/commands/opsx-notes.md':
        '---\ndescription: my personal opencode notes\n---\n\nJust my own checklist, nothing to do with openspec.\n',
    })

    const res = await cospec(
      ['init', '--harness', 'claude', '--remove-opsx', '--no-gate', '--yes'],
      { cwd: root },
    )
    expect(res.exitCode).toBe(0)

    // The real pinned-binary leftover is gone, its directory pruned.
    expect(existsSync(realCommand)).toBe(false)
    expect(existsSync(realSkill)).toBe(false)
    expect(existsSync(join(root, '.opencode/skills/openspec-propose'))).toBe(false)

    // The user's own file at the same path shape survives.
    expect(existsSync(join(root, '.opencode/commands/opsx-notes.md'))).toBe(true)
  })

  test('cospec init --json opsx.found lists the real leftover before removal', async () => {
    const root = mkTempRepo({ git: true })
    const initRes = await openspec(['init', '--tools', 'opencode', '--no-animation'], root)
    expect(initRes.exitCode).toBe(0)

    const { stdout, exitCode } = await cospec(
      ['init', '--harness', 'claude', '--no-gate', '--yes', '--json'],
      { cwd: root },
    )
    expect(exitCode).toBe(0)
    const json = JSON.parse(stdout) as { opsx: { found: string[] } }
    expect(json.opsx.found).toContain('.opencode/commands/opsx-propose.md')
  })
})
