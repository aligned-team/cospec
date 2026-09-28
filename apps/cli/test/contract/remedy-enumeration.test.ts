// Every sentence the pinned binary can print that names a bare `openspec
// <command>` is in at least one of three categories (`support/remedy-sources.ts`):
// cospec's remedy allowlist (`core/remedies.ts`), which failure relays respell
// verbatim; never printed by a cospec relay, with the reason; or reachable
// unspelled through a successful answer cospec relays untouched, owned by the
// roadmap PR named beside it (`REACHABLE_OWNED`). Reads the pinned package
// itself — both the compiled `dist/**/*.js` (what runs) and the spec-driven
// schema's `schemas/**/*.{yaml,md}` (the built-in schema's own instruction
// text and templates, which `cospec instructions` relays untouched for a
// change on that schema) — so a future pin that adds or rewords such a
// sentence in either tree fails here until it is classified, and no new
// remedy reaches a cospec user unaccounted for.

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { openspecPackageDir } from '../../src/core/openspec.ts'
import { REMEDIES } from '../../src/core/remedies.ts'
import {
  NOT_RELAYED_TREES,
  notRelayed,
  OWNERS,
  REACHABLE_OWNED,
  REMEDY_SOURCES,
  SUCCESS_RELAYS,
} from './support/remedy-sources.ts'

const DIST = join(openspecPackageDir(), 'dist')
const SCHEMAS = join(openspecPackageDir(), 'schemas')

/** A bare `openspec` naming a command, spelled out or built from a hole. */
const NAMES_A_COMMAND = /\bopenspec (?:[a-z]|\$\{)/

/** A compiled JS line that is a comment, which the binary never prints. */
const JS_COMMENT = /^(?:\/\/|\/\*|\*)/

/** A YAML line that is a whole-line comment (never part of a rendered value). */
const YAML_COMMENT = /^#/

/**
 * A line the source never renders to a user, by the syntax of its file. A
 * `.md` template has no such construct here: an HTML comment in
 * `schemas/**\/*.md` is guidance text the schema's own template preserves
 * byte-for-byte into the artifact file `cospec instructions` writes, so it
 * reaches the user same as any other line and is never treated as a comment.
 */
function isComment(file: string, line: string): boolean {
  if (file.endsWith('.yaml')) return YAML_COMMENT.test(line)
  if (file.endsWith('.md')) return false
  return JS_COMMENT.test(line)
}

function modules(dir: string, extensions: readonly string[]): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return modules(path, extensions)
    return extensions.some((ext) => entry.name.endsWith(ext)) ? [path] : []
  })
}

function sourceEntries(dir: string, extensions: readonly string[], keyPrefix: string) {
  return modules(dir, extensions).map((path): [string, string[]] => [
    keyPrefix + relative(dir, path).split('\\').join('/'),
    readFileSync(path, 'utf8')
      .split('\n')
      .map((line) => line.trim()),
  ])
}

/**
 * Each source file the pinned package ships that can print a bare `openspec
 * <command>` to a user, keyed by its trimmed source lines: the compiled
 * `dist/**\/*.js` (relative to `dist/`, no prefix — the existing key shape
 * every `REMEDY_SOURCES`/`REACHABLE_OWNED` entry already uses) and the
 * built-in spec-driven schema's `schemas/**\/*.{yaml,md}` (relative to
 * `schemas/`, `schemas/`-prefixed so the two trees never collide).
 */
const SOURCE = new Map([
  ...sourceEntries(DIST, ['.js'], ''),
  ...sourceEntries(SCHEMAS, ['.yaml', '.md'], 'schemas/'),
])

const key = (file: string, line: string) => `${file}\n${line}`
const CLASSIFIED = new Map<string, string[]>()
for (const [file, line, where] of REMEDY_SOURCES) {
  CLASSIFIED.set(key(file, line), [...(CLASSIFIED.get(key(file, line)) ?? []), where])
}
const REMEDY_IDS = new Set(REMEDIES.map((remedy) => remedy.id))
const REASONS = new Set<string>(Object.values(notRelayed))
const REACHABLE = new Set(REACHABLE_OWNED.map(([file, line]) => key(file, line)))

describe('every dist sentence naming a bare openspec command is classified', () => {
  test('the source tree has lines to classify', () => {
    expect(SOURCE.size).toBeGreaterThan(100)
  })

  test('the schema tree is walked too', () => {
    expect([...SOURCE.keys()].some((file) => file.startsWith('schemas/'))).toBe(true)
  })

  test('each such line is allowlisted, never relayed, or reachable and owned', () => {
    const unclassified: string[] = []
    for (const [file, lines] of SOURCE) {
      if (NOT_RELAYED_TREES.some(([prefix]) => file.startsWith(prefix))) continue
      for (const line of lines) {
        if (isComment(file, line) || !NAMES_A_COMMAND.test(line)) continue
        const k = key(file, line)
        if (!CLASSIFIED.has(k) && !REACHABLE.has(k)) unclassified.push(`${file}: ${line}`)
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

  test('each reachable line is still in the pinned dist', () => {
    const stale = REACHABLE_OWNED.filter(
      ([file, line]) => !(SOURCE.get(file) ?? []).includes(line),
    ).map(([file, line]) => `${file}: ${line}`)
    expect(stale).toEqual([])
  })

  test('each reachable line names a success relay and its owning roadmap PR', () => {
    const owners = new Set<string>(OWNERS)
    const relays = new Set<string>(SUCCESS_RELAYS)
    const unknown = REACHABLE_OWNED.filter(
      ([, , relay, owner]) => !relays.has(relay) || !owners.has(owner),
    )
    expect(unknown).toEqual([])
    const seen = REACHABLE_OWNED.map(([file, line, relay]) => `${key(file, line)}\n${relay}`)
    expect(seen.length).toBe(new Set(seen).size)
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

describe("shared.js's default new-change hint is never printed", () => {
  // `validateChangeExists(…, hints)` falls back to a bare
  // `openspec new change <name>` only when its caller passes no hint. Every
  // caller in the pinned dist passes one (spelled through the allowlist as
  // `workflow/new-change-hint` on its own line), and `templates` never calls
  // it, so the fallback line is classified as never relayed, not as an
  // allowlist entry some relay reaches.
  const DEFAULT_HINT = "const newChangeHint = hints.newChangeHint ?? 'openspec new change <name>';"

  test('every validateChangeExists caller passes its own newChangeHint', () => {
    const calls = [...SOURCE]
      .filter(([file]) => file !== 'commands/workflow/shared.js')
      .flatMap(([file, lines]) =>
        lines
          .filter((line) => line.includes('validateChangeExists(') && !line.startsWith('import'))
          .map((line) => `${file}: ${line}`),
      )
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.filter((call) => !call.includes('newChangeHint'))).toEqual([])
    expect(calls.some((call) => call.startsWith('commands/workflow/templates.js'))).toBe(false)
  })

  test('its fallback line is classified as never relayed', () => {
    expect(CLASSIFIED.get(key('commands/workflow/shared.js', DEFAULT_HINT))).toEqual([
      notRelayed.DEFAULT_NEW_CHANGE_HINT,
    ])
  })
})
