// Passthrough group refusals, relays and JSON documents (change
// `passthrough-json-and-doctor`, ledger 1.1–1.4, 3.1–3.5, 4.1–4.3, 5.1–5.3,
// 7.1–7.2). Every expected answer is the pinned binary's for the same argv on
// the same fixture, read at test time through the upstream oracle, with only
// the allowlisted respelling (`respellRemedies`) applied — never a hand-typed
// copy of upstream's text. The 3.x and 7.x rows need `root-resolution-parity`
// (its structural respell helper and its `--cwd` check) and stay failing until
// this change rebases onto it (tasks group 9).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { respellRemedies } from '../../src/core/remedies.ts'
import { cleanupAll, cospec, hashTree, mkTempRepo, type SpawnResult } from '../fixtures/support.ts'
import { documentCount } from './support/parse-class.ts'
import {
  oracle,
  oracleEnv,
  oracleJson,
  type OracleRun,
  scaffoldOracleRoot,
} from './support/upstream-oracle.ts'

afterAll(cleanupAll)

let template: string

beforeAll(async () => {
  template = await scaffoldOracleRoot()
}, 60_000)

/** A bare `openspec` command a user could copy and run outside cospec. */
const BARE_OPENSPEC = /\bopenspec [a-z-]/

const SPEC =
  '# ref-spec\n\n## Purpose\nx\n\n## Requirements\n\n### Requirement: A\nThe system SHALL x.\n\n' +
  '#### Scenario: s\n- **WHEN** a\n- **THEN** b\n'

/** A copy of the scaffolded root; `name` nests it in a directory of that name. */
function plainRoot(name?: string): string {
  const dir = name === undefined ? mkTempRepo() : join(mkTempRepo(), name)
  mkdirSync(dir, { recursive: true })
  cpSync(join(template, 'openspec'), join(dir, 'openspec'), { recursive: true })
  return dir
}

function registry(root: string): string {
  return join(root, '.oracle-home', '.local', 'share', 'openspec', 'stores')
}

function writeRegistry(root: string, stores: Record<string, string>): void {
  mkdirSync(registry(root), { recursive: true })
  const body = Object.entries(stores)
    // Quoted: a fixture path may hold `: ` or other YAML syntax.
    .map(
      ([id, path]) =>
        `  ${id}:\n    backend:\n      type: git\n      local_path: ${JSON.stringify(path)}\n`,
    )
    .join('')
  writeFileSync(join(registry(root), 'registry.yaml'), `version: 1\nstores:\n${body}`)
}

/** A usable store checkout with id `id` and one spec, at `dir`. */
function storeCheckout(dir: string, id: string): void {
  mkdirSync(join(dir, '.openspec-store'), { recursive: true })
  writeFileSync(join(dir, '.openspec-store', 'store.yaml'), `version: 1\nid: ${id}\n`)
  cpSync(join(template, 'openspec'), join(dir, 'openspec'), { recursive: true })
  mkdirSync(join(dir, 'openspec', 'specs', 'ref-spec'), { recursive: true })
  writeFileSync(join(dir, 'openspec', 'specs', 'ref-spec', 'spec.md'), SPEC)
}

function appendConfig(root: string, text: string): void {
  const config = join(root, 'openspec', 'config.yaml')
  const scaffolded = existsSync(config) ? readFileSync(config, 'utf8') : ''
  writeFileSync(config, `${scaffolded}\n${text}`)
}

/**
 * A root whose `config.yaml` references a usable store `st1`, a registered
 * store `st2` whose checkout is empty, and an unregistered `gone`: the
 * binary's context carries its reference block at exit 0. `storeDirName`
 * names st1's checkout directory.
 */
function referencingRoot(opts: { name?: string; storeDirName?: string } = {}): string {
  const dir = plainRoot(opts.name)
  const storeDir = join(dir, opts.storeDirName ?? 'store')
  storeCheckout(storeDir, 'st1')
  mkdirSync(join(dir, 'broken'))
  writeRegistry(dir, { st1: storeDir, st2: join(dir, 'broken') })
  appendConfig(dir, 'references:\n  - st1\n  - st2\n  - gone\n')
  return dir
}

/** A root referencing `st1` whose store registry does not parse. */
function unreadableRegistryRoot(): string {
  const dir = plainRoot()
  mkdirSync(registry(dir), { recursive: true })
  writeFileSync(join(registry(dir), 'registry.yaml'), 'garbage: [\n')
  appendConfig(dir, 'references:\n  - st1\n')
  return dir
}

