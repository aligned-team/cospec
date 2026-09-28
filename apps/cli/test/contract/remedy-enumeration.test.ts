// Every sentence the pinned binary can print that names a bare `openspec
// <command>` is either in cospec's remedy allowlist (`core/remedies.ts`), which
// relays respell verbatim, or listed with the reason no cospec relay ever
// prints it (`support/remedy-sources.ts`). Reads the pinned dist itself: a
// future pin that adds or rewords such a sentence fails here until it is
// classified, so no new remedy reaches a cospec user unspelled.

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { openspecPackageDir } from '../../src/core/openspec.ts'
import { REMEDIES } from '../../src/core/remedies.ts'
import { NOT_RELAYED_TREES, notRelayed, REMEDY_SOURCES } from './support/remedy-sources.ts'

const DIST = join(openspecPackageDir(), 'dist')

/** A bare `openspec` naming a command, spelled out or built from a hole. */
const NAMES_A_COMMAND = /\bopenspec (?:[a-z]|\$\{)/

/** A compiled line that is a comment, which the binary never prints. */
const COMMENT = /^(?:\/\/|\/\*|\*)/

function modules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return modules(path)
    return entry.name.endsWith('.js') ? [path] : []
  })
}

/** Each dist module (relative to dist/) with its trimmed source lines. */
const SOURCE = new Map(
  modules(DIST).map((path) => [
    relative(DIST, path).split('\\').join('/'),
    readFileSync(path, 'utf8')
      .split('\n')
      .map((line) => line.trim()),
  ]),
)

const key = (file: string, line: string) => `${file}\n${line}`
const CLASSIFIED = new Map<string, string[]>()
for (const [file, line, where] of REMEDY_SOURCES) {
  CLASSIFIED.set(key(file, line), [...(CLASSIFIED.get(key(file, line)) ?? []), where])
}
const REMEDY_IDS = new Set(REMEDIES.map((remedy) => remedy.id))
const REASONS = new Set<string>(Object.values(notRelayed))

describe('every dist sentence naming a bare openspec command is classified', () => {
  test('the dist has lines to classify', () => {
    expect(SOURCE.size).toBeGreaterThan(100)
  })

  test('each such line is an allowlisted remedy or listed as never relayed', () => {
    const unclassified: string[] = []
    for (const [file, lines] of SOURCE) {
      if (NOT_RELAYED_TREES.some(([prefix]) => file.startsWith(prefix))) continue
      for (const line of lines) {
        if (COMMENT.test(line) || !NAMES_A_COMMAND.test(line)) continue
        if (!CLASSIFIED.has(key(file, line))) unclassified.push(`${file}: ${line}`)
      }
    }
    expect(unclassified).toEqual([])
  })

  test('each classified line is still in the pinned dist', () => {
    const stale = REMEDY_SOURCES.filter(
      ([file, line]) => !(SOURCE.get(file) ?? []).includes(line),
    ).map(([file, line]) => `${file}: ${line}`)
    expect(stale).toEqual([])
  })

  test('each line names an allowlist entry or a reason it is never relayed', () => {
    const unknown = REMEDY_SOURCES.filter(
      ([, , where]) => !REMEDY_IDS.has(where) && !REASONS.has(where),
    )
    expect(unknown).toEqual([])
  })

  test('each never-relayed tree exists in the dist', () => {
    for (const [prefix] of NOT_RELAYED_TREES)
      expect(
        [...SOURCE.keys()].some((file) => file.startsWith(prefix)),
        prefix,
      ).toBe(true)
  })
})

/** A source line with its JS string escapes undone. */
const unescape = (line: string) => line.replace(/\\([`"'\\])/g, '$1')

describe('every allowlist entry is one of the pinned dist sentences', () => {
  for (const remedy of REMEDIES) {
    test(remedy.id, () => {
      const lines = REMEDY_SOURCES.filter(([, , where]) => where === remedy.id).map(([, line]) =>
        unescape(line),
      )
      expect(lines.length).toBeGreaterThan(0)
      // Each `openspec …` run in the entry's literal text, up to a hole or a
      // quote, stands in one of its source lines.
      const runs = remedy.upstream
        .split(/\{(?:id|text|store|sgr|cmd)\}/)
        .flatMap((part) => part.match(/openspec [^`"'{]*/g) ?? [])
      for (const run of runs)
        expect(
          lines.some((line) => line.includes(run)),
          `${remedy.id}: ${run}`,
        ).toBe(true)
      // A sentence a `{cmd}` hole ends names no command itself; its own text
      // is in its source line.
      if (runs.length === 0) {
        const first = remedy.upstream.split(/\{(?:id|text|store|sgr|cmd)\}/)[0]!
        expect(
          lines.some((line) => line.includes(first)),
          `${remedy.id}: ${first}`,
        ).toBe(true)
      }
    })
  }
})
