import { describe, expect, test } from 'bun:test'
import { dirname, join } from 'node:path'

import {
  adapterFor,
  BODY_DIALECTS,
  buildClaudeCommandFrontmatter,
  buildOpencodeCommandFrontmatter,
  commandPath,
  HARNESS_NAMES,
  HARNESS_TABLE,
  type HarnessAdapter,
  type HarnessName,
  injectOpenCodeArgs,
  isBodyDialect,
  isHarnessName,
  legacySkillsRoots,
  removalRoots,
  renderCodexRules,
  scanRoots,
  serializeFrontmatter,
  skillPath,
  skillsRoot,
  transformBody,
} from '../../../src/harness/adapters.ts'
import { LEGACY_CODEX_SKILL_ROOT } from '../../../src/harness/legacy-skills.ts'

describe('isHarnessName', () => {
  test('accepts the four known harnesses and rejects others', () => {
    expect(isHarnessName('claude')).toBe(true)
    expect(isHarnessName('codex')).toBe(true)
    expect(isHarnessName('opencode')).toBe(true)
    expect(isHarnessName('agents')).toBe(true)
    expect(isHarnessName('cursor')).toBe(false)
    expect(isHarnessName('all')).toBe(false)
  })
})

describe('isBodyDialect', () => {
  test('accepts exactly the declared dialects', () => {
    for (const dialect of BODY_DIALECTS) expect(isBodyDialect(dialect)).toBe(true)
    expect(BODY_DIALECTS).toEqual(['canonical', 'shared', 'flat'])
    expect(isBodyDialect('codex')).toBe(false)
    expect(isBodyDialect('')).toBe(false)
  })
})

describe('transformBody', () => {
  const body = 'Run /cospec:apply then /cospec:archive when done.'
  const skillById = new Map([
    ['apply', 'cospec-apply-change'],
    ['archive', 'cospec-archive-change'],
  ])

  test('canonical leaves the body verbatim', () => {
    expect(transformBody(body, 'canonical', skillById)).toBe(body)
  })

  test('flat rewrites colon slashes to hyphen slashes', () => {
    expect(transformBody(body, 'flat', skillById)).toBe(
      'Run /cospec-apply then /cospec-archive when done.',
    )
  })

  test('flat with an explicit / respells to the / invocation', () => {
    expect(transformBody(body, 'flat', skillById, '/')).toBe(
      'Run /cospec-apply then /cospec-archive when done.',
    )
  })

  test('flat with @ respells to the @ invocation', () => {
    expect(transformBody(body, 'flat', skillById, '@')).toBe(
      'Run @cospec-apply then @cospec-archive when done.',
    )
  })

  test('shared respells each reference as its skill name in both invocation syntaxes', () => {
    expect(transformBody(body, 'shared', skillById)).toBe(
      'Run $cospec-apply-change (Codex) or /cospec-apply-change (other agents) then ' +
        '$cospec-archive-change (Codex) or /cospec-archive-change (other agents) when done.',
    )
  })

  test('shared leaves an unknown id verbatim so doctor still flags it as dangling', () => {
    expect(transformBody('see /cospec:nope', 'shared', skillById)).toBe('see /cospec:nope')
  })

  test('shared uses the skill name, not the workflow id — they differ for most workflows', () => {
    expect(transformBody('/cospec:apply', 'shared', skillById)).not.toContain('/cospec-apply ')
    expect(transformBody('/cospec:apply', 'shared', skillById)).toContain('cospec-apply-change')
  })
})