/** A root that is itself the registered store `self1` and references only itself. */
function selfReferencingRoot(): string {
  const dir = plainRoot()
  mkdirSync(join(dir, '.openspec-store'), { recursive: true })
  writeFileSync(join(dir, '.openspec-store', 'store.yaml'), 'version: 1\nid: self1\n')
  writeRegistry(dir, { self1: dir })
  appendConfig(dir, 'references:\n  - self1\n')
  return dir
}

/** A directory with no `openspec/` tree whose sandboxed registry lists `st1`. */
function rootlessWithStore(): string {
  const dir = mkTempRepo()
  storeCheckout(join(dir, 'store'), 'st1')
  writeRegistry(dir, { st1: join(dir, 'store') })
  return dir
}

function runCospec(argv: string[], root: string): Promise<SpawnResult> {
  return cospec(argv, { cwd: root, env: oracleEnv(root) })
}

function detail(run: SpawnResult | OracleRun): string {
  return `exit ${run.exitCode}\nstdout: ${run.stdout}\nstderr: ${run.stderr}`
}

/** A `--json` answer's one document with the allowlisted respelling applied. */
function respelledDoc(stdout: string): unknown {
  return JSON.parse(respellRemedies(stdout))
}

/** Asserts `co` is `up` with only the allowlisted respelling applied, and names no bare command. */
function expectRespelledRelay(co: SpawnResult, up: OracleRun): void {
  expect(co.exitCode, detail(co)).toBe(up.exitCode)
  expect(co.stdout, detail(co)).toBe(respellRemedies(up.stdout))
  expect(co.stderr, detail(co)).toBe(respellRemedies(up.stderr))
  expect(BARE_OPENSPEC.test(co.stdout + co.stderr), detail(co)).toBe(false)
}

// --- 1. store and workset group refusals ------------------------------------

describe('store group refusals are the binary’s, spelled through cospec (ledger 1.1, 1.2)', () => {
  for (const argv of [
    ['store', 'bogus', '--json'],
    ['store', '--json'],
    ['store', '--bogus', '--json'],
    ['store', '--json', '--', '--bogus'],
  ]) {
    test(`${argv.join(' ')}: one document with unknown_store_subcommand`, async () => {
      const root = plainRoot()
      const up = await oracle(argv, root)
      const co = await runCospec(argv, root)
      expect(up.exitCode).toBe(1)
      expect(co.exitCode, detail(co)).toBe(1)
      expect(documentCount(co.stdout), detail(co)).toBe(1)
      const doc = JSON.parse(co.stdout) as { status: { code: string; message: string }[] }
      expect(doc).toEqual(respelledDoc(up.stdout) as typeof doc)
      const upDoc = JSON.parse(up.stdout) as { status: { code: string; fix: string }[] }
      expect(doc.status[0]!.code).toBe(upDoc.status[0]!.code)
      expect(doc.status[0]!.message).toContain("'cospec store'")
      expect(co.stderr, detail(co)).toBe(respellRemedies(up.stderr))
      expect(BARE_OPENSPEC.test(co.stdout), detail(co)).toBe(false)
    }, 30_000)
  }

  for (const argv of [
    ['store'],
    ['store', 'bogus'],
    ['store', '--bogus'],
    ['store', '--', '--bogus'],
    ['store', 'new', 'change', 'x'],
    ['store', 'validate'],
  ]) {
    test(`${argv.join(' ')}: the binary's text refusal`, async () => {
      const root = plainRoot()
      const up = await oracle(argv, root)
      const co = await runCospec(argv, root)
      expect(up.exitCode).toBe(1)
      expectRespelledRelay(co, up)
      expect(co.stdout).toBe('')
      expect(co.stderr).toContain("'cospec store'")
      if (argv[1] === 'new') expect(co.stderr).toContain('cospec new <type> x --store <id>')
      if (argv[1] === 'validate') expect(co.stderr).toContain('cospec validate --store <id>')
    }, 30_000)
  }
})

