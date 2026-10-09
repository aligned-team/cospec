// The home directory a home-relative skills root resolves against, and the containment rule for
// removing a skill there (tool-matrix design decision 8).

import { describe, expect, test } from 'bun:test'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { resolveContainedPath } from '../../../src/core/managed-files.ts'
import { resolveHomeDir } from '../../../src/harness/home-root.ts'

describe('resolveHomeDir', () => {
  test('USERPROFILE wins over HOME', () => {
    expect(resolveHomeDir({ USERPROFILE: '/u/profile', HOME: '/u/home' })).toBe('/u/profile')
  })

  test('HOME is used when USERPROFILE is unset', () => {
    expect(resolveHomeDir({ HOME: '/u/home' })).toBe('/u/home')
  })

  test('the OS home directory is the last resort', () => {
    expect(resolveHomeDir({})).toBe(homedir())
  })

  test('an empty value counts as unset, never a path inside the project', () => {
    expect(resolveHomeDir({ USERPROFILE: '', HOME: '/u/home' })).toBe('/u/home')
    expect(resolveHomeDir({ USERPROFILE: '', HOME: '' })).toBe(homedir())
  })
})

describe('resolveContainedPath with an absolute root', () => {
  const root = '/h/.minimax/skills'
  const contain = (relpath: string): string | undefined =>
    resolveContainedPath('/project', relpath, ['openspec', '.claude'], [root])

  test('an absolute path inside the absolute root resolves', () => {
    expect(contain(join(root, 'cospec-x/SKILL.md'))).toBe(join(root, 'cospec-x/SKILL.md'))
  })

  test('the root itself, a sibling and a traversal out of it do not', () => {
    expect(contain(root)).toBeUndefined()
    expect(contain('/h/.minimax/other/cospec-x/SKILL.md')).toBeUndefined()
    expect(contain(`${root}/../../etc/passwd`)).toBeUndefined()
    expect(contain('/h/.minimax/skills-evil/x')).toBeUndefined()
  })

  test('an absolute path is never contained by the relative roots', () => {
    expect(resolveContainedPath('/project', '/project/openspec/x', ['openspec'])).toBeUndefined()
    expect(
      resolveContainedPath('/project', '/project/openspec/x', ['openspec'], [root]),
    ).toBeUndefined()
  })

  test('a relative path is never contained by an absolute root', () => {
    expect(resolveContainedPath('/project', 'cospec-x/SKILL.md', [], [root])).toBeUndefined()
    expect(contain('.claude/skills/x/SKILL.md')).toBe('/project/.claude/skills/x/SKILL.md')
  })
})
