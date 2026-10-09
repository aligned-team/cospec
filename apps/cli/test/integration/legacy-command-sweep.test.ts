// Pre-opsx leftovers are found for every tool (design decision 12, verification 9.1): every
// entry of the pinned binary's `LEGACY_SLASH_COMMAND_PATHS` that belongs to a harness row, so
// directory entries with their `managedFileNames`, `.opencode/command/` and
// `.qwen/commands/*.toml` included. Driven through doctor, `init --json` and `--remove-opsx`.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { openspecPackageDir } from '../../src/core/openspec.ts'
import { HARNESS_NAMES } from '../../src/harness/adapters.ts'
import { cleanupAll, cospec, mkTempRepo, oracleEnv } from '../fixtures/support.ts'

afterAll(cleanupAll)

type UpstreamEntry =
  | { type: 'directory'; path: string; managedFileNames: string[] }
  | { type: 'files'; pattern: string | string[] }

const { LEGACY_SLASH_COMMAND_PATHS } = (await import(
  join(openspecPackageDir(), 'dist/core/legacy-cleanup.js')
)) as { LEGACY_SLASH_COMMAND_PATHS: Record<string, UpstreamEntry> }

/** Upstream's entries for tools that have a row; the rest belong to rows a later task adds. */
const ENTRIES = Object.entries(LEGACY_SLASH_COMMAND_PATHS).filter(([id]) =>
  (HARNESS_NAMES as readonly string[]).includes(id),
)

const MARKED = '<!-- OPENSPEC:START -->\nOpenSpec instructions\n<!-- OPENSPEC:END -->\n'
// What every opsx-era command the pinned binary writes carries, whatever its wrapper.
const ROOT_GUARD = 'Run `openspec list --json` and read `root`.\n'

const USER_TEXT = '# My notes\n\nNot OpenSpec.\n'

interface Planted {
  /** Files that carry OpenSpec's own content, so a leftover. */
  leftovers: Map<string, string>
  /** Same-shaped files without it, so the user's. */
  decoys: Map<string, string>
  /** Directory entries holding nothing but what OpenSpec wrote. */
  folders: string[]
}

function plantEntries(): Planted {
  const planted: Planted = { leftovers: new Map(), decoys: new Map(), folders: [] }
  for (const [, entry] of ENTRIES) {
    if (entry.type === 'directory') {
      planted.folders.push(entry.path)
      for (const name of entry.managedFileNames) {
        planted.leftovers.set(`${entry.path}/${name}`, MARKED)
      }
      continue
    }
    for (const pattern of [entry.pattern].flat()) {
      const content = pattern.includes('/opsx-') ? ROOT_GUARD : MARKED
      planted.leftovers.set(pattern.replace('*', 'proposal'), content)
      planted.decoys.set(pattern.replace('*', 'notes'), USER_TEXT)
    }
  }
  return planted
}

function write(dir: string, rel: string, text: string): void {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), text)
}

function repoWith(planted: Planted): { dir: string; env: Record<string, string> } {
  const dir = mkTempRepo({ git: true })
  write(dir, 'openspec/config.yaml', 'schema: feat\n')
  for (const [rel, text] of [...planted.leftovers, ...planted.decoys]) write(dir, rel, text)
  for (const folder of planted.folders) mkdirSync(join(dir, folder), { recursive: true })
  return { dir, env: oracleEnv(mkTempRepo()) }
}

interface DoctorJson {
  findings: { check: string; message: string }[]
}

describe('pre-opsx leftovers at every LEGACY_SLASH_COMMAND_PATHS entry that has a row', () => {
  test('the pinned binary lists entries for rows we ship, the others owned by later rows', () => {
    expect(ENTRIES.map(([id]) => id).toSorted()).toEqual(
      Object.keys(LEGACY_SLASH_COMMAND_PATHS)
        .filter((id) => id !== 'github-copilot' && id !== 'antigravity')
        .toSorted(),
    )
  })

  test('doctor and init --json report each marker-carrying file and no other', async () => {
    const planted = plantEntries()
    const { dir, env } = repoWith(planted)
    const expected = [...planted.leftovers.keys()].toSorted()

    const doctor = await cospec(['doctor', '--json'], { cwd: dir, env })
    const findings = (JSON.parse(doctor.stdout) as DoctorJson).findings.filter(
      (f) => f.check === 'opsx-leftover',
    )
    const named = expected.filter((rel) => findings.some((f) => f.message.includes(` ${rel} `)))
    expect(named).toEqual(expected)
    expect(findings).toHaveLength(expected.length)

    const run = await cospec(['init', '--harness', 'none', '--no-gate', '--json'], {
      cwd: dir,
      env,
    })
    expect(run.exitCode).toBe(0)
    const doc = JSON.parse(run.stdout) as { opsx: { found: string[]; removed: boolean } }
    expect(doc.opsx.found.toSorted()).toEqual(expected)
  }, 120_000)

  test('--remove-opsx removes exactly those, empties each folder and keeps the user files', async () => {
    const planted = plantEntries()
    const { dir, env } = repoWith(planted)
    const run = await cospec(
      ['init', '--harness', 'none', '--no-gate', '--remove-opsx', '--json'],
      {
        cwd: dir,
        env,
      },
    )
    expect(run.exitCode).toBe(0)
    for (const rel of planted.leftovers.keys()) expect(existsSync(join(dir, rel))).toBe(false)
    for (const [rel, text] of planted.decoys)
      expect(readFileSync(join(dir, rel), 'utf8')).toBe(text)
    // A folder is removed once nothing is left in it, the empty `.lingma` one included.
    for (const folder of planted.folders) expect(existsSync(join(dir, folder))).toBe(false)
  }, 120_000)

  test('a legacy folder holding a user file keeps the folder and the file', async () => {
    const planted: Planted = { leftovers: new Map(), decoys: new Map(), folders: [] }
    for (const name of ['proposal.md', 'apply.md', 'archive.md']) {
      planted.leftovers.set(`.claude/commands/openspec/${name}`, MARKED)
    }
    // Carries the markers but is not a name OpenSpec wrote there, so it is the user's.
    planted.decoys.set('.claude/commands/openspec/mine.md', MARKED)
    const { dir, env } = repoWith(planted)

    const run = await cospec(
      ['init', '--harness', 'none', '--no-gate', '--remove-opsx', '--json'],
      {
        cwd: dir,
        env,
      },
    )
    expect(run.exitCode).toBe(0)
    expect((JSON.parse(run.stdout) as { opsx: { found: string[] } }).opsx.found.toSorted()).toEqual(
      [...planted.leftovers.keys()].toSorted(),
    )
    expect(readdirSync(join(dir, '.claude/commands/openspec'))).toEqual(['mine.md'])
    expect(readFileSync(join(dir, '.claude/commands/openspec/mine.md'), 'utf8')).toBe(MARKED)
  }, 60_000)
})
