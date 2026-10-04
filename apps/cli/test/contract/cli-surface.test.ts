// cli-surface-parity, probed against the REAL pinned binary (design D5, D11).
//
// Every row builds its fixture in a temp root, runs the pinned binary through
// the upstream oracle and cospec from source under the identical sandbox
// environment (`oracleEnv(root)`), and compares the two answers at test time —
// no row holds a hand-typed copy of an upstream string. The key oracle
// (`support/key-oracle.ts`) compares whole `--json` documents; the rest compare
// the part of an answer their row names.

import { afterAll, describe, expect, test } from 'bun:test'
import {
  chmodSync,
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { computeStatus } from '../../src/commands/status.ts'
import { COSPEC_TYPES, resolveChange } from '../../src/core/change.ts'
import { openspecPackageDir } from '../../src/core/openspec.ts'
import { respellRemedies, respellWholeRemedy } from '../../src/core/remedies.ts'
import { errnoShape } from '../fixtures/errno.ts'
import {
  cleanupAll,
  cospec,
  emptyMachineStateEnv,
  mkTempRepo,
  REPO_ROOT,
  type SpawnResult,
  writeFiles,
} from '../fixtures/support.ts'
import {
  byCodeAndName,
  byKey,
  byKindAndId,
  checkNativeKeys,
  compareDocuments,
  NAMED_COLLISIONS,
  type OracleSpec,
} from './support/key-oracle.ts'
import { makeSandbox } from './support/root-sandbox.ts'
import { oracle, oracleEnv, type OracleRun } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

/** Mode-000 rows cannot fail for root, which reads any file. */
const RUNNING_AS_ROOT = process.getuid?.() === 0
const unlessRoot = RUNNING_AS_ROOT ? describe.skip : describe

// --- fixture builders --------------------------------------------------------

const PROPOSAL = `# Proposal

## Why

The widget rendering path needs a restated requirement so the spec matches the
shipped code; without it the capability is documented wrongly.

## What Changes

- Restate the widget rendering requirement.

## Impact

- None.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

const DELTA = `## ADDED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

const LIVING = (name: string): string => `# ${name} Specification

## Purpose

The ${name} capability, described well enough to pass the purpose check.

## Requirements

### Requirement: ${name} works

The system SHALL make ${name} work.

#### Scenario: It works

- **WHEN** a caller uses ${name}
- **THEN** it works
`

/**
 * A root as `cospec init` leaves it: every cospec type installed as a project
 * schema (the binary resolves `feat` from there), `config.yaml` naming `feat`,
 * and the three planning directories.
 */
function cospecRoot(configSchema: string | null = 'feat'): string {
  const root = mkTempRepo({ git: true })
  for (const type of COSPEC_TYPES)
    cpSync(join(REPO_ROOT, 'openspec/schemas', type), join(root, 'openspec/schemas', type), {
      recursive: true,
    })
  mkdirSync(join(root, 'openspec/specs'), { recursive: true })
  mkdirSync(join(root, 'openspec/changes/archive'), { recursive: true })
  writeFiles(root, {
    'openspec/config.yaml': configSchema === null ? '# no schema\n' : `schema: ${configSchema}\n`,
  })
  return root
}

/** A change directory holding `files`; `.openspec.yaml` names `schema` unless it is `null`. */
function writeChange(
  root: string,
  id: string,
  files: Record<string, string> = {},
  schema: string | null = 'feat',
  schemaVersion = 2,
): string {
  const dir = `openspec/changes/${id}`
  const out: Record<string, string> = {}
  if (schema !== null)
    out[`${dir}/.openspec.yaml`] =
      `schema: ${schema}\ncreated: 2026-09-01\nschemaVersion: ${schemaVersion}\n`
  for (const [rel, body] of Object.entries(files)) out[`${dir}/${rel}`] = body
  writeFiles(root, out)
  mkdirSync(join(root, dir), { recursive: true })
  return join(root, dir)
}

/** Every file and directory under `dir`, deepest first. */
function treeOf(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name)
      if (entry.isDirectory()) walk(p)
      out.push(p)
    }
  }
  walk(dir)
  out.push(dir)
  return out
}

/**
 * Stage each named change's mtimes: `ids[0]` oldest. Run after every write,
 * since writing a file resets its mtime and the binary takes the newest file
 * under the change.
 */
function stageMtimes(root: string, ids: readonly string[]): void {
  const base = Date.parse('2026-09-01T00:00:00Z') / 1000
  ids.forEach((id, i) => {
    const t = base + i * 3600
    for (const p of treeOf(join(root, 'openspec/changes', id))) utimesSync(p, t, t)
  })
}

/** `changes/<name>/<child>/` holding only a `.openspec.yaml`: a namespace folder. */
function namespaceFolder(root: string, name = 'mobile', child = 'refresh-token'): void {
  writeFiles(root, {
    [`openspec/changes/${name}/${child}/.openspec.yaml`]: 'schema: feat\ncreated: 2026-09-01\n',
  })
}

/**
 * The list fixture: `alpha` (a `feat` change with only `proposal.md`), `beta`
 * (a `fix` change with tasks, half done), `gamma` (a `chore` change), a
 * namespace folder `mobile`, staged so the binary's recent-first order is
 * `gamma, beta, alpha` with `mobile` newest.
 */
function listFixture(): string {
  const root = cospecRoot()
  writeChange(root, 'alpha', { 'proposal.md': PROPOSAL })
  writeChange(
    root,
    'beta',
    {
      'proposal.md': PROPOSAL,
      'tasks.md': '## 1. Work\n\n- [x] 1.1 First\n- [ ] 1.2 Second\n',
    },
    'fix',
  )
  writeChange(root, 'gamma', { 'proposal.md': PROPOSAL }, 'chore')
  namespaceFolder(root)
  stageMtimes(root, ['alpha', 'beta', 'gamma', 'mobile'])
  return root
}

/**
 * One candidate per detector signal (design D2), each named for the case:
 * `ns-*` must be reported as a namespace folder, `ch-*` must not.
 */
function detectorMatrix(root: string): void {
  writeFiles(root, {
    // A child with a root marker.
    'openspec/changes/ns-marker/c/proposal.md': PROPOSAL,
    // A child with a delta file and nothing else.
    'openspec/changes/ns-delta/c/specs/widgets/spec.md': DELTA,
    // A child with only a dot-file under specs/: not a change, so no nesting.
    'openspec/changes/ch-dotspec/c/specs/.keep': '',
    // A child with only an output of the root's schema (`feat`'s verification.md).
    'openspec/changes/ns-schema/c/verification.md': '# Verification\n',
    // A file of its own keeps the directory a change.
    'openspec/changes/ch-ownfile/README.md': '# notes\n',
    'openspec/changes/ch-ownfile/c/.openspec.yaml': 'schema: feat\n',
    // A dot-file of its own does not.
    'openspec/changes/ns-owndot/.DS_Store': '',
    'openspec/changes/ns-owndot/c/.openspec.yaml': 'schema: feat\n',
    // Depths one to four.
    'openspec/changes/ns-depth1/c/.openspec.yaml': 'schema: feat\n',
    'openspec/changes/ns-depth2/a/c/.openspec.yaml': 'schema: feat\n',
    'openspec/changes/ns-depth3/a/b/c/.openspec.yaml': 'schema: feat\n',
    'openspec/changes/ch-depth4/a/b/c/d/.openspec.yaml': 'schema: feat\n',
    // A dot-directory child is never searched.
    'openspec/changes/ch-dotchild/.c/.openspec.yaml': 'schema: feat\n',
    // Two nested changes, reported sorted.
    'openspec/changes/ns-two/zeta/.openspec.yaml': 'schema: feat\n',
    'openspec/changes/ns-two/eta/proposal.md': PROPOSAL,
    // A change-looking child is not descended into.
    'openspec/changes/ns-shallow/c/.openspec.yaml': 'schema: feat\n',
    'openspec/changes/ns-shallow/c/deeper/.openspec.yaml': 'schema: feat\n',
    // A marker of its own: a change, whatever it holds.
    'openspec/changes/ch-marker/proposal.md': PROPOSAL,
    'openspec/changes/ch-marker/sub/.openspec.yaml': 'schema: feat\n',
    // A dot-directory at the top is never a candidate.
    'openspec/changes/.hidden/c/.openspec.yaml': 'schema: feat\n',
    // `archive` is never a candidate.
    'openspec/changes/archive/2026-01-01-old/c/.openspec.yaml': 'schema: feat\n',
  })
}

/** A project fork of the package's `spec-driven` schema, installed as `name`. */
function projectFork(root: string, name = 'house'): void {
  cpSync(join(openspecPackageDir(), 'schemas/spec-driven'), join(root, 'openspec/schemas', name), {
    recursive: true,
  })
  const path = join(root, 'openspec/schemas', name, 'schema.yaml')
  writeFileSync(path, readFileSync(path, 'utf8').replace(/^name: .*$/m, `name: ${name}`))
}

/** A change on the package's built-in `spec-driven` schema. */
function specDrivenChange(root: string, id = 'legacy-one'): void {
  writeChange(root, id, { 'proposal.md': PROPOSAL }, 'spec-driven')
}

/** A change whose schema resolves nowhere. */
function unknownSchemaChange(root: string, id = 'ghost'): void {
  writeChange(root, id, { 'proposal.md': PROPOSAL }, 'nope')
}

/** A hand-made change directory: `proposal.md` and no `.openspec.yaml`. */
function handMadeChange(root: string, id = 'bare-dir'): void {
  writeChange(root, id, { 'proposal.md': PROPOSAL }, null)
}

/** `gamma` as both an active change and a living spec. */
function ambiguousGamma(root: string): void {
  writeChange(root, 'gamma', { 'proposal.md': PROPOSAL })
  writeFiles(root, { 'openspec/specs/gamma/spec.md': LIVING('gamma') })
}

/**
 * Put `path` at mode 000 until the returned restore runs. The suite's own
 * `cleanupAll` removes the tree, which needs the mode back first.
 */
function lock(path: string): () => void {
  const mode = statSync(path).mode & 0o7777
  chmodSync(path, 0o000)
  return () => chmodSync(path, mode)
}

/**
 * Whether this runtime's `realpath` refuses a mode-000 file. The binary
 * confines every artifact output through `realpathSync.native` before it reads
 * one (`FileSystemUtils.canonicalizePotentialPath`): Bun on macOS opens the
 * file to resolve it and fails with EACCES; Bun on Linux and Node anywhere
 * resolve it without opening it. Where it refuses, the binary refuses the
 * change; where it doesn't, the binary counts an unreadable `tasks.md` as no
 * tasks, as its `countTaskFile` counts any unreadable task file.
 */
function realpathRefuses(path: string): boolean {
  try {
    realpathSync.native(path)
    return false
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES') return true
    throw error
  }
}

