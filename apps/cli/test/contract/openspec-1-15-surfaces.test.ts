// The OpenSpec 1.15.0 surfaces cospec reaches (change openspec-1-15-parity,
// tasks 5.1, 5.2, 5.4, 5.5), probed against the REAL pinned binary: each row
// runs the binary through the upstream oracle and cospec from source under the
// identical sandbox (`oracleEnv(root)`), and the key oracle compares the whole
// `--json` documents, so a key upstream emits can never go missing from
// cospec's. No row holds a hand-typed copy of an upstream document.

import { afterAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { upgradeCommand, type InstallType } from '../../src/commands/version.ts'
import { COSPEC_TYPES } from '../../src/core/change.ts'
import { PINNED_OPENSPEC_VERSION } from '../../src/core/openspec.ts'
import {
  cleanupAll,
  cospec,
  mkTempRepo,
  REPO_ROOT,
  type SpawnResult,
  writeFiles,
} from '../fixtures/support.ts'
import { byKey, compareDocuments, type OracleSpec } from './support/key-oracle.ts'
import { oracle, oracleEnv, type OracleRun } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

// --- fixtures ----------------------------------------------------------------------

/** A root as `cospec init` leaves it: every cospec type as a project schema, `config.yaml` on feat. */
function cospecRoot(): string {
  const root = mkTempRepo({ git: true })
  for (const type of COSPEC_TYPES)
    cpSync(join(REPO_ROOT, 'openspec/schemas', type), join(root, 'openspec/schemas', type), {
      recursive: true,
    })
  mkdirSync(join(root, 'openspec/specs'), { recursive: true })
  mkdirSync(join(root, 'openspec/changes/archive'), { recursive: true })
  writeFiles(root, { 'openspec/config.yaml': 'schema: feat\n' })
  return root
}

const PROPOSAL = `# Proposal

## Why

The widget path needs its requirement restated so the spec matches the code.

## What Changes

- Restate it.

## Impact

- None.
`

/** Two active changes and three archived ones, of three commit types. */
function archiveFixture(): string {
  const root = cospecRoot()
  const change = (dir: string, schema: string, tasks: string): Record<string, string> => ({
    [`${dir}/.openspec.yaml`]: `schema: ${schema}\ncreated: 2026-01-01\n`,
    [`${dir}/proposal.md`]: PROPOSAL,
    [`${dir}/tasks.md`]: tasks,
  })
  writeFiles(root, {
    ...change('openspec/changes/zeta-active', 'feat', '## 1. Work\n\n- [ ] 1.1 Do it\n'),
    ...change('openspec/changes/alpha-active', 'chore', '## 1. Work\n\n- [x] 1.1 Done\n'),
    ...change(
      'openspec/changes/archive/2026-03-02-beta-old',
      'fix',
      '## 1. Work\n\n- [x] 1.1 Done\n- [x] 1.2 Done\n',
    ),
    ...change(
      'openspec/changes/archive/2026-01-15-omega-old',
      'docs',
      '## 1. Work\n\n- [x] 1.1 Done\n',
    ),
    ...change(
      'openspec/changes/archive/2025-12-31-delta-old',
      'ci',
      '## 1. Work\n\n- [x] 1.1 Done\n',
    ),
  })
  return root
}

const LIVING = `# Widgets Specification

## Purpose

The widgets capability, described well enough to pass the purpose check.

## Requirements

### Requirement: Widgets render

The system SHALL render a widget when requested.

#### Scenario: A widget is requested

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

// --- runners -----------------------------------------------------------------------

interface JsonAnswer {
  exitCode: number
  json: Record<string, unknown>
  stdout: string
  stderr: string
}

function parse(label: string, run: OracleRun | SpawnResult): JsonAnswer {
  try {
    return { ...run, json: JSON.parse(run.stdout) as Record<string, unknown> }
  } catch (error) {
    throw new Error(`${label} printed no JSON document: ${run.stdout.slice(0, 400)}`, {
      cause: error,
    })
  }
}

async function upstreamJson(argv: string[], root: string, cwd = root): Promise<JsonAnswer> {
  return parse(`openspec ${argv.join(' ')}`, await oracle(argv, root, { cwd }))
}

async function oursJson(
  argv: string[],
  root: string,
  env: Record<string, string> = {},
  cwd = root,
): Promise<JsonAnswer> {
  const run = await cospec(argv, { cwd, env: { ...oracleEnv(root), ...env } })
  return parse(`cospec ${argv.join(' ')}`, run)
}

type Row = Record<string, unknown>
const rows = (doc: Record<string, unknown>): Row[] => (doc.changes ?? []) as Row[]

/** A local npm-registry stand-in answering `/latest` with `body` (or hanging, for `hang`). */
function registry(body: string | 'hang'): { url: string; stop: () => void } {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      body === 'hang'
        ? new Promise<Response>(() => {})
        : new Response(body, { headers: { 'content-type': 'application/json' } }),
  })
  return { url: `http://127.0.0.1:${server.port}/latest`, stop: () => server.stop(true) }
}

