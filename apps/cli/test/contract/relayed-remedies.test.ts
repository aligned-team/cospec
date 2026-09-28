// Relayed remedies never name bare `openspec` (change `unknown-option-contract`,
// ledger 1.42, 1.43): `show` and `view` relay the pinned binary's own text, and the
// binary writes its remedies as `openspec <command>` — `show` for a change
// with no proposal.md (text and `--json`) and for an id that is both a change
// and a spec, `view` in its dashboard footer. cospec relays the binary's
// answer with each such remedy spelled as the cospec command of the same
// shape, and drops a remedy cospec has no command for (upstream's noun-form
// `change show` / `spec show`), keeping upstream's own store-root wording
// ("Pass --type change|spec."). Everything else stays byte-for-byte the
// binary's, read at test time.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import {
  cleanupAll,
  cospec,
  mkTempRepo,
  openspecBinPath,
  type SpawnResult,
} from '../fixtures/support.ts'
import { documentCount } from './support/parse-class.ts'
import { oracle, oracleEnv, scaffoldOracleRoot } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

let template: string

beforeAll(async () => {
  template = await scaffoldOracleRoot()
}, 60_000)

/** A bare `openspec` command a user could copy and run outside cospec. */
const BARE_OPENSPEC = /\bopenspec [a-z-]/

const PROPOSAL = '## Why\nx\n\n## What Changes\n- x\n'
const SPEC =
  '# dup\n\n## Purpose\nx\n\n## Requirements\n\n### Requirement: A\nThe system SHALL x.\n\n' +
  '#### Scenario: s\n- **WHEN** a\n- **THEN** b\n'

/**
 * A copy of the scaffolded root holding `bare` (a change with no proposal.md),
 * `dup` (a change and a spec of the same name), `done` (a change with a
 * proposal) and `sd1` (a change on OpenSpec's own `spec-driven` schema, which
 * cospec treats as legacy), each tool running in its own copy.
 */
function fixtureRoot(name?: string): string {
  const dir = name === undefined ? mkTempRepo() : join(mkTempRepo(), name)
  mkdirSync(dir, { recursive: true })
  cpSync(join(template, 'openspec'), join(dir, 'openspec'), { recursive: true })
  const changes = join(dir, 'openspec', 'changes')
  mkdirSync(join(changes, 'bare'), { recursive: true })
  writeFileSync(join(changes, 'bare', 'tasks.md'), '## Tasks\n- [ ] 1.1 x\n')
  for (const id of ['dup', 'done']) {
    mkdirSync(join(changes, id), { recursive: true })
    writeFileSync(join(changes, id, 'proposal.md'), PROPOSAL)
  }
  mkdirSync(join(dir, 'openspec', 'specs', 'dup'), { recursive: true })
  writeFileSync(join(dir, 'openspec', 'specs', 'dup', 'spec.md'), SPEC)
  mkdirSync(join(changes, 'sd1'), { recursive: true })
  writeFileSync(join(changes, 'sd1', '.openspec.yaml'), 'schema: spec-driven\n')
  writeFileSync(join(changes, 'sd1', 'proposal.md'), PROPOSAL)
  return dir
}

/**
 * A directory with no `openspec/` tree; with `store`, its sandboxed registry
 * lists a store `st1`, which turns the binary's no-root answer into the one
 * naming the registered stores.
 */
function rootless(store: boolean): string {
  const dir = mkTempRepo()
  if (store) {
    const storeDir = join(dir, 'store')
    mkdirSync(join(storeDir, '.openspec-store'), { recursive: true })
    writeFileSync(join(storeDir, '.openspec-store', 'store.yaml'), 'version: 1\nid: st1\n')
    cpSync(join(template, 'openspec'), join(storeDir, 'openspec'), { recursive: true })
    const registry = join(dir, '.oracle-home', '.local', 'share', 'openspec', 'stores')
    mkdirSync(registry, { recursive: true })
    writeFileSync(
      join(registry, 'registry.yaml'),
      `version: 1\nstores:\n  st1:\n    backend:\n      type: git\n      local_path: ${storeDir}\n`,
    )
  }
  return dir
}

