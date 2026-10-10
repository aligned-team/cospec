// bulk-archive resolves a collision through delta edits only (canon-workflow-parity 7.1,
// verification 6; design D9).
//
// Two selected changes ADD the same requirement to one capability. Archived as they stand, the
// newer one is refused by `archive/added-exists`. The rendered bulk-archive body directs the
// resolution: the newer delta's `ADDED` becomes a full-content `MODIFIED` (both implemented,
// older first), or its colliding block is removed (excluded). Either edit touches only that
// change's delta files, and each change then archives through the very `cospec validate` and
// `cospec archive` lines the rendered body prints, so both hard gates run per change.

import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  cleanupAll,
  cospec,
  hashTree,
  mkTempRepo,
  oracleEnv,
  type SpawnResult,
  writeFiles,
} from '../fixtures/support.ts'

afterAll(cleanupAll)
setDefaultTimeout(120_000)

const OLDER = 'add-password-login'
const NEWER = 'add-sso-login'
const SKILL = '.claude/skills/cospec-bulk-archive-change/SKILL.md'

const proposal = (caps: readonly string[]): string => `# change

## Why

Users cannot sign in to the product today, so every session is anonymous and
nothing they do is kept; this change adds the sign-in path the flow needs.

## What Changes

- Add the sign-in behaviour described in the spec deltas.

## Capabilities

### New Capabilities

${caps.map((c) => `- ${c}`).join('\n')}

## Impact

- New sign-in behaviour; no breaking changes.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

const BLOCKERS = '# Dependencies\n\n## Blocked by\n\nNone.\n\n## Soft-blocked by\n\nNone.\n'
const TASKS = '## 1. Implementation\n\n- [x] 1.1 Implement sign-in\n- [x] 1.2 Add a covering test\n'
const VERIFICATION = `# Verification

## 1. Sign-in works [critical]

- [x] 1.1 @integration (agent) sign in with valid credentials -> a session is created
`

const PASSWORD_SCENARIO = `#### Scenario: Password sign-in

- **WHEN** a user submits a valid email and password
- **THEN** a session is created`

const SSO_SCENARIO = `#### Scenario: SSO sign-in

- **WHEN** a user completes the identity provider's redirect
- **THEN** a session is created`

const OLDER_AUTH = `## ADDED Requirements

### Requirement: Session login

The system SHALL create a session when a user signs in with a password.

${PASSWORD_SCENARIO}
`

const NEWER_AUTH = `## ADDED Requirements

### Requirement: Session login

The system SHALL create a session when a user signs in with a password or through SSO.

${SSO_SCENARIO}
`

const NEWER_AUDIT = `## ADDED Requirements

### Requirement: Login audit

The system SHALL record every successful sign-in in the audit log.

#### Scenario: Sign-in is recorded

- **WHEN** a user signs in
- **THEN** an audit entry names the user and the time
`

/** The retarget the body directs: the newer `ADDED` as a `MODIFIED` carrying the full requirement. */
const NEWER_AUTH_MODIFIED = `## MODIFIED Requirements

### Requirement: Session login

The system SHALL create a session when a user signs in with a password or through SSO.

${PASSWORD_SCENARIO}

${SSO_SCENARIO}
`

/** The same retarget with the older change's scenario dropped. */
const NEWER_AUTH_MODIFIED_DROPPING = `## MODIFIED Requirements

### Requirement: Session login

The system SHALL create a session when a user signs in with a password or through SSO.

${SSO_SCENARIO}
`

function change(
  slug: string,
  created: string,
  specs: Record<string, string>,
): Record<string, string> {
  const c = `openspec/changes/${slug}`
  const files: Record<string, string> = {
    [`${c}/.openspec.yaml`]: `schema: feat\ncreated: ${created}\nschemaVersion: 2\n`,
    [`${c}/proposal.md`]: proposal(Object.keys(specs)),
    [`${c}/blocking-changes.md`]: BLOCKERS,
    [`${c}/verification.md`]: VERIFICATION,
    [`${c}/tasks.md`]: TASKS,
  }
  for (const [cap, text] of Object.entries(specs)) files[`${c}/specs/${cap}/spec.md`] = text
  return files
}

/** The collision fixture: an initialised project with the claude skills and both changes. */
async function fixture(): Promise<string> {
  const root = mkTempRepo({ fixture: 'fresh', git: true })
  const init = await run(root, ['init', '--yes', '--harness', 'claude', '--no-gate'])
  expect(init.exitCode).toBe(0)
  writeFiles(root, {
    ...change(OLDER, '2026-07-01', { auth: OLDER_AUTH }),
    ...change(NEWER, '2026-07-02', { auth: NEWER_AUTH, audit: NEWER_AUDIT }),
  })
  return root
}

const run = (root: string, argv: string[]): Promise<SpawnResult> =>
  cospec(argv, { cwd: root, env: oracleEnv(root) })

/** The argv of the command line the rendered bulk-archive skill prints, for `slug`. */
function bodyArgv(root: string, command: RegExp, slug: string): string[] {
  const skill = readFileSync(join(root, SKILL), 'utf8')
  const line = skill.split('\n').find((l) => command.test(l))
  if (line === undefined) throw new Error(`the bulk-archive skill prints no ${command} line`)
  const text = /cospec ([^`]*)/.exec(line)![1]!
  return text
    .replace(/"?<slug>"?/, slug)
    .trim()
    .split(/\s+/)
}

const VALIDATE = /^cospec validate <slug> --strict$/
const ARCHIVE = /^cospec archive <slug>$/

