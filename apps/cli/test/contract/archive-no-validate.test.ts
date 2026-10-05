// archive-and-sync-parity: `cospec archive` beside the pinned binary's own
// archive — `--no-validate`, the JSON documents, the scenario-preservation
// gate on the verbatim view, an unreadable archive directory, namespace
// folders, REMOVED on a new capability, the Specs line and relayed remedies.
// Every expectation about upstream is read from the binary at test time.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, realpathSync, renameSync } from 'node:fs'
import { join, relative } from 'node:path'

import { formatLocalDate } from '../../src/commands/archive.ts'
import { COMMAND_TABLE } from '../../src/core/command-table.ts'
import { respellRemedies } from '../../src/core/remedies.ts'
import { errnoShape } from '../fixtures/errno.ts'
import {
  cleanupAll,
  cospec,
  hashTree,
  mkTempRepo,
  openspec,
  writeFiles,
} from '../fixtures/support.ts'
import {
  R7_ARCHIVE_UNREADABLE,
  R7_BARE_VERIFICATION,
  R7_CHORE,
  R7_COMMENT_KEPT,
  R7_COMMENTED_LIVING_HEADER,
  R7_COMMENTED_LIVING_SCENARIO,
  R7_DELTA_INVALID,
  R7_FIXTURES,
  R7_INCOMPLETE_TASK,
  R7_MODIFIED,
  R7_NAMESPACE,
  R7_NEW_ADDED_REMOVED,
  R7_NEW_MODIFIED,
  R7_NEW_REMOVED_ONLY,
  R7_NEW_REMOVED_ONLY_MARKED,
  R7_NEW_RENAMED,
  R7_NO_DELTA,
  R7_RETIRED,
  R7_REVALIDATION_ONLY,
  R7_SCENARIO_DROP,
  R7_SHORT_PURPOSE,
  R7_SYNCED_MODIFIED,
  R7_SYNCED_SHAPES,
  R7_UNRELATED_UNREADABLE,
  restoreArchiveMode,
  restoreUnrelatedMode,
  type R7Fixture,
} from './fixtures.ts'
import { byKey, checkNativeKeys, compareDocuments, type OracleSpec } from './support/key-oracle.ts'
import { oracle, oracleEnv } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

/** Build `fixture` in a fresh repo, run `fn`, and leave the tree removable. */
async function withFixture<T>(
  fixture: R7Fixture,
  fn: (root: string, name: string) => Promise<T>,
): Promise<T> {
  const root = mkTempRepo({ git: true })
  const name = fixture.build(root)
  try {
    return await fn(root, name)
  } finally {
    if (fixture.key === 'archive-unreadable') restoreArchiveMode(root)
  }
}

describe('fixtures: each builder reads as both validators are told it does', () => {
  for (const fixture of R7_FIXTURES) {
    test(`${fixture.key}: openspec validate --strict`, () =>
      withFixture(fixture, async (root, name) => {
        const res = await openspec(['validate', name, '--strict'], root)
        expect({ valid: res.exitCode === 0, out: res.stdout + res.stderr }).toEqual({
          valid: fixture.binaryValid,
          out: expect.any(String),
        })
      }))
    test(`${fixture.key}: cospec validate --strict`, () =>
      withFixture(fixture, async (root, name) => {
        const res = await cospec(['validate', name, '--strict'], { cwd: root })
        expect({ valid: res.exitCode === 0, out: res.stdout + res.stderr }).toEqual({
          valid: fixture.cospecValid,
          out: expect.any(String),
        })
      }))
  }
})

// --- harness -------------------------------------------------------------------

interface Run {
  exitCode: number
  stdout: string
  stderr: string
}

/** Every output a row captured from `cospec archive`, for row 8.2. */
const CAPTURED: { row: string; text: string }[] = []

/** `cospec <args>` in `root`, under the sandbox env the oracle's child sees. */
async function own(row: string, root: string, args: string[]): Promise<Run> {
  const res = await cospec(args, { cwd: root, env: oracleEnv(root) })
  // Row 8.2 sweeps what `archive` itself printed, not the other commands a row runs.
  if (args[0] === 'archive') CAPTURED.push({ row, text: `${res.stdout}\n${res.stderr}` })
  return res
}