/** The binary's `run openspec init` remedy, as cospec relays it. */
function viaCospecInit(text: string): string {
  return text
    .replaceAll('run openspec init', 'run cospec init')
    .replaceAll('Run openspec init', 'Run cospec init')
}

async function both(argv: string[]): Promise<{ co: SpawnResult; up: SpawnResult }> {
  const coRoot = fixtureRoot()
  const upRoot = fixtureRoot()
  const [co, up] = await Promise.all([
    cospec(argv, { cwd: coRoot, env: oracleEnv(coRoot) }),
    oracle(argv, upRoot, { runtime: 'node' }),
  ])
  return { co, up }
}

function detail(co: SpawnResult): string {
  return `cospec exit ${co.exitCode}\nstdout: ${co.stdout}\nstderr: ${co.stderr}`
}

describe('show relays its remedies through cospec', () => {
  test('a change with no proposal.md, text', async () => {
    const { co, up } = await both(['show', 'bare'])
    expect(up.stderr).toContain('Run "openspec status --change bare"')
    expect(co.exitCode, detail(co)).toBe(up.exitCode)
    expect(co.stdout).toBe(up.stdout)
    expect(co.stderr, detail(co)).toBe(
      up.stderr.replace('Run "openspec status --change bare"', 'Run "cospec status --change bare"'),
    )
    expect(co.stdout + co.stderr).not.toMatch(BARE_OPENSPEC)
  }, 30_000)

  test('a change with no proposal.md, --json: one document, the message respelled', async () => {
    const { co, up } = await both(['show', 'bare', '--json'])
    const upDoc = JSON.parse(up.stdout) as { status: { message: string }[] }
    expect(upDoc.status[0]!.message).toContain('Run "openspec status --change bare"')
    expect(co.exitCode, detail(co)).toBe(up.exitCode)
    expect(documentCount(co.stdout), detail(co)).toBe(1)
    upDoc.status[0]!.message = upDoc.status[0]!.message.replace(
      'Run "openspec status',
      'Run "cospec status',
    )
    expect(JSON.parse(co.stdout)).toEqual(upDoc)
    expect(co.stderr).toBe(up.stderr)
    expect(co.stdout + co.stderr).not.toMatch(BARE_OPENSPEC)
  }, 30_000)

  test('an id that is both a change and a spec, text: no noun-form remedy', async () => {
    const { co, up } = await both(['show', 'dup'])
    expect(up.stderr).toContain('or use: openspec change show / openspec spec show')
    expect(co.exitCode, detail(co)).toBe(up.exitCode)
    expect(co.stdout).toBe(up.stdout)
    expect(co.stderr, detail(co)).toBe(
      up.stderr.replace(
        'Pass --type change|spec, or use: openspec change show / openspec spec show',
        'Pass --type change|spec.',
      ),
    )
    expect(co.stdout + co.stderr).not.toMatch(BARE_OPENSPEC)
  }, 30_000)

  test('an id that is both a change and a spec, --json: the binary document as is', async () => {
    const { co, up } = await both(['show', 'dup', '--json'])
    expect(co.exitCode, detail(co)).toBe(up.exitCode)
    expect(co.stdout, detail(co)).toBe(up.stdout)
    expect(co.stdout + co.stderr).not.toMatch(BARE_OPENSPEC)
  }, 30_000)

  test("a change's own text that names openspec is shown untouched", async () => {
    const coRoot = fixtureRoot()
    const upRoot = fixtureRoot()
    const text = '## Why\nRun openspec status --change done by hand.\n\n## What Changes\n- x\n'
    for (const root of [coRoot, upRoot])
      writeFileSync(join(root, 'openspec', 'changes', 'done', 'proposal.md'), text)
    const co = await cospec(['show', 'done'], { cwd: coRoot, env: oracleEnv(coRoot) })
    const up = await oracle(['show', 'done'], upRoot, { runtime: 'node' })
    expect(up.stdout).toContain('Run openspec status --change done by hand.')
    expect(co.exitCode, detail(co)).toBe(up.exitCode)
    expect(co.stdout, detail(co)).toBe(up.stdout)
  }, 30_000)
})

