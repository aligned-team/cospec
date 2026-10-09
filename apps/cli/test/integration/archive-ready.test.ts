// `archiveReady` agrees with the gates (issue #67): `status`, `status --all` and
// `list` report the same value for the same change, a change with unresolved or
// malformed verification rows is not archive-ready, and a change reported
// archive-ready is never refused by `archive/verification-incomplete`.

import { afterAll, describe, expect, test } from 'bun:test'

import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'

afterAll(cleanupAll)

const BLOCKERS_EMPTY = `# Dependencies

## Blocked by

None.

## Soft-blocked by

None.
`

const TASKS_DONE = `## 1. Parser

- [x] 1.1 add the guard and verify by running the unit suite
`

const FIX_PROPOSAL = `# Proposal

## Why

The widget crashes on empty input. Users hit this daily and lose work.

## What Changes

Guard against empty input in the widget parser.

## Impact

Parser only.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

const CI_PROPOSAL = `# change

## Why

The pipeline is missing a step and we are adding it now.

## What Changes

- Add the step.

## Impact

- Config only; no application source touched.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

const VERIFICATION = {
  unresolved: `# Verification

## 1. Empty input is handled [critical]

- [ ] 1.1 @regression (agent) run the widget with empty input, failing before the fix -> no crash after
- [ ] 1.2 @e2e (agent) drive the real flow end to end with empty input -> no crash
- [ ] 1.3 @manual (human) try it in a browser -> no crash shown
`,
  malformed: `# Verification

## 1. Empty input is handled [critical]

- [x] 1.1 @regression (agent) run the widget with empty input -> no crash after
- [x] 1.2 a row with no layer and no owner
`,
  resolved: `# Verification

## 1. Empty input is handled [critical]

- [x] 1.1 @regression (agent) run the widget with empty input -> no crash after
- [~] 1.2 @manual (human) try it in a browser -> defer: no browser in CI
`,
} as const

interface Fixture {
  slug: string
  expectReady: boolean
  files: Record<string, string>
}

function change(
  slug: string,
  schema: string,
  yamlExtra: string,
  proposal: string,
  verification: string | undefined,
  expectReady: boolean,
): Fixture {
  const c = `openspec/changes/${slug}`
  return {
    slug,
    expectReady,
    files: {
      [`${c}/.openspec.yaml`]: `schema: ${schema}\ncreated: 2026-07-06\n${yamlExtra}`,
      [`${c}/proposal.md`]: proposal,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/tasks.md`]: TASKS_DONE,
      ...(verification === undefined ? {} : { [`${c}/verification.md`]: verification }),
    },
  }
}

const V2 = 'schemaVersion: 2\n'
const FIXTURES: Fixture[] = [
  change('unresolved-rows', 'fix', V2, FIX_PROPOSAL, VERIFICATION.unresolved, false),
  change('malformed-row', 'fix', V2, FIX_PROPOSAL, VERIFICATION.malformed, false),
  change('no-verification-file', 'fix', V2, FIX_PROPOSAL, undefined, false),
  change('resolved-rows', 'fix', V2, FIX_PROPOSAL, VERIFICATION.resolved, true),
  // Grandfathered: no schemaVersion stamp means v1, where verification is not enforced.
  change('v1-no-verification', 'fix', '', FIX_PROPOSAL, undefined, true),
  // A type that forbids verification is unaffected.
  change('ci-change', 'ci', V2, CI_PROPOSAL, undefined, true),
]

async function setup(): Promise<string> {
  const root = mkTempRepo({ fixture: 'fresh', git: true })
  await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
  for (const f of FIXTURES) writeFiles(root, f.files)
  return root
}

describe('archiveReady parity across status, status --all and list', () => {
  test('every fixture reports the same archiveReady in all three, matching the expectation', async () => {
    const root = await setup()
    const all = JSON.parse((await cospec(['status', '--all', '--json'], { cwd: root })).stdout) as {
      changes: { change: string; archiveReady: boolean }[]
    }
    const list = JSON.parse((await cospec(['list', '--json'], { cwd: root })).stdout) as {
      changes: { change: string; archiveReady: boolean }[]
    }
    const listText = (await cospec(['list'], { cwd: root })).stdout

    for (const f of FIXTURES) {
      const one = JSON.parse(
        (await cospec(['status', '--change', f.slug, '--json'], { cwd: root })).stdout,
      ) as { archiveReady: boolean; verification: { blockedReasons: string[] } }
      const text = (await cospec(['status', '--change', f.slug], { cwd: root })).stdout
      const row = list.changes.find((c) => c.change === f.slug)
      const line = listText.split('\n').find((l) => l.includes(f.slug)) ?? ''

      expect({ slug: f.slug, status: one.archiveReady }).toEqual({
        slug: f.slug,
        status: f.expectReady,
      })
      expect({
        slug: f.slug,
        all: all.changes.find((c) => c.change === f.slug)?.archiveReady,
      }).toEqual({
        slug: f.slug,
        all: f.expectReady,
      })
      expect({ slug: f.slug, list: row?.archiveReady }).toEqual({
        slug: f.slug,
        list: f.expectReady,
      })
      expect(text).toContain(`archive-ready: ${f.expectReady ? 'yes' : 'no'}`)
      expect(line.includes('archive-ready')).toBe(f.expectReady)
      // The flag is false whenever the verification gate would refuse.
      if (one.verification.blockedReasons.length > 0) expect(one.archiveReady).toBe(false)
    }
  }, 120_000)
})

describe('archiveReady: true is never refused by archive/verification-incomplete', () => {
  for (const f of FIXTURES) {
    test(`${f.slug}: the flag and the archive gate agree`, async () => {
      const root = await setup()
      const status = JSON.parse(
        (await cospec(['status', '--change', f.slug, '--json'], { cwd: root })).stdout,
      ) as { archiveReady: boolean }
      const res = await cospec(['archive', f.slug, '--json'], { cwd: root })
      const refusedOnVerification = `${res.stdout}${res.stderr}`.includes(
        'archive/verification-incomplete',
      )
      if (status.archiveReady) {
        expect(refusedOnVerification).toBe(false)
        expect(res.exitCode).toBe(0)
      } else {
        // And the reverse for these fixtures: a not-ready change is refused. A
        // row that does not parse is refused earlier, by validate's
        // `verification/row-grammar`; the rest by the verification gate itself.
        expect(res.exitCode).not.toBe(0)
        if (f.slug !== 'malformed-row') expect(refusedOnVerification).toBe(true)
      }
    })
  }
})
