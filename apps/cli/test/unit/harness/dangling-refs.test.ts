import { describe, expect, test } from 'bun:test'

import { type HarnessName, renderHarnessFiles } from '../../../src/harness/render.ts'
import { TEST_VERSION, TYPE_TABLE, WORKFLOW_COMMANDS, WORKFLOW_SKILLS } from './fixtures.ts'

const ALL: HarnessName[] = ['claude', 'codex', 'opencode', 'agents']

const files = renderHarnessFiles({ harnesses: ALL, typeTable: TYPE_TABLE, version: TEST_VERSION })

const KNOWN_COMMANDS = new Set<string>(WORKFLOW_COMMANDS)
const KNOWN_SKILLS = new Set<string>(WORKFLOW_SKILLS)

/**
 * The regression guard against OpenSpec's shipped bug (research openspec-cli-probe §2.3): its
 * generated bodies referenced `openspec-sync-specs` / `openspec-continue-change` skills the
 * generator never emitted. cospec's bodies may only reference the twelve workflows it always emits.
 */
describe('no dangling workflow references', () => {
  test('every /cospec:x or /cospec-x slash token resolves to a workflow or a skill', () => {
    // The shared `.agents` dialect respells references as SKILL names (`/cospec-apply-change`),
    // so a slash token legitimately resolves either way. Doctor's checkDanglingRefs applies
    // the same two-way resolution — this is the render-side half of that contract.
    const slash = /\/cospec[:-]([a-z][a-z0-9-]*)/g
    for (const f of files) {
      for (const m of f.body.matchAll(slash)) {
        const token = m[1]!
        const resolved = KNOWN_COMMANDS.has(token) || KNOWN_SKILLS.has(`cospec-${token}`)
        expect([f.path, token, resolved]).toEqual([f.path, token, true])
      }
    }
  })

  test('the shared dialect never emits a bare `/cospec-<id>` that has no command file', () => {
    // `.agents/skills` emits no command files, so only the skill spelling may appear there.
    for (const f of files) {
      if (!f.path.startsWith('.agents/')) continue
      for (const m of f.body.matchAll(/\/cospec[:-]([a-z][a-z0-9-]*)/g)) {
        expect([f.path, m[1]!, KNOWN_SKILLS.has(`cospec-${m[1]!}`)]).toEqual([f.path, m[1]!, true])
      }
    }
  })

  test('every cospec-<skill> token names an emitted skill', () => {
    // Match skill-style tokens (`cospec-foo-bar`) but not CLI subcommands (`cospec foo`).
    const skillRef = /\bcospec-[a-z][a-z-]*\b/g
    for (const f of files) {
      for (const m of f.body.matchAll(skillRef)) {
        const token = m[0]
        // Slash-command tokens are validated separately; skip the opencode `/cospec-x` forms.
        if (KNOWN_COMMANDS.has(token.slice('cospec-'.length))) continue
        expect(KNOWN_SKILLS.has(token)).toBe(true)
      }
    }
  })

  test('every emitted workflow is actually reachable as a file', () => {
    for (const cmd of WORKFLOW_COMMANDS) {
      expect(files.some((f) => f.workflow === cmd)).toBe(true)
    }
  })
})