describe('show with an empty item name answers itself, never the binary screen', () => {
  // An empty token (`""`, after `--` too) is no item: the binary answers it
  // with its "Nothing to show" screen, whose remedies are bare `openspec`
  // commands, so cospec gives its own item-name error instead — text on
  // stderr, or under `--json` one document on stdout — exit 1 either way.
  const REQUIRED = 'cospec show: an item name is required (cospec show <change-or-spec>)\n'
  const cases: { argv: string[]; store: boolean }[] = [
    { argv: ['show', ''], store: false },
    { argv: ['show', '--', ''], store: false },
    { argv: ['show', '--store', 'st1', ''], store: true },
  ]
  for (const { argv, store } of cases) {
    test(
      argv.map((a) => (a === '' ? '""' : a)).join(' '),
      async () => {
        const coRoot = store ? rootless(true) : fixtureRoot()
        const upRoot = store ? rootless(true) : fixtureRoot()
        const co = await cospec(argv, { cwd: coRoot, env: oracleEnv(coRoot) })
        const up = await oracle(argv, upRoot, { runtime: 'node' })
        expect(up.exitCode).toBe(1)
        expect(up.stderr).toContain('Nothing to show. Try one of:')
        expect(up.stderr).toMatch(BARE_OPENSPEC)
        expect(co.exitCode, detail(co)).toBe(1)
        expect(co.stdout, detail(co)).toBe('')
        expect(co.stderr, detail(co)).toBe(REQUIRED)
      },
      30_000,
    )
  }

  for (const argv of [
    ['show', '', '--json'],
    ['show', '--json'],
  ]) {
    test(`${argv.map((a) => (a === '' ? '""' : a)).join(' ')}: one document`, async () => {
      const root = fixtureRoot()
      const co = await cospec(argv, { cwd: root, env: oracleEnv(root) })
      expect(co.exitCode, detail(co)).toBe(1)
      expect(documentCount(co.stdout), detail(co)).toBe(1)
      expect(JSON.parse(co.stdout)).toEqual({
        status: [
          {
            severity: 'error',
            code: 'missing_item',
            message: 'an item name is required (cospec show <change-or-spec>)',
          },
        ],
      })
      expect(co.stderr, detail(co)).toBe('')
    }, 30_000)
  }

  // `-r` takes a value, so commander gives it the rest of the token
  // (`-r1`, `-r=1` as `=1`, `-rr` as `r`): no item, the same screen.
  const ATTACHED = [
    ['show', '-r1'],
    ['show', '-r=1'],
    ['show', '-rr'],
    ['show', '--no-scenarios', '-r1'],
  ]
  for (const argv of ATTACHED) {
    test(`${argv.join(' ')}: an attached short value is no item`, async () => {
      const coRoot = fixtureRoot()
      const upRoot = fixtureRoot()
      const co = await cospec(argv, { cwd: coRoot, env: oracleEnv(coRoot) })
      const up = await oracle(argv, upRoot, { runtime: 'node' })
      expect(up.exitCode).toBe(1)
      expect(up.stderr).toContain('Nothing to show. Try one of:')
      expect(co.exitCode, detail(co)).toBe(1)
      expect(co.stdout, detail(co)).toBe('')
      expect(co.stderr, detail(co)).toBe(REQUIRED)
    }, 30_000)
    test(`${argv.join(' ')} --json: one missing_item document`, async () => {
      const root = fixtureRoot()
      const co = await cospec([...argv, '--json'], { cwd: root, env: oracleEnv(root) })
      expect(co.exitCode, detail(co)).toBe(1)
      expect(documentCount(co.stdout), detail(co)).toBe(1)
      expect(JSON.parse(co.stdout)).toEqual({
        status: [
          {
            severity: 'error',
            code: 'missing_item',
            message: 'an item name is required (cospec show <change-or-spec>)',
          },
        ],
      })
      expect(co.stderr, detail(co)).toBe('')
    }, 30_000)
  }

  test('an empty token before an item still reaches the binary', async () => {
    const { co, up } = await both(['show', '', 'done'])
    expect(up.stderr).toContain('too many arguments')
    expect(co.exitCode, detail(co)).toBe(up.exitCode)
    expect(co.stderr, detail(co)).toContain('too many arguments')
  }, 30_000)
})

