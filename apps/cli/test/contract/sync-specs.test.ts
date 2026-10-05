// archive-and-sync-parity: `cospec sync-specs <change>` merges a change's
// delta specs into the main specs without archiving it, by running the pinned
// binary's own `archive -y` on a scratch copy and copying back the main-spec
// files it changed. Every row compares against `openspec archive c1 -y` on a
// copy of the same fixture (file list and sha256 per file), read at test time.

import { afterAll, describe, expect, test } from 'bun:test'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'

import { formatLocalDate } from '../../src/commands/archive.ts'
import { respellRemedies } from '../../src/core/remedies.ts'
import { cleanupAll, cospec, hashTree, mkTempRepo, writeFiles } from '../fixtures/support.ts'
import {
  R7_ADDED_NEW,
  R7_CHORE,
  R7_DELTA_INVALID,
  R7_MODIFIED,
  R7_NAMESPACE,
  R7_NO_DELTA,
  R7_SCENARIO_DROP,
  R7_SHORT_PURPOSE,
  R7_SKIP_SPECS,
  R7_SKIP_SPECS_WITH_DELTA,
  R7_SYMLINKED_ALIAS,
  R7_SYNC_SHAPES,
  writeLivingSpec,
  type R7Fixture,
} from './fixtures.ts'
import { makeSandbox, setupStore } from './support/root-sandbox.ts'
import { oracle, oracleEnv } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

// --- harness -------------------------------------------------------------------

interface Run {
  exitCode: number
  stdout: string
  stderr: string
}

/** Every output a row captured from `cospec sync-specs`, for row 8.2. */
const CAPTURED: { row: string; text: string }[] = []

/**
 * A private temp directory for one cospec run (its `TMPDIR`), so a row can
 * prove the scratch tree is gone afterwards — or, made unwritable, that the
 * command never tried to create one.
 */
function privateTmp(): string {
  const dir = join(mkTempRepo(), 'tmp')
  mkdirSync(dir)
  return dir
}

/** `cospec <args>` in `root` under the oracle's sandbox env and `tmp` as `TMPDIR`. */
async function own(
  row: string,
  root: string,
  args: string[],
  tmp: string = privateTmp(),
  env: Record<string, string> = oracleEnv(root),
): Promise<Run> {
  const res = await cospec(args, { cwd: root, env: { ...env, TMPDIR: tmp } })
  // Row 8.2 sweeps what `sync-specs` itself printed, not the other commands a row runs.
  if (args[0] === 'sync-specs') CAPTURED.push({ row, text: `${res.stdout}\n${res.stderr}` })
  return res
}

/** `cospec <args>` with `TMPDIR` unwritable: a scratch directory cannot be made. */
async function ownWithoutScratch(row: string, root: string, args: string[]): Promise<Run> {
  const tmp = privateTmp()
  chmodSync(tmp, 0o500)
  try {
    return await own(row, root, args, tmp)
  } finally {
    chmodSync(tmp, 0o755)
  }
}

function binary(root: string, args: string[]): Promise<Run> {
  return oracle(args, root)
}

function twin(fixture: R7Fixture): { root: string; copy: string; name: string } {
  const root = mkTempRepo({ git: true })
  const copy = mkTempRepo({ git: true })
  const name = fixture.build(root)
  fixture.build(copy)
  return { root, copy, name }
}

function document(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>
}

const specsOf = (root: string): Record<string, string> =>
  existsSync(join(root, 'openspec/specs')) ? hashTree(join(root, 'openspec/specs')) : {}

/** Every directory under `openspec/specs/`, so a pruned directory shows. */
function specDirs(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true }))
      if (e.isDirectory()) {
        out.push(relative(root, join(dir, e.name)))
        walk(join(dir, e.name))
      }
  }
  if (existsSync(join(root, 'openspec/specs'))) walk(join(root, 'openspec/specs'))
  return out.toSorted()
}

const openspecOf = (root: string): Record<string, string> => hashTree(join(root, 'openspec'))

