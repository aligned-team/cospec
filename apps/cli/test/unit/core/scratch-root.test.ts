// Verification 11.2 and 11.5: `core/scratch-root.ts` with an injected runner
// standing in for the wrapped archive, so a failed or raced run can be staged
// exactly.

import { afterAll, describe, expect, test } from 'bun:test'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import {
  ScratchRefusal,
  symlinkEscape,
  syncThroughScratch,
  type ScratchRun,
} from '../../../src/core/scratch-root.ts'
import { cleanupAll, hashTree, mkTempRepo, writeFiles } from '../../fixtures/support.ts'

afterAll(cleanupAll)

const LIVING = '# widgets\n\n## Purpose\n\nWidgets.\n\n## Requirements\n'

/** A root with one living spec and a change `c1` with one delta. */
function root(): string {
  const dir = mkTempRepo()
  writeFiles(dir, {
    'openspec/config.yaml': 'schema: feat\n',
    'openspec/specs/widgets/spec.md': LIVING,
    'openspec/changes/c1/.openspec.yaml': 'schema: feat\n',
    'openspec/changes/c1/specs/widgets/spec.md': '## ADDED Requirements\n',
    'openspec/changes/c2/.openspec.yaml': 'schema: feat\n',
  })
  mkdirSync(join(dir, 'openspec/changes/archive'), { recursive: true })
  return dir
}

/** What a completed wrapped archive leaves in the scratch tree. */
function archiveIn(scratch: string, id: string): void {
  renameSync(
    join(scratch, 'openspec/changes', id),
    join(scratch, 'openspec/changes/archive', `2026-10-05-${id}`),
  )
}

const ok: ScratchRun = { stdout: 'Specs updated successfully.\n', stderr: '', exitCode: 0 }

describe('syncThroughScratch', () => {
  test('a completed run copies back what it wrote and deleted, and leaves the change active', async () => {
    const dir = root()
    const changes = hashTree(join(dir, 'openspec/changes'))
    let seen = ''
    const result = await syncThroughScratch(dir, 'c1', async (scratch) => {
      seen = scratch
      // Only what the archive reads is there: no sibling change, an empty archive.
      expect(existsSync(join(scratch, 'openspec/changes/c2'))).toBe(false)
      expect(existsSync(join(scratch, 'openspec/config.yaml'))).toBe(true)
      writeFileSync(join(scratch, 'openspec/specs/widgets/spec.md'), `${LIVING}\nmerged\n`)
      writeFiles(scratch, { 'openspec/specs/gadgets/spec.md': 'new\n' })
      archiveIn(scratch, 'c1')
      return ok
    })
    expect(result.written).toEqual([
      'openspec/specs/gadgets/spec.md',
      'openspec/specs/widgets/spec.md',
    ])
    expect(result.deleted).toEqual([])
    expect(hashTree(join(dir, 'openspec/changes'))).toEqual(changes)
    expect(await Bun.file(join(dir, 'openspec/specs/widgets/spec.md')).text()).toBe(
      `${LIVING}\nmerged\n`,
    )
    expect(existsSync(seen)).toBe(false)
  })

  test('a retirement deletes the spec and prunes its emptied directory', async () => {
    const dir = root()
    const result = await syncThroughScratch(dir, 'c1', async (scratch) => {
      rmSync(join(scratch, 'openspec/specs/widgets'), { recursive: true })
      archiveIn(scratch, 'c1')
      return ok
    })
    expect(result.deleted).toEqual(['openspec/specs/widgets/spec.md'])
    expect(existsSync(join(dir, 'openspec/specs/widgets'))).toBe(false)
  })

  test('11.2 a run that claims, writes and fails leaves the real tree byte-identical', async () => {
    const dir = root()
    const before = hashTree(dir)
    let seen = ''
    const failed = syncThroughScratch(dir, 'c1', async (scratch) => {
      seen = scratch
      writeFileSync(join(scratch, 'openspec/changes/archive/.openspec-archive.lock'), '{}')
      writeFileSync(join(scratch, 'openspec/specs/widgets/spec.md'), 'partial')
      return {
        stdout: 'Task status: ✓ Complete\n',
        stderr: '✖ Error: the run broke\n',
        exitCode: 1,
      }
    })
    await expect(failed).rejects.toThrow(ScratchRefusal)
    await expect(failed).rejects.toThrow('the run broke')
    expect(hashTree(dir)).toEqual(before)
    expect(existsSync(seen)).toBe(false)
  })

  test('a run that exits 0 without archiving the scratch copy is refused', async () => {
    const dir = root()
    const before = hashTree(dir)
    const refused = syncThroughScratch(dir, 'c1', async () => ({
      stdout: 'Aborted. No files were changed.\n',
      stderr: '',
      exitCode: 0,
    }))
    await expect(refused).rejects.toMatchObject({ kind: 'scratch-run' })
    expect(hashTree(dir)).toEqual(before)
  })

  test('11.5 the real main specs changing while the run works refuses, writing nothing', async () => {
    const dir = root()
    const refused = syncThroughScratch(dir, 'c1', async (scratch) => {
      writeFileSync(join(scratch, 'openspec/specs/widgets/spec.md'), 'merged')
      writeFileSync(join(dir, 'openspec/specs/widgets/spec.md'), 'edited meanwhile')
      archiveIn(scratch, 'c1')
      return ok
    })
    await expect(refused).rejects.toMatchObject({ kind: 'specs-changed' })
    await expect(refused).rejects.toThrow('the main specs changed while sync ran')
    expect(await Bun.file(join(dir, 'openspec/specs/widgets/spec.md')).text()).toBe(
      'edited meanwhile',
    )
  })
})