// --- runners -------------------------------------------------------------------

interface JsonAnswer {
  exitCode: number
  json: unknown
  stdout: string
  stderr: string
}

function parseOne(label: string, stdout: string): unknown {
  try {
    return JSON.parse(stdout)
  } catch (err) {
    throw new Error(
      `${label} did not print one JSON document: ${JSON.stringify(stdout.slice(0, 400))}`,
      {
        cause: err,
      },
    )
  }
}

/** The binary's answer for `argv` in `root` (or `cwd`). */
function upstream(argv: string[], root: string, cwd = root): Promise<OracleRun> {
  return oracle(argv, root, { cwd })
}

/** cospec's answer for `argv` in `root` (or `cwd`), under the oracle's sandbox env. */
function ours(
  argv: string[],
  root: string,
  cwd = root,
  env: Record<string, string> = {},
): Promise<SpawnResult> {
  return cospec(argv, { cwd, env: { ...oracleEnv(root), ...env } })
}

async function upstreamJson(argv: string[], root: string, cwd = root): Promise<JsonAnswer> {
  const run = await upstream(argv, root, cwd)
  return { ...run, json: parseOne(`openspec ${argv.join(' ')}`, run.stdout) }
}

async function oursJson(
  argv: string[],
  root: string,
  cwd = root,
  env: Record<string, string> = {},
): Promise<JsonAnswer> {
  const run = await ours(argv, root, cwd, env)
  return { ...run, json: parseOne(`cospec ${argv.join(' ')}`, run.stdout) }
}

// --- the key oracle's own contract (verification 1.8) -----------------------------

describe('the key oracle', () => {
  const spec: OracleSpec = {
    identities: { 'changes[]': { upstream: byKey('changeName'), cospec: byKey('change') } },
    timing: ['**.lastModified'],
  }
  const upstreamDoc = {
    changes: [{ changeName: 'a', schemaName: 'feat', lastModified: '2026-01-01' }],
    root: { path: '/r', source: 'nearest' },
    version: '1.0',
  }
  const good = {
    version: 1,
    changes: [
      { change: 'a', type: 'feat', changeName: 'a', schemaName: 'feat', lastModified: 'x' },
    ],
    root: { path: '/r', source: 'nearest' },
  }

  test('a document carrying every upstream key passes, whatever its version', () => {
    expect(compareDocuments(upstreamDoc, good, spec).failures).toEqual([])
  })

  test('a string root where the binary has an object fails, naming root', () => {
    const failures = compareDocuments(upstreamDoc, { ...good, root: '/r' }, spec).failures
    expect(failures).toHaveLength(1)
    expect(failures[0]).toStartWith('root: collision')
  })

  test('a missing upstream key fails, naming its path', () => {
    const doc = {
      ...good,
      changes: [{ change: 'a', type: 'feat', changeName: 'a', lastModified: 'x' }],
    }
    const failures = compareDocuments(upstreamDoc, doc, spec).failures
    expect(failures).toEqual([expect.stringContaining('changes[].schemaName: missing')])
  })

  test('an entry the binary has and cospec lacks fails, naming the identity', () => {
    const failures = compareDocuments(upstreamDoc, { ...good, changes: [] }, spec).failures
    expect(failures).toEqual([
      expect.stringContaining('changes: no cospec entry for the binary\'s "a"'),
    ])
  })

  test('a timing value of another JSON type fails', () => {
    const doc = { ...good, changes: [{ ...good.changes[0], lastModified: 7 }] }
    const failures = compareDocuments(upstreamDoc, doc, spec).failures
    expect(failures).toEqual([expect.stringContaining('changes[].lastModified')])
  })

  test('an unnamed collision fails; the named items[].type one passes only with kind', () => {
    const up = {
      items: [
        { id: 'a', type: 'change' },
        { id: 's', type: 'spec' },
      ],
    }
    const vspec: OracleSpec = {
      identities: { 'items[]': { upstream: byKindAndId('type'), cospec: byKindAndId('kind') } },
      collisions: ['items[].type'],
    }
    const ok = {
      items: [
        { id: 'a', kind: 'change', type: 'feat' },
        { id: 's', kind: 'spec' },
      ],
    }
    expect(compareDocuments(up, ok, vspec).failures).toEqual([])
    expect(
      compareDocuments(up, ok, { identities: vspec.identities }).failures.join('\n'),
    ).toContain('items[].type: collision: cospec has "feat" where the binary has "change"')
    const broken = {
      items: [
        { id: 'a', kind: 'change', type: 'feat' },
        { id: 's', kind: 'spec', type: 'x' },
      ],
    }
    expect(compareDocuments(up, broken, vspec).failures).toEqual([
      expect.stringContaining('items[].type: named collision broken'),
    ])
    expect(NAMED_COLLISIONS.map((c) => c.path)).toEqual(['version', 'items[].type'])
  })

  test('a respelled path must carry the binary value spelled through cospec', () => {
    const up = {
      nextSteps: [
        'Run openspec instructions design --change "a" --json before writing that artifact.',
      ],
    }
    const rspec: OracleSpec = { respelled: ['nextSteps[]'] }
    expect(compareDocuments(up, up, rspec).failures).toEqual([
      expect.stringContaining('nextSteps[]: '),
    ])
    const respelled = {
      nextSteps: [
        'Run cospec instructions design --change "a" --json before writing that artifact.',
      ],
    }
    expect(compareDocuments(up, respelled, rspec).failures).toEqual([])
  })

  test('a dropped or changed snapshotted cospec key fails, naming its path', () => {
    const native = { changes: [{ change: 'a', type: 'feat', gate: 'clear' }] }
    const ids = { 'changes[]': { upstream: byKey('changeName'), cospec: byKey('change') } }
    const snapshot = ['changes[].change', 'changes[].type', 'changes[].gate']
    expect(checkNativeKeys(good, native, snapshot, ids)).toEqual([
      expect.stringContaining('changes[].gate: cospec key dropped'),
    ])
    const changed = { changes: [{ change: 'a', type: 'fix', gate: 'clear' }] }
    expect(checkNativeKeys(changed, native, snapshot, ids)).toEqual([
      expect.stringContaining('changes[].type: cospec value changed'),
    ])
    expect(checkNativeKeys(native, native, snapshot, ids)).toEqual([])
  })

  test('an empty upstream array is reported so a row can require its fixture to fill it', () => {
    const { emptyArrays } = compareDocuments({ warnings: [] }, { warnings: [] }, {})
    expect(emptyArrays).toEqual(['warnings'])
  })
})

// --- the fixtures stand up against the binary ------------------------------------

describe('cli-surface fixtures', () => {
  test('the list fixture lists recent-first with the namespace folder marked', async () => {
    const root = listFixture()
    const up = await upstreamJson(['list', '--json'], root)
    const rows = (up.json as { changes: { name: string; nested?: string[] }[] }).changes
    expect(rows.map((r) => r.name)).toEqual(['mobile', 'gamma', 'beta', 'alpha'])
    expect(rows[0]!.nested).toEqual(['mobile/refresh-token'])
  })

  test('the detector matrix marks exactly the ns-* candidates', async () => {
    const root = cospecRoot()
    detectorMatrix(root)
    const up = await upstreamJson(['list', '--json'], root)
    const rows = (up.json as { changes: { name: string; nested?: string[] }[] }).changes
    const marked = rows
      .filter((r) => r.nested !== undefined)
      .map((r) => r.name)
      .toSorted()
    expect(marked).toEqual(
      rows
        .map((r) => r.name)
        .filter((n) => n.startsWith('ns-'))
        .toSorted(),
    )
    expect(rows.find((r) => r.name === 'ns-two')!.nested).toEqual(['ns-two/eta', 'ns-two/zeta'])
  })

  test('the schema fixtures resolve as the binary resolves them', async () => {
    const root = cospecRoot()
    projectFork(root)
    writeChange(root, 'forked', { 'proposal.md': PROPOSAL }, 'house')
    specDrivenChange(root)
    unknownSchemaChange(root)
    handMadeChange(root)
    const status = async (id: string) =>
      (await upstreamJson(['status', '--change', id, '--json'], root)).json as Record<
        string,
        unknown
      >
    expect((await status('forked')).schemaName).toBe('house')
    expect((await status('legacy-one')).schemaName).toBe('spec-driven')
    expect((await status('bare-dir')).schemaName).toBe('feat')
    expect(JSON.stringify(await status('ghost'))).toContain("Unknown schema 'nope'")
  })

  test('the ambiguous gamma fixture is refused by the binary', async () => {
    const root = cospecRoot()
    ambiguousGamma(root)
    const up = await upstreamJson(['validate', 'gamma', '--json'], root)
    expect(JSON.stringify(up.json)).toContain('ambiguous_item')
  })

  unlessRoot('mode 000', () => {
    test("an unreadable tasks.md is the binary's list_error where its realpath refuses the file", async () => {
      const root = listFixture()
      const tasks = join(root, 'openspec/changes/beta/tasks.md')
      const restore = lock(tasks)
      try {
        const refused = realpathRefuses(tasks)
        const up = await upstreamJson(['list', '--json'], root)
        expect(up.exitCode).toBe(refused ? 1 : 0)
        if (refused) expect(firstStatus(up.json).code).toBe('list_error')
        else
          expect(rowsOf(up.json).find((r) => r.name === 'beta')).toMatchObject({
            completedTasks: 0,
            totalTasks: 0,
          })
      } finally {
        restore()
      }
    })
  })
})

// --- shared row helpers ------------------------------------------------------------

const BLOCKERS = `# Dependencies

## Blocked by

None.

## Soft-blocked by

None.
`

const VERIFICATION = `# Verification

## 1. It works [critical]

- [ ] 1.1 @unit (agent) run the tests -> they pass
`

const TASKS = '## 1. Work\n\n- [ ] 1.1 Do it\n'

/** A bare `openspec <command>` anywhere in `text` (paths like `openspec/changes/` excepted). */
const BARE_OPENSPEC = /(?<![\w./-])openspec\s+[a-z][\w-]*/

/** Every status answer the rows below captured, for row 5.6. */
const STATUS_OUTPUTS: { label: string; text: string }[] = []

function captureStatus(label: string, run: { stdout: string; stderr: string }): void {
  STATUS_OUTPUTS.push({ label, text: `${run.stdout}${run.stderr}` })
}

interface Diagnostic {
  severity: string
  code: string
  message: string
  target?: string
  fix?: string
}

function firstStatus(doc: unknown): Diagnostic {
  const status = (doc as { status?: Diagnostic[] }).status
  if (status === undefined || status.length === 0)
    throw new Error(`no status diagnostic in ${JSON.stringify(doc)}`)
  return status[0]!
}