const changeOf = (root: string, name: string): Record<string, string> =>
  hashTree(join(root, 'openspec/changes', name))

const archiveEntries = (root: string): string[] =>
  readdirSync(join(root, 'openspec/changes/archive'))

/** Every `.openspec-archive.lock` under `root`. */
function locks(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const child = join(dir, e.name)
      if (e.name === '.openspec-archive.lock') out.push(relative(root, child))
      if (e.isDirectory() && e.name !== '.git' && e.name !== '.oracle-home') walk(child)
    }
  }
  walk(root)
  return out
}

/** Mark the fixture's verification row bare again. */
function unresolveVerification(root: string, name: string): void {
  writeFileSync(
    join(root, 'openspec/changes', name, 'verification.md'),
    '# Verification\n\n## 1. Widgets behave [critical]\n\n- [ ] 1.1 @integration (agent) render a widget -> rendered\n',
  )
}

// --- 9. sync-specs writes archive's main specs and leaves the change active -------

describe("9. sync-specs writes archive's main specs and leaves the change active", () => {
  for (const fixture of R7_SYNC_SHAPES)
    test(`9.1 ${fixture.key}: the main specs are the binary's archive's, byte for byte`, async () => {
      const { root, copy, name } = twin(fixture)
      const change = changeOf(root, name)
      const tmp = privateTmp()
      const res = await own('9.1', root, ['sync-specs', name], tmp)
      const up = await binary(copy, ['archive', name, '-y'])
      expect([res.exitCode, up.exitCode]).toEqual([0, 0])
      expect(specsOf(root)).toEqual(specsOf(copy))
      expect(specDirs(root)).toEqual(specDirs(copy))
      expect(changeOf(root, name)).toEqual(change)
      expect(archiveEntries(root)).toEqual([])
      expect(readdirSync(tmp)).toEqual([])
    })

  for (const fixture of R7_SYNC_SHAPES)
    test(`9.2 ${fixture.key}: a later archive is the no-op merge`, async () => {
      const root = mkTempRepo({ git: true })
      const name = fixture.build(root)
      expect((await own('9.2', root, ['sync-specs', name])).exitCode).toBe(0)
      const synced = specsOf(root)
      const res = await own('9.2', root, ['archive', name])
      expect(res.exitCode).toBe(0)
      expect(existsSync(join(root, 'openspec/changes', name))).toBe(false)
      expect(res.stdout).toContain('Specs:    already in sync\n')
      expect(specsOf(root)).toEqual(synced)
    })

  for (const fixture of R7_SYNC_SHAPES)
    test(`9.3 ${fixture.key}: the verification gate still runs after a sync`, async () => {
      const root = mkTempRepo({ git: true })
      const name = fixture.build(root)
      expect((await own('9.3', root, ['sync-specs', name])).exitCode).toBe(0)
      unresolveVerification(root, name)
      const res = await own('9.3', root, ['archive', name])
      expect(res.exitCode).toBe(1)
      expect(res.stderr).toContain('verification.md is not fully resolved')
    })

  test('9.3 modified: the scenario gate still runs after a sync', async () => {
    const root = mkTempRepo({ git: true })
    const name = R7_MODIFIED.build(root)
    expect((await own('9.3', root, ['sync-specs', name])).exitCode).toBe(0)
    const living = join(root, 'openspec/specs/widgets/spec.md')
    const text = await Bun.file(living).text()
    writeFileSync(
      living,
      text.replace(
        '- **THEN** a widget is rendered\n',
        '- **THEN** a widget is rendered\n\n#### Scenario: Render a large widget\n\n- **WHEN** a caller requests a large widget\n- **THEN** it is rendered at scale\n',
      ),
    )
    const res = await own('9.3', root, ['archive', name])
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('scenario-preservation gate refused')
  })

  test('9.4 a second sync reports in sync and writes nothing', async () => {
    const root = mkTempRepo({ git: true })
    const name = R7_MODIFIED.build(root)
    expect((await own('9.4', root, ['sync-specs', name])).exitCode).toBe(0)
    const once = openspecOf(root)
    const res = await own('9.4', root, ['sync-specs', name])
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('Specs:    already in sync; no files changed\n')
    expect(res.stdout).not.toContain('Synced:')
    expect(openspecOf(root)).toEqual(once)
  })
})

