// Integration-suite constants + artifact authoring helpers. Everything an
// end-to-end lifecycle test needs to stand up a valid change without an agent,
// keyed to the DESIGN contracts (§3.2 matrix, §6.1 harness file map).

import { writeFiles } from '../fixtures/support.ts'

/** The 11 conventional-commit types = 11 cospec schemas (DESIGN §3.2). */
export const TYPES = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
] as const

/** The eleven workflow ids (DESIGN §6.1). */
export const WORKFLOWS = [
  'propose',
  'new',
  'continue',
  'ff',
  'apply',
  'verify',
  'archive',
  'bulk-archive',
  'sync-specs',
  'explore',
  'onboard',
] as const

/** Skill directory names per workflow (DESIGN §6.1). */
export const SKILLS = [
  'cospec-propose',
  'cospec-new-change',
  'cospec-continue-change',
  'cospec-ff-change',
  'cospec-apply-change',
  'cospec-verify-change',
  'cospec-archive-change',
  'cospec-bulk-archive-change',
  'cospec-sync-specs',
  'cospec-explore',
  'cospec-onboard',
] as const

/** Files a Claude init must produce, independent of gate/schema specifics. */
export function claudeInitPaths(): string[] {
  const paths = ['openspec/config.yaml', 'openspec/.cospec-manifest.json', '.claude/settings.json']
  for (const t of TYPES) paths.push(`openspec/schemas/${t}/schema.yaml`)
  for (const w of WORKFLOWS) paths.push(`.claude/commands/cospec/${w}.md`)
  for (const s of SKILLS) paths.push(`.claude/skills/${s}/SKILL.md`)
  return paths
}

const FULL_PROPOSAL = (cap: string): string => `# change

## Why

This capability does not exist yet and the team needs it to complete the flow;
without it the described behavior cannot ship at all, blocking downstream work.

## What Changes

- Introduce the ${cap} capability described in the spec deltas.

## Capabilities

### New Capabilities

- ${cap}

## Impact

- New capability ${cap}; no breaking changes.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

const LITE_PROPOSAL = `# change

## Why

The pipeline is missing a step and we are adding it now.

## What Changes

- Add the step.

## Impact

- Config only; no application source touched.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

export const BLOCKERS_EMPTY = `# Dependencies

## Blocked by

None.

## Soft-blocked by

None.
`

/** blocking-changes.md with one unchecked hard blocker on `slug`. */
export function blockersHard(slug: string): string {
  return `# Dependencies

## Blocked by

- [ ] \`${slug}\` — provides the prerequisite capability

## Soft-blocked by

None.
`
}

function tasks(done: boolean): string {
  const box = done ? 'x' : ' '
  return `## 1. Implementation

- [${box}] 1.1 Implement the capability
- [${box}] 1.2 Add a covering test
`
}

function specDelta(cap: string): string {
  return `## ADDED Requirements

### Requirement: ${cap} behavior

The system SHALL provide the ${cap} behavior when requested.

#### Scenario: ${cap} works

- **WHEN** a caller invokes ${cap}
- **THEN** the expected result is returned
`
}

export interface AuthorOptions {
  /** blocking-changes.md body; defaults to the empty (None./None.) shape. */
  blockers?: string
  /** mark all tasks complete (default false). */
  tasksDone?: boolean
}

/** Author a complete, valid `feat` change (proposal+blockers+specs+tasks). */
export function authorFeat(
  root: string,
  name: string,
  cap: string,
  opts: AuthorOptions = {},
): void {
  const c = `openspec/changes/${name}`
  writeFiles(root, {
    [`${c}/.openspec.yaml`]: 'schema: feat\ncreated: 2026-07-03\n',
    [`${c}/proposal.md`]: FULL_PROPOSAL(cap),
    [`${c}/blocking-changes.md`]: opts.blockers ?? BLOCKERS_EMPTY,
    [`${c}/specs/${cap}/spec.md`]: specDelta(cap),
    [`${c}/tasks.md`]: tasks(opts.tasksDone ?? false),
  })
}

/** Author a complete, valid `ci` change (proposal+blockers+tasks, no specs). */
export function authorCi(root: string, name: string, opts: AuthorOptions = {}): void {
  const c = `openspec/changes/${name}`
  writeFiles(root, {
    [`${c}/.openspec.yaml`]: 'schema: ci\ncreated: 2026-07-03\n',
    [`${c}/proposal.md`]: LITE_PROPOSAL,
    [`${c}/blocking-changes.md`]: opts.blockers ?? BLOCKERS_EMPTY,
    [`${c}/tasks.md`]: tasks(opts.tasksDone ?? false),
  })
}