describe('syncThroughScratch: links and unreadable entries', () => {
  test('an absolute in-tree link is re-pointed into the scratch copy, never the real tree', async () => {
    const dir = root()
    const realAlias = join(dir, 'openspec/specs/widgets')
    symlinkSync(realAlias, join(dir, 'openspec/specs/alias'))
    const result = await syncThroughScratch(dir, 'c1', async (scratch) => {
      const alias = join(scratch, 'openspec/specs/alias')
      expect(realpathSync(alias)).toBe(realpathSync(join(scratch, 'openspec/specs/widgets')))
      // The binary merges through the alias, as it would in place.
      writeFileSync(join(alias, 'spec.md'), `${LIVING}\nmerged\n`)
      archiveIn(scratch, 'c1')
      return ok
    })
    expect(result.written).toEqual(['openspec/specs/widgets/spec.md'])
    expect(readlinkSync(join(dir, 'openspec/specs/alias'))).toBe(realAlias)
    expect(await Bun.file(join(realAlias, 'spec.md')).text()).toBe(`${LIVING}\nmerged\n`)
  })

  test('a link through a symlinked specs directory is walked, and one leading out named', () => {
    const dir = root()
    const kept = mkTempRepo()
    renameSync(join(dir, 'openspec/specs'), join(kept, 'specs'))
    symlinkSync(join(kept, 'specs'), join(dir, 'openspec/specs'))
    expect(symlinkEscape(dir, 'c1')).toBeUndefined()
    symlinkSync(mkTempRepo(), join(kept, 'specs/ext'))
    expect(symlinkEscape(dir, 'c1')).toBe('openspec/specs/ext')
  })

  test('a retired capability whose spec.md is a link: the link is deleted and its directory pruned', async () => {
    const dir = root()
    writeFiles(dir, { 'openspec/specs/shared/widgets.md': LIVING })
    rmSync(join(dir, 'openspec/specs/widgets/spec.md'))
    symlinkSync('../shared/widgets.md', join(dir, 'openspec/specs/widgets/spec.md'))
    const result = await syncThroughScratch(dir, 'c1', async (scratch) => {
      rmSync(join(scratch, 'openspec/specs/widgets'), { recursive: true })
      archiveIn(scratch, 'c1')
      return ok
    })
    expect(result).toMatchObject({ written: [], deleted: ['openspec/specs/widgets/spec.md'] })
    expect(existsSync(join(dir, 'openspec/specs/widgets'))).toBe(false)
    expect(await Bun.file(join(dir, 'openspec/specs/shared/widgets.md')).text()).toBe(LIVING)
  })

  test('a link the run replaced with a file is written over the link', async () => {
    const dir = root()
    writeFiles(dir, { 'openspec/specs/shared/widgets.md': LIVING })
    rmSync(join(dir, 'openspec/specs/widgets/spec.md'))
    symlinkSync('../shared/widgets.md', join(dir, 'openspec/specs/widgets/spec.md'))
    const result = await syncThroughScratch(dir, 'c1', async (scratch) => {
      const spec = join(scratch, 'openspec/specs/widgets/spec.md')
      rmSync(spec)
      writeFileSync(spec, 'merged\n')
      archiveIn(scratch, 'c1')
      return ok
    })
    expect(result.written).toEqual(['openspec/specs/widgets/spec.md'])
    expect(lstatSync(join(dir, 'openspec/specs/widgets/spec.md')).isFile()).toBe(true)
    expect(await Bun.file(join(dir, 'openspec/specs/shared/widgets.md')).text()).toBe(LIVING)
  })

  test('a link the run created is a breach, thrown before anything is written', async () => {
    const dir = root()
    const before = hashTree(dir)
    const breached = syncThroughScratch(dir, 'c1', async (scratch) => {
      writeFileSync(join(scratch, 'openspec/specs/widgets/spec.md'), 'merged\n')
      symlinkSync('widgets', join(scratch, 'openspec/specs/alias'))
      archiveIn(scratch, 'c1')
      return ok
    })
    await expect(breached).rejects.toThrow('openspec/specs/alias as a link to widgets')
    expect(hashTree(dir)).toEqual(before)
  })

  test.skipIf(process.getuid?.() === 0)(
    'an unrelated spec no one can read is copied as an unreadable placeholder; the sync completes',
    async () => {
      const dir = root()
      writeFiles(dir, { 'openspec/specs/other/spec.md': LIVING })
      const other = join(dir, 'openspec/specs/other/spec.md')
      chmodSync(other, 0o000)
      try {
        const result = await syncThroughScratch(dir, 'c1', async (scratch) => {
          const placeholder = join(scratch, 'openspec/specs/other/spec.md')
          expect(statSync(placeholder).mode & 0o777).toBe(0)
          expect(() => readFileSync(placeholder)).toThrow()
          writeFileSync(join(scratch, 'openspec/specs/widgets/spec.md'), `${LIVING}\nmerged\n`)
          archiveIn(scratch, 'c1')
          return ok
        })
        expect(result).toMatchObject({ written: ['openspec/specs/widgets/spec.md'], deleted: [] })
        expect(statSync(other).mode & 0o777).toBe(0)
      } finally {
        chmodSync(other, 0o644)
      }
      expect(await Bun.file(join(dir, 'openspec/specs/other/spec.md')).text()).toBe(LIVING)
    },
  )
})

describe('symlinkEscape', () => {
  test('a link inside the copied tree is kept; one leading out is named', () => {
    const dir = root()
    symlinkSync('widgets', join(dir, 'openspec/specs/alias'))
    expect(symlinkEscape(dir, 'c1')).toBeUndefined()
    const outside = mkTempRepo()
    symlinkSync(outside, join(dir, 'openspec/specs/ext'))
    expect(symlinkEscape(dir, 'c1')).toBe('openspec/specs/ext')
  })

  test('a link into a sibling change leads outside: it is never copied', () => {
    const dir = root()
    symlinkSync(join(dir, 'openspec/changes/c2'), join(dir, 'openspec/changes/c1/sibling'))
    expect(symlinkEscape(dir, 'c1')).toBe('openspec/changes/c1/sibling')
  })
})