// --- 10. sync-specs refuses what archive refuses -----------------------------------

describe('10. sync-specs refuses what archive refuses', () => {
  test('10.1 a scenario-dropping MODIFIED: refused, nothing written, no scratch left', async () => {
    const { root, copy, name } = twin(R7_SCENARIO_DROP)
    const before = openspecOf(root)
    const tmp = privateTmp()
    const res = await own('10.1', root, ['sync-specs', name], tmp)
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('cospec sync-specs: scenario-preservation gate refused')
    expect(openspecOf(root)).toEqual(before)
    expect(readdirSync(tmp)).toEqual([])
    const up = await binary(copy, ['archive', name, '-y'])
    expect(up.exitCode).toBe(1)
  })

  test('10.2 a change revalidation refuses: the report, nothing spawned or written', async () => {
    const root = mkTempRepo({ git: true })
    const name = R7_DELTA_INVALID.build(root)
    const before = openspecOf(root)
    const res = await ownWithoutScratch('10.2', root, ['sync-specs', name])
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('cospec sync-specs')
    expect(res.stdout).toContain('deltas/requirement-shape')
    expect(openspecOf(root)).toEqual(before)
  })
  test.failing(
    '10.2 skip_specs: true beside a delta file: refused as archive refuses it',
    async () => {
      const root = mkTempRepo({ git: true })
      const name = R7_SKIP_SPECS_WITH_DELTA.build(root)
      const archived = await own('10.2', root, ['archive', name])
      expect(archived.exitCode).toBe(1)
      expect(archived.stdout).toContain('deltas/skip-specs-conflict')
      const before = openspecOf(root)
      const res = await ownWithoutScratch('10.2', root, ['sync-specs', name])
      expect(res.exitCode).toBe(1)
      expect(res.stdout).toContain('cospec sync-specs')
      expect(res.stdout).toContain('deltas/skip-specs-conflict')
      expect(openspecOf(root)).toEqual(before)
    },
  )
})

// --- 11. a failed scratch run leaves nothing in the real tree ----------------------

describe('11. a failed scratch run leaves nothing in the real tree', () => {
  test('11.1 the binary refuses after its claim: its reason relayed, no lock, tree unchanged', async () => {
    const root = mkTempRepo({ git: true })
    const name = R7_SYMLINKED_ALIAS.build(root)
    expect((await own('11.1', root, ['validate', name, '--strict'])).exitCode).toBe(0)
    const before = openspecOf(root)
    const tmp = privateTmp()
    const res = await own('11.1', root, ['sync-specs', name], tmp)
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('resolve to the same target')
    expect(locks(root)).toEqual([])
    expect(openspecOf(root)).toEqual(before)
    expect(readdirSync(tmp)).toEqual([])
  })

  test('11.3 sibling changes and a taken archive slot are never copied', async () => {
    const root = mkTempRepo({ git: true })
    const name = R7_MODIFIED.build(root)
    for (const sibling of ['c2', 'c3'])
      cpSync(join(root, 'openspec/changes', name), join(root, 'openspec/changes', sibling), {
        recursive: true,
      })
    writeFiles(root, {
      [`openspec/changes/archive/${formatLocalDate()}-${name}/.openspec.yaml`]:
        'schema: feat\ncreated: 2026-10-05\nschemaVersion: 2\n',
    })
    const changes = hashTree(join(root, 'openspec/changes'))
    const specs = specsOf(root)
    const res = await own('11.3', root, ['sync-specs', name])
    expect(res.exitCode).toBe(0)
    expect(hashTree(join(root, 'openspec/changes'))).toEqual(changes)
    expect(Object.keys(specsOf(root))).toEqual(Object.keys(specs))
    expect(specsOf(root)).not.toEqual(specs)
  })

  test('11.4 a symlink leading outside the copied tree is refused before any spawn', async () => {
    const root = mkTempRepo({ git: true })
    const name = R7_MODIFIED.build(root)
    const outside = mkTempRepo()
    writeLivingSpec(outside, 'ext', '# ext\n')
    symlinkSync(join(outside, 'openspec/specs/ext'), join(root, 'openspec/specs/ext'))
    const before = openspecOf(root)
    const res = await ownWithoutScratch('11.4', root, ['sync-specs', name])
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('openspec/specs/ext')
    expect(res.stderr).toContain('leads outside')
    expect(openspecOf(root)).toEqual(before)
  })
})

