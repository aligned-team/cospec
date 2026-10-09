import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { isInsideNestedCheckout, walkProjectFiles } from '../../../src/harness/scan-walk.ts'

// Review finding (opsx-leftover-scan-scope): the nested-checkout prune ran only on child
// directories, so a scan root that is itself a nested checkout — or resolves into one — was
// walked in full.
describe('walkProjectFiles — a scan root never reaches a nested checkout', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cospec-scan-walk-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const put = (rel: string, text = 'x\n'): void => {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  // `git worktree add` writes `.git` as a file, a gitdir pointer.
  const worktree = (rel: string): void =>
    put(`${rel}/.git`, 'gitdir: /elsewhere/.git/worktrees/x\n')
  const walked = (roots: string[], skipDir?: (name: string) => boolean): string[] => {
    const out: string[] = []
    walkProjectFiles(dir, roots, (r) => out.push(r), skipDir)
    return out.toSorted()
  }

  test('control: a plain in-project root is walked', () => {
    put('.claude/skills/a/SKILL.md')
    expect(walked(['.claude'])).toEqual(['.claude/skills/a/SKILL.md'])
  })

  test('a root that is itself an embedded clone is skipped', () => {
    mkdirSync(join(dir, '.claude/.git'), { recursive: true })
    put('.claude/skills/a/SKILL.md')
    expect(walked(['.claude'])).toEqual([])
  })

  test('a root that is itself a worktree checkout (.git file) is skipped', () => {
    worktree('.claude')
    put('.claude/skills/a/SKILL.md')
    expect(walked(['.claude'])).toEqual([])
  })

  test('a root beneath an embedded clone (.agents/.git) is skipped', () => {
    mkdirSync(join(dir, '.agents/.git'), { recursive: true })
    put('.agents/skills/a/SKILL.md')
    expect(walked(['.agents/skills'])).toEqual([])
  })

  test('a symlinked root resolving into a nested worktree inside the project is skipped', () => {
    worktree('wt/feat')
    put('wt/feat/.claude/skills/a/SKILL.md')
    symlinkSync(join(dir, 'wt/feat/.claude'), join(dir, '.claude'))
    expect(walked(['.claude'])).toEqual([])
  })

  test('a symlinked openspec root resolving into a nested worktree is skipped', () => {
    worktree('.claude/worktrees/feat')
    put('.claude/worktrees/feat/openspec/changes/x/proposal.md.cospec-new')
    symlinkSync(join(dir, '.claude/worktrees/feat/openspec'), join(dir, 'openspec'))
    expect(walked(['openspec'])).toEqual([])
  })

  test('a symlinked root resolving back inside the project outside any checkout is still walked', () => {
    put('shared/skills/a/SKILL.md')
    symlinkSync(join(dir, 'shared'), join(dir, '.claude'))
    expect(walked(['.claude'])).toEqual(['.claude/skills/a/SKILL.md'])
  })

  test("the project's own .git entry (the cwd) is never a boundary", () => {
    mkdirSync(join(dir, '.git'), { recursive: true })
    put('.claude/skills/a/SKILL.md')
    expect(walked(['.claude'])).toEqual(['.claude/skills/a/SKILL.md'])
  })

  test('a child nested checkout is still pruned and skipDir still applies', () => {
    worktree('.claude/worktrees/wt')
    put('.claude/worktrees/wt/skills/a/SKILL.md')
    put('.claude/skills/a/SKILL.md')
    put('.claude/archive/b.md')
    expect(walked(['.claude'], (n) => n === 'archive')).toEqual(['.claude/skills/a/SKILL.md'])
  })
})

describe('isInsideNestedCheckout', () => {
  test('a file under a worktree is inside; a project file is not', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cospec-nested-'))
    try {
      mkdirSync(join(dir, 'wt/skills'), { recursive: true })
      writeFileSync(join(dir, 'wt/.git'), 'gitdir: /x\n')
      writeFileSync(join(dir, 'wt/skills/a.md'), 'x\n')
      writeFileSync(join(dir, 'b.md'), 'x\n')
      const real = realpathSync(dir)
      expect(isInsideNestedCheckout(dir, real, join(dir, 'wt/skills/a.md'))).toBe(true)
      expect(isInsideNestedCheckout(dir, real, join(dir, 'b.md'))).toBe(false)
      // Reached through a symlink: the lexical path is clean, the resolved one is not.
      symlinkSync(join(dir, 'wt/skills'), join(dir, 'link'))
      expect(isInsideNestedCheckout(dir, real, join(dir, 'link/a.md'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
