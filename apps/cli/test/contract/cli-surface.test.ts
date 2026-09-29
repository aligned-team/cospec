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
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { COSPEC_TYPES } from '../../src/core/change.ts'
import { openspecPackageDir } from '../../src/core/openspec.ts'
import {
  cleanupAll,
  cospec,
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
    void byCodeAndName
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
    test("an unreadable tasks.md is the binary's list_error", async () => {
      const root = listFixture()
      const restore = lock(join(root, 'openspec/changes/beta/tasks.md'))
      try {
        const up = await upstreamJson(['list', '--json'], root)
        expect(up.exitCode).toBe(1)
        expect(JSON.stringify(up.json)).toContain('list_error')
      } finally {
        restore()
      }
    })
  })

  void ours
  void oursJson
})