// --- 12. sync-specs output ----------------------------------------------------------

describe('12. sync-specs output', () => {
  test('12.1 text and --json on the MODIFIED fixture', async () => {
    const text = mkTempRepo({ git: true })
    const json = mkTempRepo({ git: true })
    const name = R7_MODIFIED.build(text)
    R7_MODIFIED.build(json)
    const t = await own('12.1', text, ['sync-specs', name])
    expect(t.exitCode).toBe(0)
    expect(t.stdout).toBe(
      'Synced:   openspec/specs/widgets/spec.md (written)\nTotals:   + 0, ~ 1, - 0, → 0\n',
    )
    const j = await own('12.1', json, ['sync-specs', name, '--json'])
    expect(j.exitCode).toBe(0)
    expect(document(j.stdout)).toEqual({
      change: name,
      type: 'feat',
      synced: true,
      totals: { added: 0, modified: 1, removed: 0, renamed: 0 },
      files: { written: ['openspec/specs/widgets/spec.md'], deleted: [] },
      warnings: [],
      root: { path: expect.any(String), source: 'nearest' },
    })
  })

  test('12.1 text on a new capability names the created file', async () => {
    const root = mkTempRepo({ git: true })
    const name = R7_ADDED_NEW.build(root)
    const res = await own('12.1', root, ['sync-specs', name])
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('Synced:   openspec/specs/widgets/spec.md (written)\n')
    expect(res.stdout).toContain('Totals:   + 1, ~ 0, - 0, → 0\n')
  })

  const nothing: { fixture: R7Fixture; why: string; reason: string }[] = [
    { fixture: R7_CHORE, why: 'the chore schema has no specs artifact', reason: 'schema' },
    { fixture: R7_NO_DELTA, why: 'c1 has no delta specs', reason: 'no-deltas' },
    { fixture: R7_SKIP_SPECS, why: 'c1 declares skip_specs: true', reason: 'skip-specs' },
  ]
  for (const n of nothing)
    test(`12.2 ${n.fixture.key}: nothing to sync, and why, spawning nothing`, async () => {
      const text = mkTempRepo({ git: true })
      const json = mkTempRepo({ git: true })
      const name = n.fixture.build(text)
      n.fixture.build(json)
      const before = openspecOf(text)
      const t = await ownWithoutScratch('12.2', text, ['sync-specs', name])
      expect(t.exitCode).toBe(0)
      expect(t.stdout).toBe(`Nothing to sync: ${n.why}.\n`)
      expect(openspecOf(text)).toEqual(before)
      const j = await ownWithoutScratch('12.2', json, ['sync-specs', name, '--json'])
      expect(j.exitCode).toBe(0)
      const doc = document(j.stdout)
      expect([doc.synced, doc.skipReason]).toEqual([false, n.reason])
    })

  test("12.3 --store syncs the store's main specs and leaves the cwd repo alone", async () => {
    const sb = await makeSandbox([])
    const store = await setupStore(sb, 'alpha')
    const name = R7_MODIFIED.build(store)
    const repo = join(sb.dir, 'repo')
    mkdirSync(repo)
    R7_MODIFIED.build(repo)
    const repoBefore = openspecOf(repo)
    const storeBefore = specsOf(store)
    const res = await own(
      '12.3',
      repo,
      ['sync-specs', name, '--store', 'alpha'],
      privateTmp(),
      sb.env,
    )
    expect(res.exitCode).toBe(0)
    expect(specsOf(store)).not.toEqual(storeBefore)
    expect(openspecOf(repo)).toEqual(repoBefore)
  })

  test('12.4 an unknown change under --json is one failure document', async () => {
    const root = mkTempRepo({ git: true })
    R7_MODIFIED.build(root)
    const res = await own('12.4', root, ['sync-specs', 'nope', '--json'])
    expect(res.exitCode).toBe(1)
    const doc = document(res.stdout)
    expect(doc).toMatchObject({ change: 'nope', synced: false })
    expect((doc.status as { code: string; message: string }[])[0]).toMatchObject({
      code: 'archive_change_not_found',
      message: "Change 'nope' not found. Available changes: c1",
    })
  })

  test("12.4 a refused scratch run under --json carries archive_error and the binary's reason", async () => {
    const root = mkTempRepo({ git: true })
    const name = R7_SYMLINKED_ALIAS.build(root)
    const res = await own('12.4', root, ['sync-specs', name, '--json'])
    expect(res.exitCode).toBe(1)
    const doc = document(res.stdout)
    expect(doc).toMatchObject({ change: name, synced: false })
    const status = (doc.status as { code: string; message: string }[])[0]!
    expect(status.code).toBe('archive_error')
    expect(status.message).toContain('resolve to the same target')
  })
})

