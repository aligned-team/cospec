// A tool is a `HARNESS_TABLE` row, never a branch in a command: no row id appears as a string
// literal in `src/commands/*.ts`, so adding a row never means editing a command. The one
// documented exception is Claude-only behaviour that sits outside the table by design
// (docs/harness-integration.md): `init`'s `.claude/settings.json` merge and its fresh-repo
// default. Comments are not code, so the scan reads the transpiled source, which drops them.
// A tool id can also arrive as an imported constant (`export const X = 'github-copilot'`), which
// the literal scan cannot see, so a command may not name any harness-module export whose value
// is a table id either.

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { HARNESS_NAMES } from '../../../src/harness/adapters.ts'

const COMMANDS_DIR = join(import.meta.dir, '../../../src/commands')
const HARNESS_DIR = join(import.meta.dir, '../../../src/harness')

/** `file` may carry `id` as a string literal exactly `count` times, for the reason given. */
const CLAUDE_ONLY: readonly { file: string; id: string; count: number; why: string }[] = [
  {
    file: 'init.ts',
    id: 'claude',
    count: 2,
    why: 'the fresh-repo default harness and the .claude/settings.json permission merge',
  },
]

const transpiler = new Bun.Transpiler({ loader: 'ts' })

function literalCounts(source: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const id of HARNESS_NAMES) {
    const n = source.split(`"${id}"`).length - 1 + (source.split(`'${id}'`).length - 1)
    if (n > 0) counts.set(id, n)
  }
  return counts
}

/** The names `modules` export as a string that is exactly a `HARNESS_TABLE` id. */
export function idConstantNames(modules: Record<string, Record<string, unknown>>): string[] {
  const ids = new Set<string>(HARNESS_NAMES)
  return Object.values(modules).flatMap((mod) =>
    Object.entries(mod)
      .filter(([, value]) => typeof value === 'string' && ids.has(value))
      .map(([name]) => name),
  )
}

/** Which of `names` appear as a whole identifier in `source`. */
export function identifiersUsed(source: string, names: readonly string[]): string[] {
  return names.filter((name) => new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(source))
}

describe('the imported-constant scan', () => {
  test('finds an exported id constant and its use, and nothing that merely contains the name', () => {
    const names = idConstantNames({
      a: { COPILOT_HARNESS: 'github-copilot', NOT_AN_ID: 'something', COUNT: 3 },
    })
    expect(names).toEqual(['COPILOT_HARNESS'])
    expect(identifiersUsed('x.includes(COPILOT_HARNESS)', names)).toEqual(['COPILOT_HARNESS'])
    expect(identifiersUsed('MY_COPILOT_HARNESS_2', names)).toEqual([])
  })
})

describe('no tool-name branches in commands', () => {
  test('no HARNESS_TABLE id is a string literal in src/commands outside the Claude-only lines', () => {
    const found: string[] = []
    for (const file of readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.ts'))) {
      const source = transpiler.transformSync(readFileSync(join(COMMANDS_DIR, file), 'utf8'))
      for (const [id, count] of literalCounts(source)) {
        const allowed = CLAUDE_ONLY.find((a) => a.file === file && a.id === id)?.count ?? 0
        if (count !== allowed) found.push(`${file}: '${id}' x${count} (allowed ${allowed})`)
      }
    }
    expect(found).toEqual([])
  })

  test('no command names an exported constant whose value is a HARNESS_TABLE id', async () => {
    const modules: Record<string, Record<string, unknown>> = {}
    for (const file of readdirSync(HARNESS_DIR).filter((f) => f.endsWith('.ts'))) {
      modules[file] = await import(join(HARNESS_DIR, file))
    }
    const names = idConstantNames(modules)
    const found: string[] = []
    for (const file of readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.ts'))) {
      const source = transpiler.transformSync(readFileSync(join(COMMANDS_DIR, file), 'utf8'))
      for (const name of identifiersUsed(source, names)) found.push(`${file}: ${name}`)
    }
    expect(found).toEqual([])
  })

  test('every Claude-only exception still exists, so the allowlist cannot go stale', () => {
    for (const a of CLAUDE_ONLY) {
      const source = transpiler.transformSync(readFileSync(join(COMMANDS_DIR, a.file), 'utf8'))
      expect({ ...a, count: literalCounts(source).get(a.id) ?? 0 }).toEqual(a)
    }
  })
})