describe('injectOpenCodeArgs', () => {
  test('inserts the placeholder as its own paragraph before the first section', () => {
    const body = 'Do the thing.\n\n## 1. Pick the change\n\nbody\n'
    expect(injectOpenCodeArgs(body)).toBe(
      'Do the thing.\n\n**Provided arguments**: $ARGUMENTS\n\n## 1. Pick the change\n\nbody\n',
    )
  })

  test('is a no-op when the body already names an argument placeholder', () => {
    const withArgs = 'Do it with $ARGUMENTS.\n\n## 1. Go\n'
    expect(injectOpenCodeArgs(withArgs)).toBe(withArgs)
    const withPositional = 'Do it with $1.\n\n## 1. Go\n'
    expect(injectOpenCodeArgs(withPositional)).toBe(withPositional)
  })

  test('appends at the end when the body has no section heading', () => {
    expect(injectOpenCodeArgs('Just a paragraph.\n')).toBe(
      'Just a paragraph.\n\n**Provided arguments**: $ARGUMENTS\n',
    )
  })

  test('preserves CRLF line endings', () => {
    const body = 'Do the thing.\r\n\r\n## 1. Go\r\n'
    expect(injectOpenCodeArgs(body)).toBe(
      'Do the thing.\r\n\r\n**Provided arguments**: $ARGUMENTS\r\n\r\n## 1. Go\r\n',
    )
  })
})

describe('renderCodexRules', () => {
  const rules = renderCodexRules('cospec@test')
  test('pre-approves the read-only + gate set', () => {
    expect(rules).toContain('prefix_rule(pattern=["cospec", "validate"], decision="allow")')
    expect(rules).toContain('prefix_rule(pattern=["cospec", "apply"], decision="allow")')
    expect(rules).toContain(
      'prefix_rule(pattern=["cospec", "sync-blockers", "--check"], decision="allow")',
    )
  })
  test('never pre-approves archive', () => {
    expect(rules).not.toContain('"archive"')
  })
  test('is snapshot-stable', () => {
    expect(rules).toMatchSnapshot()
  })
})

describe('serializeFrontmatter', () => {
  test('emits a nested metadata block deterministically', () => {
    const out = serializeFrontmatter({
      name: 'cospec-apply-change',
      description: 'x',
      metadata: { author: 'cospec', generatedBy: 'cospec@test', contentHash: 'sha256:abc' },
    })
    expect(out).toMatchSnapshot()
  })
})

/** One workflow's rendered paths for a row — enough to see two rows collide. */
function pathsOf(row: HarnessAdapter): Set<string> {
  const out = new Set<string>([skillPath(row, 'cospec-propose')])
  const cmd = commandPath(row, 'propose')
  if (cmd !== undefined) out.add(cmd)
  if (row.rulesPath !== undefined) out.add(row.rulesPath)
  return out
}

describe('HARNESS_TABLE invariants', () => {
  test('HarnessName is the literal union of the table ids', () => {
    const ok: HarnessName = 'agents'
    // @ts-expect-error — an id the table does not declare is not a HarnessName
    const bad: HarnessName = 'cursor'
    expect<string[]>([ok, bad]).toEqual(['agents', 'cursor'])
  })

  test("ids are unique and HARNESS_NAMES is today's four, in today's order", () => {
    const ids = HARNESS_TABLE.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(HARNESS_NAMES).toEqual(['claude', 'codex', 'opencode', 'agents'])
    expect(HARNESS_NAMES).toEqual(ids)
  })

  test('namespacing agrees with the filename template on every row with commands', () => {
    for (const row of HARNESS_TABLE as readonly HarnessAdapter[]) {
      const c = row.commands
      if (c === undefined) continue
      expect(c.namespacing === 'namespaced').toBe(c.file === 'cospec/{command}')
      expect(c.namespacing === 'flat').toBe(c.file === 'cospec-{command}')
    }
  })

  test('rows whose rendered paths overlap declare the same bodyDialect', () => {
    const rows = HARNESS_TABLE as readonly HarnessAdapter[]
    let overlaps = 0
    for (const a of rows) {
      for (const b of rows) {
        if (a.id >= b.id) continue
        const shared = [...pathsOf(a)].some((p) => pathsOf(b).has(p))
        if (!shared) continue
        overlaps++
        expect(`${a.id}:${a.bodyDialect}`).toBe(`${a.id}:${b.bodyDialect}`)
      }
    }
    // codex and agents share `.agents/skills`; the check must not be vacuous.
    expect(overlaps).toBe(1)
  })

  test('the four rows are all repo-scoped, `/`-invoked and need no IDE restart', () => {
    for (const row of HARNESS_TABLE as readonly HarnessAdapter[]) {
      expect(skillsRoot(row).scope).toBe('project')
      expect(row.invocationPrefix).toBe('/')
      expect(row.requiresIdeRestart).toBe(false)
      expect(typeof row.setupNote).toBe('string')
    }
  })

  test("each command surface carries today's frontmatter builder and argument injection", () => {
    expect(adapterFor('claude').commands?.frontmatter).toBe(buildClaudeCommandFrontmatter)
    expect(adapterFor('claude').commands?.injectArguments).toBeUndefined()
    expect(adapterFor('opencode').commands?.frontmatter).toBe(buildOpencodeCommandFrontmatter)
    expect(adapterFor('opencode').commands?.injectArguments).toBe(true)
    expect(adapterFor('codex').commands).toBeUndefined()
    expect(adapterFor('agents').commands).toBeUndefined()
  })

  test('adapterFor refuses an id the table does not declare', () => {
    expect(() => adapterFor('cursor')).toThrow(/no harness adapter row for 'cursor'/)
  })
})

