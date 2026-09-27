// Relayed remedies never name bare `openspec` (change `unknown-option-contract`,
// ledger 1.41): `show` and `view` relay the pinned binary's own text, and the
// binary writes its remedies as `openspec <command>` — `show` for a change
// with no proposal.md (text and `--json`) and for an id that is both a change
// and a spec, `view` in its dashboard footer. cospec relays the binary's
// answer with each such remedy spelled as the cospec command of the same
// shape, and drops a remedy cospec has no command for (upstream's noun-form
// `change show` / `spec show`), keeping upstream's own store-root wording
// ("Pass --type change|spec."). Everything else stays byte-for-byte the
// binary's, read at test time.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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
 * `dup` (a change and a spec of the same name) and `done` (a change with a
 * proposal), each tool running in its own copy.
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
  return dir
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
  test.failing(
    'a change with no proposal.md, text',
    async () => {
      const { co, up } = await both(['show', 'bare'])
      expect(up.stderr).toContain('Run "openspec status --change bare"')
      expect(co.exitCode, detail(co)).toBe(up.exitCode)
      expect(co.stdout).toBe(up.stdout)
      expect(co.stderr, detail(co)).toBe(
        up.stderr.replace(
          'Run "openspec status --change bare"',
          'Run "cospec status --change bare"',
        ),
      )
      expect(co.stdout + co.stderr).not.toMatch(BARE_OPENSPEC)
    },
    30_000,
  )

  test.failing(
    'a change with no proposal.md, --json: one document, the message respelled',
    async () => {
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
    },
    30_000,
  )

  test.failing(
    'an id that is both a change and a spec, text: no noun-form remedy',
    async () => {
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
    },
    30_000,
  )

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

describe('view relays its footer through cospec', () => {
  test.failing(
    'the dashboard names cospec list for the detailed views',
    async () => {
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
    },
    30_000,
  )
})