describe('workset group refusals are the binary’s, spelled through cospec (ledger 1.3, 1.4)', () => {
  for (const argv of [
    ['workset', '--json'],
    ['workset', 'bogus', '--json'],
    ['workset', '--json', '--', '--bogus'],
  ]) {
    test(`${argv.join(' ')}: one document with unknown_workset_subcommand`, async () => {
      const root = plainRoot()
      const up = await oracle(argv, root)
      const co = await runCospec(argv, root)
      expect(up.exitCode).toBe(1)
      expect(co.exitCode, detail(co)).toBe(1)
      expect(documentCount(co.stdout), detail(co)).toBe(1)
      const doc = JSON.parse(co.stdout) as { status: { code: string; message: string }[] }
      expect(doc).toEqual(respelledDoc(up.stdout) as typeof doc)
      expect(doc.status[0]!.code).toBe('unknown_workset_subcommand')
      expect(doc.status[0]!.message).toContain("'cospec workset'")
      expect(BARE_OPENSPEC.test(co.stdout), detail(co)).toBe(false)
    }, 30_000)
  }

  for (const argv of [['workset'], ['workset', 'bogus'], ['workset', '--', '--bogus']]) {
    test(`${argv.join(' ')}: the binary's text refusal`, async () => {
      const root = plainRoot()
      const up = await oracle(argv, root)
      const co = await runCospec(argv, root)
      expect(up.exitCode).toBe(1)
      expectRespelledRelay(co, up)
      expect(co.stderr).toContain("'cospec workset'")
    }, 30_000)
  }

  // Already relayed at the workset level before this change (a regression
  // guard): the group refuses a bare option itself.
  test('workset --bogus: the binary’s unknown-option refusal', async () => {
    const root = plainRoot()
    const up = await oracle(['workset', '--bogus'], root)
    const co = await runCospec(['workset', '--bogus'], root)
    expect(up.exitCode).toBe(1)
    expectRespelledRelay(co, up)
  }, 30_000)

  // A user's raw `cospec -- workset --bogus`: `bun <entry>` drops one leading
  // `--` (the compiled launcher does not, unknown-option-contract ledger
  // 1.17), so the runner passes two; the binary runs under Node, which keeps
  // its one.
  test('-- workset --bogus: the binary’s missing-subcommand refusal', async () => {
    const root = plainRoot()
    const up = await oracle(['--', 'workset', '--bogus'], root, { runtime: 'node' })
    const co = await runCospec(['--', '--', 'workset', '--bogus'], root)
    expect(up.exitCode).toBe(1)
    expectRespelledRelay(co, up)
    expect(co.stderr).toContain("Missing subcommand for 'cospec workset'")
  }, 30_000)
})

// --- 3. context and schemas (post-rebase) ------------------------------------

interface Diagnostic {
  fix?: string
}
interface ContextDoc {
  members: { fetch?: string; status: Diagnostic[] }[]
  status: Diagnostic[]
}

/** The command-bearing field values of a context document (design D4's field map). */
function contextFields(doc: ContextDoc): string[] {
  return [
    ...doc.members.flatMap((m) => [
      ...(m.fetch === undefined ? [] : [m.fetch]),
      ...m.status.flatMap((s) => (s.fix === undefined ? [] : [s.fix])),
    ]),
    ...doc.status.flatMap((s) => (s.fix === undefined ? [] : [s.fix])),
  ]
}

/** `doc` with each field in design D4's context field map spelled through cospec. */
function respellContextDoc(doc: ContextDoc): ContextDoc {
  const fix = (s: Diagnostic): Diagnostic =>
    s.fix === undefined ? s : { ...s, fix: respellRemedies(s.fix) }
  return {
    ...doc,
    members: doc.members.map((m) => ({
      ...m,
      ...(m.fetch === undefined ? {} : { fetch: respellRemedies(m.fetch) }),
      status: m.status.map(fix),
    })),
    status: doc.status.map(fix),
  }
}

/** The binary's text with each field value its document holds spelled through cospec. */
function respellFieldsInText(text: string, fields: readonly string[]): string {
  const pairs = [...new Set(fields)]
    .map((value) => [value, respellRemedies(value)] as const)
    .filter(([value, spelled]) => value !== spelled)
    .toSorted((a, b) => b[0].length - a[0].length)
  return pairs.reduce((out, [value, spelled]) => out.replaceAll(value, spelled), text)
}

