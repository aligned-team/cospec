// The nesting (16) and expansion (1024) bounds on `generates` / `apply.tracks`
// patterns: both rejected before any matching, with the artifact and limit named,
// and brace-expanded alternatives still confined to the change directory.

import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  archiveManagedDirOutsideRoot,
  assertArtifactPatternBounds,
  expandArtifactBraces,
  GlobBoundsError,
  MAX_BRACE_EXPANSIONS,
  MAX_BRACE_NESTING,
  resolveArtifactOutputs,
} from '../../../src/core/glob.ts'

const temps: string[] = []
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function changeDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'cospec-glob-'))
  temps.push(root)
  const dir = join(root, 'change')
  mkdirSync(join(dir, 'rfc'), { recursive: true })
  writeFileSync(join(dir, 'rfc', 'a.md'), '# a\n')
  writeFileSync(join(root, 'outside.md'), '# outside\n')
  return dir
}

const nested = (depth: number) => `rfc/${'{a,'.repeat(depth)}b${'}'.repeat(depth)}*.md`
const wide = (groups: number) => `rfc/${'{a,b}'.repeat(groups)}.md`

describe('glob bounds', () => {
  test('17 nested brace levels are rejected naming the artifact and the limit', () => {
    let error: unknown
    try {
      assertArtifactPatternBounds('rfc', nested(17))
    } catch (err) {
      error = err
    }
    expect(error).toBeInstanceOf(GlobBoundsError)
    expect((error as GlobBoundsError).limit).toBe('nesting')
    expect((error as Error).message).toContain("Artifact 'rfc' generates:")
    expect((error as Error).message).toContain(`more than ${MAX_BRACE_NESTING} levels deep`)
  })

  test('17 nested parentheses count as nesting too', () => {
    expect(() =>
      resolveArtifactOutputs(changeDir(), `rfc/${'('.repeat(17)}a${')'.repeat(17)}*.md`),
    ).toThrow(`more than ${MAX_BRACE_NESTING} levels deep`)
  })

  test('16 nested levels resolve normally', () => {
    expect(() => assertArtifactPatternBounds('rfc', nested(16))).not.toThrow()
    expect(resolveArtifactOutputs(changeDir(), nested(16))).toHaveLength(1)
  })

  test('a 1025-path expansion is rejected naming the artifact and the limit', () => {
    expect(() => assertArtifactPatternBounds('tasks', 'rfc/{1..1025}.md', 'apply.tracks')).toThrow(
      `Artifact 'tasks' apply.tracks: Artifact output pattern expands to more than ${MAX_BRACE_EXPANSIONS} patterns`,
    )
    expect(() => resolveArtifactOutputs(changeDir(), wide(11))).toThrow(GlobBoundsError)
  })

  test('a huge range is refused without allocating it', () => {
    expect(() => expandArtifactBraces('rfc/{1..1000000000}.md')).toThrow(GlobBoundsError)
  })

  test('exactly 1024 expansions are allowed', () => {
    expect(expandArtifactBraces(wide(10))).toHaveLength(MAX_BRACE_EXPANSIONS)
  })

  test('a brace alternative leaving the change is refused before matching', () => {
    expect(() => resolveArtifactOutputs(changeDir(), '{../,rfc/}*.md')).toThrow(
      'Path is outside the allowed directory',
    )
  })

  test('a literal path is not bound-checked', () => {
    expect(() => assertArtifactPatternBounds('proposal', 'proposal.md')).not.toThrow()
  })
})

// 1.14.2: archive accepts a project-owned symlinked openspec/, changes/ or specs/.
describe('archiveManagedDirOutsideRoot', () => {
  function layout(): { root: string; paths: Parameters<typeof archiveManagedDirOutsideRoot>[0] } {
    const root = mkdtempSync(join(tmpdir(), 'cospec-archive-root-'))
    temps.push(root)
    const openspec = join(root, 'openspec')
    mkdirSync(join(openspec, 'changes', 'archive'), { recursive: true })
    mkdirSync(join(openspec, 'specs'), { recursive: true })
    return {
      root,
      paths: {
        projectRoot: root,
        changesDir: join(openspec, 'changes'),
        archiveDir: join(openspec, 'changes', 'archive'),
        specsDir: join(openspec, 'specs'),
      },
    }
  }

  test('a plain layout and a symlinked specs/ inside the project pass', () => {
    const { root, paths } = layout()
    expect(archiveManagedDirOutsideRoot(paths)).toBeUndefined()
    rmSync(paths.specsDir, { recursive: true })
    mkdirSync(join(root, 'docs', 'specs'), { recursive: true })
    symlinkSync(join(root, 'docs', 'specs'), paths.specsDir)
    expect(archiveManagedDirOutsideRoot(paths)).toBeUndefined()
  })

  test('an archive/ that leaves the changes directory is refused', () => {
    const { paths } = layout()
    rmSync(paths.archiveDir, { recursive: true })
    const elsewhere = mkdtempSync(join(tmpdir(), 'cospec-archive-elsewhere-'))
    temps.push(elsewhere)
    symlinkSync(elsewhere, paths.archiveDir)
    expect(archiveManagedDirOutsideRoot(paths)).toBe(paths.archiveDir)
  })

  test('a dangling linked changes/ is refused', () => {
    const { root, paths } = layout()
    rmSync(paths.changesDir, { recursive: true })
    symlinkSync(join(root, 'gone'), paths.changesDir)
    expect(archiveManagedDirOutsideRoot(paths)).toBe(paths.changesDir)
  })
})
