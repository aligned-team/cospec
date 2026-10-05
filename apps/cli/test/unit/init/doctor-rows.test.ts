// Doctor's harness checks over fixture rows injected through its `table` seam:
// a reference is matched with the owning row's invocation prefix, a file under
// a row's non-primary root (a split commands/skills layout), under another
// row's primary root, or under a legacy skills root is still attributed to that
// row, and the scan collects each markdown row's commands by that row's
// own extension, so a `.prompt` command gets the stale-version, mixed-version
// and dangling-reference checks a `.md` one does.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  checkDanglingRefs,
  checkOpsx,
  checkStaleness,
  type Finding,
  harnessMarkdownFiles,
} from '../../../src/commands/doctor.ts'
import { findOpsxFiles } from '../../../src/commands/init.ts'
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

/** Antigravity's shape: skills in `.agents`, commands under `.agents/workflows`. */
const NESTED_ROW: HarnessAdapter = {
  id: 'nested-fixture',
  displayName: "Fixture tool whose commands sit under another row's primary root",
  skillsDir: '.agents',
  commands: {
    dir: '.agents/workflows',
    namespacing: 'flat',
    file: 'cospec-{command}',
    extension: '.md',
    serializer: 'markdown',
  },
  invocationPrefix: '/',
  bodyDialect: 'flat',
  requiresIdeRestart: false,
  detectionPaths: ['.agents/workflows'],
}

