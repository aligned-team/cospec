// Byte-identity baseline for `renderHarnessFiles`, captured BEFORE any source
// edit lands in this change (design.md "Migration steps" #1, tasks.md 1.1).
// Every later commit on this branch must leave these bytes untouched —
// `git diff --exit-code <this commit's sha> HEAD -- test/unit/__golden__/harness-render/`
// is verification 1.2.
//
// Write mode regenerates the committed golden files:
//   COSPEC_GOLDEN_WRITE=1 bun test test/unit/harness-render.test.ts
// Every other run only compares against them — Buffer-for-Buffer, plus the
// exact path set and the (path, kind, workflow, harness, contentHash) index —
// never `toMatchSnapshot`, which stores escaped strings and rewrites them in
// place on `--update-snapshots` (design.md decision 14).

import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { type HarnessName, renderHarnessFiles } from '../../src/harness/render.ts'
import { TEST_VERSION, TYPE_TABLE } from './harness/fixtures.ts'

const GOLDEN_ROOT = join(import.meta.dir, '__golden__/harness-render')
const WRITE = process.env.COSPEC_GOLDEN_WRITE === '1'

/** Each pinned tool rendered alone, plus all four together, in `HARNESS_NAMES` order. */
const RENDER_SETS: Record<string, HarnessName[]> = {
  claude: ['claude'],
  codex: ['codex'],
  opencode: ['opencode'],
  agents: ['agents'],
  all: ['claude', 'codex', 'opencode', 'agents'],
}

interface IndexRecord {
  path: string
  kind: string
  workflow: string | null
  harness: string
  contentHash: string | null
}

function goldenDir(name: string): string {
  return join(GOLDEN_ROOT, name)
}

/** Every committed file under a render's golden dir, sorted, `index.json` excluded. */
function listGoldenFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  const walk = (abs: string, rel: string): void => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`
      if (entry.isDirectory()) walk(join(abs, entry.name), childRel)
      else if (childRel !== 'index.json') out.push(childRel)
    }
  }
  walk(dir, '')
  return out.toSorted()
}

for (const [name, harnesses] of Object.entries(RENDER_SETS)) {
  const files = renderHarnessFiles({ harnesses, typeTable: TYPE_TABLE, version: TEST_VERSION })
  const index: IndexRecord[] = files
    .map((f) => ({
      path: f.path,
      kind: f.kind,
      workflow: f.workflow,
      harness: f.harness,
      contentHash: f.contentHash,
    }))
    .toSorted((a, b) => a.path.localeCompare(b.path))

  describe(`harness-render golden — ${name}`, () => {
    if (WRITE) {
      test(`writes the ${name} golden (COSPEC_GOLDEN_WRITE=1)`, () => {
        const dir = goldenDir(name)
        rmSync(dir, { recursive: true, force: true })
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
        for (const f of files) {
          const abs = join(dir, f.path)
          mkdirSync(dirname(abs), { recursive: true })
          writeFileSync(abs, f.content)
        }
        expect(files.length).toBeGreaterThan(0)
      })
      return
    }

    test(`${name} — exact path set matches the committed golden`, () => {
      expect(files.map((f) => f.path).toSorted()).toEqual(listGoldenFiles(goldenDir(name)))
    })

    test(`${name} — index.json matches (path, kind, workflow, harness, contentHash)`, () => {
      const committed = JSON.parse(
        readFileSync(join(goldenDir(name), 'index.json'), 'utf8'),
      ) as IndexRecord[]
      expect(index).toEqual(committed)
    })

    test(`${name} — every file is byte-identical to its committed golden`, () => {
      for (const f of files) {
        const committedBytes = readFileSync(join(goldenDir(name), f.path))
        expect(Buffer.from(f.content, 'utf8').equals(committedBytes)).toBe(true)
      }
    })
  })
}