describe('view relays its footer through cospec', () => {
  test('the dashboard names cospec list for the detailed views', async () => {
    const { co, up } = await both(['view'])
    expect(up.stdout).toContain('Use openspec list --changes or openspec list --specs')
    expect(co.exitCode, detail(co)).toBe(up.exitCode)
    expect(co.stdout, detail(co)).toBe(
      up.stdout.replace(
        'Use openspec list --changes or openspec list --specs',
        'Use cospec list --changes or cospec list --specs',
      ),
    )
    expect(co.stdout + co.stderr).not.toMatch(BARE_OPENSPEC)
  }, 30_000)
})

describe('status of a legacy-schema change relays the binary status through cospec', () => {
  /** The absolute change root each tool prints, which differs between the two copies. */
  function rootless_(text: string, root: string): string {
    return text.replaceAll(realpathSync(root), '<root>').replaceAll(root, '<root>')
  }

  test('text: the binary status, its Next remedy naming cospec instructions', async () => {
    const coRoot = fixtureRoot()
    const upRoot = fixtureRoot()
    const co = await cospec(['status', '--change', 'sd1'], {
      cwd: coRoot,
      env: oracleEnv(coRoot),
    })
    const up = await oracle(['status', '--change', 'sd1'], upRoot, { runtime: 'node' })
    expect(up.stdout).toContain('Next: openspec instructions specs --change "sd1" --json')
    expect(co.exitCode, detail(co)).toBe(up.exitCode)
    expect(rootless_(co.stdout, coRoot), detail(co)).toBe(
      rootless_(up.stdout, upRoot).replace(
        'Next: openspec instructions specs',
        'Next: cospec instructions specs',
      ),
    )
    expect(co.stderr).toBe(up.stderr)
    expect(co.stdout + co.stderr).not.toMatch(BARE_OPENSPEC)
  }, 30_000)

  test('--json keeps its legacy document', async () => {
    const root = fixtureRoot()
    const co = await cospec(['status', '--change', 'sd1', '--json'], {
      cwd: root,
      env: oracleEnv(root),
    })
    expect(co.exitCode, detail(co)).toBe(0)
    expect(JSON.parse(co.stdout)).toEqual({ change: 'sd1', type: 'spec-driven', legacy: true })
  }, 30_000)

  test('--all points a legacy change at cospec status', async () => {
    const root = fixtureRoot()
    const co = await cospec(['status', '--all'], { cwd: root, env: oracleEnv(root) })
    expect(co.stdout, detail(co)).toContain(
      'sd1 (spec-driven): legacy schema — use `cospec status --change sd1` for details',
    )
    expect(co.stdout + co.stderr).not.toMatch(BARE_OPENSPEC)
  }, 30_000)
})