/** The pinned binary with `args`, in `root`. */
function binary(root: string, args: string[]): Promise<Run> {
  return oracle(args, root)
}

/** `fixture` built twice: `root` for cospec, `copy` for the binary. */
function twin(fixture: R7Fixture): { root: string; copy: string; name: string } {
  const root = mkTempRepo({ git: true })
  const copy = mkTempRepo({ git: true })
  const name = fixture.build(root)
  fixture.build(copy)
  return { root, copy, name }
}

/** The one JSON document `stdout` must be. */
function document(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>
}

const specsOf = (root: string): Record<string, string> =>
  existsSync(join(root, 'openspec/specs')) ? hashTree(join(root, 'openspec/specs')) : {}

const changeDir = (root: string, name: string): string => join(root, 'openspec/changes', name)

const archived = (root: string, name: string): boolean => !existsSync(changeDir(root, name))

/** Every `.openspec-archive.lock` under `root`. */
function locks(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EACCES') return
      throw error
    }
    for (const entry of entries) {
      const child = join(dir, entry.name)
      if (entry.name === '.openspec-archive.lock') out.push(relative(root, child))
      if (entry.isDirectory() && entry.name !== '.git' && entry.name !== '.oracle-home') walk(child)
    }
  }
  walk(root)
  return out
}

/** `message` with `root`'s canonical path written `<root>`. */
const underRoot = (root: string, message: string): string =>
  message.replaceAll(realpathSync(root), '<root>')

const slotFor = (name: string): string => `${formatLocalDate()}-${name}`

/** The banner `--no-validate` prints before its first gate. */
function expectBanner(stderr: string): void {
  expect(stderr).toContain('--no-validate skips revalidation')
  expect(stderr).toContain('archive/verification-incomplete')
  expect(stderr).toContain('archive/scenario-preservation')
}

/** cospec's archive keys before this change, and their values for a fixture. */
const COSPEC_KEYS = [
  'change',
  'type',
  'archived',
  'target',
  'specs',
  'retired',
  'warnings',
  'blockers',
] as const

function nativeSuccess(
  name: string,
  specs: Record<string, number> | 'skipped',
  warnings: string[] = [],
): Record<string, unknown> {
  return {
    change: name,
    type: 'feat',
    archived: true,
    target: slotFor(name),
    specs,
    retired: [],
    warnings,
    blockers: { checkedOff: [], nowUnblocked: [] },
  }
}

/** A failure document's `status[]`, paired by code. */
const STATUS = { 'status[]': { upstream: byKey('code'), cospec: byKey('code') } } as const

const roots = (copy: string, root: string): OracleSpec['paths'] => ({
  keys: ['archive.path', 'root.path'],
  upstreamRoot: realpathSync(copy),
  cospecRoot: realpathSync(root),
})

// --- 1. --no-validate skips only revalidation ----------------------------------

