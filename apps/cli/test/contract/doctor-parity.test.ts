// The doctor key oracle (change `passthrough-json-and-doctor`, ledger 2.1–2.3,
// 2.5, 2.7): `cospec doctor --json` carries `openspec doctor --json`'s `root`,
// `store`, `references` and `status` keys on every root, beside its own
// `version`/`findings`/`summary`. Each expected value is the pinned binary's
// for the same argv on the same fixture (`oracleJson`), with only design D4's
// respelling applied: on a successful answer each diagnostic's `fix`, on a
// failed one the allowlist over the whole answer (`message` and `fix`).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { respellRemedies } from '../../src/core/remedies.ts'
import {
  cleanupAll,
  cospec,
  mkTempRepo,
  openspecBinPath,
  type SpawnResult,
} from '../fixtures/support.ts'
import { documentCount } from './support/parse-class.ts'
import { oracleEnv, oracleJson, scaffoldOracleRoot } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

let template: string

beforeAll(async () => {
  template = await scaffoldOracleRoot()
}, 60_000)

/** A bare `openspec` command a user could copy and run outside cospec. */
const BARE_OPENSPEC = /\bopenspec [a-z-]/

interface Diagnostic {
  severity: string
  code: string
  message: string
  fix?: string
}
interface RelationshipKeys {
  root: { status: Diagnostic[] } | null
  store: { status: Diagnostic[] } | null
  references: { status: Diagnostic[] }[]
  status: Diagnostic[]
}
interface Finding {
  level: string
  check: string
  message: string
  remedy?: string
}
interface DoctorDoc extends RelationshipKeys {
  version: number
  findings: Finding[]
  summary: { errors: number; warnings: number; infos: number }
}

function runCospec(argv: string[], root: string): Promise<SpawnResult> {
  return cospec(argv, { cwd: root, env: oracleEnv(root) })
}

function detail(run: SpawnResult): string {
  return `exit ${run.exitCode}\nstdout: ${run.stdout}\nstderr: ${run.stderr}`
}

function registry(root: string): string {
  return join(root, '.oracle-home', '.local', 'share', 'openspec', 'stores')
}

function writeRegistry(root: string, stores: Record<string, string>): void {
  mkdirSync(registry(root), { recursive: true })
  const body = Object.entries(stores)
    .map(
      ([id, path]) =>
        `  ${id}:\n    backend:\n      type: git\n      local_path: ${JSON.stringify(path)}\n`,
    )
    .join('')
  writeFileSync(join(registry(root), 'registry.yaml'), `version: 1\nstores:\n${body}`)
}

function storeCheckout(dir: string, id: string): void {
  mkdirSync(join(dir, '.openspec-store'), { recursive: true })
  writeFileSync(join(dir, '.openspec-store', 'store.yaml'), `version: 1\nid: ${id}\n`)
  cpSync(join(template, 'openspec'), join(dir, 'openspec'), { recursive: true })
}

/**
 * A copy of the scaffolded root that `cospec init` has also stamped, so
 * cospec's own checks find nothing and the exit code is the folded report's.
 */
async function initializedRoot(): Promise<string> {
  const dir = mkTempRepo()
  cpSync(join(template, 'openspec'), join(dir, 'openspec'), { recursive: true })
  const init = await runCospec(['init', '.', '--harness', 'none'], dir)
  if (init.exitCode !== 0) throw new Error(`cospec init failed on the fixture: ${detail(init)}`)
  return dir
}

/** `initializedRoot()` referencing a usable `st1`, an empty-checkout `st2` and an unregistered `gone`. */
async function referencingRoot(): Promise<string> {
  const dir = await initializedRoot()
  storeCheckout(join(dir, 'store'), 'st1')
  mkdirSync(join(dir, 'broken'))
  writeRegistry(dir, { st1: join(dir, 'store'), st2: join(dir, 'broken') })
  const config = join(dir, 'openspec', 'config.yaml')
  writeFileSync(
    config,
    `${readFileSync(config, 'utf8')}\nreferences:\n  - st1\n  - st2\n  - gone\n`,
  )
  return dir
}

/** The four upstream keys of a doctor document. */
function relationshipKeys(doc: RelationshipKeys): RelationshipKeys {
  return { root: doc.root, store: doc.store, references: doc.references, status: doc.status }
}

/** The binary's four keys as cospec carries them (design D4's doctor field map). */
function expectedKeys(up: { exitCode: number; json: unknown }): RelationshipKeys {
  const doc = up.json as RelationshipKeys
  if (up.exitCode !== 0)
    return relationshipKeys(JSON.parse(respellRemedies(JSON.stringify(doc))) as RelationshipKeys)
  const fix = (s: Diagnostic): Diagnostic =>
    s.fix === undefined ? s : { ...s, fix: respellRemedies(s.fix) }
  return {
    root: doc.root === null ? null : { ...doc.root, status: doc.root.status.map(fix) },
    store: doc.store === null ? null : { ...doc.store, status: doc.store.status.map(fix) },
    references: doc.references.map((r) => ({ ...r, status: r.status.map(fix) })),
    status: doc.status.map(fix),
  }
}

async function doctorBoth(
  argv: string[],
  root: string,
  cwd = root,
): Promise<{ co: SpawnResult; doc: DoctorDoc; up: { exitCode: number; json: unknown } }> {
  const up = await oracleJsonIn(argv, root, cwd)
  const co = await cospec(argv, { cwd, env: oracleEnv(root) })
  expect(documentCount(co.stdout), detail(co)).toBe(1)
  return { co, doc: JSON.parse(co.stdout) as DoctorDoc, up }
}