describe("the binary's no-root answer names cospec init", () => {
  // With no store registered, cospec's resolver hands the command an implicit
  // root and the binary's own no-root answer is relayed, respelled.
  for (const argv of [['context'], ['context', '--json']]) {
    test(
      argv.join(' '),
      async () => {
        const coRoot = rootless(false)
        const upRoot = rootless(false)
        const co = await cospec(argv, { cwd: coRoot, env: oracleEnv(coRoot) })
        const up = await oracle(argv, upRoot, { runtime: 'node' })
        expect(up.stdout + up.stderr).toMatch(/[Rr]un openspec init/)
        expect(co.exitCode, detail(co)).toBe(up.exitCode)
        expect(documentCount(co.stdout)).toBe(documentCount(up.stdout))
        const paths = (text: string, root: string): string => text.replaceAll(root, '<root>')
        expect(paths(co.stdout, coRoot), detail(co)).toBe(viaCospecInit(paths(up.stdout, upRoot)))
        expect(paths(co.stderr, coRoot), detail(co)).toBe(viaCospecInit(paths(up.stderr, upRoot)))
        expect(co.stdout + co.stderr).not.toMatch(BARE_OPENSPEC)
      },
      30_000,
    )
  }
})

describe('with a store registered, the resolver gives the no-root answer', () => {
  // root-resolution-parity ports upstream's `no_root_with_registered_stores`
  // into cospec's resolver, so the command fails before any spawn: in human
  // mode with the binary's message and Fix line after `cospec: ` (where the
  // binary prints `Error: ` or `✖ Error: `), and under --json as the one
  // `{"status": [diagnostic]}` document (design D12) — byte-for-byte the
  // binary's own where its document is that envelope alone.
  const human = [['context'], ['show', 'x'], ['instructions', 'proposal', '--change', 'x']]
  for (const argv of human) {
    test(`${argv.join(' ')} (a store registered)`, async () => {
      const coRoot = rootless(true)
      const upRoot = rootless(true)
      const co = await cospec(argv, { cwd: coRoot, env: oracleEnv(coRoot) })
      const up = await oracle(argv, upRoot, { runtime: 'node' })
      expect(up.stdout + up.stderr).toMatch(/[Rr]un openspec init/)
      expect(co.exitCode, detail(co)).toBe(up.exitCode)
      expect(co.stdout, detail(co)).toBe(up.stdout)
      expect(co.stderr, detail(co)).toBe(
        viaCospecInit(up.stderr.replace(/^(?:✖ )?Error: /, 'cospec: ')),
      )
      expect(co.stdout + co.stderr).not.toMatch(BARE_OPENSPEC)
    }, 30_000)
  }

  const json = [
    ['show', 'x', '--json'],
    ['instructions', 'proposal', '--change', 'x', '--json'],
  ]
  for (const argv of json) {
    test(`${argv.join(' ')} (a store registered)`, async () => {
      const coRoot = rootless(true)
      const upRoot = rootless(true)
      const co = await cospec(argv, { cwd: coRoot, env: oracleEnv(coRoot) })
      const up = await oracle(argv, upRoot, { runtime: 'node' })
      expect(up.stdout + up.stderr).toMatch(/[Rr]un openspec init/)
      expect(co.exitCode, detail(co)).toBe(up.exitCode)
      expect(Object.keys(JSON.parse(up.stdout) as object)).toEqual(['status'])
      expect(co.stdout, detail(co)).toBe(viaCospecInit(up.stdout))
      expect(co.stderr, detail(co)).toBe(up.stderr)
      expect(co.stdout + co.stderr).not.toMatch(BARE_OPENSPEC)
    }, 30_000)
  }

  test('context --json (a store registered)', async () => {
    const coRoot = rootless(true)
    const upRoot = rootless(true)
    const co = await cospec(['context', '--json'], { cwd: coRoot, env: oracleEnv(coRoot) })
    const up = await oracle(['context', '--json'], upRoot, { runtime: 'node' })
    expect(co.exitCode, detail(co)).toBe(up.exitCode)
    expect(co.stderr, detail(co)).toBe(up.stderr)
    const upDoc = JSON.parse(up.stdout) as { status: unknown[] }
    // The binary's document also carries context's own null payload; the
    // per-command failure keys are cli-surface-parity's (design D12), so the
    // difference is pinned exactly here and fails the moment either side moves.
    expect(Object.keys(upDoc)).toEqual(['root', 'members', 'status'])
    expect(upDoc).toMatchObject({ root: null, members: [] })
    expect(co.stdout, detail(co)).toBe(
      `${JSON.stringify({ status: JSON.parse(viaCospecInit(JSON.stringify(upDoc.status))) }, null, 2)}\n`,
    )
    expect(co.stdout + co.stderr).not.toMatch(BARE_OPENSPEC)
  }, 30_000)
})

