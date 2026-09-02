import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'

import {
  hashBody,
  type HarnessName,
  renderHarnessFiles,
  renderTypeTable,
} from '../../../src/harness/render.ts'
import {
  ARG_WORKFLOWS,
  TEST_VERSION,
  TYPE_TABLE,
  WORKFLOW_COMMANDS,
  WORKFLOW_SKILLS,
} from './fixtures.ts'

const ALL: HarnessName[] = ['claude', 'codex', 'opencode']

function render(harnesses: HarnessName[] = ALL) {
  return renderHarnessFiles({ harnesses, typeTable: TYPE_TABLE, version: TEST_VERSION })
}

describe('renderHarnessFiles — file set', () => {
  test('emits the expected path set for all three harnesses', () => {
    const paths = render()
      .map((f) => f.path)
      .toSorted()
    expect(paths).toMatchSnapshot()
  })

  test('claude emits 12 commands + 12 skills, no rules', () => {
    const files = render(['claude'])
    expect(files.filter((f) => f.kind === 'command')).toHaveLength(12)
    expect(files.filter((f) => f.kind === 'skill')).toHaveLength(12)
    expect(files.filter((f) => f.kind === 'rules')).toHaveLength(0)
  })

  test('codex emits 12 skills + 1 rules, no commands', () => {
    const files = render(['codex'])
    expect(files.filter((f) => f.kind === 'skill')).toHaveLength(12)
    expect(files.filter((f) => f.kind === 'rules')).toHaveLength(1)
    expect(files.filter((f) => f.kind === 'command')).toHaveLength(0)
  })

  test('opencode emits 12 commands + 12 skills, no rules', () => {
    const files = render(['opencode'])
    expect(files.filter((f) => f.kind === 'command')).toHaveLength(12)
    expect(files.filter((f) => f.kind === 'skill')).toHaveLength(12)
    expect(files.filter((f) => f.kind === 'rules')).toHaveLength(0)
  })

  test('every workflow command + skill exists per surface-bearing harness', () => {
    for (const harness of ['claude', 'opencode'] as HarnessName[]) {
      const files = render([harness])
      for (const cmd of WORKFLOW_COMMANDS) {
        expect(files.some((f) => f.kind === 'command' && f.workflow === cmd)).toBe(true)
      }
    }
    for (const skill of WORKFLOW_SKILLS) {
      expect(render(['codex']).some((f) => f.path.includes(`${skill}/SKILL.md`))).toBe(true)
    }
  })
})

describe('renderHarnessFiles — content snapshots', () => {
  for (const harness of ALL) {
    test(`${harness} full render is stable`, () => {
      const files = render([harness]).map((f) => ({
        path: f.path,
        kind: f.kind,
        content: f.content,
      }))
      expect(files).toMatchSnapshot()
    })
  }
})

describe('renderHarnessFiles — content hash', () => {
  test('contentHash equals sha256 of the body section verbatim', () => {
    for (const f of render()) {
      if (f.contentHash === null) continue
      // The body section is everything after the closing frontmatter delimiter.
      const bodySection = f.content.slice(f.content.indexOf('\n---\n') + '\n---\n'.length)
      const expected = `sha256:${createHash('sha256').update(bodySection, 'utf8').digest('hex')}`
      expect(f.contentHash).toBe(expected)
    }
  })

  test('contentHash is body-only — a version bump does not change it', () => {
    const a = renderHarnessFiles({ harnesses: ALL, typeTable: TYPE_TABLE, version: 'cospec@1.0.0' })
    const b = renderHarnessFiles({ harnesses: ALL, typeTable: TYPE_TABLE, version: 'cospec@9.9.9' })
    expect(a).toHaveLength(b.length)
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.contentHash).toBe(b[i]!.contentHash)
      // ...but the generatedBy stamp in the content differs.
      if (a[i]!.frontmatter !== null) {
        expect(a[i]!.content).not.toBe(b[i]!.content)
      }
    }
  })

  test('command and skill of the same workflow share a body hash (claude)', () => {
    const files = render(['claude'])
    for (const cmd of WORKFLOW_COMMANDS) {
      const command = files.find((f) => f.kind === 'command' && f.workflow === cmd)!
      const skill = files.find((f) => f.kind === 'skill' && f.workflow === cmd)!
      expect(command.contentHash).toBe(skill.contentHash)
    }
  })

  test('hashBody matches the crypto reference', () => {
    const body = '\nhello world\n'
    expect(hashBody(body)).toBe(`sha256:${createHash('sha256').update(body, 'utf8').digest('hex')}`)
  })
})

