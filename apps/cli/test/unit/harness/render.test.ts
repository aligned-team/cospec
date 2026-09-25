import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'

import {
  adapterFor,
  buildOpencodeCommandFrontmatter,
  type CommandSurface,
  type HarnessAdapter,
} from '../../../src/harness/adapters.ts'
import {
  escapeTomlBasicString,
  escapeTomlMultilineBasicString,
  hashBody,
  type HarnessName,
  renderHarnessFiles,
  renderTypeTable,
  serializeTomlCommand,
} from '../../../src/harness/render.ts'
import {
  ARG_WORKFLOWS,
  TEST_VERSION,
  TYPE_TABLE,
  WORKFLOW_COMMANDS,
  WORKFLOW_SKILLS,
} from './fixtures.ts'

const ALL: HarnessName[] = ['claude', 'codex', 'opencode', 'agents']

function render(harnesses: HarnessName[] = ALL) {
  return renderHarnessFiles({ harnesses, typeTable: TYPE_TABLE, version: TEST_VERSION })
}

describe('renderHarnessFiles — file set', () => {
  test('emits the expected path set for all four harnesses', () => {
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

  test('agents emits 12 skills under the shared root, no commands and no rules', () => {
    const files = render(['agents'])
    expect(files.filter((f) => f.kind === 'skill')).toHaveLength(12)
    expect(files.filter((f) => f.kind === 'command')).toHaveLength(0)
    expect(files.filter((f) => f.kind === 'rules')).toHaveLength(0)
    for (const f of files) expect(f.path.startsWith('.agents/skills/')).toBe(true)
  })

  test('claude and opencode write nothing under the shared root', () => {
    for (const harness of ['claude', 'opencode'] as HarnessName[]) {
      for (const f of render([harness])) expect(f.path.startsWith('.agents/')).toBe(false)
    }
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

describe('renderHarnessFiles — shared .agents root', () => {
  test('codex and agents render byte-identical skill files, contentHash included', () => {
    const codexSkills = render(['codex']).filter((f) => f.kind === 'skill')
    const agentsSkills = render(['agents'])
    expect(agentsSkills).toHaveLength(codexSkills.length)
    for (let i = 0; i < codexSkills.length; i++) {
      const a = codexSkills[i]!
      const b = agentsSkills[i]!
      expect(b.path).toBe(a.path)
      expect(b.content).toBe(a.content)
      expect(b.contentHash).toBe(a.contentHash)
    }
  })

  test('selecting codex and agents together emits each shared file exactly once', () => {
    const both = render(['codex', 'agents'])
    const paths = both.map((f) => f.path)
    expect(new Set(paths).size).toBe(paths.length)
    // 12 shared skills + codex's rules file, and nothing more.
    expect(both).toHaveLength(13)
    expect(both.filter((f) => f.kind === 'rules')).toHaveLength(1)
  })

  test('a shared file is attributed to the harness that rendered it first', () => {
    const skill = render(['codex', 'agents']).find((f) => f.kind === 'skill')!
    expect(skill.harness).toBe('codex')
    const reversed = render(['agents', 'codex']).find((f) => f.kind === 'skill')!
    expect(reversed.harness).toBe('agents')
  })

  test('two harnesses writing one path with different bodies is a hard error', () => {
    // Give the shared root two dialects — the one thing the dedupe guard must refuse.
    const agents: HarnessAdapter = { ...adapterFor('agents'), bodyDialect: 'canonical' }
    const adapters = [adapterFor('codex'), agents]
    expect(adapterFor('codex', adapters).bodyDialect).toBe('shared')
    expect(adapterFor('agents', adapters).bodyDialect).toBe('canonical')
    expect(() =>
      renderHarnessFiles({
        harnesses: ['codex', 'agents'],
        typeTable: TYPE_TABLE,
        version: TEST_VERSION,
        adapters,
      }),
    ).toThrow(/harness render conflict: codex and agents both write \.agents\/skills\//)
  })
})

describe('renderHarnessFiles — content snapshots', () => {
  // `agents` is omitted deliberately: it renders the same paths and bytes as `codex`
  // (asserted above), so a second snapshot of the same 12 files would only add churn.
  for (const harness of ['claude', 'codex', 'opencode'] as HarnessName[]) {
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
  test('opencode bodies use hyphen slashes', () => {
    const opencode = render(['opencode']).find(
      (f) => f.workflow === 'apply' && f.kind === 'command',
    )!
    expect(opencode.body).toContain('/cospec-archive')
    expect(opencode.body).not.toContain('/cospec:archive')
  })

  test('claude keeps the colon slashes it registers as commands', () => {
    const claude = render(['claude']).find((f) => f.workflow === 'apply' && f.kind === 'command')!
    expect(claude.body).toContain('/cospec:archive')
  })

  test('codex and agents respell references as skill names — the shared root has no commands', () => {
    for (const harness of ['codex', 'agents'] as HarnessName[]) {
      const skill = render([harness]).find((f) => f.workflow === 'apply' && f.kind === 'skill')!
      expect(skill.body).toContain('$cospec-archive-change (Codex)')
      expect(skill.body).toContain('/cospec-archive-change (other agents)')
      expect(skill.body).not.toContain('/cospec:archive')
      // `/cospec-archive` would dangle: no command file is emitted under `.agents/`.
      expect(skill.body).not.toMatch(/\/cospec-archive(?![a-z-])/)
    }
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

// Fixture rows go through RenderOptions.adapters and never enter HARNESS_TABLE. They reuse
// a real id so RenderOptions.harnesses keeps its HarnessName type; adapterFor looks the id
// up in the override table.
function renderRow(row: HarnessAdapter) {
  return renderHarnessFiles({
    harnesses: [row.id as HarnessName],
    typeTable: TYPE_TABLE,
    version: TEST_VERSION,
    adapters: [row],
  })
}

const markdownCommands = (
  dir: string,
  namespacing: 'namespaced' | 'flat',
  extension: CommandSurface['extension'],
): CommandSurface => ({
  dir,
  namespacing,
  file: namespacing === 'namespaced' ? 'cospec/{command}' : 'cospec-{command}',
  extension,
  serializer: 'markdown',
  frontmatter: buildOpencodeCommandFrontmatter,
})

const TOML_ROW: HarnessAdapter = {
  ...adapterFor('opencode'),
  skillsDir: '.gemini',
  commands: {
    dir: '.gemini/commands',
    namespacing: 'namespaced',
    file: 'cospec/{command}',
    extension: '.toml',
    serializer: 'toml',
  },
}

describe('toml serializer', async () => {
  // The package's exports map exposes only `.`, so the dist module is reached by path.
  const pkgJson = Bun.resolveSync(
    '@fission-ai/openspec/package.json',
    join(import.meta.dir, '../../../src'),
  )
  const { geminiAdapter } = (await import(
    join(dirname(pkgJson), 'dist/core/command-generation/adapters/gemini.js')
  )) as { geminiAdapter: { formatFile: (content: Record<string, unknown>) => string } }
  const upstream = (description: string, body: string): string =>
    geminiAdapter.formatFile({
      id: 'x',
      name: 'X',
      category: 'Workflow',
      tags: [],
      description,
      body,
    })

  const bodies: Record<string, string> = {
    backslash: 'a \\ path C:\\dir\\n and a trailing \\',
    'triple quote': 'says """ then """" and "" alone',
    tab: 'col\tcol\t',
    'C0 control': 'bell\u0007 nul\u0000 esc\u001b del\u007f vt\u000b ff\u000c',
    'lone CR': 'one\rtwo',
    CRLF: 'line one\r\nline two\r\n\r\nline four',
    'every ASCII code unit plus the C1 edges': [
      ...Array.from({ length: 0x80 }, (_, i) => String.fromCharCode(i)),
      '\u0080\u009f\u00a0é😀',
    ].join(''),
    'mixed with escapes after doubling': '\\"""\\\r\n\t\u0001',
  }
  for (const [name, body] of Object.entries(bodies)) {
    test(`matches upstream's formatFile byte for byte: body with ${name}`, () => {
      expect(serializeTomlCommand('plain', body)).toBe(upstream('plain', body))
    })
  }

  test("matches upstream's formatFile on a description with a quote, newline, tab and C0", () => {
    const description = 'Say "hi"\nthen\tgo \\ now\r\u0002'
    expect(serializeTomlCommand(description, 'body')).toBe(upstream(description, 'body'))
    const ascii = Array.from({ length: 0x80 }, (_, i) => String.fromCharCode(i)).join('')
    expect(serializeTomlCommand(ascii, 'body')).toBe(upstream(ascii, 'body'))
    expect(escapeTomlBasicString(description)).toBe('Say \\"hi\\"\\nthen\\tgo \\\\ now\\r\\u0002')
  })

  test('multiline escaping keeps raw LF and tab, normalizes CRLF, escapes a lone CR', () => {
    expect(escapeTomlMultilineBasicString('a\r\nb\tc\rd"""e')).toBe('a\nb\tc\\rd""\\"e')
  })

  test('a toml row renders manifest-tracked commands: no frontmatter, no hash', () => {
    const files = renderRow(TOML_ROW)
    const commands = files.filter((f) => f.kind === 'command')
    expect(commands).toHaveLength(12)
    for (const f of commands) {
      const skill = files.find((s) => s.kind === 'skill' && s.workflow === f.workflow)!
      const description = skill.frontmatter!['description'] as string
      expect(f.path).toMatch(/^\.gemini\/commands\/cospec\/[a-z-]+\.toml$/)
      expect(f.scope).toBe('project')
      expect(f.frontmatter).toBeNull()
      expect(f.contentHash).toBeNull()
      expect(f.content).toBe(upstream(description, f.body.replace(/\n$/, '')))
      expect(f.content.startsWith('description = "')).toBe(true)
      expect(f.content.endsWith(`${f.body.split('\n').at(-2)}\n"""\n`)).toBe(true)
    }
    // Skills on a toml row are still markdown with provenance frontmatter.
    for (const f of files.filter((s) => s.kind === 'skill')) {
      expect(f.content.startsWith('---\n')).toBe(true)
      expect(f.contentHash).not.toBeNull()
    }
  })

  test('a toml row that declares a frontmatter builder is refused', () => {
    const row = {
      ...TOML_ROW,
      commands: { ...TOML_ROW.commands!, frontmatter: buildOpencodeCommandFrontmatter },
    }
    expect(() => renderRow(row)).toThrow(/toml commands, which carry no frontmatter/)
  })

  test('a markdown row with no frontmatter builder is refused', () => {
    const row: HarnessAdapter = {
      ...adapterFor('opencode'),
      commands: { ...markdownCommands('.x/commands', 'flat', '.md'), frontmatter: undefined },
    } as HarnessAdapter
    expect(() => renderRow(row)).toThrow(/markdown commands but no frontmatter builder/)
  })
})

describe('fixture rows — per-row command layout', () => {
  test('a commands root independent of the skills root writes each surface under its own', () => {
    const row: HarnessAdapter = {
      ...adapterFor('opencode'),
      skillsDir: '.cline',
      commands: markdownCommands('.clinerules/workflows', 'flat', '.md'),
    }
    const files = renderRow(row)
    const skills = files.filter((f) => f.kind === 'skill')
    const commands = files.filter((f) => f.kind === 'command')
    expect(skills).toHaveLength(12)
    expect(commands).toHaveLength(12)
    for (const f of skills) expect(f.path).toMatch(/^\.cline\/skills\/cospec-[a-z-]+\/SKILL\.md$/)
    for (const f of commands)
      expect(f.path).toMatch(/^\.clinerules\/workflows\/cospec-[a-z-]+\.md$/)
  })

  const extensions: [CommandSurface['extension'], CommandSurface['serializer']][] = [
    ['.prompt', 'markdown'],
    ['.prompt.md', 'markdown'],
    ['.toml', 'toml'],
  ]
  for (const [extension, serializer] of extensions) {
    test(`a ${extension} row writes <dir>/cospec-<command>${extension}`, () => {
      const commands: CommandSurface =
        serializer === 'toml'
          ? {
              ...TOML_ROW.commands!,
              dir: '.x/prompts',
              namespacing: 'flat',
              file: 'cospec-{command}',
            }
          : markdownCommands('.x/prompts', 'flat', extension)
      const files = renderRow({ ...adapterFor('opencode'), commands } as HarnessAdapter)
      const paths = files.filter((f) => f.kind === 'command').map((f) => f.path)
      expect(paths.toSorted()).toEqual(
        WORKFLOW_COMMANDS.map((c) => `.x/prompts/cospec-${c}${extension}`).toSorted(),
      )
    })
  }

  test('a namespaced row writes <dir>/cospec/<command><ext>, a flat row <dir>/cospec-<command><ext>', () => {
    for (const [namespacing, sep] of [
      ['namespaced', '/'],
      ['flat', '-'],
    ] as const) {
      const row = {
        ...adapterFor('opencode'),
        commands: markdownCommands('.x/c', namespacing, '.md'),
      }
      const paths = renderRow(row)
        .filter((f) => f.kind === 'command')
        .map((f) => f.path)
      expect(paths.toSorted()).toEqual(
        WORKFLOW_COMMANDS.map((c) => `.x/c/cospec${sep}${c}.md`).toSorted(),
      )
    }
  })
})

describe('fixture rows — invocation prefix', () => {
  const real = render(['opencode'])

  test('a flat row with `/` is byte-identical to the real OpenCode render', () => {
    const files = renderRow({ ...adapterFor('opencode'), invocationPrefix: '/' })
    expect(files.map((f) => [f.path, f.content])).toEqual(real.map((f) => [f.path, f.content]))
  })

  test('a flat row with `@` respells /cospec:<id> as @cospec-<id>', () => {
    const files = renderRow({ ...adapterFor('opencode'), invocationPrefix: '@' })
    expect(files.map((f) => f.path)).toEqual(real.map((f) => f.path))
    let respelled = 0
    for (const [i, f] of files.entries()) {
      const r = real[i]!
      expect(f.body).not.toContain('/cospec:')
      expect(f.body).not.toContain('/cospec-')
      expect(f.body).toBe(r.body.replaceAll('/cospec-', '@cospec-'))
      if (f.body !== r.body) respelled++
    }
    expect(respelled).toBeGreaterThan(0)
  })
})

describe('fixture rows — scope', () => {
  test('a globalSkillsDir row renders its skills home-scoped at <root>/skills/<skill>/SKILL.md', () => {
    const row: HarnessAdapter = {
      id: 'agents',
      displayName: 'MiniMax Code',
      globalSkillsDir: '.minimax',
      invocationPrefix: '/',
      bodyDialect: 'shared',
      requiresIdeRestart: false,
      detectionPaths: [],
    }
    const files = renderRow(row)
    expect(files).toHaveLength(12)
    for (const f of files) {
      expect(f.kind).toBe('skill')
      expect(f.scope).toBe('home')
      expect(f.path).toMatch(/^\.minimax\/skills\/cospec-[a-z-]+\/SKILL\.md$/)
    }
    expect(files.map((f) => f.path.split('/')[2]).toSorted()).toEqual(
      [...WORKFLOW_SKILLS].toSorted(),
    )
  })

  test('every file the four real rows render is project-scoped', () => {
    const files = render()
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) expect(f.scope).toBe('project')
  })
})