describe('1. archive --no-validate skips only revalidation', () => {
  test('1.1 the pending entry is gone and the flag is handled in the command table', () => {
    const pendingYaml = readFileSync(join(import.meta.dir, 'parity-pending.yaml'), 'utf8')
    expect(pendingYaml.match(/owner: archive-and-sync-parity/g) ?? []).toEqual([])
    const flag = COMMAND_TABLE.find((r) => r.name === 'archive')?.flags.find(
      (f) => f.name === '--no-validate',
    )
    expect(flag).toBeDefined()
    expect(JSON.stringify(flag!.status)).not.toContain('pending')
  })

  test('1.2 a bare [ ] verification row is still refused', async () => {
    const root = mkTempRepo({ git: true })
    const name = R7_BARE_VERIFICATION.build(root)
    const res = await own('1.2', root, ['archive', name, '--no-validate'])
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('verification.md is not fully resolved')
    expectBanner(res.stderr)
    expect(archived(root, name)).toBe(false)
  })

  test('1.3 a scenario-dropping MODIFIED is still refused, as the binary refuses it', async () => {
    const { root, copy, name } = twin(R7_SCENARIO_DROP)
    const before = specsOf(root)
    const res = await own('1.3', root, ['archive', name, '--no-validate'])
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('scenario-preservation gate refused')
    expectBanner(res.stderr)
    expect(archived(root, name)).toBe(false)
    expect(specsOf(root)).toEqual(before)
    // Recorded beside it: the binary under the flag refuses the merge too.
    const up = await binary(copy, ['archive', name, '-y', '--no-validate'])
    expect({ exit: up.exitCode, archived: archived(copy, name) }).toEqual({
      exit: 1,
      archived: false,
    })
  })

  test('1.4 an incomplete task is still refused', async () => {
    const root = mkTempRepo({ git: true })
    const name = R7_INCOMPLETE_TASK.build(root)
    const res = await own('1.4', root, ['archive', name, '--no-validate'])
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('incomplete task(s) — refusing to archive')
    expectBanner(res.stderr)
    expect(archived(root, name)).toBe(false)
  })

  test('1.5 a change only revalidation refuses archives, as the binary archives it', async () => {
    const { root, copy, name } = twin(R7_REVALIDATION_ONLY)
    const res = await own('1.5', root, ['archive', name, '--no-validate'])
    const up = await binary(copy, ['archive', name, '-y', '--no-validate'])
    expect([res.exitCode, up.exitCode]).toEqual([0, 0])
    expect([archived(root, name), archived(copy, name)]).toEqual([true, true])
    expect(specsOf(root)).toEqual(specsOf(copy))
    expectBanner(res.stderr)
  })

  test('1.6 --json prints one document on stdout and the banner on stderr only', async () => {
    const root = mkTempRepo({ git: true })
    const name = R7_MODIFIED.build(root)
    const res = await own('1.6', root, ['archive', name, '--no-validate', '--json'])
    expect(res.exitCode).toBe(0)
    expect(document(res.stdout).archived).toBe(true)
    expect(res.stdout).not.toContain('revalidation')
    expectBanner(res.stderr)
  })

  test('1.7 an unrelated unreadable living spec: archived as the binary archives it, one document', async () => {
    const { root, copy, name } = twin(R7_UNRELATED_UNREADABLE)
    try {
      const res = await own('1.7', root, ['archive', name, '--no-validate', '--json'])
      const up = await binary(copy, ['archive', name, '-y', '--no-validate', '--json'])
      expect([res.exitCode, up.exitCode]).toEqual([0, 0])
      expect(document(res.stdout)).toMatchObject({ archived: true })
      expect([archived(root, name), archived(copy, name)]).toEqual([true, true])
      restoreUnrelatedMode(root)
      restoreUnrelatedMode(copy)
      expect(specsOf(root)).toEqual(specsOf(copy))
    } finally {
      restoreUnrelatedMode(root)
      restoreUnrelatedMode(copy)
    }
  })

  test('1.7 without --no-validate: one document, exit as the revalidation reads the tree', async () => {
    const root = mkTempRepo({ git: true })
    const name = R7_UNRELATED_UNREADABLE.build(root)
    try {
      const res = await own('1.7', root, ['archive', name, '--json'])
      const doc = document(res.stdout)
      expect(doc).toMatchObject({ change: name, archived: res.exitCode === 0 })
    } finally {
      restoreUnrelatedMode(root)
    }
  })
})

// --- 2. archive's JSON documents carry the binary's keys ------------------------