/** The body names the retarget a test is about to apply, or the row has nothing to drive. */
function bodyDirects(root: string, phrase: string): void {
  const skill = readFileSync(join(root, SKILL), 'utf8').replace(/\s+/g, ' ')
  if (!skill.includes(phrase)) throw new Error(`the bulk-archive skill never directs: ${phrase}`)
}

/** Every path that was added, removed or changed between two hash walks. */
function changedPaths(before: Record<string, string>, after: Record<string, string>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter((k) => before[k] !== after[k]).toSorted()
}

/**
 * The body's loop over the resolved order: archive the older change, then validate the edited
 * newer one against the living specs the older left, then archive it.
 */
async function archiveInOrder(root: string): Promise<void> {
  const older = await run(root, bodyArgv(root, ARCHIVE, OLDER))
  expect(older.exitCode).toBe(0)
  expect(existsSync(join(root, `openspec/changes/${OLDER}`))).toBe(false)
  const validated = await run(root, bodyArgv(root, VALIDATE, NEWER))
  expect(validated.exitCode).toBe(0)
  const newer = await run(root, bodyArgv(root, ARCHIVE, NEWER))
  expect(newer.exitCode).toBe(0)
  expect(existsSync(join(root, `openspec/changes/${NEWER}`))).toBe(false)
}

const livingAuth = (root: string): string =>
  readFileSync(join(root, 'openspec/specs/auth/spec.md'), 'utf8')

describe('an unresolved ADDED collision (verification 6.1)', () => {
  test('the newer archive refuses with archive/added-exists and moves nothing', async () => {
    const root = await fixture()
    // Step 3's detection source: each change's delta specs, from its status document.
    const status = await run(root, ['status', '--change', NEWER, '--json'])
    expect(status.exitCode).toBe(0)
    const specs = (
      JSON.parse(status.stdout) as {
        artifactPaths: { specs: { existingOutputPaths: string[] } }
      }
    ).artifactPaths.specs.existingOutputPaths
    expect(specs.some((p) => p.endsWith('specs/auth/spec.md'))).toBe(true)
    expect(specs.some((p) => p.endsWith('specs/audit/spec.md'))).toBe(true)
    const first = await run(root, bodyArgv(root, ARCHIVE, OLDER))
    expect(first.exitCode).toBe(0)
    const living = livingAuth(root)
    const before = hashTree(root)

    const second = await run(root, bodyArgv(root, ARCHIVE, NEWER))
    expect(second.exitCode).not.toBe(0)
    expect(`${second.stdout}${second.stderr}`).toContain('archive/added-exists')
    expect(existsSync(join(root, `openspec/changes/${NEWER}`))).toBe(true)
    expect(livingAuth(root)).toBe(living)
    expect(changedPaths(before, hashTree(root))).toEqual([])
  })
})

describe("the resolution edits only the newer change's delta files (verification 6.2-6.3)", () => {
  test('both implemented: the newer ADDED becomes a full-content MODIFIED, then both archive in order', async () => {
    const root = await fixture()
    bodyDirects(root, '`## MODIFIED Requirements`')
    const before = hashTree(root)
    writeFileSync(join(root, `openspec/changes/${NEWER}/specs/auth/spec.md`), NEWER_AUTH_MODIFIED)
    const edited = changedPaths(before, hashTree(root))
    expect(edited.length).toBeGreaterThan(0)
    for (const p of edited) expect(p.startsWith(`openspec/changes/${NEWER}/specs/`)).toBe(true)

    await archiveInOrder(root)
    const living = livingAuth(root)
    expect(living).toContain('signs in with a password or through SSO')
    expect(living).toContain('Scenario: Password sign-in')
    expect(living).toContain('Scenario: SSO sign-in')
  })

  test('the MODIFIED must carry every scenario: dropping the older one is refused by archive/scenario-preservation', async () => {
    const root = await fixture()
    bodyDirects(root, 'every scenario')
    writeFileSync(
      join(root, `openspec/changes/${NEWER}/specs/auth/spec.md`),
      NEWER_AUTH_MODIFIED_DROPPING,
    )
    expect((await run(root, bodyArgv(root, ARCHIVE, OLDER))).exitCode).toBe(0)
    const refused = await run(root, bodyArgv(root, ARCHIVE, NEWER))
    expect(refused.exitCode).not.toBe(0)
    const said = `${refused.stdout}${refused.stderr}`
    expect(said).toContain('scenario-preservation gate refused')
    expect(said).toContain('missing: "Password sign-in"')
    expect(existsSync(join(root, `openspec/changes/${NEWER}`))).toBe(true)
  })

  test('only the older implemented: the newer colliding block is removed, then both archive', async () => {
    const root = await fixture()
    bodyDirects(root, 'remove its colliding `### Requirement:` blocks')
    const before = hashTree(root)
    // The newer auth delta held only the colliding block, so its file goes; `audit` remains.
    rmSync(join(root, `openspec/changes/${NEWER}/specs/auth`), { recursive: true })
    const edited = changedPaths(before, hashTree(root))
    expect(edited).toEqual([`openspec/changes/${NEWER}/specs/auth/spec.md`])

    await archiveInOrder(root)
    expect(livingAuth(root)).toContain('signs in with a password.')
    expect(livingAuth(root)).not.toContain('SSO')
    expect(readFileSync(join(root, 'openspec/specs/audit/spec.md'), 'utf8')).toContain(
      'Login audit',
    )
  })
})
