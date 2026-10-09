// `verification.layers` in `openspec/config.yaml` (verification-artifact spec,
// "Project-extended layer is accepted"): a declared layer passes every gate that
// validates a change; an undeclared one still fails closed (#68).

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