describe("2. archive's JSON documents carry the binary's keys", () => {
  test('2.1 a MODIFIED archive: archive and root as the binary reports them', async () => {
    const { root, copy, name } = twin(R7_MODIFIED)
    const res = await own('2.1', root, ['archive', name, '--json'])
    const up = await binary(copy, ['archive', name, '-y', '--json'])
    expect([res.exitCode, up.exitCode]).toEqual([0, 0])
    const cs = document(res.stdout)
    const upDoc = document(up.stdout)
    expect(compareDocuments(upDoc, cs, { paths: roots(copy, root) }).failures).toEqual([])
    const native = nativeSuccess(name, { added: 0, modified: 1, removed: 0, renamed: 0 })
    expect(checkNativeKeys(cs, native, COSPEC_KEYS)).toEqual([])
  })

  test('2.2 --skip-specs: no totals, specsUpdated false, as the binary reports', async () => {
    const { root, copy, name } = twin(R7_MODIFIED)
    const res = await own('2.2', root, ['archive', name, '--skip-specs', '--json'])
    const up = await binary(copy, ['archive', name, '-y', '--skip-specs', '--json'])
    expect([res.exitCode, up.exitCode]).toEqual([0, 0])
    const cs = document(res.stdout)
    const upDoc = document(up.stdout)
    expect((upDoc.archive as Record<string, unknown>).totals).toBeUndefined()
    expect(compareDocuments(upDoc, cs, { paths: roots(copy, root) }).failures).toEqual([])
    expect((cs.archive as Record<string, unknown>).totals).toBeUndefined()
    expect(checkNativeKeys(cs, nativeSuccess(name, 'skipped'), COSPEC_KEYS)).toEqual([])
  })

  test('2.2 an already-synced change: zero totals, specsUpdated false, as the binary reports', async () => {
    const { root, copy, name } = twin(R7_SYNCED_MODIFIED)
    const res = await own('2.2', root, ['archive', name, '--json'])
    const up = await binary(copy, ['archive', name, '-y', '--json'])
    expect([res.exitCode, up.exitCode]).toEqual([0, 0])
    const upDoc = document(up.stdout)
    expect((upDoc.archive as Record<string, unknown>).specsUpdated).toBe(false)
    expect(
      compareDocuments(upDoc, document(res.stdout), { paths: roots(copy, root) }).failures,
    ).toEqual([])
  })

  test("2.2 a merge that warns: archive.warnings is the binary's", async () => {
    const { root, copy, name } = twin(R7_NEW_ADDED_REMOVED)
    const res = await own('2.2', root, ['archive', name, '--json'])
    const up = await binary(copy, ['archive', name, '-y', '--json'])
    expect([res.exitCode, up.exitCode]).toEqual([0, 0])
    const upDoc = document(up.stdout)
    expect((upDoc.archive as Record<string, unknown>).warnings).toEqual([
      expect.stringContaining('nothing to remove'),
    ])
    expect(
      compareDocuments(upDoc, document(res.stdout), { paths: roots(copy, root) }).failures,
    ).toEqual([])
  })

  test("2.2 a retirement: archive.warnings carries the binary's retirement note", async () => {
    const { root, copy, name } = twin(R7_RETIRED)
    const res = await own('2.2', root, ['archive', name, '--json'])
    const up = await binary(copy, ['archive', name, '-y', '--json'])
    expect([res.exitCode, up.exitCode]).toEqual([0, 0])
    const upDoc = document(up.stdout)
    expect((upDoc.archive as Record<string, unknown>).warnings).toEqual([
      expect.stringContaining('capability retired'),
    ])
    expect(
      compareDocuments(upDoc, document(res.stdout), { paths: roots(copy, root) }).failures,
    ).toEqual([])
  })

  /** One failure row: cospec's document beside the binary's for the same refusal. */
  async function failureRow(
    row: string,
    root: string,
    copy: string,
    args: string[],
    binaryArgs: string[],
    collisions: string[] = [],
  ): Promise<Record<string, unknown>> {
    const res = await own(row, root, args)
    const up = await binary(copy, binaryArgs)
    expect([res.exitCode, up.exitCode]).toEqual([1, 1])
    const cs = document(res.stdout)
    const upDoc = document(up.stdout)
    expect(upDoc.archive).toBeNull()
    expect(cs.archive).toBeNull()
    expect(cs.archived).toBe(false)
    expect(typeof cs.reason).toBe('string')
    const spec: OracleSpec = {
      paths: {
        keys: ['root.path'],
        upstreamRoot: realpathSync(copy),
        cospecRoot: realpathSync(root),
      },
      identities: STATUS,
      respelled: ['status[].fix'],
      collisions,
    }
    expect(compareDocuments(upDoc, cs, spec).failures).toEqual([])
    return cs
  }

  test('2.3 unknown change', async () => {
    const { root, copy } = twin(R7_MODIFIED)
    const cs = await failureRow(
      '2.3',
      root,
      copy,
      ['archive', 'nope', '--json'],
      ['archive', 'nope', '--json'],
    )
    expect((cs.status as { code: string }[])[0]!.code).toBe('archive_change_not_found')
  })

  test('2.3 invalid change name', async () => {
    const { root, copy } = twin(R7_MODIFIED)
    const cs = await failureRow(
      '2.3',
      root,
      copy,
      ['archive', 'a/b', '--json'],
      ['archive', 'a/b', '--json'],
    )
    expect((cs.status as { code: string }[])[0]!.code).toBe('archive_change_name_invalid')
  })

  test('2.3 namespace folder', async () => {
    const { root, copy, name } = twin(R7_NAMESPACE)
    const cs = await failureRow(
      '2.3',
      root,
      copy,
      ['archive', name, '--json'],
      ['archive', name, '--json'],
    )
    expect((cs.status as { code: string }[])[0]!.code).toBe('archive_change_is_namespace_folder')
  })

  test('2.3 revalidation failure', async () => {
    const { root, copy, name } = twin(R7_DELTA_INVALID)
    const cs = await failureRow(
      '2.3',
      root,
      copy,
      ['archive', name, '--json'],
      ['archive', name, '--json'],
    )
    expect((cs.status as { code: string }[])[0]!.code).toBe('archive_validation_failed')
    // The revalidation document keeps every key its report carried.
    for (const key of ['version', 'items', 'summary']) expect(cs).toHaveProperty(key)
  })

  test('2.3 incomplete tasks (the binary without -y)', async () => {
    const { root, copy, name } = twin(R7_INCOMPLETE_TASK)
    const cs = await failureRow(
      '2.3',
      root,
      copy,
      ['archive', name, '--json'],
      ['archive', name, '--json'],
      ['status[].fix'],
    )
    expect((cs.status as { code: string }[])[0]!.code).toBe('archive_tasks_incomplete')
  })

  test('2.3 taken archive slot', async () => {
    const { root, copy, name } = twin(R7_MODIFIED)
    for (const r of [root, copy])
      writeFiles(r, {
        [`openspec/changes/archive/${slotFor(name)}/.openspec.yaml`]:
          'schema: feat\ncreated: 2026-10-05\nschemaVersion: 2\n',
      })
    const cs = await failureRow(
      '2.3',
      root,
      copy,
      ['archive', name, '--json'],
      ['archive', name, '--json'],
    )
    expect((cs.status as { code: string }[])[0]!.code).toBe('archive_target_exists')
  })

  test('2.3 scenario-dropping MODIFIED (the binary with -y)', async () => {
    const { root, copy, name } = twin(R7_SCENARIO_DROP)
    // cospec's revalidation runs the advisory scenario rule at WARNING; the
    // hard gate is what refuses, so the change passes revalidation first.
    const cs = await failureRow(
      '2.3',
      root,
      copy,
      ['archive', name, '--json'],
      ['archive', name, '-y', '--json'],
    )
    expect((cs.status as { code: string }[])[0]!.code).toBe('archive_spec_update_failed')
    expect(cs.reason).toBe('archive/scenario-preservation')
  })

  test('2.4 a bare [ ] verification row is one cospec-only document', async () => {
    const root = mkTempRepo({ git: true })
    const name = R7_BARE_VERIFICATION.build(root)
    const res = await own('2.4', root, ['archive', name, '--json'])
    expect(res.exitCode).toBe(1)
    const cs = document(res.stdout)
    expect(cs.archive).toBeNull()
    expect(cs.reason).toBe('archive/verification-incomplete')
    expect((cs.status as { code: string }[])[0]!.code).toBe('archive_verification_incomplete')
  })

  test("2.6 an unknown --store is the resolver document with archive's payload", async () => {
    const { root, copy, name } = twin(R7_MODIFIED)
    const res = await own('2.6', root, ['archive', name, '--json', '--store', 'nope'])
    const up = await binary(copy, ['archive', name, '--json', '--store', 'nope'])
    expect([res.exitCode, up.exitCode]).toEqual([1, 1])
    const upDoc = document(up.stdout)
    expect(upDoc).toEqual({ archive: null, status: expect.any(Array) })
    // The message is cospec's own resolver wording, which every command shares
    // (`core/root.ts`); the code, target and fix are the binary's.
    const spec: OracleSpec = {
      identities: STATUS,
      respelled: ['status[].fix'],
      verdict: ['status[].message'],
    }
    expect(compareDocuments(upDoc, document(res.stdout), spec).failures).toEqual([])
  })
})