/** The namespace folder's explanation, as the binary prints it for `name`. */
async function explanation(root: string, name = 'mobile'): Promise<string> {
  const up = await upstreamJson(['status', '--change', name, '--json'], root)
  return firstStatus(up.json).message
}

type Row = Record<string, unknown>

function rowsOf(doc: unknown, key = 'changes'): Row[] {
  return ((doc as Record<string, unknown>)[key] ?? []) as Row[]
}

const STATUS_ENTRY_SNAPSHOT = [
  'change',
  'type',
  'state',
  'gate',
  'gateState',
  'tasks',
  'archiveReady',
  'verification',
  'error',
  'artifacts[].id',
  'artifacts[].done',
  'artifacts[].required',
  'artifacts[].ready',
]

const STATUS_SPEC: OracleSpec = {
  identities: { 'artifacts[]': { upstream: byKey('id'), cospec: byKey('id') } },
  respelled: ['nextSteps[]'],
}

const STATUS_ALL_SPEC: OracleSpec = {
  identities: {
    'changes[]': { upstream: byKey('changeName'), cospec: byKey('change') },
    'changes[].artifacts[]': { upstream: byKey('id'), cospec: byKey('id') },
  },
  respelled: ['changes[].nextSteps[]'],
}

const LIST_SPEC: OracleSpec = {
  identities: {
    'changes[]': { upstream: byKey('name'), cospec: byKey('change') },
    'warnings[]': { upstream: byCodeAndName, cospec: byCodeAndName },
  },
  timing: ['changes[].lastModified'],
}

const VALIDATE_SPEC: OracleSpec = {
  identities: { 'items[]': { upstream: byKindAndId('type'), cospec: byKindAndId('kind') } },
  timing: ['items[].durationMs'],
  verdict: ['items[].valid', 'items[].issues', 'summary.totals.*', 'summary.byType.*.*'],
  collisions: ['items[].type'],
}

const FINDINGS_SPEC: OracleSpec = {
  verdict: ['itemFindings', 'report.returnedItems', 'summary.totals.*', 'summary.byType.*.*'],
}

function expectOracle(up: unknown, cs: unknown, spec: OracleSpec): void {
  const { failures } = compareDocuments(up, cs, spec)
  expect(failures).toEqual([])
}

/** A `feat` change whose every required artifact exists and whose `design.md` does not. */
function requiredDone(root: string, id: string): void {
  writeChange(root, id, {
    'proposal.md': PROPOSAL,
    'blocking-changes.md': BLOCKERS,
    'specs/widgets/spec.md': DELTA,
    'verification.md': VERIFICATION,
    'tasks.md': TASKS,
  })
}

// --- 1. the key oracle rows ---------------------------------------------------------

describe('1. the key oracle passes and keeps cospec keys', () => {
  test('1.1 list --json on the staged-mtime fixture', async () => {
    const root = listFixture()
    const up = await upstreamJson(['list', '--json'], root)
    const cs = await oursJson(['list', '--json'], root)
    expect(cs.exitCode).toBe(up.exitCode)
    const { failures, emptyArrays } = compareDocuments(up.json, cs.json, LIST_SPEC)
    expect(failures).toEqual([])
    expect(emptyArrays).toEqual([])
    expect(rowsOf(cs.json).map((r) => r.change)).toEqual(rowsOf(up.json).map((r) => r.name))
    expect((cs.json as Row).version).toBe(1)
    const cell = (
      change: string,
      type: string,
      total: number,
      complete: number,
      state = 'building',
    ) => ({
      change,
      type,
      state,
      gate: 'clear',
      gateState: 'clear',
      tasks: { total, complete },
      archiveReady: false,
    })
    const native = {
      changes: [
        cell('mobile', '(none)', 0, 0, 'not-a-change'),
        cell('gamma', 'chore', 0, 0),
        cell('beta', 'fix', 2, 1),
        cell('alpha', 'feat', 0, 0),
      ],
    }
    const snapshot = ['change', 'type', 'state', 'gate', 'gateState', 'tasks', 'archiveReady'].map(
      (k) => `changes[].${k}`,
    )
    expect(checkNativeKeys(cs.json, native, snapshot, LIST_SPEC.identities)).toEqual([])
  })

  test('1.2 list --specs --json on a two-spec fixture', async () => {
    const root = cospecRoot()
    writeFiles(root, {
      'openspec/specs/widgets/spec.md': LIVING('widgets'),
      'openspec/specs/gadgets/spec.md': LIVING('gadgets'),
    })
    const up = await upstreamJson(['list', '--specs', '--json'], root)
    const cs = await oursJson(['list', '--specs', '--json'], root)
    expect(cs.exitCode).toBe(up.exitCode)
    const spec: OracleSpec = {
      identities: { 'specs[]': { upstream: byKey('id'), cospec: byKey('id') } },
    }
    const { failures, emptyArrays } = compareDocuments(up.json, cs.json, spec)
    expect(failures).toEqual([])
    expect(emptyArrays).toEqual([])
    expect((cs.json as Row).version).toBe(1)
  })

  test('1.3 status --change alpha --json on a feat change with only proposal.md', async () => {
    const root = listFixture()
    const up = await upstreamJson(['status', '--change', 'alpha', '--json'], root)
    const cs = await oursJson(['status', '--change', 'alpha', '--json'], root)
    captureStatus('1.3', cs)
    expect(cs.exitCode).toBe(up.exitCode)
    expectOracle(up.json, cs.json, STATUS_SPEC)
    const native = computeStatus(root, resolveChange(root, 'alpha')!)
    expect(checkNativeKeys(cs.json, native, STATUS_ENTRY_SNAPSHOT, STATUS_SPEC.identities)).toEqual(
      [],
    )
    expect((cs.json as Row).root).toEqual((up.json as Row).root)
  })

  test('1.4 status --all --json on the list fixture', async () => {
    const root = listFixture()
    const up = await upstreamJson(['status', '--all', '--json'], root)
    const cs = await oursJson(['status', '--all', '--json'], root)
    captureStatus('1.4', cs)
    expect(cs.exitCode).toBe(up.exitCode)
    const { failures, emptyArrays } = compareDocuments(up.json, cs.json, STATUS_ALL_SPEC)
    expect(failures).toEqual([])
    // `linkedContext` is always empty upstream, and an artifact's
    // `existingOutputPaths` is empty wherever that artifact is unwritten.
    expect(
      emptyArrays.filter(
        (p) => !p.endsWith('linkedContext') && !p.endsWith('.existingOutputPaths'),
      ),
    ).toEqual([])
    const message = await explanation(root)
    const native = {
      changes: [
        ...['alpha', 'beta', 'gamma'].map((id) => computeStatus(root, resolveChange(root, id)!)),
        { change: 'mobile', error: message },
      ],
    }
    const snapshot = STATUS_ENTRY_SNAPSHOT.map((p) => `changes[].${p}`)
    expect(checkNativeKeys(cs.json, native, snapshot, STATUS_ALL_SPEC.identities)).toEqual([])
  })

  test('1.5 validate alpha --json and validate --all --json', async () => {
    const root = listFixture()
    writeChange(root, 'delta-one', {
      'proposal.md': PROPOSAL,
      'blocking-changes.md': BLOCKERS,
      'specs/widgets/spec.md': DELTA,
      'verification.md': VERIFICATION,
      'tasks.md': TASKS,
    })
    writeFiles(root, { 'openspec/specs/gadgets/spec.md': LIVING('gadgets') })
    for (const argv of [
      ['validate', 'delta-one', '--json'],
      ['validate', '--all', '--json'],
    ]) {
      const up = await upstreamJson(argv, root)
      const cs = await oursJson(argv, root)
      const { failures, emptyArrays } = compareDocuments(up.json, cs.json, VALIDATE_SPEC)
      expect(failures).toEqual([])
      expect(emptyArrays).toEqual([])
      const doc = cs.json as Row
      expect(doc.version).toBe(1)
      // A change item's `type` is its schema (a namespace folder has none).
      const schemas: Record<string, string> = {
        alpha: 'feat',
        beta: 'fix',
        gamma: 'chore',
        'delta-one': 'feat',
      }
      for (const item of rowsOf(doc, 'items'))
        if (item.kind === 'change' && schemas[String(item.id)] !== undefined)
          expect({ id: item.id, type: item.type }).toEqual({
            id: item.id,
            type: schemas[String(item.id)],
          })
      const summary = doc.summary as Row
      for (const key of ['errors', 'warnings', 'byRule', 'totals', 'byType'])
        expect(summary).toHaveProperty(key)
    }
  })

  test('1.6 validate --all --report findings --json', async () => {
    const root = listFixture()
    writeFiles(root, { 'openspec/specs/gadgets/spec.md': LIVING('gadgets') })
    const argv = ['validate', '--all', '--report', 'findings', '--json']
    const up = await upstreamJson(argv, root)
    const cs = await oursJson(argv, root)
    expectOracle(up.json, cs.json, FINDINGS_SPEC)
    const doc = cs.json as Row
    expect(doc.version).toBe(1)
    const report = doc.report as Row
    expect(report.kind).toBe('validation-findings')
    expect(report.version).toBe('1.0')
    for (const key of ['scope', 'returnedItems', 'totalItems']) expect(report).toHaveProperty(key)
    expect(doc).toHaveProperty('itemFindings')
    expect(doc).toHaveProperty('root')
  })

  test('1.7 apply nope --json beside instructions apply --change nope --json', async () => {
    const root = listFixture()
    const up = await upstreamJson(['instructions', 'apply', '--change', 'nope', '--json'], root)
    const cs = await oursJson(['apply', 'nope', '--json'], root)
    expect(up.exitCode).toBe(1)
    expect(cs.exitCode).toBe(1)
    const want = firstStatus(up.json)
    const got = firstStatus(cs.json)
    for (const key of ['severity', 'code', 'message']) expect(got).toHaveProperty(key)
    expect(got.code).toBe(want.code)
    expect(got.code).toBe('change_error')
  })
})

// --- 3. every status entry names its next step ---------------------------------------