/** Context on `root`, text or `--json`, against the binary's respelled answer. */
async function expectContextRespelled(root: string, json: boolean): Promise<SpawnResult> {
  const argv = json ? ['context', '--json'] : ['context']
  const upDoc = await oracleJson(['context', '--json'], root)
  const up = await oracle(argv, root)
  const co = await runCospec(argv, root)
  expect(up.exitCode, detail(up)).toBe(0)
  expect(co.exitCode, detail(co)).toBe(0)
  if (json) {
    expect(documentCount(co.stdout), detail(co)).toBe(1)
    expect(JSON.parse(co.stdout)).toEqual(respellContextDoc(upDoc.json as ContextDoc))
  } else {
    const fields = contextFields(upDoc.json as ContextDoc)
    expect(co.stdout, detail(co)).toBe(respellFieldsInText(up.stdout, fields))
    expect(co.stderr, detail(co)).toBe(respellFieldsInText(up.stderr, fields))
  }
  return co
}

describe('context spells its reference block through cospec (ledger 3.1–3.4, post-rebase)', () => {
  for (const json of [false, true]) {
    const mode = json ? '--json' : 'text'
    test.failing(
      `context ${mode}: st1, st2 and gone spelled cospec, ids unchanged`,
      async () => {
        const root = referencingRoot()
        const co = await expectContextRespelled(root, json)
        expect(BARE_OPENSPEC.test(co.stdout + co.stderr), detail(co)).toBe(false)
        for (const id of ['st1', 'st2', 'gone']) expect(co.stdout).toContain(id)
      },
      30_000,
    )

    test.failing(
      `context ${mode}: an unreadable registry's note spelled cospec`,
      async () => {
        const co = await expectContextRespelled(unreadableRegistryRoot(), json)
        expect(BARE_OPENSPEC.test(co.stdout + co.stderr), detail(co)).toBe(false)
      },
      30_000,
    )

    // No reference field to respell: the binary's answer, byte for byte.
    test(`context ${mode}: self-references only, relayed as the binary wrote it`, async () => {
      await expectContextRespelled(selfReferencingRoot(), json)
    }, 30_000)

    test(`context ${mode}: no references declared, relayed as the binary wrote it`, async () => {
      await expectContextRespelled(plainRoot(), json)
    }, 30_000)

    // A root directory and a store checkout whose names read like the
    // binary's remedies: printed as the binary printed them.
    test.failing(
      `context ${mode}: names shaped like remedies stay as they are`,
      async () => {
        const root = referencingRoot({
          name: 'Run: openspec store doctor',
          storeDirName: 'openspec show x --type spec',
        })
        const co = await expectContextRespelled(root, json)
        const out = json ? JSON.parse(co.stdout) : co.stdout
        const text = typeof out === 'string' ? out : JSON.stringify(out)
        expect(text).toContain('Run: openspec store doctor')
        expect(text).toContain('openspec show x --type spec')
      },
      30_000,
    )
  }

  // Onto an existing file the binary refuses (exit 1), and a failed answer is
  // already respelled whole, so that row guards the order and the refusal.
  for (const existing of [false, true]) {
    const row = existing ? test : test.failing
    row(
      `context --code-workspace ${existing ? 'onto an existing file' : 'fresh'}: listing first`,
      async () => {
        const root = referencingRoot()
        const target = join(root, 'ws.code-workspace')
        const argv = ['context', '--code-workspace', 'ws.code-workspace']
        const upDoc = await oracleJson(['context', '--json'], root)
        if (existing) writeFileSync(target, '{}\n')
        const up = await oracle(argv, root)
        rmSync(target, { force: true })
        if (existing) writeFileSync(target, '{}\n')
        const co = await runCospec(argv, root)
        const fields = contextFields(upDoc.json as ContextDoc)
        expect(co.exitCode, detail(co)).toBe(up.exitCode)
        expect(co.stdout, detail(co)).toBe(respellFieldsInText(up.stdout, fields))
        expect(co.stderr, detail(co)).toBe(respellRemedies(respellFieldsInText(up.stderr, fields)))
        expect(existsSync(target)).toBe(true)
      },
      30_000,
    )
  }
})

describe('schemas spells its relayed no-root answer through cospec (ledger 3.5, post-rebase)', () => {
  for (const argv of [['schemas'], ['schemas', '--json']]) {
    test.failing(
      `${argv.join(' ')} with no root and a registered store`,
      async () => {
        const root = rootlessWithStore()
        const up = await oracle(argv, root)
        const co = await runCospec(argv, root)
        expect(up.exitCode).toBe(1)
        expectRespelledRelay(co, up)
        expect(co.stdout + co.stderr).toContain('cospec init')
      },
      30_000,
    )
  }
})