// --- 3. the scenario-preservation gate reads the verbatim view -------------------

describe('3. the scenario-preservation gate reads the verbatim view', () => {
  test('3.1 a scenario kept only inside a comment: validate, cospec archive and the binary accept', async () => {
    const { root, copy, name } = twin(R7_COMMENT_KEPT)
    const validated = await own('3.1', root, ['validate', name, '--strict'])
    expect(validated.exitCode).toBe(0)
    const res = await own('3.1', root, ['archive', name])
    const up = await binary(copy, ['archive', name, '-y'])
    expect([res.exitCode, up.exitCode]).toEqual([0, 0])
    expect([archived(root, name), archived(copy, name)]).toEqual([true, true])
    expect(specsOf(root)).toEqual(specsOf(copy))
  })

  test('3.2 a commented living scenario the delta omits: both archives refuse', async () => {
    const { root, copy, name } = twin(R7_COMMENTED_LIVING_SCENARIO)
    const before = specsOf(root)
    const res = await own('3.2', root, ['archive', name])
    const up = await binary(copy, ['archive', name, '-y'])
    expect([res.exitCode, up.exitCode]).toEqual([1, 1])
    expect([archived(root, name), archived(copy, name)]).toEqual([false, false])
    expect([specsOf(root), specsOf(copy)]).toEqual([before, before])
    expect(res.stderr).toContain('scenario-preservation gate refused')
    expect(res.stderr).toContain('"Render a hidden widget"')
  })

  test('3.3 a commented living requirement header: both archive, byte-identical', async () => {
    const { root, copy, name } = twin(R7_COMMENTED_LIVING_HEADER)
    const res = await own('3.3', root, ['archive', name])
    const up = await binary(copy, ['archive', name, '-y'])
    expect([res.exitCode, up.exitCode]).toEqual([0, 0])
    expect(specsOf(root)).toEqual(specsOf(copy))
  })
})

