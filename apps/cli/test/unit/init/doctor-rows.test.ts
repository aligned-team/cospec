// Doctor's dangling-ref check over fixture rows injected through its `table`
// seam: a reference is matched with the owning row's invocation prefix, and a
// file under a row's non-primary root (a split commands/skills layout) is still
// attributed to that row.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  checkDanglingRefs,
  type Finding,
  harnessMarkdownFiles,
} from '../../../src/commands/doctor.ts'
import { HARNESS_TABLE, type HarnessAdapter } from '../../../src/harness/adapters.ts'
import { cleanup, makeRepo } from './helpers.ts'

/** Amazon Q's shape: flat commands invoked with `@`. */
const AT_ROW: HarnessAdapter = {
  id: 'at-fixture',
  displayName: 'Fixture tool invoked with @',
  skillsDir: '.at-fixture',
  commands: {
    dir: '.at-fixture/prompts',
    namespacing: 'flat',
    file: 'cospec-{command}',
    extension: '.md',
    serializer: 'markdown',
  },
  invocationPrefix: '@',
  bodyDialect: 'flat',
  requiresIdeRestart: false,
  detectionPaths: ['.at-fixture'],
}

/** Cline's shape: commands under `.clinerules`, skills under `.cline`. */
const SPLIT_ROW: HarnessAdapter = {
  id: 'split-fixture',
  displayName: 'Fixture tool with split roots',
  skillsDir: '.split-skills',
  commands: {
    dir: '.split-rules/workflows',
    namespacing: 'flat',
    file: 'cospec-{command}',
    extension: '.md',
    serializer: 'markdown',
  },
  invocationPrefix: '/',
  bodyDialect: 'flat',
  requiresIdeRestart: false,
  detectionPaths: ['.split-rules'],
}

function put(dir: string, relpath: string, text: string): void {
  mkdirSync(dirname(join(dir, relpath)), { recursive: true })
  writeFileSync(join(dir, relpath), text)
}

function danglingRefs(dir: string, table: readonly HarnessAdapter[]): Finding[] {
  const findings: Finding[] = []
  checkDanglingRefs(dir, harnessMarkdownFiles(dir, table), findings, table)
  return findings.filter((f) => f.check === 'dangling-ref')
}

describe('doctor dangling-ref check over injected rows', () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  test('an @-prefix row: an unknown @cospec-<id> is a dangling ERROR', () => {
    put(dir, '.at-fixture/prompts/cospec-apply.md', 'Then run @cospec-nonexistent.\n')
    expect(danglingRefs(dir, [AT_ROW])).toEqual([
      {
        level: 'ERROR',
        check: 'dangling-ref',
        message:
          '.at-fixture/prompts/cospec-apply.md references /cospec:nonexistent, which is not a known cospec workflow',
        remedy: 'run `cospec update` to regenerate from canon',
      },
    ])
  })

  test('an @-prefix row: @cospec-<id> resolves against its own files', () => {
    put(dir, '.at-fixture/prompts/cospec-apply.md', 'Then run @cospec-apply and @cospec-verify.\n')
    // `apply` has its command file; `verify` has neither skill nor command.
    expect(danglingRefs(dir, [AT_ROW]).map((f) => f.message)).toEqual([
      '.at-fixture/prompts/cospec-apply.md references /cospec:verify, but no at-fixture skill or command file for it exists',
    ])
  })

  test("a split-root row's skills tree is attributed to the row and checked", () => {
    put(dir, '.split-rules/workflows/cospec-explore.md', 'See /cospec-explore.\n')
    put(dir, '.split-skills/skills/cospec-explore/SKILL.md', 'Then run /cospec-bogus.\n')
    expect(danglingRefs(dir, [SPLIT_ROW]).map((f) => f.message)).toEqual([
      '.split-skills/skills/cospec-explore/SKILL.md references /cospec:bogus, which is not a known cospec workflow',
    ])
  })

  test("a split-root row's skills resolve a reference from its commands root", () => {
    put(dir, '.split-skills/skills/cospec-explore/SKILL.md', 'See /cospec-explore.\n')
    put(dir, '.split-rules/workflows/cospec-onboard.md', 'Then run /cospec-explore.\n')
    expect(danglingRefs(dir, [SPLIT_ROW])).toEqual([])
  })

  test('a primary-root match still wins over another row whose skills root covers the file', () => {
    // `.agents/skills` is codex's skills root but agents' primary root: agents owns it.
    put(dir, '.agents/skills/cospec-explore/SKILL.md', 'Then run /cospec-apply-change.\n')
    expect(danglingRefs(dir, HARNESS_TABLE).map((f) => f.message)).toEqual([
      '.agents/skills/cospec-explore/SKILL.md references /cospec:apply, but no agents skill or command file for it exists',
    ])
  })
})