describe('3. status next steps', () => {
  test('3.1 a mid-build feat change prints and carries its next step', async () => {
    const root = listFixture()
    const text = await ours(['status', '--change', 'alpha'], root)
    captureStatus('3.1 text', text)
    expect(text.exitCode).toBe(0)
    expect(
      text.stdout.endsWith('Next: cospec instructions blocking-changes --change alpha\n'),
    ).toBe(true)
    const json = await oursJson(['status', '--change', 'alpha', '--json'], root)
    captureStatus('3.1 json', json)
    expect((json.json as Row).next).toBe('cospec instructions blocking-changes --change alpha')
  })

  test('3.5 an empty change keeps its next spelling in both modes', async () => {
    const root = cospecRoot()
    writeChange(root, 'empty')
    const text = await ours(['status', '--change', 'empty'], root)
    captureStatus('3.5 text', text)
    expect(text.exitCode).toBe(0)
    expect(text.stdout).toContain('next: cospec instructions proposal --change empty')
    const json = await oursJson(['status', '--change', 'empty', '--json'], root)
    captureStatus('3.5 json', json)
    expect((json.json as Row).next).toBe('cospec instructions proposal --change empty')
  })

  test("3.2 nextSteps equals the binary's, respelled, on five fixtures", async () => {
    const root = cospecRoot()
    writeChange(root, 'empty')
    writeChange(root, 'mid', { 'proposal.md': PROPOSAL })
    requiredDone(root, 'done-but-design')
    writeFiles(root, {
      'openspec/changes/skipped/.openspec.yaml':
        'schema: feat\ncreated: 2026-09-01\nschemaVersion: 2\nskip_specs: true\n',
      'openspec/changes/skipped/proposal.md': PROPOSAL,
    })
    specDrivenChange(root, 'driven')
    for (const id of ['empty', 'mid', 'done-but-design', 'skipped', 'driven']) {
      const up = await upstreamJson(['status', '--change', id, '--json'], root)
      const cs = await oursJson(['status', '--change', id, '--json'], root)
      captureStatus(`3.2 ${id}`, cs)
      const want = ((up.json as Row).nextSteps as string[]).map(respellWholeRemedy)
      const got = (cs.json as Row).nextSteps as string[]
      expect({ id, got }).toEqual({ id, got: want })
      for (const step of got) expect(step).not.toMatch(BARE_OPENSPEC)
    }
  })

  test('3.4 each cospec type declares its artifacts in the binary order', async () => {
    const root = cospecRoot()
    for (const type of COSPEC_TYPES)
      writeChange(root, `t-${type}`, { 'proposal.md': PROPOSAL }, type)
    for (const type of COSPEC_TYPES) {
      const id = `t-${type}`
      const up = await upstreamJson(['status', '--change', id, '--json'], root)
      const cs = await oursJson(['status', '--change', id, '--json'], root)
      const ids = (doc: unknown) => rowsOf(doc, 'artifacts').map((a) => a.id)
      expect({ type, order: ids(cs.json) }).toEqual({ type, order: ids(up.json) })
    }
  })
})

// --- 4. a namespace folder is reported as one ----------------------------------------------

describe('4. namespace folders', () => {
  test('4.1 status --change mobile refuses it in text and --json', async () => {
    const root = listFixture()
    const message = await explanation(root)
    const upText = await upstream(['status', '--change', 'mobile'], root)
    const csText = await ours(['status', '--change', 'mobile'], root)
    captureStatus('4.1 text', csText)
    expect(upText.exitCode).toBe(1)
    expect(csText.exitCode).toBe(1)
    expect(csText.stderr).toContain(message)
    const up = await upstreamJson(['status', '--change', 'mobile', '--json'], root)
    const cs = await oursJson(['status', '--change', 'mobile', '--json'], root)
    captureStatus('4.1 json', cs)
    expect(cs.exitCode).toBe(1)
    expect(cs.json).toEqual(up.json)
  })

  test('4.2 status --all --json carries the folder as a failure entry', async () => {
    const root = listFixture()
    const message = await explanation(root)
    const up = await upstreamJson(['status', '--all', '--json'], root)
    const cs = await oursJson(['status', '--all', '--json'], root)
    captureStatus('4.2', cs)
    expect(cs.exitCode).toBe(up.exitCode)
    expect(cs.exitCode).toBe(1)
    const entries = rowsOf(cs.json)
    const folder = entries.find((e) => e.change === 'mobile')!
    expect(folder.error).toBe(message)
    expect(firstStatus(folder).message).toBe(message)
    for (const e of entries.filter((x) => x.change !== 'mobile'))
      expect(e).toHaveProperty('artifacts')
  })

  test('4.3 list marks the folder in text and --json', async () => {
    const root = listFixture()
    const up = await upstreamJson(['list', '--json'], root)
    const cs = await oursJson(['list', '--json'], root)
    const row = rowsOf(cs.json).find((r) => r.change === 'mobile')!
    const upRow = rowsOf(up.json).find((r) => r.name === 'mobile')!
    expect(row.state).toBe('not-a-change')
    expect(row.nested).toEqual(upRow.nested)
    expect((cs.json as Row).warnings).toEqual((up.json as Row).warnings)
    const text = await ours(['list'], root)
    expect(text.stdout).toMatch(/^\s+mobile\s+.*not a change/m)
    const warning = ((up.json as Row).warnings as Row[])[0]!.message as string
    expect(text.stdout.endsWith(`Warning: ${warning}\n`)).toBe(true)
  })

  test('4.4 validate reports the folder as one meta/nested-change', async () => {
    const root = listFixture()
    const message = await explanation(root)
    for (const argv of [
      ['validate', 'mobile', '--json'],
      ['validate', '--all', '--json'],
    ]) {
      const cs = await oursJson(argv, root)
      expect(cs.exitCode).toBe(1)
      const item = rowsOf(cs.json, 'items').find((i) => i.id === 'mobile')!
      const issues = item.issues as { level: string; rule: string; message: string }[]
      expect(issues).toHaveLength(1)
      expect(issues[0]).toMatchObject({ level: 'ERROR', rule: 'meta/nested-change', message })
    }
  })

  test("4.6 the detector matrix nests every row as the binary's list does", async () => {
    const root = cospecRoot()
    detectorMatrix(root)
    const up = await upstreamJson(['list', '--json'], root)
    const cs = await oursJson(['list', '--json'], root)
    const nested = (rows: Row[], key: string) =>
      Object.fromEntries(rows.map((r) => [r[key] as string, r.nested ?? null]))
    expect(nested(rowsOf(cs.json), 'change')).toEqual(nested(rowsOf(up.json), 'name'))
  })
})

// --- 5. a schema cospec doesn't type gets real status ------------------------------------

/** stdout lines, with the `Next:` line split out. */
function statusText(stdout: string): { body: string[]; next: string | undefined } {
  const lines = stdout.split('\n')
  const nextLine = lines.find((l) => l.startsWith('Next: '))
  return { body: lines.filter((l) => !l.startsWith('Next: ')), next: nextLine }
}

/** The artifact a `Next:` line names (`instructions <id>`), for either spelling. */
function nextArtifact(line: string | undefined): string | undefined {
  return line === undefined ? undefined : /instructions (\S+)/.exec(line)?.[1]
}

describe('5. schemas cospec does not type', () => {
  test('5.1 a project fork gets the binary status, spelled cospec', async () => {
    const root = cospecRoot()
    projectFork(root)
    writeChange(root, 'forked', { 'proposal.md': PROPOSAL }, 'house')
    const upText = await upstream(['status', '--change', 'forked'], root)
    const csText = await ours(['status', '--change', 'forked'], root)
    captureStatus('5.1 text', csText)
    expect(csText.exitCode).toBe(0)
    const u = statusText(upText.stdout)
    const c = statusText(csText.stdout)
    expect(c.body).toEqual(u.body)
    expect(c.next).toBe(`Next: cospec instructions ${nextArtifact(u.next)} --change forked`)
    const up = await upstreamJson(['status', '--change', 'forked', '--json'], root)
    const cs = await oursJson(['status', '--change', 'forked', '--json'], root)
    captureStatus('5.1 json', cs)
    expect(cs.exitCode).toBe(0)
    expect(cs.json).toMatchObject({ change: 'forked', type: 'house', legacy: true })
    expectOracle(up.json, cs.json, STATUS_SPEC)
  })

  test('5.2 a spec-driven change, singly and in the sweep', async () => {
    const root = cospecRoot()
    specDrivenChange(root)
    const upText = await upstream(['status', '--change', 'legacy-one'], root)
    const csText = await ours(['status', '--change', 'legacy-one'], root)
    captureStatus('5.2 text', csText)
    expect(statusText(csText.stdout).body).toEqual(statusText(upText.stdout).body)
    const up = await upstreamJson(['status', '--change', 'legacy-one', '--json'], root)
    const cs = await oursJson(['status', '--change', 'legacy-one', '--json'], root)
    captureStatus('5.2 json', cs)
    expectOracle(up.json, cs.json, STATUS_SPEC)
    const sweep = await ours(['status', '--all'], root)
    captureStatus('5.2 sweep', sweep)
    for (const line of statusText(upText.stdout).body.filter((l) => l.length > 0))
      expect(sweep.stdout).toContain(line)
  })

  test('5.3 an unknown schema fails under --json', async () => {
    const root = cospecRoot()
    unknownSchemaChange(root)
    const up = await upstreamJson(['status', '--change', 'ghost', '--json'], root)
    const cs = await oursJson(['status', '--change', 'ghost', '--json'], root)
    captureStatus('5.3', cs)
    expect(up.exitCode).toBe(1)
    expect(cs.exitCode).toBe(1)
    expect(firstStatus(cs.json).message).toBe(firstStatus(up.json).message)
    expect(firstStatus(cs.json).message).toContain("Unknown schema 'nope'")
  })

  test('5.4 a hand-made change is typed by config.yaml', async () => {
    const root = cospecRoot()
    handMadeChange(root)
    const up = await upstreamJson(['status', '--change', 'bare-dir', '--json'], root)
    const cs = await oursJson(['status', '--change', 'bare-dir', '--json'], root)
    captureStatus('5.4 feat', cs)
    const doc = cs.json as Row
    expect(doc.type).toBe('feat')
    expect(doc.schemaName).toBe((up.json as Row).schemaName)
    expect(doc.schemaName).toBe('feat')
    // Graded at schemaVersion 1: `verification` joined feat's gate at v2.
    const required = rowsOf(doc, 'artifacts')
      .filter((a) => a.required === true)
      .map((a) => a.id)
    expect(required).not.toContain('verification')
    expect(required).toContain('proposal')

    const bare = cospecRoot(null)
    handMadeChange(bare)
    const up2 = await upstreamJson(['status', '--change', 'bare-dir', '--json'], bare)
    const cs2 = await oursJson(['status', '--change', 'bare-dir', '--json'], bare)
    captureStatus('5.4 spec-driven', cs2)
    expect((up2.json as Row).schemaName).toBe('spec-driven')
    expect(cs2.json).toMatchObject({ change: 'bare-dir', legacy: true, schemaName: 'spec-driven' })
  })

  test('5.5 --schema overrides, and an unknown one is refused as the binary refuses it', async () => {
    const root = listFixture()
    const all = await oursJson(['status', '--all', '--schema', 'fix', '--json'], root)
    captureStatus('5.5 fix', all)
    for (const entry of rowsOf(all.json).filter((e) => e.change !== 'mobile')) {
      expect(entry.type).toBe('fix')
      expect(entry.schemaName).toBe('fix')
    }
    const refusal = async (argv: string[], dir: string) => {
      const up = await upstreamJson(argv, dir)
      const cs = await oursJson(argv, dir)
      captureStatus(`5.5 ${argv.join(' ')}`, cs)
      expect({ argv, exit: cs.exitCode }).toEqual({ argv, exit: up.exitCode })
      expect(cs.json).toEqual(up.json)
    }
    await refusal(['status', '--change', 'alpha', '--schema', 'nope', '--json'], root)
    const empty = cospecRoot()
    await refusal(['status', '--all', '--schema', 'nope', '--json'], empty)
    await refusal(['status', '--schema', 'nope', '--json'], empty)
  })
})