// --- 4. an unreadable archive directory is one answer ---------------------------

describe('4. an unreadable archive directory is one answer', () => {
  test("4.1 mode 000: cospec's code is the binary's on this runtime, text and --json", async () => {
    const { root, copy, name } = twin(R7_ARCHIVE_UNREADABLE)
    try {
      const res = await own('4.1', root, ['archive', name, '--json'])
      const text = await own('4.1', root, ['archive', name])
      const up = await binary(copy, ['archive', name, '-y', '--json'])
      expect([res.exitCode, text.exitCode, up.exitCode]).toEqual([1, 1, 1])
      const upStatus = (document(up.stdout).status as { code: string; message: string }[])[0]!
      const csStatus = (document(res.stdout).status as { code: string; message: string }[])[0]!
      expect(csStatus.code).toBe(upStatus.code)
      if (upStatus.code === 'archive_error') {
        const upErr = errnoShape(underRoot(copy, upStatus.message))
        const csErr = errnoShape(underRoot(root, csStatus.message))
        expect(csErr).toEqual(upErr)
      } else expect(underRoot(root, csStatus.message)).toBe(underRoot(copy, upStatus.message))
      expect(text.stdout).toBe('')
      // Where the binary's first step refuses (macOS), nothing else ran: one
      // line. Where its slot check refuses (Linux), cospec's degraded archive
      // read warned first, naming the directory.
      const lines = text.stderr.trim().split('\n')
      expect(lines).toHaveLength(upStatus.code === 'archive_path_outside_root' ? 1 : 2)
      expect(lines.at(-1)).toBe(`cospec archive: ${csStatus.message}`)
      expect(text.stderr).not.toContain('    at ')
      expect([archived(root, name), archived(copy, name)]).toEqual([false, false])
    } finally {
      restoreArchiveMode(root)
      restoreArchiveMode(copy)
    }
    expect([locks(root), locks(copy)]).toEqual([[], []])
  })
})