describe('type table injection', () => {
  test('propose and new bodies contain the rendered table; others do not', () => {
    const table = renderTypeTable(TYPE_TABLE)
    for (const f of render()) {
      if (f.workflow === 'propose' || f.workflow === 'new') {
        expect(f.body).toContain('| feat | A new feature')
        expect(f.body).not.toContain('{{TYPE_TABLE}}')
      } else if (f.kind !== 'rules') {
        expect(f.body).not.toContain('{{TYPE_TABLE}}')
        expect(f.body).not.toContain(table)
      }
    }
  })

  test('renderTypeTable emits one row per type with all three fields', () => {
    const table = renderTypeTable(TYPE_TABLE)
    expect(table.split('\n')).toHaveLength(TYPE_TABLE.length + 2) // header + separator + rows
    expect(table).toContain('| ci | CI configuration and automation pipeline change |')
  })
})

describe('slash-syntax substitution', () => {
  test('opencode bodies use hyphen slashes; claude/codex keep colon slashes', () => {
    const opencode = render(['opencode']).find(
      (f) => f.workflow === 'apply' && f.kind === 'command',
    )!
    expect(opencode.body).toContain('/cospec-archive')
    expect(opencode.body).not.toContain('/cospec:archive')

    const claude = render(['claude']).find((f) => f.workflow === 'apply' && f.kind === 'command')!
    expect(claude.body).toContain('/cospec:archive')

    const codex = render(['codex']).find((f) => f.workflow === 'apply')!
    expect(codex.body).toContain('/cospec:archive')
  })
})

describe('OpenCode $ARGUMENTS injection', () => {
  const argWorkflows = new Set<string>(ARG_WORKFLOWS)

  test('every arg-taking opencode command names the placeholder exactly once', () => {
    for (const f of render(['opencode'])) {
      if (f.kind !== 'command') continue
      const occurrences = f.body.split('$ARGUMENTS').length - 1
      expect([f.workflow, occurrences]).toEqual([f.workflow, argWorkflows.has(f.workflow!) ? 1 : 0])
    }
  })

  test('skill bodies never carry the placeholder — nothing substitutes it there', () => {
    for (const f of render()) {
      if (f.kind === 'skill') expect(f.body).not.toContain('$ARGUMENTS')
    }
  })

  test('claude commands never carry it either (Claude binds arguments implicitly)', () => {
    for (const f of render(['claude'])) expect(f.body).not.toContain('$ARGUMENTS')
  })

  test('an opencode command and its skill hash differently when args are injected', () => {
    const files = render(['opencode'])
    for (const id of ARG_WORKFLOWS) {
      const command = files.find((f) => f.kind === 'command' && f.workflow === id)!
      const skill = files.find((f) => f.kind === 'skill' && f.workflow === id)!
      expect(command.contentHash).not.toBe(skill.contentHash)
    }
    // ...and identically when they are not.
    const command = files.find((f) => f.kind === 'command' && f.workflow === 'onboard')!
    const skill = files.find((f) => f.kind === 'skill' && f.workflow === 'onboard')!
    expect(command.contentHash).toBe(skill.contentHash)
  })
})

describe('runtime-neutral prose', () => {
  // Bodies render byte-identically into Codex and OpenCode, neither of which has
  // Claude Code's AskUserQuestion or TodoWrite tools; naming them there is an
  // instruction the runtime cannot follow (OpenSpec's own #1403/#1464 bug).
  test('no generated body names a Claude-only tool', () => {
    for (const f of render()) {
      expect(f.body).not.toContain('AskUserQuestion')
      expect(f.body).not.toContain('TodoWrite')
    }
  })
})
