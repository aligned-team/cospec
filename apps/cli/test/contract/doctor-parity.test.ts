// The doctor key oracle (change `passthrough-json-and-doctor`, ledger 2.1–2.3,
// 2.5, 2.7, 2.8): `cospec doctor --json` carries `openspec doctor --json`'s `root`,
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
): Promise<{ exitCode: number; json: unknown; stderr: string }> {
  if (cwd === root) return oracleJson(argv, root)
  const proc = Bun.spawn(['bun', openspecBinPath(), ...argv], {
    cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: oracleEnv(root),
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { exitCode, json: JSON.parse(stdout), stderr }
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

  test('a root whose only config is config.yml (ledger 2.3)', async () => {
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
  }, 60_000)

  for (const stores of [false, true]) {
    test(`no OpenSpec root, ${stores ? 'a store registered' : 'no store'} (ledger 2.5)`, async () => {
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
    }, 60_000)
  }

  // The resolver's ancestor walk (`root-resolution-parity`) finds the
  // enclosing root; doctor's own checks diagnose it too.
  test('from a subdirectory of an initialized project (ledger 2.7)', async () => {
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
  }, 60_000)

  /**
   * A cospec-initialized store checkout `st1` under `root`, registered in
   * `root`'s sandbox, so cospec's own checks find nothing on it.
   */
  async function initializedStore(root: string): Promise<string> {
    const storeDir = join(root, 'store')
    storeCheckout(storeDir, 'st1')
    writeRegistry(root, { st1: storeDir })
    const init = await cospec(['init', '.', '--harness', 'none'], {
      cwd: storeDir,
      env: oracleEnv(root),
    })
    if (init.exitCode !== 0) throw new Error(`cospec init failed on the store: ${detail(init)}`)
    return storeDir
  }

  /** A project whose only `openspec/` content is a `store: st1` pointer, and its store. */
  async function pointerRoot(): Promise<string> {
    const root = mkTempRepo()
    await initializedStore(root)
    mkdirSync(join(root, 'openspec'), { recursive: true })
    writeFileSync(join(root, 'openspec', 'config.yaml'), 'store: st1\n')
    mkdirSync(join(root, 'sub'))
    return root
  }

  /** A rootless directory whose global config names `st1` as the `defaultStore`. */
  async function defaultStoreRoot(): Promise<string> {
    const root = mkTempRepo()
    await initializedStore(root)
    const config = join(root, '.oracle-home', '.config', 'openspec')
    mkdirSync(config, { recursive: true })
    writeFileSync(join(config, 'config.json'), '{"defaultStore":"st1"}\n')
    return root
  }

  // A declared pointer or a global defaultStore selects the store as the
  // operating root: doctor's own checks read that root, not the directory it
  // runs in, and the binary's report names the source it selected by.
  for (const [name, make, where, source] of [
    ['a store: pointer root', pointerRoot, '.', 'declared'],
    ['a store: pointer root, from a subdirectory', pointerRoot, 'sub', 'declared'],
    ['a global defaultStore root', defaultStoreRoot, '.', 'global_default'],
  ] as const) {
    test(`${name}: checks the selected store, root.source ${source}`, async () => {
      const root = await make()
      const { co, doc, up } = await doctorBoth(['doctor', '--json'], root, join(root, where))
      const upRoot = (up.json as { root: { source: string; path: string } | null }).root
      expect(upRoot?.source).toBe(source)
      const coRoot = (doc as unknown as { root: { source: string; path: string } | null }).root
      expect(coRoot?.source, detail(co)).toBe(source)
      expect(relationshipKeys(doc)).toEqual(expectedKeys(up))
      expect(
        doc.findings.filter((f) => f.level === 'ERROR'),
        detail(co),
      ).toEqual([])
      expect(co.exitCode, detail(co)).toBe(up.exitCode)
      expect(up.exitCode).toBe(0)
    }, 60_000)
  }

  // The wrapped `openspec doctor --json` writes its config warnings to stderr
  // (`Invalid 'context' field in config (must be string)`, …). cospec folds
  // each line it did not already print itself into its document as a WARNING
  // finding, so both modes carry it and nothing reaches stderr twice.
  const INVALID_CONTEXT = 'context:\n  a: 1\n'
  const INVALID_REFERENCES = 'references:\n  - 42\n'
  const STDERR_CHECK = 'openspec-stderr'

  /** The binary's `--json` stderr lines as cospec's findings carry them. */
  function expectedStderrFindings(stderr: string, printed: readonly string[] = []): Finding[] {
    return stderr
      .split(/\r?\n/u)
      .filter((line) => line.trim() !== '' && !printed.includes(line))
      .map((line) => ({ level: 'WARNING', check: STDERR_CHECK, message: respellRemedies(line) }))
  }

  function textFinding(f: Finding): string {
    return `  ${f.level.padEnd(7)}  ${f.check}: ${f.message}`
  }

  /** `root`'s store `st1` config replaced with one whose `context` is invalid. */
  function invalidStoreConfig(root: string): void {
    writeFileSync(
      join(root, 'store', 'openspec', 'config.yaml'),
      `schema: spec-driven\n${INVALID_CONTEXT}`,
    )
  }

  /** An initialized plain root whose config has an invalid `context` and `references`. */
  async function invalidConfigRoot(): Promise<string> {
    const root = await initializedRoot()
    writeFileSync(
      join(root, 'openspec', 'config.yaml'),
      `schema: spec-driven\n${INVALID_CONTEXT}${INVALID_REFERENCES}`,
    )
    return root
  }

  /** A `store: st1` pointer with invalid `references`, its store's `context` invalid. */
  async function invalidPointerRoot(): Promise<string> {
    const root = await pointerRoot()
    writeFileSync(join(root, 'openspec', 'config.yaml'), `store: st1\n${INVALID_REFERENCES}`)
    invalidStoreConfig(root)
    return root
  }

  /** A bare workspace (no `openspec/`) beside a store `st1` whose `context` is invalid. */
  async function invalidStoreRoot(): Promise<string> {
    const root = mkTempRepo()
    await initializedStore(root)
    invalidStoreConfig(root)
    mkdirSync(join(root, 'bare'))
    return root
  }

  for (const [name, make, where, argv, lines] of [
    ['a plain root', invalidConfigRoot, '.', [], 2],
    ['a store: pointer root', invalidPointerRoot, '.', [], 2],
    ['a --store root from its pointer root', invalidPointerRoot, '.', ['--store', 'st1'], 1],
    ['a --store root from a bare workspace', invalidStoreRoot, 'bare', ['--store', 'st1'], 1],
  ] as const) {
    test(`${name}: the binary's config warnings are WARNING findings (--json)`, async () => {
      const root = await make()
      const cwd = join(root, where)
      const up = await oracleJsonIn(['doctor', ...argv, '--json'], root, cwd)
      const expected = expectedStderrFindings(up.stderr)
      expect(expected.length, up.stderr).toBe(lines)
      const co = await cospec(['doctor', ...argv, '--json'], { cwd, env: oracleEnv(root) })
      expect(documentCount(co.stdout), detail(co)).toBe(1)
      const doc = JSON.parse(co.stdout) as DoctorDoc
      expect(
        doc.findings.filter((f) => f.check === STDERR_CHECK),
        detail(co),
      ).toEqual(expected)
      expect(doc.summary.warnings, detail(co)).toBeGreaterThanOrEqual(expected.length)
      for (const f of expected) expect(co.stderr, detail(co)).not.toContain(f.message)
      // An explicit --store keeps cospec's own checks on the invocation
      // directory (design D3), so only the selected-root rows compare exits.
      if (argv.length === 0) expect(co.exitCode, detail(co)).toBe(up.exitCode)
    }, 60_000)

    test(`${name}: the binary's config warnings are printed as findings (text)`, async () => {
      const root = await make()
      const cwd = join(root, where)
      const up = await oracleJsonIn(['doctor', ...argv, '--json'], root, cwd)
      const expected = expectedStderrFindings(up.stderr)
      expect(expected.length, up.stderr).toBe(lines)
      const co = await cospec(['doctor', ...argv], { cwd, env: oracleEnv(root) })
      const printed = co.stdout.split('\n').filter((l) => l.includes(`${STDERR_CHECK}: `))
      expect(printed, detail(co)).toEqual(expected.map(textFinding))
      for (const f of expected) expect(co.stderr, detail(co)).not.toContain(f.message)
      if (argv.length > 0) {
        const banner = co.stderr.split('\n').filter((l) => l.startsWith('Using OpenSpec root: '))
        expect(banner.length, detail(co)).toBe(1)
      }
      // An explicit --store keeps cospec's own checks on the invocation
      // directory (design D3), so only the selected-root rows compare exits.
      if (argv.length === 0) expect(co.exitCode, detail(co)).toBe(up.exitCode)
    }, 60_000)
  }

  // A line cospec's own root selection already printed — the ignored-pointer
  // warning on a real root, the global config's invalid-JSON warning on a
  // rootless directory — is not folded again; the rest of stderr still is.
  for (const [name, make, own, rest] of [
    [
      'an ignored store: pointer',
      async () => {
        const root = await initializedRoot()
        writeFileSync(
          join(root, 'openspec', 'config.yaml'),
          `schema: spec-driven\nstore: st1\n${INVALID_CONTEXT}`,
        )
        return root
      },
      /^Warning: \S*openspec\/config\.yaml declares store 'st1', but this directory is a real OpenSpec root; the declaration is ignored\.$/u,
      ["Invalid 'context' field in config (must be string)"],
    ],
    [
      'an unparseable global config on a rootless directory',
      async () => {
        const root = mkTempRepo()
        const dir = join(root, '.oracle-home', '.config', 'openspec')
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'config.json'), '{')
        return root
      },
      /^Warning: Invalid JSON in \S*\.oracle-home\/\.config\/openspec\/config\.json, using defaults$/u,
      [],
    ],
  ] as const) {
    for (const json of [true, false]) {
      test(`${name}: a line cospec printed is not folded (${json ? '--json' : 'text'})`, async () => {
        const root = await make()
        const up = await oracleJsonIn(['doctor', '--json'], root, root)
        const upLines = up.stderr.split(/\r?\n/u)
        const co = await runCospec(['doctor', ...(json ? ['--json'] : [])], root)
        const coLines = co.stderr.split(/\r?\n/u)
        const line = coLines.find((l) => l.startsWith('Warning: '))
        expect(line, detail(co)).toBeDefined()
        expect(line!, detail(co)).toMatch(own)
        expect(upLines, up.stderr).toContain(line!)
        expect(coLines.filter((l) => l === line).length, detail(co)).toBe(1)
        const expected = expectedStderrFindings(up.stderr, [line!])
        expect(expected.map((f) => f.message)).toEqual([...rest])
        const folded = json
          ? (JSON.parse(co.stdout) as DoctorDoc).findings.filter((f) => f.check === STDERR_CHECK)
          : co.stdout.split('\n').filter((l) => l.includes(`${STDERR_CHECK}: `))
        expect(folded, detail(co)).toEqual(json ? expected : expected.map(textFinding))
        expect(co.exitCode, detail(co)).toBe(up.exitCode)
      }, 60_000)
    }
  }
})