// --- 5. a namespace folder ------------------------------------------------------

describe('5. archive refuses a namespace folder as the binary does', () => {
  test("5.1 text and --json: the binary's message and fix, nothing moved", async () => {
    const { root, copy, name } = twin(R7_NAMESPACE)
    const text = await own('5.1', root, ['archive', name])
    const res = await own('5.1', root, ['archive', name, '--json'])
    const up = await binary(copy, ['archive', name, '-y', '--json'])
    expect([text.exitCode, res.exitCode, up.exitCode]).toEqual([1, 1, 1])
    const upStatus = (document(up.stdout).status as Record<string, string>[])[0]!
    const csStatus = (document(res.stdout).status as Record<string, string>[])[0]!
    expect(csStatus).toEqual(upStatus)
    expect(upStatus.code).toBe('archive_change_is_namespace_folder')
    expect(text.stderr).toContain(`${upStatus.message}\n`)
    expect(text.stderr).toContain(upStatus.fix!)
    expect(text.stderr).toStartWith("cospec archive: Cannot archive 'mobile': ")
    expect(`${text.stdout}${text.stderr}${res.stdout}`).not.toContain('meta/nested-change')
    expect(existsSync(join(changeDir(root, name), 'refresh/proposal.md'))).toBe(true)
  })
})

// --- 6. a new capability refuses only MODIFIED and RENAMED ------------------------

interface Report {
  items: { issues: { rule: string; level: string }[] }[]
}

async function ownRules(row: string, root: string, name: string): Promise<string[]> {
  const res = await own(row, root, ['validate', name, '--strict', '--json'])
  return (document(res.stdout) as unknown as Report).items.flatMap((i) =>
    i.issues.filter((x) => x.level === 'ERROR').map((x) => x.rule),
  )
}

describe('6. a new capability refuses only MODIFIED and RENAMED', () => {
  test('6.1 ADDED + REMOVED: both validate, both archive byte-identical, the warning relayed', async () => {
    const { root, copy, name } = twin(R7_NEW_ADDED_REMOVED)
    expect(await ownRules('6.1', root, name)).toEqual([])
    expect((await binary(copy, ['validate', name, '--strict'])).exitCode).toBe(0)
    const res = await own('6.1', root, ['archive', name])
    const up = await binary(copy, ['archive', name, '-y'])
    expect([res.exitCode, up.exitCode]).toEqual([0, 0])
    expect(specsOf(root)).toEqual(specsOf(copy))
    expect(res.stdout).toContain(
      'Warning:  widgets - 1 REMOVED requirement(s) ignored for new spec (nothing to remove).',
    )
  })

  test('6.2 REMOVED-only under the marker: validate passes, archive reports in sync', async () => {
    const { root, copy, name } = twin(R7_NEW_REMOVED_ONLY_MARKED)
    expect(await ownRules('6.2', root, name)).toEqual([])
    const res = await own('6.2', root, ['archive', name])
    const up = await binary(copy, ['archive', name, '-y'])
    expect([res.exitCode, up.exitCode]).toEqual([0, 0])
    expect(up.stdout).toContain('Specs already in sync; no files changed.')
    expect(res.stdout).toContain('Specs:    already in sync')
  })

  test('6.3 REMOVED-only without the marker: rebuilt-spec-invalid, refused before delegating', async () => {
    const { root, copy, name } = twin(R7_NEW_REMOVED_ONLY)
    const rules = await ownRules('6.3', root, name)
    expect(rules).toContain('archive/rebuilt-spec-invalid')
    expect(rules).not.toContain('archive/new-spec-non-added')
    const res = await own('6.3', root, ['archive', name])
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('archive/rebuilt-spec-invalid')
    expect(archived(root, name)).toBe(false)
    const up = await binary(copy, ['archive', name, '-y'])
    expect({ exit: up.exitCode, archived: archived(copy, name) }).toEqual({
      exit: 1,
      archived: false,
    })
  })

  for (const fixture of [R7_NEW_MODIFIED, R7_NEW_RENAMED])
    test(`6.4 ${fixture.key}: archive/new-spec-non-added is still an ERROR`, async () => {
      const root = mkTempRepo({ git: true })
      const name = fixture.build(root)
      expect(await ownRules('6.4', root, name)).toContain('archive/new-spec-non-added')
    })
})