// --- 5.2 a namespace folder ----------------------------------------------------------

describe('5.2 sync-specs refuses a namespace folder', () => {
  test("text and --json: Cannot sync 'mobile', nothing spawned or written", async () => {
    const root = mkTempRepo({ git: true })
    const name = R7_NAMESPACE.build(root)
    const before = openspecOf(root)
    const t = await ownWithoutScratch('5.2', root, ['sync-specs', name])
    expect(t.exitCode).toBe(1)
    expect(t.stderr).toStartWith(
      'cospec sync-specs: Cannot sync \'mobile\': "mobile" is not a change',
    )
    expect(t.stderr).toContain(
      'Rename openspec/changes/mobile/refresh/ to a flat change directory, then sync it.',
    )
    const j = await ownWithoutScratch('5.2', root, ['sync-specs', name, '--json'])
    expect(j.exitCode).toBe(1)
    const status = (document(j.stdout).status as { code: string; message: string }[])[0]!
    expect(status.code).toBe('archive_change_is_namespace_folder')
    expect(status.message).toStartWith("Cannot sync 'mobile': ")
    expect(openspecOf(root)).toEqual(before)
  })
})

// --- 8. relayed output is spelled cospec ----------------------------------------------

describe('8. relayed sync-specs output is spelled cospec', () => {
  test('8.1 the carried-Purpose warning names cospec validate', async () => {
    const root = mkTempRepo({ git: true })
    const name = R7_SHORT_PURPOSE.build(root)
    const res = await own('8.1', root, ['sync-specs', name])
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toMatch(
      /Warning: {2}widgets - carried Purpose is under \d+ characters; cospec validate --strict reports it as too brief\.\n/,
    )
  })

  // Runs last: every output the rows above captured.
  test('8.2 no captured output names a bare allowlisted openspec command', () => {
    expect(CAPTURED.some(({ row }) => row === '8.1')).toBe(true)
    // Only rows where sync-specs ran to an answer of its own count: today's
    // tree has no such command, so this row is failing-first.
    expect(CAPTURED.every(({ text }) => !text.includes("unknown command 'sync-specs'"))).toBe(true)
    const bare = CAPTURED.filter(({ text }) => respellRemedies(text) !== text).map(({ row }) => row)
    expect(bare).toEqual([])
  })
})
