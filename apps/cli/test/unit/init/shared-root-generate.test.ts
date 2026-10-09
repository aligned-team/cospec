import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { detectHarnesses, generate } from '../../../src/commands/update.ts'
import { readManifest } from '../../../src/core/managed-files.ts'
import type { HarnessName } from '../../../src/harness/adapters.ts'
import { SHARED_TARGET_MARKER } from '../../../src/harness/shared-root.ts'
import { SHARED_ROOT_TABLE as TABLE } from '../harness/shared-root-table.ts'
import { cleanup, makeRepo } from './helpers.ts'

const MARKER = `.agents/skills/${SHARED_TARGET_MARKER}`

/** The synthetic table's ids, which the shipped `HarnessName` union does not all carry yet. */
const ids = (...names: string[]): HarnessName[] => names as HarnessName[]

let dir: string
beforeEach(() => {
  dir = makeRepo()
})
afterEach(() => {
  cleanup(dir)
})

const read = (relpath: string): string => readFileSync(join(dir, relpath), 'utf8')

describe('generate — one writer per shared skills root', () => {
  test('four rows on .agents write each shared file once and stamp the marker', () => {
    const { results, manifest, skillWriters } = generate(dir, {
      harnesses: ids('codex', 'agents', 'zed', 'antigravity'),
      adapters: TABLE,
    })
    const paths = results.map((r) => r.path)
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths.filter((p) => /^\.agents\/skills\/cospec-[^/]+\/SKILL\.md$/.test(p))).toHaveLength(
      12,
    )
    expect(paths.filter((p) => p.startsWith('.agents/workflows/cospec-'))).toHaveLength(12)
    expect(paths.filter((p) => p === '.codex/rules/cospec.rules')).toHaveLength(1)
    expect([...skillWriters]).toEqual(['codex'])
    expect(read(MARKER)).toBe('codex\n')
    expect(manifest.files[MARKER]).toBeDefined()
    // The shared tree is codex's dual spelling, not antigravity's flat one.
    expect(read('.agents/skills/cospec-propose/SKILL.md')).toContain('$cospec-')
  })

  test('the marker keeps the writer across runs, and detection follows it', () => {
    mkdirSync(join(dir, '.agents/skills'), { recursive: true })
    writeFileSync(join(dir, MARKER), 'agents\n')
    generate(dir, { harnesses: ids('agents', 'zed'), adapters: TABLE })
    expect(read(MARKER)).toBe('agents\n')
    expect(detectHarnesses(dir, TABLE)).toEqual(['agents'])
  })

  test('a non-writer with its own command surface is still detected by it', () => {
    generate(dir, { harnesses: ids('codex', 'antigravity'), adapters: TABLE })
    expect(read(MARKER)).toBe('codex\n')
    expect<string[]>(detectHarnesses(dir, TABLE)).toEqual(['codex', 'antigravity'])
  })

  test('a non-writer with no surface of its own is not detected from the shared tree', () => {
    generate(dir, { harnesses: ids('zed', 'codex'), adapters: TABLE })
    expect(detectHarnesses(dir, TABLE)).toEqual(['codex'])
  })

  test('the rules file alone detects codex', () => {
    generate(dir, { harnesses: ids('codex'), adapters: TABLE })
    // `rm -r .agents`: the shared tree and its marker are gone, the rules file stays.
    cleanup(join(dir, '.agents'))
    expect(detectHarnesses(dir, TABLE)).toEqual(['codex'])
  })

  test('re-generating from the detected set is a byte no-op', () => {
    generate(dir, { harnesses: ids('codex', 'agents', 'zed', 'antigravity'), adapters: TABLE })
    const detected = detectHarnesses(dir, TABLE)
    expect<string[]>(detected).toEqual(['codex', 'antigravity'])
    const { results } = generate(dir, { harnesses: detected, adapters: TABLE })
    expect(results.filter((r) => r.outcome !== 'unchanged')).toEqual([])
  })
})

describe('generate — the shipped table', () => {
  test('codex alone stamps the marker on the shared root it writes', () => {
    generate(dir, { harnesses: ['codex'] })
    expect(read(MARKER)).toBe('codex\n')
  })

  test('agents alone stamps the marker too', () => {
    generate(dir, { harnesses: ['agents'] })
    expect(read(MARKER)).toBe('agents\n')
  })

  test('a row alone on its root in the table writes no marker', () => {
    generate(dir, { harnesses: ['claude'] })
    expect(existsSync(join(dir, MARKER))).toBe(false)
  })

  test('--check writes no marker', () => {
    const { results } = generate(dir, { harnesses: ['codex'], dryRun: true })
    expect(results.find((r) => r.path === MARKER)?.outcome).toBe('created')
    expect(existsSync(join(dir, MARKER))).toBe(false)
  })

  test('deselecting the shared root removes the unmodified marker', () => {
    generate(dir, { harnesses: ['claude', 'agents'] })
    const { results } = generate(dir, { harnesses: ['claude'] })
    expect(results.find((r) => r.path === MARKER)?.outcome).toBe('removed')
    expect(readManifest(dir)?.files[MARKER]).toBeUndefined()
  })
})