describe('HARNESS_TABLE derived roots', () => {
  test("scan roots are today's `.<id>` walk order", () => {
    expect(scanRoots()).toEqual(['.claude', '.codex', '.opencode', '.agents'])
  })

  test('removal roots are openspec plus every tool root', () => {
    expect(new Set(removalRoots())).toEqual(
      new Set(['openspec', '.claude', '.agents', '.opencode', '.codex']),
    )
    expect(removalRoots()).toHaveLength(5)
  })

  test("the codex row's legacy skills root is the one legacy-skills.ts migrates from", () => {
    expect(legacySkillsRoots(adapterFor('codex'))).toEqual([LEGACY_CODEX_SKILL_ROOT])
  })
})

interface UpstreamTool {
  value: string
  name: string
  skillsDir?: string
  globalSkillsDir?: string
  legacySkillsDirs?: string[]
  requiresIdeRestart?: boolean
  detectionPaths?: string[]
  searchAliases?: string[]
}

describe('HARNESS_TABLE against the pinned OpenSpec AI_TOOLS', async () => {
  // The package's exports map exposes only `.`, so the dist module is reached by path.
  const pkgJson = Bun.resolveSync(
    '@fission-ai/openspec/package.json',
    join(import.meta.dir, '../../../src'),
  )
  const config = (await import(join(dirname(pkgJson), 'dist/core/config.js'))) as {
    AI_TOOLS: UpstreamTool[]
  }
  const upstream = (id: string): UpstreamTool => {
    const tool = config.AI_TOOLS.find((t) => t.value === id)
    if (tool === undefined) throw new Error(`pinned AI_TOOLS has no '${id}' entry`)
    return tool
  }

  for (const id of HARNESS_NAMES) {
    test(`${id}: fields named after AI_TOOLS carry upstream's values`, () => {
      const row = adapterFor(id)
      const up = upstream(id)
      expect(row.displayName).toBe(up.name)
      expect(row.skillsDir).toBe(up.skillsDir)
      expect(row.globalSkillsDir).toBe(up.globalSkillsDir)
      expect(row.legacySkillsDirs).toEqual(up.legacySkillsDirs)
      expect(row.requiresIdeRestart).toBe(up.requiresIdeRestart ?? false)
    })
  }

  test("agents: searchAliases and detectionPaths equal upstream's", () => {
    const row = adapterFor('agents')
    const up = upstream('agents')
    expect(up.searchAliases).toBeDefined()
    expect<unknown>({
      searchAliases: row.searchAliases,
      detectionPaths: row.detectionPaths,
    }).toEqual({
      searchAliases: up.searchAliases,
      detectionPaths: up.detectionPaths,
    })
  })

  test('codex: detectionPaths deliberately diverge from upstream (tool-matrix aligns them)', () => {
    // Upstream's would select codex on an agents-only repo — a behaviour change this
    // refactor must not make. The `tool-matrix` change owns aligning it.
    expect(upstream('codex').detectionPaths).toEqual(['.agents/skills', '.codex/skills'])
    expect(adapterFor('codex').detectionPaths).toEqual(['.codex'])
  })
})