// --- 7. the Specs line and early-synced archives ---------------------------------

describe('7. the Specs line and early-synced archives', () => {
  const cases: {
    label: string
    fixture: R7Fixture
    args: string[]
    line: string
    reason: string
  }[] = [
    {
      label: 'a feat change with no delta files',
      fixture: R7_NO_DELTA,
      args: [],
      line: 'Specs:    none (no delta specs, so no spec sync)',
      reason: 'no-deltas',
    },
    {
      label: '--skip-specs',
      fixture: R7_MODIFIED,
      args: ['--skip-specs'],
      line: 'Specs:    skipped (--skip-specs)',
      reason: 'flag',
    },
    {
      label: 'a chore change',
      fixture: R7_CHORE,
      args: [],
      line: 'Specs:    none (the chore schema has no specs artifact)',
      reason: 'schema',
    },
  ]
  for (const c of cases)
    test(`7.1 ${c.label}: the Specs line and specsSkipReason name the reason`, async () => {
      const text = mkTempRepo({ git: true })
      const json = mkTempRepo({ git: true })
      const name = c.fixture.build(text)
      c.fixture.build(json)
      const t = await own('7.1', text, ['archive', name, ...c.args])
      expect(t.exitCode).toBe(0)
      expect(t.stdout).toContain(`${c.line}\n`)
      const j = await own('7.1', json, ['archive', name, ...c.args, '--json'])
      expect(j.exitCode).toBe(0)
      const doc = document(j.stdout)
      expect([doc.specs, doc.specsSkipReason]).toEqual(['skipped', c.reason])
    })

  for (const fixture of R7_SYNCED_SHAPES)
    test(`7.2 ${fixture.key}: both archive, the binary in sync, Specs: already in sync`, async () => {
      const { root, copy, name } = twin(fixture)
      const res = await own('7.2', root, ['archive', name])
      const up = await binary(copy, ['archive', name, '-y'])
      expect([res.exitCode, up.exitCode]).toEqual([0, 0])
      expect(up.stdout).toContain('Specs already in sync; no files changed.')
      expect(res.stdout).toContain('Specs:    already in sync\n')
      expect(res.stderr).not.toContain('invariant breach')
      expect(specsOf(root)).toEqual(specsOf(copy))
    })
})

// --- 8. relayed archive output is spelled cospec ---------------------------------

describe('8. relayed archive output is spelled cospec', () => {
  test('8.1 the carried-Purpose warning names cospec validate', async () => {
    const root = mkTempRepo({ git: true })
    const name = R7_SHORT_PURPOSE.build(root)
    const res = await own('8.1', root, ['archive', name])
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toMatch(
      /Warning: {2}widgets - carried Purpose is under \d+ characters; cospec validate --strict reports it as too brief\.\n/,
    )
  })

  test('8.2 a change name containing openspec passes through byte-for-byte', async () => {
    const root = mkTempRepo({ git: true })
    const built = R7_MODIFIED.build(root)
    renameSync(changeDir(root, built), changeDir(root, 'openspec-widgets'))
    const res = await own('8.2', root, ['archive', 'openspec-widgetz', '--json'])
    expect(res.exitCode).toBe(1)
    expect(res.stdout + res.stderr).toContain("'openspec-widgetz'")
  })

  // Runs last: every output the rows above captured.
  test('8.2 no captured output names a bare allowlisted openspec command', () => {
    expect(CAPTURED.length).toBeGreaterThan(20)
    const bare = CAPTURED.filter(({ text }) => respellRemedies(text) !== text).map(({ row }) => row)
    expect(bare).toEqual([])
    // A row capturing the purpose warning must exist for this to mean anything.
    expect(CAPTURED.some(({ row }) => row === '8.1')).toBe(true)
  })
})