/** A legacy skills root under no primary root (upstream antigravity's `.agent`). */
const LEGACY_ROW: HarnessAdapter = {
  id: 'legacy-fixture',
  displayName: 'Fixture tool with a legacy skills root of its own',
  skillsDir: '.xnew',
  legacySkillsDirs: ['.xold'],
  invocationPrefix: '/',
  bodyDialect: 'flat',
  requiresIdeRestart: false,
  detectionPaths: ['.xnew'],
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

  test("a commands dir under an earlier row's primary root belongs to its own row", () => {
    // `.agents` is agents' primary root, but `.agents/workflows` is the fixture's surface.
    put(dir, '.agents/workflows/cospec-propose.md', 'Then run /cospec-apply.\n')
    put(dir, '.agents/workflows/cospec-apply.md', 'x\n')
    expect(danglingRefs(dir, [...HARNESS_TABLE, NESTED_ROW])).toEqual([])
  })

  test("a nested commands dir's missing target is reported under its own row", () => {
    put(dir, '.agents/workflows/cospec-propose.md', 'Then run /cospec-apply.\n')
    expect(danglingRefs(dir, [...HARNESS_TABLE, NESTED_ROW]).map((f) => f.message)).toEqual([
      '.agents/workflows/cospec-propose.md references /cospec:apply, but no nested-fixture skill or command file for it exists',
    ])
  })

  test('a shared skills root keeps its primary owner when a later row shares it', () => {
    put(dir, '.agents/skills/cospec-explore/SKILL.md', 'Then run /cospec-apply-change.\n')
    expect(danglingRefs(dir, [...HARNESS_TABLE, NESTED_ROW]).map((f) => f.message)).toEqual([
      '.agents/skills/cospec-explore/SKILL.md references /cospec:apply, but no agents skill or command file for it exists',
    ])
  })

  test('a legacy skills root no primary root covers is still checked', () => {
    put(dir, '.xold/skills/cospec-propose/SKILL.md', 'Then run /cospec-bogus.\n')
    expect(danglingRefs(dir, [LEGACY_ROW]).map((f) => f.message)).toEqual([
      '.xold/skills/cospec-propose/SKILL.md references /cospec:bogus, which is not a known cospec workflow',
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

describe("the opsx leftover scans read each row's command extension", () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  const LEFTOVER = '.prompt-fixture/prompts/opsx-propose.prompt'

  test("init finds an openspec-authored .prompt command in the row's commands dir", () => {
    put(dir, LEFTOVER, '---\nname: "OPSX: Propose"\n---\nbody\n')
    put(dir, '.prompt-fixture/prompts/mine.prompt', '---\nname: Mine\n---\nbody\n')
    expect(findOpsxFiles(dir, [PROMPT_ROW])).toEqual([{ relpath: LEFTOVER }])
  })

  test('doctor warns on the same .prompt leftover', () => {
    put(dir, LEFTOVER, '---\nname: "OPSX: Propose"\n---\nbody\n')
    const findings: Finding[] = []
    checkOpsx(dir, findings, [PROMPT_ROW])
    expect(findings.map((f) => `${f.check} ${f.level} ${f.message}`)).toEqual([
      `opsx-leftover WARNING leftover openspec (opsx) file: ${LEFTOVER} — two propose commands confuse agents`,
    ])
  })
})

// Verification 2.4 (harness-receipt-and-doctor-scope): a harness document is a
// file at a path cospec generates, matched by shape on the full root.
describe("doctor's harness scan collects only the paths cospec generates", () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  test('a SKILL.md deeper than one directory under a skills root is not collected', () => {
    put(dir, '.claude/skills/x/y/SKILL.md', managed('cospec@0.0.1', 'Run /cospec:bogus.\n'))
    expect(harnessMarkdownFiles(dir, HARNESS_TABLE)).toEqual([])
  })

  test("a legacy skills root's <skill>/SKILL.md is still collected", () => {
    put(dir, '.codex/skills/cospec-propose/SKILL.md', managed(CURRENT_GENERATED_BY, 'x\n'))
    expect(harnessMarkdownFiles(dir, HARNESS_TABLE).map((f) => f.relpath)).toEqual([
      '.codex/skills/cospec-propose/SKILL.md',
    ])
  })
})

// Verification 3.2 (harness-receipt-and-doctor-scope): upstream's legacy
// command paths — `.claude/commands/opsx/<id>.md` and
// `.opencode/commands/opsx-<id>.md`, from the pinned 1.13.1 dist's
// `core/command-generation/adapters/{claude,opencode}.js` — are no harness
// document, yet stay reachable through the leftover scan. The Claude fixture is
// that adapter's frontmatter; the OpenCode adapter writes `description` only,
// so its fixture carries the `name: "OPSX: …"` marker the provenance check
// reads, to prove the path is still walked.
describe("the opsx leftover scan still reads upstream's legacy command paths", () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  const CLAUDE_LEFTOVER = '.claude/commands/opsx/propose.md'
  const OPENCODE_LEFTOVER = '.opencode/commands/opsx-propose.md'

  function plant(): void {
    put(
      dir,
      CLAUDE_LEFTOVER,
      '---\nname: "OPSX: Propose"\ndescription: "Propose a new change"\nallowed-tools: Bash(openspec *)\ncategory: "Workflow"\ntags: ["workflow", "artifacts"]\n---\n\nbody\n',
    )
    put(dir, OPENCODE_LEFTOVER, '---\nname: "OPSX: Propose"\ndescription: "Propose"\n---\n\nbody\n')
  }

  test('init lists both', () => {
    plant()
    expect(findOpsxFiles(dir)).toEqual([
      { relpath: CLAUDE_LEFTOVER },
      { relpath: OPENCODE_LEFTOVER },
    ])
  })

  test('doctor warns on both', () => {
    plant()
    const findings: Finding[] = []
    checkOpsx(dir, findings)
    expect(findings.map((f) => `${f.check} ${f.level} ${f.message}`)).toEqual([
      `opsx-leftover WARNING leftover openspec (opsx) file: ${CLAUDE_LEFTOVER} — two propose commands confuse agents`,
      `opsx-leftover WARNING leftover openspec (opsx) file: ${OPENCODE_LEFTOVER} — two propose commands confuse agents`,
    ])
  })
})

// Verification 2.1–2.3 (opsx-leftover-scan-scope): the opsx leftover scan's
// walk never crosses into a nested git working tree — a directory holding its
// own `.git` entry, such as a `.claude/worktrees/<name>/` checkout — so a copy
// of the project living there is never listed or removed by the outer scan.
describe('the opsx leftover scan does not cross a nested worktree boundary', () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  const WT_LEFTOVER = '.claude/worktrees/wt/.claude/commands/opsx/apply.md'
  const OUTER_LEFTOVER = '.claude/commands/opsx/apply.md'

  function plantNestedWorktree(): void {
    // `git worktree add` writes `.git` as a *file* (a gitdir pointer), not a
    // directory — the boundary check must key on existence, not `isDirectory()`.
    put(dir, '.claude/worktrees/wt/.git', 'gitdir: /elsewhere/.git/worktrees/wt\n')
    put(dir, WT_LEFTOVER, "---\nname: 'OPSX: Apply'\n---\nreal openspec command\n")
  }

  test('a real leftover inside a nested worktree checkout is not listed', () => {
    plantNestedWorktree()
    expect(findOpsxFiles(dir)).toEqual([])
  })

  test("doctor's opsx-leftover never names a path under .claude/worktrees/", () => {
    plantNestedWorktree()
    const findings: Finding[] = []
    checkOpsx(dir, findings)
    expect(findings.filter((f) => f.message.includes('.claude/worktrees/'))).toEqual([])
  })

  test('a sibling leftover outside any nested worktree is still (and only) found', () => {
    plantNestedWorktree()
    put(dir, OUTER_LEFTOVER, "---\nname: 'OPSX: Apply'\n---\nreal openspec command\n")
    expect(findOpsxFiles(dir)).toEqual([{ relpath: OUTER_LEFTOVER }])
  })
})

// Verification 3.1–3.3 (opsx-leftover-scan-scope): OpenCode's command adapter
// (pinned 1.13.1 dist's `core/command-generation/adapters/opencode.js`) writes
// frontmatter with only `description` — no `name`, no `metadata` — so neither
// existing provenance marker ever matches a real OpenCode opsx leftover. The
// body excerpt below is trimmed from the pinned binary's own probed
// `init --tools opencode` output, keeping the frontmatter shape and the
// literal `` `openspec list --json` `` reference every opsx workflow body
// carries (the pinned dist's shared `PROJECT_ROOT_GUARD` template).
describe('a real OpenCode opsx command leftover is detected by its own shape', () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  const OPENCODE_REAL_LEFTOVER = '.opencode/commands/opsx-propose.md'
  const REAL_SHAPE = `---
description: "Propose a new change - create it and generate all artifacts in one step"
---

Propose a new change - create the change and generate all artifacts in one step.

**Store selection:** If the user names a store (a store is a standalone OpenSpec repo registered on this machine) or the work lives in one, run \`openspec store list --json\` to discover registered store ids, then pass \`--store <id>\` on the commands that read or write specs and changes.

**Project check:** These steps expect a project that already uses OpenSpec. Before the first step that writes anything, confirm the project has a root: run \`openspec list --json\` (with \`--store <id>\` when a store is selected, since the store is then the root) and read \`root\`.
`

  const OPENCODE_USER_NOTES = '.opencode/commands/opsx-notes.md'
  const USER_SHAPE =
    '---\ndescription: my personal opencode notes\n---\n\nJust my own checklist, nothing to do with openspec.\n'

  test.failing('init lists and removes the real OpenCode shape', () => {
    put(dir, OPENCODE_REAL_LEFTOVER, REAL_SHAPE)
    expect(findOpsxFiles(dir)).toEqual([{ relpath: OPENCODE_REAL_LEFTOVER }])
  })

  test.failing("doctor's opsx-leftover fires on the real OpenCode shape", () => {
    put(dir, OPENCODE_REAL_LEFTOVER, REAL_SHAPE)
    const findings: Finding[] = []
    checkOpsx(dir, findings)
    expect(findings.map((f) => `${f.check} ${f.level} ${f.message}`)).toEqual([
      `opsx-leftover WARNING leftover openspec (opsx) file: ${OPENCODE_REAL_LEFTOVER} — two propose commands confuse agents`,
    ])
  })

  test('a user file at the same path shape with no body marker is never listed', () => {
    put(dir, OPENCODE_USER_NOTES, USER_SHAPE)
    expect(findOpsxFiles(dir)).toEqual([])
    const findings: Finding[] = []
    checkOpsx(dir, findings)
    expect(findings).toEqual([])
  })
})
