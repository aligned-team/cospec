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
import { basename, join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, type SpawnResult } from '../fixtures/support.ts'
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
function fixtureRoot(): string {
  const dir = mkTempRepo()
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
    test.failing(
      `${argv.join(' ')}: an attached short value is no item`,
      async () => {
        const coRoot = fixtureRoot()
        const upRoot = fixtureRoot()
        const co = await cospec(argv, { cwd: coRoot, env: oracleEnv(coRoot) })
        const up = await oracle(argv, upRoot, { runtime: 'node' })
        expect(up.exitCode).toBe(1)
        expect(up.stderr).toContain('Nothing to show. Try one of:')
        expect(co.exitCode, detail(co)).toBe(1)
        expect(co.stdout, detail(co)).toBe('')
        expect(co.stderr, detail(co)).toBe(REQUIRED)
      },
      30_000,
    )
    test.failing(
      `${argv.join(' ')} --json: one missing_item document`,
      async () => {
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
      },
      30_000,
    )
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
  const cases: { argv: string[]; store: boolean }[] = [
    { argv: ['context'], store: false },
    { argv: ['context', '--json'], store: false },
    { argv: ['context'], store: true },
    { argv: ['context', '--json'], store: true },
    { argv: ['show', 'x'], store: true },
    { argv: ['show', 'x', '--json'], store: true },
    { argv: ['instructions', 'proposal', '--change', 'x'], store: true },
    { argv: ['instructions', 'proposal', '--change', 'x', '--json'], store: true },
  ]
  for (const { argv, store } of cases) {
    test(`${argv.join(' ')}${store ? ' (a store registered)' : ''}`, async () => {
      const coRoot = rootless(store)
      const upRoot = rootless(store)
      const co = await cospec(argv, { cwd: coRoot, env: oracleEnv(coRoot) })
      const up = await oracle(argv, upRoot, { runtime: 'node' })
      expect(up.stdout + up.stderr).toMatch(/[Rr]un openspec init/)
      expect(co.exitCode, detail(co)).toBe(up.exitCode)
      expect(documentCount(co.stdout)).toBe(documentCount(up.stdout))
      const paths = (text: string, root: string): string => text.replaceAll(root, '<root>')
      expect(paths(co.stdout, coRoot), detail(co)).toBe(viaCospecInit(paths(up.stdout, upRoot)))
      expect(paths(co.stderr, coRoot), detail(co)).toBe(viaCospecInit(paths(up.stderr, upRoot)))
      expect(co.stdout + co.stderr).not.toMatch(BARE_OPENSPEC)
    }, 30_000)
  }
})

describe("a successful context or instructions names cospec in upstream's remedies", () => {
  /**
   * `fixtureRoot()` whose `config.yaml` references a usable store `st1`, a
   * registered store `st2` whose checkout is empty, and an unregistered `gone`:
   * the binary's answer, at exit 0, carries a `Fetch:` recipe and two `Fix:`
   * remedies naming bare `openspec`.
   */
  function referencingRoot(): string {
    const dir = fixtureRoot()
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

  /** The binary's reference remedies, as cospec relays them. */
  function viaCospec(text: string): string {
    return text
      .replaceAll(
        'openspec show <spec-id> --type spec --store st1',
        'cospec show <spec-id> --type spec --store st1',
      )
      .replaceAll('Run: openspec store doctor st2', 'Run: cospec store doctor st2')
      .replaceAll(
        'and run: openspec store register <path> --id gone',
        'and run: cospec store register <path> --id gone',
      )
  }

  for (const argv of [
    ['context'],
    ['context', '--json'],
    ['instructions', 'proposal', '--change', 'done'],
    ['instructions', 'proposal', '--change', 'done', '--json'],
  ]) {
    test(
      argv.join(' '),
      async () => {
        const coRoot = referencingRoot()
        const upRoot = referencingRoot()
        const co = await cospec(argv, { cwd: coRoot, env: oracleEnv(coRoot) })
        const up = await oracle(argv, upRoot, { runtime: 'node' })
        expect(up.exitCode, detail(up)).toBe(0)
        expect(up.stdout).toContain('openspec store doctor st2')
        expect(up.stdout).toContain('openspec store register <path> --id gone')
        expect(co.exitCode, detail(co)).toBe(0)
        const paths = (text: string, root: string): string =>
          text
            .replaceAll(realpathSync(root), '<root>')
            .replaceAll(root, '<root>')
            .replaceAll(basename(root), '<name>')
        expect(paths(co.stdout, coRoot), detail(co)).toBe(viaCospec(paths(up.stdout, upRoot)))
        expect(paths(co.stderr, coRoot)).toBe(paths(up.stderr, upRoot))
        // The reference block names no bare command; a legacy schema's own
        // instruction prose, relayed as the binary wrote it, is not upstream's
        // remedy sentence and may.
        const references = co.stdout
          .split('\n')
          .filter((line) => /Fetch:|Fix:|"fetch":|"fix":/.test(line))
        expect(references.length).toBeGreaterThanOrEqual(3)
        expect(references.join('\n')).not.toMatch(BARE_OPENSPEC)
        if (argv[0] === 'context') expect(co.stdout + co.stderr).not.toMatch(BARE_OPENSPEC)
      },
      30_000,
    )
  }
})
