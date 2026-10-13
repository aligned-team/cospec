// `verification.layers` in `openspec/config.yaml` (verification-artifact spec,
// "Project-extended layer is accepted"): a declared layer passes every gate that
// validates a change; an undeclared one still fails closed (#68). `status` and
// `list` read it for `archiveReady` as those gates do (#83).

import { afterAll, describe, expect, test } from 'bun:test'
import { appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'

afterAll(cleanupAll)

const BLOCKERS_EMPTY = `# Dependencies

## Blocked by

None.

## Soft-blocked by

None.
`

const FIX_PROPOSAL = `# change

## Why

The widget crashes on empty input. Users hit this daily and lose work, so the
parser needs a guard that the regression row below proves before and after.

## What Changes

- Guard against empty input in the widget parser.

## Impact

- Parser only.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

const TASKS_DONE = `## 1. Parser

- [x] 1.1 Add the guard and run the unit suite
`

const C = 'openspec/changes/my-fix'

/** A repo with a fix change whose rows are `rows`, under a config declaring `config`. */
async function repoWith(rows: string[], config?: string): Promise<string> {
  const root = mkTempRepo({ fixture: 'fresh', git: true })
  const init = await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
  expect(init.exitCode).toBe(0)
  if (config !== undefined) appendFileSync(join(root, 'openspec/config.yaml'), `\n${config}`)
  writeFiles(root, {
    [`${C}/.openspec.yaml`]: 'schema: fix\ncreated: 2026-07-06\nschemaVersion: 2\n',
    [`${C}/proposal.md`]: FIX_PROPOSAL,
    [`${C}/blocking-changes.md`]: BLOCKERS_EMPTY,
    [`${C}/tasks.md`]: TASKS_DONE,
    [`${C}/verification.md`]: ['## 1. Empty input is handled [critical]', '', ...rows, ''].join(
      '\n',
    ),
  })
  return root
}

const UAT_ROW = '- [x] 1.2 @uat (human) try it on staging -> no crash shown'
const STAGING_ROW = '- [x] 1.3 @staging (agent) smoke the staging deploy -> healthy'
const BASE_ROW = '- [x] 1.1 @regression (agent) run the widget with empty input -> no crash'

describe('a project-declared verification layer', () => {
  test.each([
    ['block list', 'verification:\n  layers:\n    - uat\n'],
    ['flow list', 'verification:\n  layers: [uat]\n'],
    ['@-prefixed', 'verification:\n  layers: ["@uat"]\n'],
  ])('validate --strict accepts it (%s)', async (_name, config) => {
    const root = await repoWith([BASE_ROW, UAT_ROW], config)
    const res = await cospec(['validate', 'my-fix', '--strict'], { cwd: root })
    expect(res.stdout).not.toContain('verification/layer-unknown')
    expect(res.exitCode).toBe(0)
  })

  test('an undeclared layer still fails closed, naming the declared one', async () => {
    const root = await repoWith(
      [BASE_ROW, UAT_ROW, STAGING_ROW],
      'verification:\n  layers:\n    - uat\n',
    )
    const res = await cospec(['validate', 'my-fix', '--strict'], { cwd: root })
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('verification/layer-unknown')
    expect(res.stdout).toContain('@staging is not a known layer')
    expect(res.stdout).not.toContain('@uat is not a known layer')
    expect(res.stdout).toContain('project layers: @uat')
  })

  test('without a declaration the layer is rejected (the control)', async () => {
    const root = await repoWith([BASE_ROW, UAT_ROW])
    const res = await cospec(['validate', 'my-fix', '--strict'], { cwd: root })
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('@uat is not a known layer')
  })

  test('apply and archive clear the validation gate for a declared layer', async () => {
    const root = await repoWith([BASE_ROW, UAT_ROW], 'verification:\n  layers: [uat]\n')
    const apply = await cospec(['apply', 'my-fix'], { cwd: root })
    expect(apply.stdout + apply.stderr).not.toContain('verification/layer-unknown')
    expect(apply.exitCode).toBe(0)
    const archive = await cospec(['archive', 'my-fix'], { cwd: root })
    expect(archive.stdout + archive.stderr).not.toContain('verification/layer-unknown')
    expect(archive.exitCode).toBe(0)
    expect(existsSync(join(root, C))).toBe(false)
  })

  test('apply and archive refuse an undeclared layer', async () => {
    const root = await repoWith([BASE_ROW, UAT_ROW])
    const apply = await cospec(['apply', 'my-fix'], { cwd: root })
    expect(apply.exitCode).not.toBe(0)
    expect(apply.stdout + apply.stderr).toContain('verification/layer-unknown')
    const archive = await cospec(['archive', 'my-fix'], { cwd: root })
    expect(archive.exitCode).not.toBe(0)
    expect(existsSync(join(root, C))).toBe(true)
  })

  test('a malformed declaration is ignored without crashing the gate', async () => {
    const root = await repoWith([BASE_ROW, UAT_ROW], 'verification: [oops')
    const res = await cospec(['validate', 'my-fix', '--strict'], { cwd: root })
    expect(res.exitCode).not.toBe(0)
    expect(res.stderr).not.toContain('TypeError')
  })
})

const UAT_DEFERRED_ROW =
  '- [~] 1.4 @uat (human) try it on production -> defer: checked after the release'

interface ReadyRow {
  change: string
  archiveReady: boolean
}

/**
 * What `status` (one change, `--all`, text) and `list` (`--json`, text) say about my-fix. Every
 * run must succeed and report the change, so "not archive-ready" is never a missing row.
 */
async function readiness(root: string) {
  const runs = await Promise.all(
    [
      ['status', '--change', 'my-fix', '--json'],
      ['status', '--all', '--json'],
      ['status', '--change', 'my-fix'],
      ['list', '--json'],
      ['list'],
    ].map((args) => cospec(args, { cwd: root })),
  )
  for (const run of runs) expect(run.exitCode).toBe(0)
  const [one, all, statusText, list, listText] = runs.map((run) => run.stdout) as [
    string,
    string,
    string,
    string,
    string,
  ]
  const doc = JSON.parse(one) as {
    archiveReady: boolean
    verification: { blockedReasons: string[] }
  }
  const allRow = (JSON.parse(all) as { changes: ReadyRow[] }).changes.find(
    (c) => c.change === 'my-fix',
  )
  const listRow = (JSON.parse(list) as { changes: ReadyRow[] }).changes.find(
    (c) => c.change === 'my-fix',
  )
  const listLine = listText.split('\n').find((l) => l.trim().split(/\s+/)[0] === 'my-fix')
  expect(allRow).toBeDefined()
  expect(listRow).toBeDefined()
  expect(listLine).toBeDefined()
  return {
    status: doc.archiveReady,
    blockedReasons: doc.verification.blockedReasons,
    statusAll: allRow!.archiveReady,
    statusText,
    list: listRow!.archiveReady,
    listText: listLine!.includes('archive-ready'),
  }
}

describe('status and list read the declaration as validate and archive do', () => {
  test('all four agree a change whose rows name only a declared layer is archive-ready', async () => {
    const root = await repoWith(
      [BASE_ROW, UAT_ROW, UAT_DEFERRED_ROW],
      'verification:\n  layers: [uat]\n',
    )
    const validate = await cospec(['validate', 'my-fix', '--strict'], { cwd: root })
    expect(validate.exitCode).toBe(0)

    const ready = await readiness(root)
    expect(ready.blockedReasons).toEqual([])
    expect(ready.status).toBe(true)
    expect(ready.statusAll).toBe(true)
    expect(ready.statusText).toContain('archive-ready: yes')
    expect(ready.list).toBe(true)
    expect(ready.listText).toBe(true)

    const archive = await cospec(['archive', 'my-fix'], { cwd: root })
    expect(archive.exitCode).toBe(0)
    expect(existsSync(join(root, C))).toBe(false)
  }, 60_000)

  test('without the declaration status and list report not archive-ready, naming the rule', async () => {
    const root = await repoWith([BASE_ROW, UAT_ROW, UAT_DEFERRED_ROW])
    const ready = await readiness(root)
    expect(ready.blockedReasons).toEqual([
      'verification/layer-unknown (line 4): @uat is not a known layer',
      'verification/layer-unknown (line 5): @uat is not a known layer',
    ])
    expect(ready.status).toBe(false)
    expect(ready.statusAll).toBe(false)
    expect(ready.statusText).toContain('archive-ready: no')
    expect(ready.list).toBe(false)
    expect(ready.listText).toBe(false)
  }, 60_000)
})