// --- 5.1 version ---------------------------------------------------------------------

const VERSION_SPEC: OracleSpec = {
  collisions: ['install.location', 'install.packageManager', 'install.scope'],
}
const VERSION_CHECK_SPEC: OracleSpec = {
  collisions: [...VERSION_SPEC.collisions!, 'update.status', 'update.latest', 'update.command'],
}

describe('5.1 cospec version keeps upstream document shape', () => {
  test('version --json: every upstream key, cospec described, the wrapped binary under openspec', async () => {
    const root = cospecRoot()
    const up = await upstreamJson(['version', '--json'], root)
    const cs = await oursJson(['version', '--json'], root)
    expect(up.exitCode).toBe(0)
    expect(cs.exitCode).toBe(0)
    expect(compareDocuments(up.json, cs.json, VERSION_SPEC).failures).toEqual([])
    expect(cs.json.update).toBeUndefined()
    expect(cs.json.openspec).toEqual({
      version: PINNED_OPENSPEC_VERSION,
      source: 'package',
      inRange: true,
      range: '>=1.0.0 <2.0.0',
    })
    expect((cs.json.install as Row).type).toBe('source')
  }, 30_000)

  test('version --check --json: update carries every upstream key in its vocabulary', async () => {
    const root = cospecRoot()
    const fake = registry(JSON.stringify({ name: '@aligned-team/cospec', version: '999.0.0' }))
    try {
      const up = await upstreamJson(['version', '--check', '--json'], root)
      const cs = await oursJson(['version', '--check', '--json'], root, {
        COSPEC_REGISTRY_URL: fake.url,
      })
      expect(up.exitCode).toBe(0)
      expect(cs.exitCode).toBe(0)
      expect(Object.keys(up.json.update as Row).toSorted()).toEqual(
        ['canSelfUpgrade', 'command', 'latest', 'status'].toSorted(),
      )
      expect(compareDocuments(up.json, cs.json, VERSION_CHECK_SPEC).failures).toEqual([])
      const update = cs.json.update as Row
      expect(update.status).toBe('available')
      expect(update.latest).toBe('999.0.0')
      expect(update.command).toBe(upgradeCommand((cs.json.install as Row).type as InstallType))
      expect(update.canSelfUpgrade).toBe(false)
    } finally {
      fake.stop()
    }
  }, 30_000)

  test('version --check never fails: a malformed registry answer is offline, exit 0', async () => {
    const root = cospecRoot()
    const fake = registry('not json')
    try {
      const cs = await oursJson(['version', '--check', '--json'], root, {
        COSPEC_REGISTRY_URL: fake.url,
      })
      expect(cs.exitCode).toBe(0)
      expect((cs.json.update as Row).status).toBe('offline')
    } finally {
      fake.stop()
    }
  }, 30_000)
})

// --- 5.2 list --archived / --all ----------------------------------------------------

const LIST_SPEC: OracleSpec = {
  identities: { 'changes[]': { upstream: byKey('name'), cospec: byKey('change') } },
  timing: ['changes[].lastModified'],
}