describe('a successful context or instructions is relayed byte-for-byte', () => {
  // R1 relays a successful `context`/`instructions` untouched. The binary's
  // own reference block (`Fetch: openspec show …`, `Fix: Run: openspec store
  // doctor …`) therefore reaches the user as the binary wrote it: that
  // spelling is owned by upstream-spellings (instructions) and
  // passthrough-json-and-doctor (context), see `REACHABLE_OWNED` in
  // `support/remedy-sources.ts`. These rows guard the user's content.

  /**
   * `fixtureRoot()` whose `config.yaml` references a usable store `st1`, a
   * registered store `st2` whose checkout is empty, and an unregistered `gone`,
   * so the binary's answer carries its reference block at exit 0.
   */
  function referencingRoot(name?: string): string {
    const dir = fixtureRoot(name)
    const storeDir = join(dir, 'store')
    mkdirSync(join(storeDir, '.openspec-store'), { recursive: true })
    writeFileSync(join(storeDir, '.openspec-store', 'store.yaml'), 'version: 1\nid: st1\n')
    cpSync(join(template, 'openspec'), join(storeDir, 'openspec'), { recursive: true })
    mkdirSync(join(storeDir, 'openspec', 'specs', 'ref-spec'), { recursive: true })
    writeFileSync(join(storeDir, 'openspec', 'specs', 'ref-spec', 'spec.md'), SPEC)
    mkdirSync(join(dir, 'broken'))
    const registry = join(dir, '.oracle-home', '.local', 'share', 'openspec', 'stores')
    mkdirSync(registry, { recursive: true })
    writeFileSync(
      join(registry, 'registry.yaml'),
      'version: 1\nstores:\n' +
        `  st1:\n    backend:\n      type: git\n      local_path: ${storeDir}\n` +
        `  st2:\n    backend:\n      type: git\n      local_path: ${join(dir, 'broken')}\n`,
    )
    const config = join(dir, 'openspec', 'config.yaml')
    const scaffolded = existsSync(config) ? readFileSync(config, 'utf8') : ''
    writeFileSync(config, `${scaffolded}\nreferences:\n  - st1\n  - st2\n  - gone\n`)
    return dir
  }

  /** `text` with the fixture root's absolute path and its name made neutral. */
  const paths = (text: string, root: string): string =>
    text
      .replaceAll(realpathSync(root), '<root>')
      .replaceAll(root, '<root>')
      .replaceAll(basename(root), '<name>')

  /**
   * One of upstream's allowlisted sentences, written by the user: in a schema
   * template, `config.yaml`'s context and rules, and a referenced spec's
   * Purpose. The binary prints each as the user wrote it, so cospec does too.
   */
  const USER_SENTENCE = 'Run openspec init to create a root here.'

  /** `referencingRoot()` whose change `done` runs on a project schema. */
  function userContentRoot(): string {
    const dir = referencingRoot()
    const schema = join(dir, 'openspec', 'schemas', 'userschema')
    const pkg = join(dirname(openspecBinPath()), '..', 'schemas', 'spec-driven')
    cpSync(pkg, schema, { recursive: true })
    const template = join(schema, 'templates', 'proposal.md')
    writeFileSync(template, `${readFileSync(template, 'utf8')}\n${USER_SENTENCE}\n`)
    writeFileSync(
      join(dir, 'openspec', 'changes', 'done', '.openspec.yaml'),
      'schema: userschema\n',
    )
    const config = join(dir, 'openspec', 'config.yaml')
    writeFileSync(
      config,
      `${readFileSync(config, 'utf8')}\ncontext: "${USER_SENTENCE}"\n` +
        `rules:\n  proposal:\n    - "${USER_SENTENCE}"\n`,
    )
    writeFileSync(
      join(dir, 'store', 'openspec', 'specs', 'ref-spec', 'spec.md'),
      SPEC.replace('## Purpose\nx\n', `## Purpose\n${USER_SENTENCE}\n`),
    )
    return dir
  }

  for (const argv of [
    ['instructions', 'proposal', '--change', 'done'],
    ['instructions', 'proposal', '--change', 'done', '--json'],
  ]) {
    test(`${argv.join(' ')}: template, context, rules and a spec Purpose relayed verbatim`, async () => {
      const coRoot = userContentRoot()
      const upRoot = userContentRoot()
      const co = await cospec(argv, { cwd: coRoot, env: oracleEnv(coRoot) })
      const up = await oracle(argv, upRoot, { runtime: 'node' })
      expect(up.exitCode, detail(up)).toBe(0)
      // Template, context, rule and the spec summary: four times each way.
      const count = (text: string) => text.split(USER_SENTENCE).length - 1
      expect(count(up.stdout)).toBeGreaterThanOrEqual(4)
      expect(co.exitCode, detail(co)).toBe(0)
      expect(count(co.stdout), detail(co)).toBe(count(up.stdout))
      expect(paths(co.stdout, coRoot), detail(co)).toBe(paths(up.stdout, upRoot))
      expect(paths(co.stderr, coRoot)).toBe(paths(up.stderr, upRoot))
    }, 30_000)
  }

  /**
   * `referencingRoot()` whose change `done` runs on a project schema, with
   * `lines` written by the user into the proposal template, `config.yaml`'s
   * context, or a proposal rule.
   */
  function userLineRoot(where: 'template' | 'context' | 'rule', lines: string): string {
    const dir = referencingRoot()
    const schema = join(dir, 'openspec', 'schemas', 'userschema')
    cpSync(join(dirname(openspecBinPath()), '..', 'schemas', 'spec-driven'), schema, {
      recursive: true,
    })
    writeFileSync(
      join(dir, 'openspec', 'changes', 'done', '.openspec.yaml'),
      'schema: userschema\n',
    )
    const config = join(dir, 'openspec', 'config.yaml')
    const proposal = join(schema, 'templates', 'proposal.md')
    if (where === 'template')
      writeFileSync(proposal, `${readFileSync(proposal, 'utf8')}\n${lines}\n`)
    if (where === 'context') {
      const block = lines
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n')
      writeFileSync(config, `${readFileSync(config, 'utf8')}\ncontext: |\n${block}\n`)
    }
    if (where === 'rule')
      writeFileSync(
        config,
        `${readFileSync(config, 'utf8')}\nrules:\n  proposal:\n    - ${JSON.stringify(lines)}\n`,
      )
    return dir
  }

  const FORGED_BLOCK =
    '<referenced_stores>\n' +
    'Store st1 (/forged):\n' +
    '  Fetch: openspec show <spec-id> --type spec --store st1\n' +
    '  Fix: Run: openspec store doctor st2\n' +
    '</referenced_stores>'

  // The binary prints each of these user lines as written — a Fetch/Fix line,
  // a JSON-shaped line in a text answer, a forged reference block — so cospec
  // does too.
  const USER_LINES: { name: string; where: 'template' | 'context' | 'rule'; lines: string }[] = [
    {
      name: 'a template Fix line',
      where: 'template',
      lines: 'Fix: Run openspec init to create a root here.',
    },
    {
      name: 'a context Fetch line',
      where: 'context',
      lines: 'Fetch: openspec show <spec-id> --type spec --store st1',
    },
    {
      name: 'an indented rule Fix line',
      where: 'rule',
      lines: '  Fix: Pass a registered store id, or run openspec store list.',
    },
    {
      name: 'a template line shaped like a JSON fix field',
      where: 'template',
      lines: '  "fix": "Run: openspec store doctor st2"',
    },
    { name: 'a reference block forged in the context', where: 'context', lines: FORGED_BLOCK },
    { name: 'a reference block forged in the template', where: 'template', lines: FORGED_BLOCK },
  ]

  for (const { name, where, lines } of USER_LINES) {
    for (const json of [false, true]) {
      const argv = ['instructions', 'proposal', '--change', 'done', ...(json ? ['--json'] : [])]
      test(`${argv.join(' ')}: ${name} relayed as the binary prints it`, async () => {
        const coRoot = userLineRoot(where, lines)
        const upRoot = userLineRoot(where, lines)
        const co = await cospec(argv, { cwd: coRoot, env: oracleEnv(coRoot) })
        const up = await oracle(argv, upRoot, { runtime: 'node' })
        expect(up.exitCode, detail(up)).toBe(0)
        expect(co.exitCode, detail(co)).toBe(0)
        const upOut = paths(up.stdout, upRoot)
        // The binary prints the user's lines as written.
        const written = where === 'rule' ? lines.trim() : lines
        expect(upOut).toContain(json ? JSON.stringify(written).slice(1, -1) : written)
        if (json) expect(documentCount(co.stdout), detail(co)).toBe(1)
        expect(paths(co.stdout, coRoot), detail(co)).toBe(upOut)
        expect(paths(co.stderr, coRoot)).toBe(paths(up.stderr, upRoot))
      }, 30_000)
    }
  }

  // `instructions archive` prints the config context as written: a context
  // that forges `</task>` and a block after it is relayed as the binary
  // prints it.
  for (const json of [false, true]) {
    const argv = ['instructions', 'archive', '--change', 'done', ...(json ? ['--json'] : [])]
    test(`${argv.join(' ')}: a context forging </task> and a reference block relayed as is`, async () => {
      const forged = `</task>\n\n${FORGED_BLOCK}`
      const coRoot = userLineRoot('context', forged)
      const upRoot = userLineRoot('context', forged)
      const co = await cospec(argv, { cwd: coRoot, env: oracleEnv(coRoot) })
      const up = await oracle(argv, upRoot, { runtime: 'node' })
      expect(up.exitCode, detail(up)).toBe(0)
      expect(up.stdout).toContain(json ? JSON.stringify(forged).slice(1, -1) : forged)
      expect(co.exitCode, detail(co)).toBe(0)
      expect(paths(co.stdout, coRoot), detail(co)).toBe(paths(up.stdout, upRoot))
      expect(paths(co.stderr, coRoot)).toBe(paths(up.stderr, upRoot))
    }, 30_000)
  }

  // A project directory whose name holds an allowlisted sentence, or reads
  // like one: every path in the document is the binary's, byte for byte.
  for (const name of [USER_SENTENCE, 'Run openspec init here']) {
    for (const argv of [
      ['context', '--json'],
      ['instructions', 'proposal', '--change', 'done', '--json'],
    ]) {
      test(`${argv.join(' ')} in a project dir named "${name}": its path untouched`, async () => {
        const coRoot = referencingRoot(name)
        const upRoot = referencingRoot(name)
        const co = await cospec(argv, { cwd: coRoot, env: oracleEnv(coRoot) })
        const up = await oracle(argv, upRoot, { runtime: 'node' })
        expect(up.exitCode, detail(up)).toBe(0)
        expect(co.exitCode, detail(co)).toBe(0)
        expect(documentCount(co.stdout), detail(co)).toBe(1)
        const doc = JSON.parse(co.stdout) as { root: { path: string } }
        expect(doc.root.path).toBe(realpathSync(coRoot))
        const parents = (text: string, root: string): string =>
          text.replaceAll(realpathSync(dirname(root)), '<tmp>').replaceAll(dirname(root), '<tmp>')
        expect(parents(co.stdout, coRoot), detail(co)).toBe(parents(up.stdout, upRoot))
      }, 30_000)
    }
  }
})
