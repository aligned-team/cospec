// A GFM table whose header and delimiter rows disagree on column count is not a table: the
// site and llms.txt render it as one paragraph, and the docs build still passes. An unescaped
// `|` inside a code span splits the cell (`--profile core | custom`), which is how that
// happens. This walks every docs page and fails on any table GFM would not recognize, or
// whose body row carries more cells than the header (GFM drops the excess silently).

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const REPO = join(import.meta.dir, '../../../../..')
const ROOTS = [join(REPO, 'apps/docs'), join(REPO, 'docs')]
const SKIP = new Set(['node_modules', 'dist', 'cache'])

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return markdownFiles(path)
    return name.endsWith('.md') ? [path] : []
  })
}

/** Cells of a table row: a `|` splits unless escaped, even inside a code span (GFM). */
export function cellCount(line: string): number {
  let text = line.trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1)
  return text.split(/(?<!\\)\|/).length
}

const DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

export interface TableProblem {
  line: number
  problem: string
}

export function tableProblems(source: string): TableProblem[] {
  const lines = source.split('\n')
  const problems: TableProblem[] = []
  let fence: string | undefined
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker !== undefined) {
      if (fence === undefined) fence = marker
      else if (marker.startsWith(fence[0] ?? '')) fence = undefined
      continue
    }
    if (fence !== undefined) continue
    const next = lines[i + 1]
    if (!line.includes('|') || next === undefined || !DELIMITER.test(next) || !next.includes('-')) {
      continue
    }
    if (!next.includes('|') && !line.trim().startsWith('|')) continue
    const columns = cellCount(next)
    if (cellCount(line) !== columns) {
      problems.push({
        line: i + 1,
        problem: `header has ${cellCount(line)} cells, delimiter ${columns}: not a table`,
      })
      continue
    }
    for (let j = i + 2; j < lines.length; j++) {
      const row = lines[j] ?? ''
      if (row.trim() === '' || !row.includes('|')) break
      if (cellCount(row) > columns) {
        problems.push({
          line: j + 1,
          problem: `row has ${cellCount(row)} cells, header ${columns}`,
        })
      }
    }
  }
  return problems
}

describe('table shape checker', () => {
  test('an unescaped pipe in a code span splits the cell and is reported', () => {
    const md = ['| a | b |', '| - | - |', '| `x | y` | z |'].join('\n')
    expect(tableProblems(md)).toEqual([{ line: 3, problem: 'row has 3 cells, header 2' }])
  })

  test('a header and delimiter that disagree are reported', () => {
    const md = ['| a | b |', '| - | - | - |'].join('\n')
    expect(tableProblems(md)).toHaveLength(1)
  })

  test('an escaped pipe stays inside its cell', () => {
    const md = ['| a | b |', '| - | - |', '| `x\\|y` | z |'].join('\n')
    expect(tableProblems(md)).toEqual([])
  })

  test('a fenced block is not read as a table', () => {
    const md = ['```', '| a | b |', '| - | - | - |', '```'].join('\n')
    expect(tableProblems(md)).toEqual([])
  })
})

describe('docs tables', () => {
  const files = ROOTS.flatMap((root) => markdownFiles(root))

  test('the walk finds the docs pages', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  test.each(files.map((file) => [relative(REPO, file), file] as const))(
    '%s has only well-formed tables',
    (_name, file) => {
      expect(tableProblems(readFileSync(file, 'utf8'))).toEqual([])
    },
  )
})