// --- 4. remedies respelled on every relay --------------------------------------

describe('store diagnostics are spelled through cospec (ledger 4.1)', () => {
  interface StatusDoc {
    status: { fix?: string }[]
  }

  for (const argv of [
    ['store', 'doctor', 'nope'],
    ['store', 'unregister', 'nope'],
  ]) {
    test(`${argv.join(' ')}: the relayed fix names cospec`, async () => {
      const root = plainRoot()
      const up = await oracleJson([...argv, '--json'], root)
      const co = await runCospec(argv, root)
      expect(co.exitCode, detail(co)).toBe(1)
      const fix = (up.json as StatusDoc).status[0]!.fix!
      expect(co.stderr, detail(co)).toContain(`Fix: ${respellRemedies(fix)}`)
      expect(respellRemedies(fix)).not.toBe(fix)
      expect(BARE_OPENSPEC.test(co.stdout + co.stderr), detail(co)).toBe(false)
    }, 30_000)
  }

  test('store remove nope --json: the binary’s document, fix spelled cospec', async () => {
    const root = plainRoot()
    const argv = ['store', 'remove', 'nope', '--json']
    const up = await oracle(argv, root)
    const co = await runCospec(argv, root)
    expect(co.exitCode, detail(co)).toBe(1)
    expect(JSON.parse(co.stdout)).toEqual(respelledDoc(up.stdout))
    expect(BARE_OPENSPEC.test(co.stdout), detail(co)).toBe(false)
  }, 30_000)

  test('store doctor on a store whose checkout is gone: its fix spelled cospec', async () => {
    const root = plainRoot()
    writeRegistry(root, { st4: join(root, 'gone-checkout') })
    const up = await oracleJson(['store', 'doctor', '--json'], root)
    const doc = up.json as { stores: StatusDoc[] }
    const fixes = doc.stores.flatMap((s) => s.status.flatMap((d) => (d.fix ? [d.fix] : [])))
    expect(fixes.some((fix) => respellRemedies(fix) !== fix)).toBe(true)
    const text = await runCospec(['store', 'doctor'], root)
    for (const fix of fixes)
      expect(text.stdout, detail(text)).toContain(`Fix: ${respellRemedies(fix)}`)
    expect(BARE_OPENSPEC.test(text.stdout + text.stderr), detail(text)).toBe(false)
    const json = await runCospec(['store', 'doctor', '--json'], root)
    expect(JSON.parse(json.stdout)).toEqual(JSON.parse(respellRemedies(JSON.stringify(doc))))
  }, 30_000)
})

describe('workset and config next-step lines are spelled through cospec (ledger 4.2, 4.3)', () => {
  /** `text` with each whole line the allowlist holds spelled through cospec. */
  const byLine = (text: string): string => text.split('\n').map(respellRemedies).join('\n')

  test('workset create: its open-any-time line names cospec', async () => {
    const root = plainRoot()
    const up = await oracle(['workset', 'create', 'w1', '--member', root], root)
    await oracle(['workset', 'remove', 'w1', '--yes'], root)
    const co = await runCospec(['workset', 'create', 'w1', '--member', root], root)
    expect(up.exitCode, detail(up)).toBe(0)
    expect(co.exitCode, detail(co)).toBe(0)
    expect(co.stdout, detail(co)).toBe(byLine(up.stdout))
    expect(co.stdout).not.toBe(up.stdout)
    expect(co.stderr, detail(co)).toBe(up.stderr)
    expect(BARE_OPENSPEC.test(co.stdout + co.stderr), detail(co)).toBe(false)
  }, 30_000)

  test('workset list with none saved: its create line names cospec', async () => {
    const root = plainRoot()
    const up = await oracle(['workset', 'list'], root)
    const co = await runCospec(['workset', 'list'], root)
    expect(co.exitCode, detail(co)).toBe(0)
    expect(co.stdout, detail(co)).toBe(byLine(up.stdout))
    expect(co.stdout).not.toBe(up.stdout)
    expect(BARE_OPENSPEC.test(co.stdout + co.stderr), detail(co)).toBe(false)
  }, 30_000)

  test.failing(
    'config profile core: its next step names cospec update',
    async () => {
      const root = plainRoot()
      const up = await oracle(['config', 'profile', 'core'], root)
      const co = await runCospec(['config', 'profile', 'core'], root)
      expect(up.exitCode, detail(up)).toBe(0)
      expect(co.exitCode, detail(co)).toBe(0)
      expect(co.stdout, detail(co)).toBe(byLine(up.stdout))
      expect(co.stdout).toContain('`cospec update`')
      expect(co.stderr).toContain("run 'cospec update'")
      expect(BARE_OPENSPEC.test(co.stdout), detail(co)).toBe(false)
    },
    30_000,
  )
})

