// The bare-`openspec` relay guard (plan §7.3, critique B2/B3).
//
// `cospec apply` relays two strings the wrapped binary writes —
// `instruction` and `warnings[]` — into both its human transcript and its
// `--json` payload. At 1.13.1 those strings carry OpenSpec's own remedies,
// which name the `openspec` binary directly; every agent-facing OpenSpec
// access is supposed to route through `cospec` (CLAUDE.md).
//
// Each literal below is the exact string the real 1.13.1 binary emitted
// during the re-probe, copied byte-for-byte from
// `openspec instructions apply --change <name> --json`. Their upstream
// sources are `describeArtifactRemedy` and `collectApplyWarnings` in
// `src/commands/workflow/instructions.ts`. The contract suite
// (`test/contract/apply-relay-guard.test.ts`) drives the same four paths
// through the real binary; this suite pins the rewrite itself, including the
// cases the binary does not currently produce but the guard must still get
// right.

import { describe, expect, test } from 'bun:test'

import { relayApplyInstructions, relayThroughCospec } from '../../../src/commands/apply.ts'
import type { ApplyInstructionsJson } from '../../../src/core/openspec.ts'

// --- the exact 1.13.1 strings ----------------------------------------------

/** `describeArtifactRemedy(name, id)` — one missing artifact named. */
const REMEDY_ONE =
  'Cannot apply this change yet. Missing artifacts: verification.\n' +
  'Create it with `openspec instructions verification --change v1-grandfathered`' +
  ' (`openspec status --change v1-grandfathered` shows what is left).'

/** `describeArtifactRemedy(name, undefined, { many: true })` — several left. */
const REMEDY_MANY =
  'Cannot apply this change yet. Missing artifacts: specs, verification, tasks.\n' +
  'Create each with `openspec instructions <artifact> --change legacy-blocked`' +
  ' (`openspec status --change legacy-blocked` shows what is left).'

/** The empty-`tasks.md` branch — two spans plus a bare filename. */
const REMEDY_EMPTY_TASKS =
  'The tasks.md file exists but contains no tasks to work on.\n' +
  'Add tasks to tasks.md, or rebuild it: Create it with' +
  ' `openspec instructions tasks --change empty-tasks`' +
  ' (`openspec status --change empty-tasks` shows what is left).'

/** `collectApplyWarnings` — the unread-delta-file warning (new at 1.13.1). */
const WARN_UNREAD_DELTA =
  "specs/widgets.md is not a capability's spec.md, so `openspec validate unread-delta`" +
  ' rejects it and archive never merges it. Move its requirements into specs/widgets/spec.md.'

/**
 * `collectApplyWarnings` — the no-delta-specs warning. The load-bearing detail
 * is the bare (un-backticked) absolute `metadataPath` in the tail: it ends
 * `.openspec.yaml` and sits inside a path with an `openspec/` segment, so a
 * token-level rewrite would corrupt a real filesystem path.
 */
const META_PATH = '/tmp/cospec-test-JEl7jn/openspec/changes/nospec-warn/.openspec.yaml'
const WARN_NO_DELTAS =
  'This change has no delta specs and does not declare `skip_specs: true`, so' +
  ' `openspec validate nospec-warn` fails on it. Write the delta specs before' +
  ' implementing (`openspec instructions specs --change nospec-warn`), or add' +
  ` \`skip_specs: true\` to ${META_PATH} if this change really changes no specified behavior.`

function baseInstructions(): ApplyInstructionsJson {
  return {
    changeName: 'c',
    changeDir: '/tmp/repo/openspec/changes/c',
    schemaName: 'feat',
    contextFiles: {},
    progress: { total: 0, complete: 0, remaining: 0 },
    tasks: [],
    state: 'ready',
    instruction: 'nothing to rewrite',
  }
}