// --- 6. list sorts and survives read failures -----------------------------------------------

describe('6. list order and read failures', () => {
  test('6.1 --sort recent|name|bogus orders rows as the binary does', async () => {
    const root = listFixture()
    for (const extra of [[], ['--sort', 'name'], ['--sort', 'bogus']]) {
      const up = await upstreamJson(['list', '--json', ...extra], root)
      const cs = await oursJson(['list', '--json', ...extra], root)
      expect({ extra, order: rowsOf(cs.json).map((r) => r.change) }).toEqual({
        extra,
        order: rowsOf(up.json).map((r) => r.name),
      })
    }
  })

  unlessRoot('mode 000', () => {
    /** The list fixture with `alpha` carrying blockers, its archive at mode 000. */
    function lockedArchiveRoot(): { root: string; restore: () => void } {
      const root = listFixture()
      writeFiles(root, { 'openspec/changes/alpha/blocking-changes.md': BLOCKERS })
      stageMtimes(root, ['alpha', 'beta', 'gamma', 'mobile'])
      return { root, restore: lock(join(root, 'openspec/changes/archive')) }
    }

    test('6.2 list: an unreadable archive lists normally with a warning', async () => {
      const { root, restore } = lockedArchiveRoot()
      try {
        const up = await upstreamJson(['list', '--json'], root)
        const cs = await oursJson(['list', '--json'], root)
        expect(cs.exitCode).toBe(0)
        expect(rowsOf(cs.json).map((r) => r.change)).toEqual(rowsOf(up.json).map((r) => r.name))
        const warnings = ((cs.json as Row).warnings ?? []) as Row[]
        const unreadable = warnings.filter((w) => w.code === 'archive_unreadable')
        expect(unreadable).toHaveLength(1)
        expect(unreadable[0]!.message).toContain('openspec/changes/archive')
        const text = await ours(['list'], root)
        expect(text.exitCode).toBe(0)
        expect(text.stderr).toContain('openspec/changes/archive')
      } finally {
        restore()
      }
    })

    test('6.2 status: an unreadable archive reports with a warning', async () => {
      const { root, restore } = lockedArchiveRoot()
      try {
        const status = await oursJson(['status', '--change', 'alpha', '--json'], root)
        captureStatus('6.2', status)
        expect(status.exitCode).toBe(0)
        const sw = ((status.json as Row).warnings ?? []) as Row[]
        expect(sw.map((w) => w.code)).toEqual(['archive_unreadable'])
        expect(String(sw[0]!.message)).toContain('openspec/changes/archive')
        const text = await ours(['status', '--change', 'alpha'], root)
        captureStatus('6.2 text', text)
        expect(text.exitCode).toBe(0)
        expect(text.stderr).toContain('openspec/changes/archive')
      } finally {
        restore()
      }
    })

    /**
     * Row 6.3 for one argv: the binary's answer, as rows 15.11 and 15.12 hold
     * it — its failure document where its runtime's `realpath` refuses the
     * file, else the change reported with no tasks.
     */
    async function unreadableTasks(argv: string[]): Promise<void> {
      const root = listFixture()
      const tasks = join(root, 'openspec/changes/beta/tasks.md')
      const restore = lock(tasks)
      try {
        const refused = realpathRefuses(tasks)
        const up = await upstreamJson(argv, root)
        const cs = await oursJson(argv, root)
        captureStatus(`6.3 ${argv[0]}`, cs)
        expect({ argv, exit: cs.exitCode }).toEqual({ argv, exit: up.exitCode })
        expect(up.exitCode).toBe(refused ? 1 : 0)
        if (!refused) {
          expect((cs.json as Row).status).toBeUndefined()
          return
        }
        const want = firstStatus(up.json)
        const got = firstStatus(cs.json)
        expect(got.code).toBe(want.code)
        // The binary's own failure, relayed: its code, syscall (its confinement
        // check's `realpath`) and path.
        expect(errnoShape(got.message)).toEqual(errnoShape(want.message))
        const { status: _u, ...upRest } = up.json as Row
        const { status: _c, ...csRest } = cs.json as Row
        expect(csRest).toEqual(upRest)
      } finally {
        restore()
      }
    }

    test("6.3 list: an unreadable tasks.md is the binary's list_error", () =>
      unreadableTasks(['list', '--json']))

    test("6.3 status: an unreadable tasks.md is the binary's change_error", () =>
      unreadableTasks(['status', '--change', 'beta', '--json']))

    test('6.4 an unreadable blocking-changes.md fails only its row', async () => {
      const root = listFixture()
      const blockers = join(root, 'openspec/changes/beta/blocking-changes.md')
      writeFiles(root, { 'openspec/changes/beta/blocking-changes.md': BLOCKERS })
      const restore = lock(blockers)
      try {
        const cs = await oursJson(['list', '--json'], root)
        expect(cs.exitCode).toBe(1)
        const rows = rowsOf(cs.json)
        expect(rows.map((r) => r.change).toSorted()).toEqual(['alpha', 'beta', 'gamma', 'mobile'])
        expect(typeof rows.find((r) => r.change === 'beta')!.error).toBe('string')
        expect(rows.filter((r) => r.error !== undefined)).toHaveLength(1)
      } finally {
        restore()
      }
    })
  })
})

// --- 7. validate resolves items and scopes as the binary does ---------------------------------

describe('7. validate item resolution', () => {
  function itemRoot(): string {
    const root = listFixture()
    ambiguousGamma(root)
    return root
  }

  test('7.1 an ambiguous name is refused in text and --json', async () => {
    const root = itemRoot()
    const upText = await upstream(['validate', 'gamma'], root)
    const csText = await ours(['validate', 'gamma'], root)
    expect(csText.exitCode).toBe(1)
    expect(upText.exitCode).toBe(1)
    const first = upText.stderr.split('\n')[0]!
    expect(csText.stderr).toBe(`cospec: ${first}\nPass --type change|spec.\n`)
    const up = await upstreamJson(['validate', 'gamma', '--json'], root)
    const cs = await oursJson(['validate', 'gamma', '--json'], root)
    expect(cs.exitCode).toBe(1)
    expect(cs.json).toEqual(up.json)
  })

  test("7.2 an unknown name gets the binary's nearest matches", async () => {
    const root = itemRoot()
    const empty = cospecRoot()
    for (const [name, dir] of [
      ['gamm', root],
      ['zzzz', root],
      ['zzzz', empty],
    ] as const) {
      const upText = await upstream(['validate', name], dir)
      const csText = await ours(['validate', name], dir)
      expect(csText.exitCode).toBe(1)
      expect(csText.stderr).toBe(`cospec: ${upText.stderr}`)
      const up = await upstreamJson(['validate', name, '--json'], dir)
      const cs = await oursJson(['validate', name, '--json'], dir)
      expect(cs.exitCode).toBe(1)
      expect(cs.json).toEqual(up.json)
      expect(firstStatus(cs.json).code).toBe('unknown_item')
    }
  })

  test('7.3 --type forces the kind, case-insensitively', async () => {
    const root = itemRoot()
    const kinds = async (argv: string[]) => {
      const up = await upstreamJson([...argv, '--json'], root)
      const cs = await oursJson([...argv, '--json'], root)
      expect({ argv, exit: cs.exitCode }).toEqual({ argv, exit: up.exitCode })
      return {
        up: rowsOf(up.json, 'items').map((i) => `${String(i.type)}:${String(i.id)}`),
        cs: rowsOf(cs.json, 'items').map((i) => `${String(i.kind)}:${String(i.id)}`),
        upDoc: up.json,
        csDoc: cs.json,
      }
    }
    const spec = await kinds(['validate', 'gamma', '--type', 'spec'])
    expect(spec.cs).toEqual(['spec:gamma'])
    expect(spec.cs).toEqual(spec.up)
    const change = await kinds(['validate', 'gamma', '--type', 'CHANGE'])
    expect(change.cs).toEqual(['change:gamma'])
    const bogus = await kinds(['validate', 'gamma', '--type', 'bogus'])
    expect(bogus.csDoc).toEqual(bogus.upDoc)
    expect(firstStatus(bogus.csDoc).code).toBe('ambiguous_item')
    const invalid = await kinds(['validate', '../x', '--type', 'change'])
    expect(invalid.csDoc).toEqual(invalid.upDoc)
    expect(firstStatus(invalid.csDoc).code).toBe('invalid_item')
    const missing = await kinds(['validate', 'nope', '--type', 'spec'])
    const item = rowsOf(missing.csDoc, 'items')[0]!
    expect(item).toMatchObject({ id: 'nope', kind: 'spec', valid: false })
    expect((item.issues as Row[]).map((i) => i.rule)).toEqual(['meta/item-missing'])
  })

  test('7.4 a bulk flag beside a name runs the bulk scope', async () => {
    const root = itemRoot()
    for (const flag of ['--all', '--changes', '--specs']) {
      const argv = ['validate', 'alpha', flag, '--json']
      const up = await upstreamJson(argv, root)
      const cs = await oursJson(argv, root)
      const set = (doc: unknown, kindKey: string) =>
        rowsOf(doc, 'items')
          .map((i) => `${String(i[kindKey])}:${String(i.id)}`)
          .toSorted()
      expect({ flag, items: set(cs.json, 'kind') }).toEqual({ flag, items: set(up.json, 'type') })
    }
  })

  test('7.5 the four --report refusals, before any root', async () => {
    const dir = mkTempRepo()
    const cases = [
      ['--report', 'bogus', '--all'],
      ['alpha', '--report', 'full'],
      ['--archived', '--all', '--report', 'full'],
      ['--report', 'findings'],
    ]
    for (const args of cases) {
      const upText = await upstream(['validate', ...args], dir)
      const csText = await ours(['validate', ...args], dir)
      expect({ args, exit: csText.exitCode, stderr: csText.stderr }).toEqual({
        args,
        exit: 1,
        stderr: upText.stderr,
      })
      const up = await upstreamJson(['validate', ...args, '--json'], dir)
      const cs = await oursJson(['validate', ...args, '--json'], dir)
      expect(cs.exitCode).toBe(1)
      expect(cs.json).toEqual(up.json)
      expect(firstStatus(cs.json).code).toBe('invalid_validation_report_request')
    }
  })

  test("7.6 --report findings keeps full's exit code and lists only failing items", async () => {
    const root = cospecRoot()
    writeChange(root, 'broken', { 'proposal.md': PROPOSAL }, 'nope')
    writeChange(
      root,
      'clean',
      {
        'proposal.md': PROPOSAL,
        'blocking-changes.md': BLOCKERS,
        'tasks.md': '## 1. W\n\n- [x] 1.1 Done\n',
      },
      'chore',
    )
    for (const json of [[], ['--json']]) {
      const full = await ours(['validate', '--all', '--report', 'full', ...json], root)
      const findings = await ours(['validate', '--all', '--report', 'findings', ...json], root)
      expect(full.exitCode).toBe(1)
      expect(findings.exitCode).toBe(1)
      if (json.length > 0) {
        const doc = parseOne('findings', findings.stdout) as Row
        expect(rowsOf(doc, 'itemFindings').map((i) => i.id)).toEqual(['broken'])
      } else {
        expect(findings.stdout).not.toContain('clean')
      }
    }
  })

  unlessRoot('mode 000', () => {
    test('7.8 an unreadable artifact is one meta/unreadable-artifact ERROR', async () => {
      const root = cospecRoot()
      writeChange(root, 'other', { 'proposal.md': PROPOSAL }, 'chore')
      for (const file of ['proposal.md', 'tasks.md', 'specs/widgets/spec.md']) {
        const id = `locked-${file.split('/').pop()!.replace('.md', '')}`
        const dir = writeChange(root, id, {
          'proposal.md': PROPOSAL,
          'blocking-changes.md': BLOCKERS,
          'specs/widgets/spec.md': DELTA,
          'tasks.md': TASKS,
        })
        const restore = lock(join(dir, file))
        try {
          for (const argv of [
            ['validate', id, '--json'],
            ['validate', '--all', '--json'],
          ]) {
            const cs = await oursJson(argv, root)
            expect(cs.exitCode).toBe(1)
            const item = rowsOf(cs.json, 'items').find((i) => i.id === id)!
            const issues = item.issues as Row[]
            expect(issues).toHaveLength(1)
            expect(issues[0]).toMatchObject({ level: 'ERROR', rule: 'meta/unreadable-artifact' })
            expect(issues[0]!.message).toContain(file)
            expect(issues[0]!.message).toContain('EACCES')
            if (argv.includes('--all'))
              expect(rowsOf(cs.json, 'items').map((i) => i.id)).toContain('other')
          }
        } finally {
          restore()
        }
      }
    })
  })

  test("7.9 the binary's no-deltas tip is relayed spelled cospec", async () => {
    const root = cospecRoot()
    specDrivenChange(root, 'no-deltas')
    const cs = await oursJson(['validate', 'no-deltas', '--json'], root)
    const messages = rowsOf(cs.json, 'items').flatMap((i) =>
      (i.issues as Row[]).map((x) => String(x.message)),
    )
    expect(messages.some((m) => m.includes('cospec show <change-id> --json --deltas-only'))).toBe(
      true,
    )
    for (const m of messages) expect(m).not.toMatch(BARE_OPENSPEC)
  })
})