describe('5.2 list --archived and --all', () => {
  for (const flag of ['--archived', '--all'] as const) {
    test(`list ${flag} --json: every upstream key, each item adds type and archivedOn`, async () => {
      const root = archiveFixture()
      const up = await upstreamJson(['list', flag, '--json'], root)
      const cs = await oursJson(['list', flag, '--json'], root)
      expect(cs.exitCode).toBe(up.exitCode)
      const { failures, emptyArrays } = compareDocuments(up.json, cs.json, LIST_SPEC)
      expect(failures).toEqual([])
      expect(emptyArrays).toEqual([])
      expect(rows(cs.json).map((r) => r.change)).toEqual(rows(up.json).map((r) => r.name))
      expect(cs.json.version).toBe(1)
      for (const row of rows(cs.json)) {
        expect(typeof row.type).toBe('string')
        expect('archivedOn' in row).toBe(true)
      }
      const beta = rows(cs.json).find((r) => r.change === '2026-03-02-beta-old')!
      expect(beta).toMatchObject({
        type: 'fix',
        archivedOn: '2026-03-02',
        slug: 'beta-old',
        state: 'archived',
        archived: true,
      })
      const activeRows = rows(cs.json).filter((r) => r.archived !== true)
      expect(activeRows.length).toBe(flag === '--all' ? 2 : 0)
      for (const row of activeRows) expect(row.archivedOn).toBeNull()
    }, 30_000)
  }

  test('--sort name and recent order rows as the binary does, active and archived together', async () => {
    const root = archiveFixture()
    for (const extra of [[], ['--sort', 'name']]) {
      for (const flag of ['--archived', '--all']) {
        const up = await upstreamJson(['list', flag, '--json', ...extra], root)
        const cs = await oursJson(['list', flag, '--json', ...extra], root)
        expect({ flag, extra, order: rows(cs.json).map((r) => r.change) }).toEqual({
          flag,
          extra,
          order: rows(up.json).map((r) => r.name),
        })
      }
    }
  }, 60_000)

  test('text --all --sort name marks each row active or archived, in name order', async () => {
    const root = archiveFixture()
    const run = await cospec(['list', '--all', '--sort', 'name'], {
      cwd: root,
      env: oracleEnv(root),
    })
    expect(run.exitCode).toBe(0)
    const lines = run.stdout.trimEnd().split('\n')
    expect(lines.map((l) => l.trim().split(/\s+/).slice(0, 2))).toEqual([
      ['archived', '2025-12-31-delta-old'],
      ['archived', '2026-01-15-omega-old'],
      ['archived', '2026-03-02-beta-old'],
      ['active', 'alpha-active'],
      ['active', 'zeta-active'],
    ])
  }, 30_000)

  test("--specs beside --archived is the binary's list_error, before any root", async () => {
    const dir = mkTempRepo()
    const up = await upstreamJson(['list', '--specs', '--archived', '--json'], dir)
    const cs = await oursJson(['list', '--specs', '--archived', '--json'], dir)
    expect(up.exitCode).toBe(1)
    expect(cs.exitCode).toBe(1)
    expect(cs.json).toEqual(up.json)
  }, 30_000)
})

// --- 5.4 show --json names ------------------------------------------------------------

describe('5.4 show --json names requirements and scenarios', () => {
  test('each requirement and scenario carries its header name, as the binary reports it', async () => {
    const root = cospecRoot()
    writeFiles(root, { 'openspec/specs/widgets/spec.md': LIVING })
    const argv = ['show', 'widgets', '--type', 'spec', '--json']
    const up = await upstreamJson(argv, root)
    const cs = await oursJson(argv, root)
    expect(cs.exitCode).toBe(0)
    expect(compareDocuments(up.json, cs.json, {}).failures).toEqual([])
    const requirement = (cs.json.requirements as Row[])[0]!
    expect(requirement.name).toBe('Widgets render')
    expect((requirement.scenarios as Row[])[0]!.name).toBe('A widget is requested')
  }, 30_000)
})

// --- 5.5 update --dry-run --------------------------------------------------------------

describe('5.5 update --dry-run', () => {
  test("an early failure carries upstream's changes/notes/failures and status, exit nonzero", async () => {
    const dir = mkTempRepo()
    const up = await upstreamJson(['update', '--dry-run', '--json'], dir)
    const cs = await oursJson(['update', '--dry-run', '--json'], dir)
    expect(up.exitCode).not.toBe(0)
    expect(cs.exitCode).not.toBe(0)
    const status = (doc: Record<string, unknown>) => (doc.status as Row[])[0]!
    for (const key of ['changes', 'notes', 'failures'])
      expect({ key, value: cs.json[key] }).toEqual({ key, value: up.json[key] })
    expect(status(cs.json).severity).toBe(status(up.json).severity)
    expect(status(cs.json).code).toBe(status(up.json).code)
    expect(status(cs.json).message).toBe(
      String(status(up.json).message).replace("'openspec init'", "'cospec init'"),
    )
  }, 30_000)

  test('a dry run on an initialized root carries every upstream top-level key', async () => {
    const root = mkTempRepo({ git: true })
    const env = oracleEnv(root)
    const init = await cospec(['init', '--harness', 'claude', '--no-gate'], { cwd: root, env })
    expect(init.exitCode).toBe(0)
    const up = await upstreamJson(['update', '--dry-run', '--json'], root)
    const cs = await oursJson(['update', '--dry-run', '--json'], root)
    expect(cs.exitCode).toBe(0)
    const spec: OracleSpec = { verdict: ['changes', 'notes', 'failures'] }
    expect(compareDocuments(up.json, cs.json, spec).failures).toEqual([])
    expect(rows(cs.json)).toEqual([])
  }, 60_000)
})