/**
 * `oracleJson`, run from `cwd` (a directory under `root`) in `root`'s sandbox:
 * the oracle itself always runs at a fixture's root.
 */
async function oracleJsonIn(
  argv: string[],
  root: string,
  cwd: string,
): Promise<{ exitCode: number; json: unknown }> {
  if (cwd === root) return oracleJson(argv, root)
  const proc = Bun.spawn(['bun', openspecBinPath(), ...argv], {
    cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: oracleEnv(root),
  })
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
  return { exitCode, json: JSON.parse(stdout) }
}

describe('cospec doctor --json carries openspec doctor --json on every root', () => {
  test('a plain local root (ledger 2.1)', async () => {
    const root = await initializedRoot()
    const { co, doc, up } = await doctorBoth(['doctor', '--json'], root)
    expect(doc.version).toBe(1)
    expect(Array.isArray(doc.findings)).toBe(true)
    expect(relationshipKeys(doc)).toEqual(expectedKeys(up))
    expect(co.exitCode, detail(co)).toBe(up.exitCode)
  }, 60_000)

  test('a references: root with usable, broken and unregistered stores (ledger 2.2)', async () => {
    const root = await referencingRoot()
    const { co, doc, up } = await doctorBoth(['doctor', '--json'], root)
    expect(relationshipKeys(doc)).toEqual(expectedKeys(up))
    expect(co.exitCode, detail(co)).toBe(up.exitCode)
    expect(BARE_OPENSPEC.test(JSON.stringify(relationshipKeys(doc))), detail(co)).toBe(false)
  }, 60_000)

  test('a --store root (ledger 2.2)', async () => {
    const root = await referencingRoot()
    const { co, doc, up } = await doctorBoth(['doctor', '--store', 'st1', '--json'], root)
    expect(relationshipKeys(doc)).toEqual(expectedKeys(up))
    expect(co.exitCode, detail(co)).toBe(up.exitCode)
  }, 60_000)

  test('a store whose metadata is missing (ledger 2.2)', async () => {
    const root = await referencingRoot()
    const { co, doc, up } = await doctorBoth(['doctor', '--store', 'st2', '--json'], root)
    expect(up.exitCode).toBe(1)
    expect((up.json as RelationshipKeys).status.map((s) => s.code)).toContain(
      'store_identity_mismatch',
    )
    expect(relationshipKeys(doc)).toEqual(expectedKeys(up))
    expect(co.exitCode, detail(co)).toBe(1)
    expect(BARE_OPENSPEC.test(JSON.stringify(relationshipKeys(doc))), detail(co)).toBe(false)
  }, 60_000)

  test.failing(
    'a root whose only config is config.yml (ledger 2.3)',
    async () => {
      const root = mkTempRepo()
      mkdirSync(join(root, 'openspec', 'specs'), { recursive: true })
      mkdirSync(join(root, 'openspec', 'changes', 'archive'), { recursive: true })
      writeFileSync(
        join(root, 'openspec', 'config.yml'),
        'schema: spec-driven\nreferences:\n  - gone\n',
      )
      expect(existsSync(join(root, 'openspec', 'config.yaml'))).toBe(false)
      const { co, doc, up } = await doctorBoth(['doctor', '--json'], root)
      expect(doc.references).toEqual(expectedKeys(up).references)
      expect(
        doc.findings.map((f) => f.check),
        detail(co),
      ).toContain('openspec-reference-gone-reference_unresolved')
      const config = doc.findings.filter((f) => f.check === 'config')
      expect(config.length, detail(co)).toBeGreaterThan(0)
      for (const f of config) expect(f.message).toContain('openspec/config.yml')
    },
    60_000,
  )

  for (const stores of [false, true]) {
    test.failing(
      `no OpenSpec root, ${stores ? 'a store registered' : 'no store'} (ledger 2.5)`,
      async () => {
        const root = mkTempRepo()
        if (stores) {
          storeCheckout(join(root, 'store'), 'st1')
          writeRegistry(root, { st1: join(root, 'store') })
        }
        const { co, doc, up } = await doctorBoth(['doctor', '--json'], root)
        expect(up.exitCode).toBe(1)
        expect(co.exitCode, detail(co)).toBe(1)
        const initialized = doc.findings.filter((f) => f.check === 'initialized')
        expect(initialized.map((f) => f.level)).toEqual(['ERROR'])
        // Reported once: the binary's no-root diagnostic is carried, not folded.
        const code = (up.json as RelationshipKeys).status[0]!.code
        expect(
          doc.findings.some((f) => f.check.endsWith(code)),
          detail(co),
        ).toBe(false)
        expect(relationshipKeys(doc)).toEqual(expectedKeys(up))
        expect(doc.status[0]!.fix).toContain('cospec init')
        expect(BARE_OPENSPEC.test(co.stdout), detail(co)).toBe(false)
      },
      60_000,
    )
  }

  // Post-rebase: the resolver's ancestor walk (`root-resolution-parity`)
  // finds the enclosing root; doctor's own checks must diagnose it too.
  test.failing(
    'from a subdirectory of an initialized project (ledger 2.7, post-rebase)',
    async () => {
      const root = await initializedRoot()
      const sub = join(root, 'openspec', 'changes')
      const { co, doc, up } = await doctorBoth(['doctor', '--json'], root, sub)
      expect(
        doc.findings.some((f) => f.check === 'initialized'),
        detail(co),
      ).toBe(false)
      const upRoot = (up.json as { root: { path: string } | null }).root
      expect(upRoot).not.toBeNull()
      expect((doc as unknown as { root: { path: string } | null }).root?.path).toBe(upRoot!.path)
    },
    60_000,
  )
})
