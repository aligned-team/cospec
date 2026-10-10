// The root-level legacy block port (workflow-profiles design D9), checked against the pinned
// binary's own `removeMarkerBlock`, `hasOpenSpecMarkers` and `LEGACY_CONFIG_FILES`.

import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openspecPackageDir } from '../../../src/core/openspec.ts'
import {
  findLegacyConfigBlocks,
  hasOpenSpecMarkers,
  LEGACY_CONFIG_FILES,
  removeMarkerBlock,
  stripLegacyConfigBlocks,
} from '../../../src/harness/legacy-config-blocks.ts'

const DIST = join(openspecPackageDir(), 'dist')
const cleanup = (await import(join(DIST, 'core/legacy-cleanup.js'))) as {
  LEGACY_CONFIG_FILES: string[]
  hasOpenSpecMarkers: (content: string) => boolean
  removeMarkerBlock: (content: string) => string
}

const S = '<!-- OPENSPEC:START -->'
const E = '<!-- OPENSPEC:END -->'

const CASES: Record<string, string> = {
  'block only': `${S}\nx\n${E}\n`,
  'block only, CRLF': `${S}\r\nx\r\n${E}\r\n`,
  'block only, no trailing newline': `${S}\nx\n${E}`,
  'block between text': `before\n\n${S}\nx\n${E}\n\nafter\n`,
  'block at the end': `before\n${S}\nx\n${E}\n`,
  'block at the start': `${S}\nx\n${E}\nafter\n`,
  'indented markers': `a\n  ${S}  \nx\n\t${E}\nb\n`,
  'carriage return before the marker': `a\n\r${S}\nx\n${E}\nb\n`,
  'collapsing blank lines': `a\n\n\n\n${S}\nx\n${E}\n\n\n\nb\n`,
  'CRLF with blank lines': `a\r\n\r\n\r\n\r\n${S}\r\nx\r\n${E}\r\nb\r\n`,
  'inline start': `use ${S} here\nx\n${E}\n`,
  'inline end': `${S}\nx\nsee ${E}\n`,
  'both inline': `see ${S} and ${E} for more\n`,
  'inline mention before a real block': `see ${S} inline\n${S}\nx\n${E}\n`,
  'end before start': `${E}\nx\n${S}\n`,
  'start only': `${S}\nx\n`,
  'end only': `x\n${E}\n`,
  'two blocks': `${S}\na\n${E}\nmid\n${S}\nb\n${E}\n`,
  'empty block': `${S}\n${E}\n`,
  'whitespace around': `\n\n${S}\nx\n${E}\n\n\n`,
  'no markers': 'plain\n',
  empty: '',
}

describe('removeMarkerBlock and hasOpenSpecMarkers against the pinned binary', () => {
  for (const [label, text] of Object.entries(CASES)) {
    test(label, () => {
      expect(removeMarkerBlock(text)).toBe(cleanup.removeMarkerBlock(text))
      expect(hasOpenSpecMarkers(text)).toBe(cleanup.hasOpenSpecMarkers(text))
    })
  }
})

describe('LEGACY_CONFIG_FILES', () => {
  test("is the binary's list, in its order", () => {
    expect([...LEGACY_CONFIG_FILES]).toEqual(cleanup.LEGACY_CONFIG_FILES)
    expect(LEGACY_CONFIG_FILES).toHaveLength(8)
  })
})

describe('findLegacyConfigBlocks and stripLegacyConfigBlocks', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })
  const project = (files: Record<string, string>): string => {
    const dir = mkdtempSync(join(tmpdir(), 'cospec-legacy-blocks-'))
    dirs.push(dir)
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
    return dir
  }

  test('lists the files holding both markers, in the binary order', () => {
    const dir = project({
      'AGENTS.md': `x\n${S}\ny\n${E}\n`,
      'CLAUDE.md': `${S}\ny\n${E}\n`,
      'QWEN.md': 'plain\n',
      'README.md': `${S}\ny\n${E}\n`,
    })
    expect(findLegacyConfigBlocks(dir).map((b) => b.relpath)).toEqual(['CLAUDE.md', 'AGENTS.md'])
  })

  test('strips a block to empty and never deletes the file', () => {
    const dir = project({ 'CLAUDE.md': `${S}\ny\n${E}\n`, 'AGENTS.md': `keep\n${S}\ny\n${E}\n` })
    expect(stripLegacyConfigBlocks(dir, findLegacyConfigBlocks(dir))).toEqual([
      'CLAUDE.md',
      'AGENTS.md',
    ])
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe('')
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toBe('keep\n')
  })

  test('an inline-only file is found, left unwritten and not reported changed', () => {
    const text = `see ${S} and ${E}\n`
    const dir = project({ 'CLINE.md': text })
    const found = findLegacyConfigBlocks(dir)
    expect(found.map((b) => b.relpath)).toEqual(['CLINE.md'])
    expect(stripLegacyConfigBlocks(dir, found)).toEqual([])
    expect(readFileSync(join(dir, 'CLINE.md'), 'utf8')).toBe(text)
  })

  test('a link that leaves the project, a directory and a dangling link are skipped', () => {
    const dir = project({})
    const outside = project({ 'real.md': `${S}\ny\n${E}\n` })
    symlinkSync(join(outside, 'real.md'), join(dir, 'CLAUDE.md'))
    mkdirSync(join(dir, 'AGENTS.md'))
    symlinkSync(join(dir, 'nowhere.md'), join(dir, 'QWEN.md'))
    expect(findLegacyConfigBlocks(dir)).toEqual([])
  })

  test('a link that stays inside the project is read', () => {
    const dir = project({ 'real.md': `${S}\ny\n${E}\n` })
    symlinkSync(join(dir, 'real.md'), join(dir, 'CLAUDE.md'))
    expect(findLegacyConfigBlocks(dir).map((b) => b.relpath)).toEqual(['CLAUDE.md'])
  })
})
