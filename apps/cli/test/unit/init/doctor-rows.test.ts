// Doctor's harness checks over fixture rows injected through its `table` seam:
// a reference is matched with the owning row's invocation prefix, a file under
// a row's non-primary root (a split commands/skills layout) is still attributed
// to that row, and the scan collects each markdown row's commands by that row's
// own extension, so a `.prompt` command gets the stale-version, mixed-version
// and dangling-reference checks a `.md` one does.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  checkDanglingRefs,
  checkStaleness,
  type Finding,
  harnessMarkdownFiles,
} from '../../../src/commands/doctor.ts'
import { CURRENT_GENERATED_BY } from '../../../src/core/managed-files.ts'
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

/** Continue's shape: markdown commands with a `.prompt` extension. */
const PROMPT_ROW: HarnessAdapter = {
  id: 'prompt-fixture',
  displayName: 'Fixture tool with .prompt commands',
  skillsDir: '.prompt-fixture',
  commands: {
    dir: '.prompt-fixture/prompts',
    namespacing: 'flat',
    file: 'cospec-{command}',
    extension: '.prompt',
    serializer: 'markdown',
  },
  invocationPrefix: '/',
  bodyDialect: 'flat',
  requiresIdeRestart: false,
  detectionPaths: ['.prompt-fixture'],
}

/** Gemini's shape: TOML commands, which carry no frontmatter and are manifest-tracked. */
const TOML_ROW: HarnessAdapter = {
  id: 'toml-fixture',
  displayName: 'Fixture tool with TOML commands',
  skillsDir: '.toml-fixture',
  commands: {
    dir: '.toml-fixture/commands',
    namespacing: 'namespaced',
    file: 'cospec/{command}',
    extension: '.toml',
    serializer: 'toml',
  },
  invocationPrefix: '/',
  bodyDialect: 'flat',
  requiresIdeRestart: false,
  detectionPaths: ['.toml-fixture'],
}

/** A cospec-generated file stamped with `generatedBy`. */
function managed(generatedBy: string, body: string): string {
  return `---\ndescription: fixture\nmetadata:\n  author: cospec\n  generatedBy: ${generatedBy}\n  contentHash: sha256:fixture\n---\n${body}`
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

describe("doctor's harness scan reads each row's command extension", () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  test('a .prompt command is collected beside the skills', () => {
    put(dir, '.prompt-fixture/prompts/cospec-apply.prompt', managed(CURRENT_GENERATED_BY, 'x\n'))
    put(
      dir,
      '.prompt-fixture/skills/cospec-apply-change/SKILL.md',
      managed(CURRENT_GENERATED_BY, 'x\n'),
    )
    expect(
      harnessMarkdownFiles(dir, [PROMPT_ROW])
        .map((f) => f.relpath)
        .toSorted(),
    ).toEqual([
      '.prompt-fixture/prompts/cospec-apply.prompt',
      '.prompt-fixture/skills/cospec-apply-change/SKILL.md',
    ])
  })

  test('a stale .prompt command is a stale-harness WARNING and mixes versions', () => {
    put(dir, '.prompt-fixture/prompts/cospec-apply.prompt', managed('cospec@0.0.1', 'x\n'))
    put(
      dir,
      '.prompt-fixture/skills/cospec-apply-change/SKILL.md',
      managed(CURRENT_GENERATED_BY, 'x\n'),
    )
    const findings: Finding[] = []
    checkStaleness(harnessMarkdownFiles(dir, [PROMPT_ROW]), findings)
    expect(findings).toEqual([
      {
        level: 'WARNING',
        check: 'stale-harness',
        message: `.prompt-fixture/prompts/cospec-apply.prompt was generated by cospec@0.0.1 (current is ${CURRENT_GENERATED_BY})`,
        remedy: 'run `cospec update`',
      },
      {
        level: 'WARNING',
        check: 'mixed-versions',
        message: `harness files carry mixed generator versions: ${['cospec@0.0.1', CURRENT_GENERATED_BY].toSorted().join(', ')}`,
        remedy: 'run `cospec update` to bring every file to the current version',
      },
    ])
  })

  test('a dangling reference in a .prompt command is an ERROR', () => {
    put(
      dir,
      '.prompt-fixture/prompts/cospec-apply.prompt',
      managed(CURRENT_GENERATED_BY, 'Then run /cospec-bogus.\n'),
    )
    expect(danglingRefs(dir, [PROMPT_ROW]).map((f) => f.message)).toEqual([
      '.prompt-fixture/prompts/cospec-apply.prompt references /cospec:bogus, which is not a known cospec workflow',
    ])
  })

  test("a .prompt file outside the row's commands dir is not a harness file", () => {
    put(dir, '.prompt-fixture/notes/cospec-apply.prompt', managed('cospec@0.0.1', 'x\n'))
    expect(harnessMarkdownFiles(dir, [PROMPT_ROW])).toEqual([])
  })

  test("a TOML row's commands are left to the manifest, its skills still scanned", () => {
    put(
      dir,
      '.toml-fixture/commands/cospec/apply.toml',
      'description = "x"\nprompt = "/cospec-bogus"\n',
    )
    put(
      dir,
      '.toml-fixture/skills/cospec-apply-change/SKILL.md',
      managed(CURRENT_GENERATED_BY, 'x\n'),
    )
    expect(harnessMarkdownFiles(dir, [TOML_ROW]).map((f) => f.relpath)).toEqual([
      '.toml-fixture/skills/cospec-apply-change/SKILL.md',
    ])
  })
})