describe('relayThroughCospec — the exact 1.13.1 remedy strings', () => {
  test('rewrites both spans of the one-artifact remedy', () => {
    expect(relayThroughCospec(REMEDY_ONE)).toBe(
      'Cannot apply this change yet. Missing artifacts: verification.\n' +
        'Create it with `cospec instructions verification --change v1-grandfathered`' +
        ' (`cospec status --change v1-grandfathered` shows what is left).',
    )
  })

  test('rewrites the many-artifact remedy, placeholder argument included', () => {
    expect(relayThroughCospec(REMEDY_MANY)).toBe(
      'Cannot apply this change yet. Missing artifacts: specs, verification, tasks.\n' +
        'Create each with `cospec instructions <artifact> --change legacy-blocked`' +
        ' (`cospec status --change legacy-blocked` shows what is left).',
    )
  })

  test('rewrites the empty-tasks remedy without touching the bare filename', () => {
    const out = relayThroughCospec(REMEDY_EMPTY_TASKS)
    expect(out).toContain('`cospec instructions tasks --change empty-tasks`')
    expect(out).toContain('`cospec status --change empty-tasks`')
    // `Add tasks to tasks.md` is prose about a file, not a command span.
    expect(out).toContain('Add tasks to tasks.md, or rebuild it:')
  })

  test('rewrites the unread-delta warning and leaves the spec paths alone', () => {
    const out = relayThroughCospec(WARN_UNREAD_DELTA)
    expect(out).toContain('`cospec validate unread-delta`')
    expect(out).toContain('specs/widgets.md')
    expect(out).toContain('specs/widgets/spec.md')
  })

  test('rewrites the no-delta-specs warning and leaves the .openspec.yaml path byte-identical', () => {
    const out = relayThroughCospec(WARN_NO_DELTAS)
    expect(out).toContain('`cospec validate nospec-warn`')
    expect(out).toContain('`cospec instructions specs --change nospec-warn`')
    // The anchor is the backtick span, so the un-backticked path survives whole
    // — including its `openspec/` segment and its `.openspec.yaml` basename.
    expect(out).toContain(META_PATH)
    expect(out).toContain('`skip_specs: true`')
  })

  test('no relayed 1.13.1 string keeps a bare-`openspec` command span', () => {
    for (const s of [
      REMEDY_ONE,
      REMEDY_MANY,
      REMEDY_EMPTY_TASKS,
      WARN_UNREAD_DELTA,
      WARN_NO_DELTAS,
    ]) {
      expect(s).toMatch(/`openspec /) // the input really does leak
      expect(relayThroughCospec(s)).not.toMatch(/`openspec /)
    }
  })
})

describe('relayThroughCospec — the rewrite boundary', () => {
  test('leaves a verb outside the 1.13.1 set alone rather than inventing a surface', () => {
    // `openspec new change <name>` is upstream's `newChangeHint`, which reaches
    // users through a thrown error, never through `instruction`/`warnings`.
    // Relaying it would claim a `cospec new change` surface that does not exist.
    const s = 'Run `openspec new change <name>` first, or `openspec archive foo`.'
    expect(relayThroughCospec(s)).toBe(s)
  })

  test('leaves an un-backticked mention of the binary alone', () => {
    const s = 'delegating to openspec; see openspec status for details'
    expect(relayThroughCospec(s)).toBe(s)
  })

  test('does not rewrite a path segment that merely starts with a verb name', () => {
    const s = 'wrote `openspec/changes/c/.openspec.yaml` and `openspec validateur`'
    expect(relayThroughCospec(s)).toBe(s)
  })

  test('rewrites a bare-argument span', () => {
    expect(relayThroughCospec('run `openspec status` now')).toBe('run `cospec status` now')
  })

  test('rewrites every span in a multi-span string', () => {
    const out = relayThroughCospec('`openspec validate a` then `openspec status --change a`')
    expect(out).toBe('`cospec validate a` then `cospec status --change a`')
  })
})

describe('relayApplyInstructions', () => {
  test('rewrites instruction and every warning', () => {
    const out = relayApplyInstructions({
      ...baseInstructions(),
      state: 'blocked',
      instruction: REMEDY_ONE,
      warnings: [WARN_UNREAD_DELTA, WARN_NO_DELTAS],
    })
    expect(out.instruction).not.toMatch(/`openspec /)
    for (const w of out.warnings!) expect(w).not.toMatch(/`openspec /)
    expect(out.warnings).toHaveLength(2)
  })

  test('absent advisory fields stay absent — never empty arrays', () => {
    const out = relayApplyInstructions(baseInstructions())
    // A payload from a wrapped binary that reported neither advisory field
    // must round-trip as "not reported", never as "reported empty": a consumer
    // reading `warnings: []` would conclude the binary checked and found
    // nothing. Both fields are optional on `ApplyInstructionsJson`.
    expect('warnings' in out).toBe(false)
    expect('missingPrerequisites' in out).toBe(false)
  })

  test('an empty warnings array stays an empty array', () => {
    const out = relayApplyInstructions({ ...baseInstructions(), warnings: [] })
    expect(out.warnings).toEqual([])
  })

  test('every other field is carried through unchanged', () => {
    const base = {
      ...baseInstructions(),
      state: 'blocked' as const,
      missingArtifacts: ['verification'],
      missingPrerequisites: ['verification'],
      contextFiles: { proposal: ['/tmp/repo/openspec/changes/c/proposal.md'] },
      progress: { total: 3, complete: 1, remaining: 2 },
      instruction: REMEDY_ONE,
    }
    const out = relayApplyInstructions(base)
    expect({ ...out, instruction: base.instruction }).toEqual(base)
  })
})