// --- 5. config parity -----------------------------------------------------------

describe('config relays the binary’s parse refusal and help (ledger 5.1–5.3)', () => {
  for (const argv of [
    ['config', 'get', 'foo', '--bogus', '--json'],
    ['config', 'path', '--bogus', '--json'],
    ['config', 'set', 'a', 'b', '--bogus', '--json'],
  ]) {
    test.failing(
      `${argv.join(' ')}: the binary’s refusal, no envelope`,
      async () => {
        const root = plainRoot()
        const up = await oracle(argv, root)
        const co = await runCospec(argv, root)
        expect(up.exitCode).toBe(1)
        expect(co.exitCode, detail(co)).toBe(1)
        expect(co.stdout, detail(co)).toBe('')
        expect(co.stderr, detail(co)).toBe(up.stderr)
      },
      30_000,
    )
  }

  for (const argv of [['config'], ['config', '--scope', 'global']]) {
    test.failing(
      `${argv.join(' ')}: cospec's config help on stderr, exit 1`,
      async () => {
        const root = plainRoot()
        const up = await oracle(argv, root)
        // The binary prints its own `config` help on stderr and exits 1.
        expect(up.exitCode).toBe(1)
        expect(up.stdout).toBe('')
        expect(up.stderr).toContain('Usage: openspec config')
        const help = await runCospec(['config', '--help'], root)
        const co = await runCospec(argv, root)
        expect(co.exitCode, detail(co)).toBe(1)
        expect(co.stdout, detail(co)).toBe('')
        expect(co.stderr, detail(co)).toBe(help.stdout)
      },
      30_000,
    )
  }

  for (const argv of [
    ['config', '--json'],
    ['config', '--scope', 'global', '--json'],
  ]) {
    test.failing(
      `${argv.join(' ')}: the binary’s refusal of --json`,
      async () => {
        const root = plainRoot()
        const up = await oracle(argv, root)
        const co = await runCospec(argv, root)
        expect(up.exitCode).toBe(1)
        expect(co.exitCode, detail(co)).toBe(1)
        expect(co.stdout, detail(co)).toBe('')
        expect(co.stderr, detail(co)).toBe(up.stderr)
      },
      30_000,
    )
  }
})

// --- 7. a missing working directory (post-rebase) --------------------------------

describe('a --cwd that does not exist is refused before any spawn (ledger 7.1, 7.2, post-rebase)', () => {
  const COMMANDS: readonly string[][] = [
    ['store', 'list'],
    ['config', 'path'],
    ['workset', 'list'],
    ['context'],
    ['doctor'],
    ['schemas'],
  ]

  for (const command of COMMANDS) {
    test.failing(
      `${command.join(' ')} --cwd <missing>: the resolver's text refusal`,
      async () => {
        const root = plainRoot()
        const missing = join(root, 'no-such-dir')
        const tree = hashTree(root)
        const co = await runCospec([...command, '--cwd', missing], root)
        expect(co.exitCode, detail(co)).toBe(1)
        expect(co.stdout, detail(co)).toBe('')
        expect(co.stderr, detail(co)).toBe(`cospec: directory not found: ${missing}\n`)
        expect(hashTree(root)).toEqual(tree)
      },
      30_000,
    )

    test.failing(
      `${command.join(' ')} --cwd <missing> --json: the resolver's document`,
      async () => {
        const root = plainRoot()
        const missing = join(root, 'no-such-dir')
        const co = await runCospec([...command, '--cwd', missing, '--json'], root)
        expect(co.exitCode, detail(co)).toBe(1)
        expect(documentCount(co.stdout), detail(co)).toBe(1)
        expect(JSON.parse(co.stdout)).toEqual({
          status: [
            {
              severity: 'error',
              code: 'directory_not_found',
              message: `directory not found: ${missing}`,
              target: 'cwd',
            },
          ],
        })
      },
      30_000,
    )
  }
})