describe('8.3 apply under --json', () => {
  test('8.3 cospec apply nope --json is one change_error document naming nope', async () => {
    const root = listFixture()
    const cs = await ours(['apply', 'nope', '--json'], root)
    expect(cs.exitCode).toBe(1)
    expect(cs.stderr).toBe('')
    const doc = parseOne('cospec apply nope --json', cs.stdout) as Row
    expect(Object.keys(doc)).toEqual(['status'])
    const status = firstStatus(doc)
    expect(status).toMatchObject({ severity: 'error', code: 'change_error' })
    expect(status.message).toContain("'nope'")
  })
})

// --- 8. every --json failure is one document --------------------------------------------

const RESOLVER_ROWS: { argv: string[]; code: string }[] = [
  { argv: ['list', '--json'], code: 'list_error' },
  { argv: ['list', '--specs', '--json'], code: 'list_error' },
  { argv: ['status', '--change', 'a', '--json'], code: 'change_error' },
  { argv: ['status', '--all', '--json'], code: 'change_error' },
  { argv: ['validate', '--all', '--json'], code: 'validate_error' },
]

/** Row 8.1 for one command: an unreadable store registry, the command's code and payload. */
async function unreadableRegistry(row: { argv: string[]; code: string }): Promise<void> {
  const sb = await makeSandbox(['s1'])
  const registry = join(sb.env['XDG_DATA_HOME']!, 'openspec', 'stores', 'registry.yaml')
  const restore = lock(registry)
  try {
    const argv = [...row.argv, '--store', 's1']
    const up = await upstreamJson(argv, sb.dir)
    const cs = await oursJson(argv, sb.dir)
    expect({ argv, exit: cs.exitCode }).toEqual({ argv, exit: up.exitCode })
    const want = firstStatus(up.json)
    const got = firstStatus(cs.json)
    expect({ argv, code: got.code }).toEqual({ argv, code: want.code })
    expect(got.code).toBe(row.code)
    expect(errnoShape(got.message)).toEqual(errnoShape(want.message))
    const { status: _u, ...upRest } = up.json as Row
    const { status: _c, ...csRest } = cs.json as Row
    expect({ argv, payload: csRest }).toEqual({ argv, payload: upRest })
  } finally {
    restore()
  }
}

/** Row 8.4 for one command: an unknown store, the binary's diagnostic in its payload. */
async function unknownStore(row: { argv: string[] }): Promise<void> {
  const sb = await makeSandbox(['s1'])
  const argv = [...row.argv, '--store', 'nope']
  const up = await upstream(argv, sb.dir)
  const cs = await oursJson(argv, sb.dir)
  expect({ argv, exit: cs.exitCode }).toEqual({ argv, exit: up.exitCode })
  // The message is cospec's own documented wording (`concepts/stores.md`,
  // root-resolution-parity); the code, target, fix and payload are the binary's.
  const want = JSON.parse(respellRemedies(up.stdout)) as Row
  const got = cs.json as Row
  const { message: wantMessage, ...wantDiagnostic } = firstStatus(want)
  const { message: gotMessage, ...gotDiagnostic } = firstStatus(got)
  expect({ argv, diagnostic: gotDiagnostic }).toEqual({ argv, diagnostic: wantDiagnostic })
  expect(wantMessage).toContain("'nope'")
  expect(gotMessage).toContain("'nope'")
  expect(gotMessage).toContain('Registered stores: s1')
  const { status: _w, ...wantPayload } = want
  const { status: _g, ...gotPayload } = got
  expect({ argv, payload: gotPayload }).toEqual({ argv, payload: wantPayload })
  expect(gotDiagnostic.code).toBe('unknown_store')
}

const [LIST_ROW, SPECS_ROW, STATUS_ROW, SWEEP_ROW, VALIDATE_ROW] = RESOLVER_ROWS as [
  (typeof RESOLVER_ROWS)[number],
  (typeof RESOLVER_ROWS)[number],
  (typeof RESOLVER_ROWS)[number],
  (typeof RESOLVER_ROWS)[number],
  (typeof RESOLVER_ROWS)[number],
]

// `list`'s rows come from the binary's `list --json`, which refuses a directory
// with no OpenSpec root: cospec answers with that refusal, as the binary does.
describe('list outside an OpenSpec root', () => {
  test("list answers the binary's no-root refusal in text and --json", async () => {
    const dir = mkTempRepo({ git: true })
    const env = emptyMachineStateEnv()
    const upText = await upstream(['list'], dir)
    const csText = await ours(['list'], dir, dir, env)
    expect({ exit: csText.exitCode, out: csText.stdout }).toEqual({
      exit: upText.exitCode,
      out: '',
    })
    expect(upText.exitCode).toBe(1)
    expect(csText.stderr).toBe(
      respellRemedies(upText.stderr.replace(/^(?:✖ )?Error: /, 'cospec list: ')),
    )
    const up = await upstreamJson(['list', '--json'], dir)
    const cs = await oursJson(['list', '--json'], dir, dir, env)
    expect(cs.exitCode).toBe(1)
    expect(cs.json).toEqual(JSON.parse(respellRemedies(up.stdout)))
    expect(firstStatus(cs.json).code).toBe('no_openspec_root')
  })
})

describe('8. resolver failures under --json', () => {
  unlessRoot('8.1 an unreadable store registry carries the command code and payload', () => {
    test('8.1 list --json', () => unreadableRegistry(LIST_ROW))
    test('8.1 list --specs --json', () => unreadableRegistry(SPECS_ROW))
    test('8.1 status --change a --json', () => unreadableRegistry(STATUS_ROW))
    test('8.1 status --all --json', () => unreadableRegistry(SWEEP_ROW))
    test('8.1 validate --all --json', () => unreadableRegistry(VALIDATE_ROW))
  })

  describe("8.4 an unknown store carries the binary's diagnostic inside its payload", () => {
    test('8.4 list --json', () => unknownStore(LIST_ROW))
    test('8.4 list --specs --json', () => unknownStore(SPECS_ROW))
    test('8.4 status --change a --json', () => unknownStore(STATUS_ROW))
    test('8.4 status --all --json', () => unknownStore(SWEEP_ROW))
    test('8.4 validate --all --json', () => unknownStore(VALIDATE_ROW))
  })
})

// --- 9. completion serves schemas and archived changes ------------------------------------

describe('9. __complete sources', () => {
  test('9.1 schemas and archived-changes complete as the binary lists them', async () => {
    const root = cospecRoot()
    projectFork(root)
    mkdirSync(join(root, 'openspec/changes/archive/2026-01-01-one'), { recursive: true })
    mkdirSync(join(root, 'openspec/changes/archive/2026-01-02-two'), { recursive: true })
    const ids = (stdout: string) =>
      stdout
        .split('\n')
        .filter(Boolean)
        .map((l) => l.split('\t')[0])
    for (const [source, binarySource] of [
      ['schemas', 'schemas'],
      ['archived-changes', 'archived-changes'],
      ['SCHEMAS', 'schemas'],
    ] as const) {
      const up = await upstream(['__complete', binarySource], root)
      const cs = await ours(['__complete', source], root)
      expect({ source, exit: cs.exitCode, stderr: cs.stderr }).toEqual({
        source,
        exit: 0,
        stderr: '',
      })
      expect(ids(cs.stdout)).toEqual(ids(up.stdout))
      for (const line of cs.stdout.split('\n').filter(Boolean))
        expect(line).toMatch(/^[^\t]+\t[^\t]+$/)
    }
    const outside = mkTempRepo()
    for (const source of ['schemas', 'archived-changes']) {
      const cs = await ours(['__complete', source], outside, outside, emptyMachineStateEnv())
      expect({ source, exit: cs.exitCode, out: cs.stdout, err: cs.stderr }).toEqual({
        source,
        exit: 1,
        out: '',
        err: '',
      })
    }
  })
})

// --- 10. schema classification reads the binary's user directory -----------------------------

describe('10. user schema directory', () => {
  test('10.2 a user-dir schema is legacy; one under ~/.config is unknown', async () => {
    const root = cospecRoot()
    const env = oracleEnv(root)
    const userDir = join(env['XDG_DATA_HOME']!, 'openspec', 'schemas', 'house-style')
    cpSync(join(openspecPackageDir(), 'schemas/spec-driven'), userDir, { recursive: true })
    const configDir = join(env['HOME']!, '.config', 'openspec', 'schemas', 'config-style')
    cpSync(join(openspecPackageDir(), 'schemas/spec-driven'), configDir, { recursive: true })
    writeChange(root, 'user-one', { 'proposal.md': PROPOSAL }, 'house-style')
    writeChange(root, 'config-one', { 'proposal.md': PROPOSAL }, 'config-style')

    const up = await upstreamJson(['validate', 'user-one', '--json'], root)
    const cs = await oursJson(['validate', 'user-one', '--json'], root)
    const rules = (doc: unknown) =>
      rowsOf(doc, 'items').flatMap((i) => (i.issues as Row[]).map((x) => x.rule))
    expect(rules(cs.json)).not.toContain('meta/schema-unknown')
    const upMessages = rowsOf(up.json, 'items').flatMap((i) =>
      (i.issues as Row[]).map((x) => respellRemedies(String(x.message))),
    )
    const relayed = rowsOf(cs.json, 'items').flatMap((i) =>
      (i.issues as Row[])
        .filter((x) => x.rule === 'openspec/validate')
        .map((x) => respellRemedies(String(x.message))),
    )
    // Compared through the remedy allowlist on both sides: this row is about
    // where the schema resolves; the relay spelling is row 7.9's.
    expect(relayed).toEqual(upMessages)

    const config = await oursJson(['validate', 'config-one', '--json'], root)
    expect(rules(config.json)).toContain('meta/schema-unknown')
    const upConfig = await upstream(['status', '--change', 'config-one', '--json'], root)
    expect(upConfig.exitCode).toBe(1)
  })
})

// --- 15. round-2 review rows -----------------------------------------------------------

/** A project schema `rfc` whose artifacts are `doc.md` and `notes.md` (notes needs doc). */
function rfcSchema(root: string): void {
  writeFiles(root, {
    'openspec/schemas/rfc/schema.yaml': [
      'name: rfc',
      'version: 1',
      'description: An rfc-style schema',
      'artifacts:',
      '  - id: doc',
      '    generates: doc.md',
      '    description: The RFC document',
      '    template: doc.md',
      '    instruction: Write the RFC.',
      '    requires: []',
      '  - id: notes',
      '    generates: notes.md',
      '    description: Review notes',
      '    template: notes.md',
      '    instruction: Write the notes.',
      '    requires:',
      '      - doc',
      'apply:',
      '  requires: [doc]',
      '  tracks: null',
      '',
    ].join('\n'),
    'openspec/schemas/rfc/templates/doc.md': '# Doc\n',
    'openspec/schemas/rfc/templates/notes.md': '# Notes\n',
  })
}

/** The document without its `warnings` key. */
function withoutWarnings(doc: unknown): unknown {
  const { warnings: _w, ...rest } = doc as Row
  return rest
}

describe('15. round-2 review rows', () => {
  test('15.1 --type spec on a spec discovery skips validates the file, as the binary does', async () => {
    const root = cospecRoot()
    writeFiles(root, {
      'openspec/specs/.hidden/spec.md': '# hidden\n',
      'openspec/specs/real/spec.md': LIVING('real'),
    })
    const outside = mkTempRepo()
    writeFiles(outside, { 'cap/spec.md': '# linked\n' })
    symlinkSync(join(outside, 'cap'), join(root, 'openspec/specs/linked'))
    for (const id of ['.hidden', 'linked']) {
      const up = await upstreamJson(['validate', id, '--type', 'spec', '--json'], root)
      const cs = await oursJson(['validate', id, '--type', 'spec', '--json'], root)
      expect({ id, exit: cs.exitCode }).toEqual({ id, exit: up.exitCode })
      expect(up.exitCode).toBe(1)
      const upItems = rowsOf(up.json, 'items')
      const csItems = rowsOf(cs.json, 'items')
      expect(csItems.map((i) => [i.id, i.valid])).toEqual(upItems.map((i) => [i.id, i.valid]))
      const messages = (items: Row[]) =>
        items.flatMap((i) => (i.issues as Row[]).map((x) => String(x.message)))
      for (const m of messages(upItems)) expect(messages(csItems)).toContain(m)
      const text = await ours(['validate', id, '--type', 'spec'], root)
      expect({ id, exit: text.exitCode }).toEqual({ id, exit: up.exitCode })
    }
  })

  test('15.2 a hand-made change whose schema output a brace glob matches is a change', async () => {
    const root = cospecRoot('braced')
    writeFiles(root, {
      'openspec/schemas/braced/schema.yaml': [
        'name: braced',
        'version: 1',
        'description: Outputs under rfc/',
        'artifacts:',
        '  - id: proposal',
        "    generates: 'rfc/{proposal,design}*.md'",
        '    description: The proposal',
        '    template: t.md',
        '    instruction: Write it.',
        '    requires: []',
        '',
      ].join('\n'),
      'openspec/schemas/braced/templates/t.md': '# t\n',
      'openspec/changes/rfc-change/rfc/proposal.md': PROPOSAL,
    })
    const up = await upstreamJson(['list', '--json'], root)
    const cs = await oursJson(['list', '--json'], root)
    const upRow = rowsOf(up.json).find((r) => r.name === 'rfc-change')!
    const row = rowsOf(cs.json).find((r) => r.change === 'rfc-change')!
    expect(upRow.nested).toBeUndefined()
    expect(row.state).not.toBe('not-a-change')
    const validated = await oursJson(['validate', 'rfc-change', '--json'], root)
    const rules = rowsOf(validated.json, 'items').flatMap((i) =>
      (i.issues as Row[]).map((x) => x.rule),
    )
    expect(rules).not.toContain('meta/nested-change')
  })

  test("15.4 a custom schema's artifacts decide its status, singly and in the sweep", async () => {
    const root = cospecRoot()
    rfcSchema(root)
    writeChange(root, 'r-empty', {}, 'rfc')
    writeChange(root, 'r-doc', { 'doc.md': '# RFC\n' }, 'rfc')
    // `apply.requires: [doc]`: once `doc` is written the optional `notes`
    // never holds r-doc back from its gate (D4), while the binary's own
    // `nextSteps` still names `notes`.
    const expected: Record<string, { next: string; upstreamNext: string }> = {
      'r-empty': { next: 'cospec instructions doc --change r-empty', upstreamNext: 'doc' },
      'r-doc': { next: 'cospec apply r-doc', upstreamNext: 'notes' },
    }
    for (const [id, { next, upstreamNext }] of Object.entries(expected)) {
      const upText = await upstream(['status', '--change', id], root)
      const csText = await ours(['status', '--change', id], root)
      captureStatus(`15.4 ${id} text`, csText)
      expect({ id, exit: csText.exitCode }).toEqual({ id, exit: upText.exitCode })
      const u = statusText(upText.stdout)
      expect(nextArtifact(u.next)).toBe(upstreamNext)
      expect(statusText(csText.stdout).body).toEqual(u.body)
      expect(statusText(csText.stdout).next).toBe(`Next: ${next}`)
      const up = await upstreamJson(['status', '--change', id, '--json'], root)
      const cs = await oursJson(['status', '--change', id, '--json'], root)
      captureStatus(`15.4 ${id} json`, cs)
      expect({ id, exit: cs.exitCode }).toEqual({ id, exit: up.exitCode })
      expect((cs.json as Row).next).toBe(next)
      expect((cs.json as Row).nextSteps).toEqual(
        ((up.json as Row).nextSteps as string[]).map(respellWholeRemedy),
      )
      expect(JSON.stringify((cs.json as Row).nextSteps)).toContain(
        `cospec instructions ${upstreamNext}`,
      )
      expectOracle(up.json, cs.json, STATUS_SPEC)
    }
    const upAll = await upstreamJson(['status', '--all', '--json'], root)
    const csAll = await oursJson(['status', '--all', '--json'], root)
    captureStatus('15.4 sweep json', csAll)
    expect(csAll.exitCode).toBe(upAll.exitCode)
    const entry = (id: string) => rowsOf(csAll.json).find((e) => e.change === id)!
    for (const [id, { next }] of Object.entries(expected)) expect(entry(id).next).toBe(next)
    const sweep = await ours(['status', '--all'], root)
    captureStatus('15.4 sweep text', sweep)
    for (const id of ['r-empty', 'r-doc']) {
      const upText = await upstream(['status', '--change', id], root)
      for (const line of statusText(upText.stdout).body.filter((l) => l.length > 0))
        expect(sweep.stdout).toContain(line)
    }
    expect(sweep.stdout).not.toContain('cospec instructions proposal')
  })

  unlessRoot('mode 000', () => {
    function lockedArchive(): { root: string; restore: () => void } {
      const root = cospecRoot()
      requiredDone(root, 'ready')
      writeFiles(root, { 'openspec/changes/archive/2026-01-01-old/proposal.md': PROPOSAL })
      return { root, restore: lock(join(root, 'openspec/changes/archive')) }
    }

    test("15.5 validate --archived relays the binary's failure document", async () => {
      const { root, restore } = lockedArchive()
      try {
        const up = await upstreamJson(['validate', '--archived', '--json'], root)
        const cs = await oursJson(['validate', '--archived', '--json'], root)
        expect(up.exitCode).toBe(1)
        expect(cs.exitCode).toBe(up.exitCode)
        expect(cs.json).toEqual(JSON.parse(respellRemedies(up.stdout)))
        const upText = await upstream(['validate', '--archived'], root)
        const text = await ours(['validate', '--archived'], root)
        expect(text.exitCode).toBe(upText.exitCode)
        expect(text.stderr).toBe(`cospec: ${respellRemedies(firstStatus(up.json).message)}\n`)
        expect(text.stderr).not.toContain('1.9.0')
        // Row 7.9's relay half: no relayed line names a bare `openspec` command.
        for (const relayed of [cs.stdout, text.stderr])
          expect(relayed).not.toMatch(/(^|[\s`'"])openspec\s/m)
      } finally {
        restore()
      }
    })

    test.failing(
      '15.6 an unreadable archive leaves validate and apply answering with a warning',
      async () => {
        const { root, restore } = lockedArchive()
        const locked: { argv: string[]; run: JsonAnswer; text: SpawnResult }[] = []
        const argvs = [
          ['validate', 'ready', '--json'],
          ['validate', '--all', '--json'],
          ['apply', 'ready', '--json'],
        ]
        try {
          for (const argv of argvs) {
            const run = await oursJson(argv, root)
            const text = await ours(
              argv.filter((a) => a !== '--json'),
              root,
            )
            locked.push({ argv, run, text })
          }
          const up = await upstreamJson(['validate', '--all', '--json'], root)
          expect(locked[1]!.run.exitCode).toBe(up.exitCode)
        } finally {
          restore()
        }
        for (const { argv, run, text } of locked) {
          const warnings = ((run.json as Row).warnings ?? []) as Row[]
          expect({ argv, codes: warnings.map((w) => w.code) }).toEqual({
            argv,
            codes: ['archive_unreadable'],
          })
          expect(String(warnings[0]!.message)).toContain('openspec/changes/archive')
          expect(text.stderr).toContain('Warning: could not read')
          expect(text.stderr).toContain('openspec/changes/archive')
        }
        // With the archive readable again the answers are the same, bar the warning.
        for (const { argv, run } of locked) {
          const again = await oursJson(argv, root)
          expect({ argv, exit: run.exitCode }).toEqual({ argv, exit: again.exitCode })
          const scrub = (doc: unknown) =>
            JSON.parse(
              JSON.stringify(withoutWarnings(doc)).replace(/"durationMs": ?\d+/g, '"durationMs":0'),
            )
          expect(scrub(run.json)).toEqual(scrub(again.json))
        }
      },
    )

    test.failing("15.8 list --specs relays the binary's failure document and fix", async () => {
      const root = cospecRoot()
      writeFiles(root, { 'openspec/specs/locked/spec.md': LIVING('locked') })
      const restore = lock(join(root, 'openspec/specs/locked'))
      try {
        const up = await upstreamJson(['list', '--specs', '--json'], root)
        const cs = await oursJson(['list', '--specs', '--json'], root)
        expect(up.exitCode).toBe(1)
        expect(cs.exitCode).toBe(1)
        expect(cs.json).toEqual(JSON.parse(respellRemedies(up.stdout)))
        const text = await ours(['list', '--specs'], root)
        expect(text.exitCode).toBe(1)
        const d = firstStatus(up.json)
        expect(text.stderr).toBe(
          `cospec: ${respellRemedies(d.message)}\n${d.fix === undefined ? '' : `Fix: ${respellRemedies(d.fix)}\n`}`,
        )
      } finally {
        restore()
      }
    })

    test.failing(
      '15.9 an unreadable living spec is one meta/unreadable-artifact ERROR',
      async () => {
        const root = cospecRoot()
        writeFiles(root, {
          'openspec/specs/foo/spec.md': LIVING('foo'),
          'openspec/specs/bar/spec.md': LIVING('bar'),
        })
        const alone = await oursJson(['validate', 'bar', '--json'], root)
        const barAlone = rowsOf(alone.json, 'items').find((i) => i.id === 'bar')!
        const restore = lock(join(root, 'openspec/specs/foo/spec.md'))
        try {
          for (const argv of [
            ['validate', 'foo', '--json'],
            ['validate', 'foo', '--type', 'spec', '--json'],
            ['validate', '--specs', '--json'],
            ['validate', '--all', '--json'],
          ]) {
            const up = await upstream(argv, root)
            const cs = await oursJson(argv, root)
            expect({ argv, exit: cs.exitCode }).toEqual({ argv, exit: up.exitCode })
            expect(cs.exitCode).toBe(1)
            const items = rowsOf(cs.json, 'items')
            const foo = items.find((i) => i.id === 'foo')!
            const issues = foo.issues as Row[]
            expect(issues).toHaveLength(1)
            expect(issues[0]).toMatchObject({ level: 'ERROR', rule: 'meta/unreadable-artifact' })
            expect(String(issues[0]!.message)).toContain('specs/foo/spec.md')
            expect(String(issues[0]!.message)).toContain('EACCES')
            if (argv.includes('foo')) continue
            const bar = items.find((i) => i.id === 'bar')!
            expect(bar.issues).toEqual(barAlone.issues)
            expect(bar.valid).toBe(barAlone.valid)
          }
          const text = await ours(['validate', 'foo'], root)
          expect(text.exitCode).toBe(1)
          expect(text.stdout).toContain('meta/unreadable-artifact')
        } finally {
          restore()
        }
      },
    )

    /** The list fixture with `beta`'s `tasks.md` at mode 000. */
    function lockedTasks(): { root: string; tasks: string; restore: () => void } {
      const root = listFixture()
      const tasks = join(root, 'openspec/changes/beta/tasks.md')
      return { root, tasks, restore: lock(tasks) }
    }

    /** cospec's `tasks_unreadable` warnings in `doc`, each naming `tasks` and its errno code. */
    function expectTasksWarning(doc: unknown, tasks: string): void {
      const warnings = (((doc as Row).warnings ?? []) as Row[]).filter(
        (w) => w.code === 'tasks_unreadable',
      )
      expect(warnings).toHaveLength(1)
      expect(String(warnings[0]!.message)).toContain(tasks)
      expect(String(warnings[0]!.message)).toContain('EACCES')
    }

    test('15.11 an unreadable tasks.md: list and status --change answer as the binary does', async () => {
      const { root, tasks, restore } = lockedTasks()
      try {
        const refused = realpathRefuses(tasks)
        for (const argv of [
          ['list', '--json'],
          ['status', '--change', 'beta', '--json'],
        ]) {
          const up = await upstreamJson(argv, root)
          const cs = await oursJson(argv, root)
          captureStatus(`15.11 ${argv[0]}`, cs)
          expect({ argv, exit: up.exitCode }).toEqual({ argv, exit: refused ? 1 : 0 })
          expect({ argv, exit: cs.exitCode }).toEqual({ argv, exit: up.exitCode })
          const textArgv = argv.filter((a) => a !== '--json')
          const upText = await upstream(textArgv, root)
          const text = await ours(textArgv, root)
          expect({ textArgv, exit: text.exitCode }).toEqual({ textArgv, exit: upText.exitCode })
          if (refused) {
            // The binary's refusal, relayed whole: its document, its message.
            expect(cs.json).toEqual(JSON.parse(respellRemedies(up.stdout)))
            const d = firstStatus(up.json)
            // The path the binary resolved: the change directory's own realpath.
            const resolved = join(realpathSync(dirname(tasks)), 'tasks.md')
            expect(errnoShape(d.message)).toMatchObject({ code: 'EACCES', path: resolved })
            expect(text.stderr).toBe(`cospec ${argv[0]}: ${respellRemedies(d.message)}\n`)
            continue
          }
          // The binary counts the file as no tasks; so does cospec, and says why.
          expectOracle(up.json, cs.json, argv[0] === 'list' ? LIST_SPEC : STATUS_SPEC)
          expectTasksWarning(cs.json, tasks)
          expect(text.stderr).toContain(`Warning: could not read ${tasks} (EACCES)`)
          if (argv[0] === 'list') {
            const beta = rowsOf(cs.json).find((r) => r.change === 'beta')!
            expect(beta.error).toBeUndefined()
            expect(beta.tasks).toEqual({ total: 0, complete: 0 })
            expect(text.stdout).toMatch(/^ {2}beta +fix +clear +0\/0 tasks$/m)
          } else {
            expect((cs.json as Row).tasks).toEqual({ total: 0, complete: 0 })
            expect(text.stdout).toContain('  tasks:         0/0\n')
          }
        }
      } finally {
        restore()
      }
    })

    test('15.12 an unreadable tasks.md: status --all answers its change as the binary does', async () => {
      const { root, tasks, restore } = lockedTasks()
      try {
        const refused = realpathRefuses(tasks)
        const up = await upstreamJson(['status', '--all', '--json'], root)
        const cs = await oursJson(['status', '--all', '--json'], root)
        captureStatus('15.12 json', cs)
        const upText = await upstream(['status', '--all'], root)
        const text = await ours(['status', '--all'], root)
        captureStatus('15.12 text', text)
        expect(cs.exitCode).toBe(up.exitCode)
        expect(text.exitCode).toBe(upText.exitCode)
        const upBeta = rowsOf(up.json).find((e) => e.changeName === 'beta')!
        const beta = rowsOf(cs.json).find((e) => e.change === 'beta')!
        expect(Array.isArray(upBeta.status)).toBe(refused)
        if (refused) {
          // The binary could not report beta: its failure is beta's entry, and the sweep fails.
          const messages = (upBeta.status as Diagnostic[]).map((d) => d.message)
          expect(up.exitCode).toBe(1)
          expect(beta.error).toBe(messages.join('\n'))
          expect(beta.status).toEqual(upBeta.status)
          expect(text.stdout).toContain(`beta: ERROR — ${messages.join('\n')}\n`)
          return
        }
        // beta is reported; the sweep's exit code is the namespace folder's.
        expectOracle(up.json, cs.json, STATUS_ALL_SPEC)
        expect(beta.error).toBeUndefined()
        expect(beta.tasks).toEqual({ total: 0, complete: 0 })
        expectTasksWarning(cs.json, tasks)
        expect(text.stderr).toContain(`Warning: could not read ${tasks} (EACCES)`)
        expect(text.stdout).toContain('  tasks:         0/0\n')
      } finally {
        restore()
      }
    })
  })

  test.failing(
    "15.7 validate --json outside a root is the binary's one no_openspec_root document",
    async () => {
      const dir = mkTempRepo({ git: true })
      const env = emptyMachineStateEnv()
      for (const scope of ['--all', '--changes', '--specs']) {
        const up = await upstreamJson(['validate', scope, '--json'], dir)
        const cs = await oursJson(['validate', scope, '--json'], dir, dir, env)
        expect({ scope, exit: cs.exitCode }).toEqual({ scope, exit: up.exitCode })
        expect(cs.json).toEqual(JSON.parse(respellRemedies(up.stdout)))
        expect(firstStatus(cs.json)).toEqual({
          severity: 'error',
          code: 'no_openspec_root',
          message: 'No OpenSpec root found from the current directory.',
          target: 'openspec.root',
          fix: 'Run cospec init to create a root here.',
        })
      }
      const bare = await oursJson(['validate', '--json'], dir, dir, env)
      expect(bare.exitCode).toBe(1)
      expect(firstStatus(bare.json).code).toBe('no_openspec_root')
    },
  )
})

// --- 5.6 no status output names a bare openspec command ------------------------------------

describe('5.6 status outputs', () => {
  test('no captured status output names a bare openspec command', () => {
    expect(STATUS_OUTPUTS.length).toBeGreaterThan(10)
    const bare = STATUS_OUTPUTS.filter((o) => BARE_OPENSPEC.test(o.text)).map((o) => o.label)
    expect(bare).toEqual([])
  })
})
