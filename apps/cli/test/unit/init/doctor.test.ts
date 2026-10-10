import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { harnessMarkdownFiles, run as doctorRun } from '../../../src/commands/doctor.ts'
import { run as initRun } from '../../../src/commands/init.ts'
import { withEmptyMachineState } from '../../fixtures/support.ts'
import { captureAsync, cleanup, ctx, makeRepo, managedMarkdown } from './helpers.ts'

async function seed(dir: string): Promise<void> {
  await captureAsync(() => initRun(ctx(dir, ['--harness', 'claude', '--yes'])))
}

/** Init a repo on a harness that renders into the shared `.agents/skills` root. */
async function seedShared(dir: string, harness: 'codex' | 'agents'): Promise<void> {
  await captureAsync(() => initRun(ctx(dir, ['--harness', harness, '--yes'])))
}

interface JsonFinding {
  level: string
  check: string
  message: string
}

async function doctorJson(dir: string): Promise<{ code: number; findings: JsonFinding[] }> {
  const { code, out } = await captureAsync(() => doctorRun(ctx(dir, [], true, 'doctor')))
  const parsed = JSON.parse(out) as { findings: JsonFinding[] }
  return { code, findings: parsed.findings }
}

describe('cospec doctor (DESIGN §2.3)', () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  test('a clean freshly-initialized repo passes (exit 0, no errors)', async () => {
    await seed(dir)
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(0)
    expect(findings.filter((f) => f.level === 'ERROR')).toEqual([])
  })

  test('uninitialized repo reports an ERROR and exits 1', async () => {
    const { code, findings } = await withEmptyMachineState(() => doctorJson(dir))
    expect(code).toBe(1)
    expect(findings.some((f) => f.check === 'initialized')).toBe(true)
  })

  test('missing manifest is an ERROR', async () => {
    await seed(dir)
    rmSync(join(dir, 'openspec/.cospec-manifest.json'))
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(1)
    expect(findings.some((f) => f.check === 'manifest' && f.level === 'ERROR')).toBe(true)
  })

  test('a missing managed schema file is a schema-missing ERROR', async () => {
    await seed(dir)
    rmSync(join(dir, 'openspec/schemas/ci/schema.yaml'))
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(1)
    expect(findings.some((f) => f.check === 'schema-missing')).toBe(true)
  })

  test('a dangling /cospec: reference in a harness body is an ERROR', async () => {
    await seed(dir)
    mkdirSync(join(dir, '.claude/skills/cospec-rogue'), { recursive: true })
    writeFileSync(
      join(dir, '.claude/skills/cospec-rogue/SKILL.md'),
      '---\nname: rogue\n---\nRun /cospec:teleport to win.\n',
    )
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(1)
    expect(findings.some((f) => f.check === 'dangling-ref')).toBe(true)
  })

  test('a non-cospec config schema is reported as INFO (not an error)', async () => {
    await seed(dir)
    writeFileSync(join(dir, 'openspec/config.yaml'), 'schema: my-fork\n')
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(0)
    expect(findings.some((f) => f.check === 'config' && f.level === 'INFO')).toBe(true)
  })

  describe('rules: keys that are not artifact ids (issue #69)', () => {
    const KNOWN = 'blocking-changes, design, proposal, specs, tasks, verification'

    // The binary's schema listing reads `$XDG_DATA_HOME/openspec/schemas`; point it
    // at a private dir so the developer's own user-global schemas never leak in.
    let dataHome: string
    let previousDataHome: string | undefined
    beforeEach(() => {
      dataHome = mkdtempSync(join(tmpdir(), 'cospec-doctor-xdg-'))
      previousDataHome = process.env.XDG_DATA_HOME
      process.env.XDG_DATA_HOME = dataHome
    })
    afterEach(() => {
      if (previousDataHome === undefined) delete process.env.XDG_DATA_HOME
      else process.env.XDG_DATA_HOME = previousDataHome
      rmSync(dataHome, { recursive: true, force: true })
    })

    function schemaYaml(name: string, id: string, requires = '[]'): string {
      return `name: ${name}\nversion: 1\nartifacts:\n  - id: ${id}\n    generates: ${id}.md\n    description: x\n    template: ${id}.md\n    requires: ${requires}\n`
    }

    function writeSchema(root: string, name: string, yaml: string): void {
      mkdirSync(join(root, name), { recursive: true })
      writeFileSync(join(root, name, 'schema.yaml'), yaml)
    }

    function writeConfig(rules: string): void {
      writeFileSync(join(dir, 'openspec/config.yaml'), `schema: feat\n${rules}`)
    }

    function ruleFindings(findings: JsonFinding[]): JsonFinding[] {
      return findings.filter((f) => f.check === 'config' && f.message.includes('rules.'))
    }

    test('a mistyped key is one WARNING naming it and the known ids; exit code unchanged', async () => {
      await seed(dir)
      writeConfig('rules:\n  proposals:\n    - Mention rollout\n  proposal:\n    - Keep it short\n')
      const { code, findings } = await doctorJson(dir)
      const hits = ruleFindings(findings)
      expect(code).toBe(0)
      expect(hits).toHaveLength(1)
      expect(hits[0]?.level).toBe('WARNING')
      expect(hits[0]?.message).toContain('rules.proposals is not an artifact id')
      expect(hits[0]?.message).toContain(`known: ${KNOWN}`)
      expect(hits[0]?.message).toContain('its rules are ignored')
      expect(hits[0]?.message).toContain("did you mean 'proposal'?")
    })

    test('every built-in artifact id is a valid key', async () => {
      await seed(dir)
      writeConfig(
        'rules:\n' +
          KNOWN.split(', ')
            .map((id) => `  ${id}:\n    - a rule\n`)
            .join(''),
      )
      const { findings } = await doctorJson(dir)
      expect(ruleFindings(findings)).toEqual([])
    })

    test('an artifact id declared by a project schema is a valid key', async () => {
      await seed(dir)
      mkdirSync(join(dir, 'openspec/schemas/mine'), { recursive: true })
      writeFileSync(
        join(dir, 'openspec/schemas/mine/schema.yaml'),
        'name: mine\nversion: 1\nartifacts:\n  - id: extra\n    generates: extra.md\n    description: x\n    template: extra.md\n    requires: []\n',
      )
      writeConfig('rules:\n  extra:\n    - a rule\n  nope:\n    - a rule\n')
      const { findings } = await doctorJson(dir)
      const hits = ruleFindings(findings)
      expect(hits).toHaveLength(1)
      expect(hits[0]?.message).toContain('rules.nope')
      expect(hits[0]?.message).toContain('extra')
    })

    test('a key with no near id has no suggestion', async () => {
      await seed(dir)
      writeConfig('rules:\n  zzzzzzzz:\n    - a rule\n')
      const { findings } = await doctorJson(dir)
      expect(ruleFindings(findings)[0]?.message).not.toContain('did you mean')
    })

    test('absent or non-mapping rules produce no finding', async () => {
      await seed(dir)
      for (const body of ['', 'rules: not-a-map\n', 'rules:\n  - proposals\n', 'rules:\n']) {
        writeConfig(body)
        const { code, findings } = await doctorJson(dir)
        expect(code).toBe(0)
        expect(ruleFindings(findings)).toEqual([])
      }
    })

    test('an artifact id of a user-global schema is a valid key', async () => {
      await seed(dir)
      writeSchema(join(dataHome, 'openspec/schemas'), 'usr', schemaYaml('usr', 'userextra'))
      writeConfig('rules:\n  userextra:\n    - a rule\n  nope:\n    - a rule\n')
      const { findings } = await doctorJson(dir)
      const hits = ruleFindings(findings)
      expect(hits).toHaveLength(1)
      expect(hits[0]?.message).toContain('rules.nope')
      expect(hits[0]?.message).toContain('userextra')
    })

    test('ids of a schema the binary rejects as invalid are not known', async () => {
      await seed(dir)
      // `requires` names an artifact the schema never declares: the binary skips it.
      writeSchema(
        join(dir, 'openspec/schemas'),
        'cyclic',
        schemaYaml('cyclic', 'cyclicid', '[missing]'),
      )
      writeSchema(
        join(dataHome, 'openspec/schemas'),
        'usr',
        schemaYaml('usr', 'userbad', '[missing]'),
      )
      // An unparseable one is dropped the same way, with no finding of its own.
      writeSchema(join(dir, 'openspec/schemas'), 'broken', 'artifacts: [unclosed\n')
      writeConfig('rules:\n  cyclicid:\n    - r\n  userbad:\n    - r\n  proposal:\n    - r\n')
      const { findings } = await doctorJson(dir)
      const hits = ruleFindings(findings)
      expect(hits.map((f) => /rules\.(\S+)/u.exec(f.message)?.[1])).toEqual(['cyclicid', 'userbad'])
      expect(findings.filter((f) => f.check === 'config' && !f.message.includes('rules.'))).toEqual(
        [],
      )
    })

    test('a project schema shadows a same-named user-global schema', async () => {
      await seed(dir)
      writeSchema(join(dir, 'openspec/schemas'), 'usr', schemaYaml('usr', 'projid'))
      writeSchema(join(dataHome, 'openspec/schemas'), 'usr', schemaYaml('usr', 'shadowed'))
      writeConfig('rules:\n  projid:\n    - r\n  shadowed:\n    - r\n')
      const { findings } = await doctorJson(dir)
      const hits = ruleFindings(findings)
      expect(hits).toHaveLength(1)
      expect(hits[0]?.message).toContain('rules.shadowed is not an artifact id')
    })
  })

  describe('verification.layers in the config', () => {
    const layerWarnings = async (config: string): Promise<JsonFinding[]> => {
      await seed(dir)
      writeFileSync(join(dir, 'openspec/config.yaml'), config)
      const { code, findings } = await doctorJson(dir)
      expect(code).toBe(0)
      return findings.filter((f) => f.check === 'config' && f.message.includes('verification'))
    }

    test.each([
      ['verification is a scalar', 'verification: uat\n', '`verification` is not a mapping'],
      [
        'layers is a scalar',
        'verification:\n  layers: uat\n',
        '`verification.layers` is not a list',
      ],
      [
        'layers is a mapping',
        'verification:\n  layers:\n    uat: true\n',
        '`verification.layers` is not a list',
      ],
      ['a non-string entry', 'verification:\n  layers: [uat, 7]\n', '7'],
      ['an entry with whitespace', 'verification:\n  layers: ["two words"]\n', '"two words"'],
      ['an empty entry', 'verification:\n  layers: [uat, ""]\n', '""'],
    ])('a malformed declaration warns (%s)', async (_name, config, detail) => {
      const found = await layerWarnings(config)
      expect(found).toHaveLength(1)
      expect(found[0]?.level).toBe('WARNING')
      expect(found[0]?.message).toContain(detail)
    })

    test.each([
      ['absent', 'schema: feat\n'],
      ['block list', 'verification:\n  layers:\n    - uat\n'],
      ['flow list, @-prefixed', 'verification:\n  layers: ["@uat", staging]\n'],
      ['verification with no value', 'verification:\n'],
      ['layers with no value', 'verification:\n  layers:\n'],
    ])('a well-formed or absent declaration is silent (%s)', async (_name, config) => {
      expect(await layerWarnings(config)).toEqual([])
    })
  })

  // `generatedBy` here is an arbitrary openspec version, not cospec's pin: the
  // detector matches the SHAPE (`author: openspec` + a bare semver), and the
  // `.agents/` case below deliberately uses a different one.
  test('a leftover opsx file is a WARNING', async () => {
    await seed(dir)
    const skill = join(dir, '.claude/skills/openspec-apply-change')
    mkdirSync(skill, { recursive: true })
    writeFileSync(
      join(skill, 'SKILL.md'),
      '---\nname: openspec-apply-change\nmetadata:\n  author: openspec\n  generatedBy: "1.5.0"\n---\nbody\n',
    )
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(0)
    expect(findings.some((f) => f.check === 'opsx-leftover' && f.level === 'WARNING')).toBe(true)
  })

  test('a leftover under `.agents/skills/` is a WARNING (openspec ≥1.8 Codex root)', async () => {
    await seed(dir)
    const skill = join(dir, '.agents/skills/openspec-propose')
    mkdirSync(skill, { recursive: true })
    writeFileSync(
      join(skill, 'SKILL.md'),
      '---\nname: openspec-propose\nmetadata:\n  author: openspec\n  generatedBy: "1.11.0"\n---\nbody\n',
    )
    const { findings } = await doctorJson(dir)
    const opsx = findings.filter((f) => f.check === 'opsx-leftover')
    expect(opsx.some((f) => f.level === 'WARNING')).toBe(true)
  })

  test('a user-authored path-matching file is NOT flagged as opsx (provenance-only)', async () => {
    await seed(dir)
    const cmdDir = join(dir, '.opencode/commands/opsx')
    mkdirSync(cmdDir, { recursive: true })
    writeFileSync(join(cmdDir, 'mynotes.md'), '# my notes, no openspec provenance\n')
    writeFileSync(join(dir, '.opencode/opsx-helper.md'), '---\nname: My Helper\n---\nplain\n')
    const { findings } = await doctorJson(dir)
    expect(findings.some((f) => f.check === 'opsx-leftover')).toBe(false)
  })

  test('an unreconciled .cospec-new sidecar is a WARNING', async () => {
    await seed(dir)
    writeFileSync(join(dir, 'openspec/schemas/ci/schema.yaml.cospec-new'), 'x\n')
    const { findings } = await doctorJson(dir)
    expect(findings.some((f) => f.check === 'stale-sidecar')).toBe(true)
  })

  test('a change on a forked (legacy) schema resolves as change-schema INFO, not WARNING/ERROR', async () => {
    await seed(dir)
    mkdirSync(join(dir, 'openspec/schemas/my-fork'), { recursive: true })
    writeFileSync(join(dir, 'openspec/schemas/my-fork/schema.yaml'), 'name: my-fork\nversion: 1\n')
    mkdirSync(join(dir, 'openspec/changes/forked-change'), { recursive: true })
    writeFileSync(join(dir, 'openspec/changes/forked-change/.openspec.yaml'), 'schema: my-fork\n')
    const { findings } = await doctorJson(dir)
    const changeSchema = (
      findings as unknown as { level: string; check: string; message: string }[]
    ).filter((f) => f.check === 'change-schema')
    expect(changeSchema).toHaveLength(1)
    expect(changeSchema[0]?.level).toBe('INFO')
    expect(changeSchema[0]?.message).toMatch(/legacy schema 'my-fork'/)
  })
})

describe('cospec doctor — the shared .agents/skills root', () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  // The shared dialect emits no command files, so its bodies reference skills by
  // DIR NAME (`/cospec-apply-change`), not by workflow id (`/cospec:apply`).
  // Doctor resolves both spellings; if it did not, every generated body here
  // would be flagged.
  test('generated shared-root bodies raise no dangling-ref findings', async () => {
    await seedShared(dir, 'agents')
    const { code, findings } = await doctorJson(dir)
    expect(findings.filter((f) => f.check === 'dangling-ref')).toEqual([])
    expect(code).toBe(0)
  })

  test('an unknown skill-name reference under .agents/ is a single ERROR', async () => {
    await seedShared(dir, 'agents')
    mkdirSync(join(dir, '.agents/skills/cospec-rogue'), { recursive: true })
    writeFileSync(
      join(dir, '.agents/skills/cospec-rogue/SKILL.md'),
      '---\nname: rogue\n---\nRun /cospec-teleport-change to win.\n',
    )
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(1)
    const dangling = findings.filter((f) => f.check === 'dangling-ref')
    // Exactly one: `.agents` (a harness dir) and `.agents/skills` (the shared
    // opsx root) are both walked, and the overlap is deduped by relpath.
    expect(dangling).toHaveLength(1)
    expect(dangling[0]?.level).toBe('ERROR')
    expect(dangling[0]?.message).toContain('.agents/skills/cospec-rogue/SKILL.md')
  })

  test('a real workflow whose skill file is missing is still a dangling ERROR', async () => {
    await seedShared(dir, 'agents')
    rmSync(join(dir, '.agents/skills/cospec-apply-change'), { recursive: true })
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(1)
    expect(findings.some((f) => f.check === 'dangling-ref' && f.message.includes('apply'))).toBe(
      true,
    )
  })

  test('a leftover .codex/skills file is a legacy-layout WARNING, not drift', async () => {
    await seedShared(dir, 'codex')
    mkdirSync(join(dir, '.codex/skills/cospec-propose'), { recursive: true })
    writeFileSync(
      join(dir, '.codex/skills/cospec-propose/SKILL.md'),
      managedMarkdown('cospec-propose', 'legacy body'),
    )
    const { code, findings } = await doctorJson(dir)
    // WARNING only — doctor exits 1 on ERRORs.
    expect(code).toBe(0)
    const legacy = findings.filter((f) => f.check === 'legacy-layout')
    expect(legacy).toHaveLength(1)
    expect(legacy[0]?.level).toBe('WARNING')
    expect(legacy[0]?.message).toContain('.codex/skills/cospec-propose/SKILL.md')
    // The file is misplaced, not diverged from canon: the drift vocabulary must
    // stay out of it.
    expect(findings.some((f) => f.check === 'drift')).toBe(false)
  })

  test('no legacy-layout finding once the legacy tree is gone', async () => {
    await seedShared(dir, 'codex')
    const { findings } = await doctorJson(dir)
    expect(findings.some((f) => f.check === 'legacy-layout')).toBe(false)
  })
})

// Verification 2.1–2.3 (harness-receipt-and-doctor-scope): doctor's
// stale-harness, mixed-versions and dangling-ref checks read only the files
// cospec writes — `<skills-root>/<skill>/SKILL.md` and the table's command
// paths — never a user's own markdown or a nested worktree's checkout.
describe('cospec doctor — only the harness files cospec writes', () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  /** A cospec-stamped file from an older cospec, referencing an unknown workflow. */
  const OLD_COPY =
    '---\nname: cospec-propose\nmetadata:\n  author: cospec\n  generatedBy: "cospec@0.0.1"\n---\n\nThen run /cospec:not-a-real-workflow.\n'

  test("a user's .claude/notes.md mentioning /cospec:foo gives no finding", async () => {
    await seed(dir)
    writeFileSync(join(dir, '.claude/notes.md'), 'Try /cospec:foo once it exists.\n')
    const { code, findings } = await doctorJson(dir)
    expect(findings.filter((f) => f.message.includes('.claude/notes.md'))).toEqual([])
    expect(code).toBe(0)
    const human = await captureAsync(() => doctorRun(ctx(dir, [], false, 'doctor')))
    expect(human.out).not.toContain('.claude/notes.md')
    expect(human.code).toBe(0)
  })

  test("a nested worktree's copy under .claude/worktrees/ is not checked", async () => {
    await seed(dir)
    const wt = join(dir, '.claude/worktrees/wt/.claude')
    mkdirSync(join(wt, 'skills/cospec-propose'), { recursive: true })
    mkdirSync(join(wt, 'commands/cospec'), { recursive: true })
    writeFileSync(join(wt, 'skills/cospec-propose/SKILL.md'), OLD_COPY)
    writeFileSync(join(wt, 'commands/cospec/propose.md'), OLD_COPY)
    const { code, findings } = await doctorJson(dir)
    const harnessChecks = new Set(['stale-harness', 'mixed-versions', 'dangling-ref'])
    expect(
      findings.filter(
        (f) => harnessChecks.has(f.check) && f.message.includes('.claude/worktrees/'),
      ),
    ).toEqual([])
    expect(findings.filter((f) => f.check === 'mixed-versions')).toEqual([])
    expect(code).toBe(0)
  })

  test('a dangling reference in a cospec-written command file is still an ERROR', async () => {
    await seed(dir)
    const cmd = join(dir, '.claude/commands/cospec/propose.md')
    writeFileSync(cmd, `${readFileSync(cmd, 'utf8')}\nThen run /cospec:not-a-real-workflow.\n`)
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(1)
    expect(
      findings.filter((f) => f.check === 'dangling-ref').map((f) => `${f.level} ${f.message}`),
    ).toEqual([
      'ERROR .claude/commands/cospec/propose.md references /cospec:not-a-real-workflow, which is not a known cospec workflow',
    ])
  })
})

// Review finding (opsx-leftover-scan-scope): doctor's stale-sidecar and harness-markdown
// walks share the opsx scan's boundary — never into a nested git worktree, never out of
// the project through a symlinked scan root.
describe('cospec doctor — scans stay inside the project', () => {
  let dir: string
  let outside: string
  beforeEach(() => {
    dir = makeRepo()
    outside = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
    cleanup(outside)
  })

  const OLD_COPY =
    '---\nname: cospec-propose\nmetadata:\n  author: cospec\n  generatedBy: "cospec@0.0.1"\n---\n\nbody\n'

  const sidecars = (findings: JsonFinding[]): string[] =>
    findings.filter((f) => f.check === 'stale-sidecar').map((f) => f.message)

  test("a nested worktree's .cospec-new sidecar is not reported; the project's own still is", async () => {
    await seed(dir)
    const wtSidecar = '.claude/worktrees/wt/.claude/skills/cospec-x/SKILL.md.cospec-new'
    mkdirSync(join(dir, '.claude/worktrees/wt/.claude/skills/cospec-x'), { recursive: true })
    // `git worktree add` writes `.git` as a file, a gitdir pointer.
    writeFileSync(join(dir, '.claude/worktrees/wt/.git'), 'gitdir: /elsewhere/.git/worktrees/wt\n')
    writeFileSync(join(dir, wtSidecar), 'x\n')
    writeFileSync(join(dir, '.claude/commands/cospec/apply.md.cospec-new'), 'x\n')
    const { findings } = await doctorJson(dir)
    expect(sidecars(findings)).toEqual([
      'unreconciled sidecar: .claude/commands/cospec/apply.md.cospec-new',
    ])
  })

  test('a symlinked .claude resolving outside the project is not walked for sidecars', async () => {
    mkdirSync(join(outside, 'commands/cospec'), { recursive: true })
    writeFileSync(join(outside, 'commands/cospec/apply.md.cospec-new'), 'x\n')
    await seed(dir)
    rmSync(join(dir, '.claude'), { recursive: true })
    symlinkSync(outside, join(dir, '.claude'))
    const { findings } = await doctorJson(dir)
    expect(sidecars(findings)).toEqual([])
  })

  test('a symlinked .claude resolving outside the project is never read for harness files', () => {
    mkdirSync(join(outside, 'skills/cospec-propose'), { recursive: true })
    writeFileSync(join(outside, 'skills/cospec-propose/SKILL.md'), OLD_COPY)
    symlinkSync(outside, join(dir, '.claude'))
    expect(harnessMarkdownFiles(dir)).toEqual([])
  })

  test('a nested git checkout at a harness path is never read for harness files', () => {
    const nested = join(dir, '.claude/skills/cospec-propose')
    mkdirSync(join(nested, '.git'), { recursive: true })
    writeFileSync(join(nested, 'SKILL.md'), OLD_COPY)
    expect(harnessMarkdownFiles(dir)).toEqual([])
  })

  test('a .claude that is an embedded clone is never read for harness files', () => {
    mkdirSync(join(dir, '.claude/.git'), { recursive: true })
    mkdirSync(join(dir, '.claude/skills/cospec-propose'), { recursive: true })
    writeFileSync(join(dir, '.claude/skills/cospec-propose/SKILL.md'), OLD_COPY)
    expect(harnessMarkdownFiles(dir)).toEqual([])
  })

  test('a .claude symlinked into a nested worktree inside the project is never read', () => {
    const wt = join(dir, 'wt/feat')
    mkdirSync(join(wt, '.claude/skills/cospec-propose'), { recursive: true })
    writeFileSync(join(wt, '.git'), 'gitdir: /elsewhere/.git/worktrees/feat\n')
    writeFileSync(join(wt, '.claude/skills/cospec-propose/SKILL.md'), OLD_COPY)
    symlinkSync(join(wt, '.claude'), join(dir, '.claude'))
    expect(harnessMarkdownFiles(dir)).toEqual([])
  })

  test("an openspec symlinked into a nested worktree's openspec reports none of its sidecars", async () => {
    await seed(dir)
    const wt = join(dir, '.claude/worktrees/feat')
    mkdirSync(join(wt, 'openspec/changes/x'), { recursive: true })
    writeFileSync(join(wt, '.git'), 'gitdir: /elsewhere/.git/worktrees/feat\n')
    writeFileSync(join(wt, 'openspec/changes/x/proposal.md.cospec-new'), 'x\n')
    rmSync(join(dir, 'openspec'), { recursive: true })
    symlinkSync(join(wt, 'openspec'), join(dir, 'openspec'))
    const { findings } = await doctorJson(dir)
    expect(sidecars(findings)).toEqual([])
  })

  test('the project own harness file is still read (control)', () => {
    mkdirSync(join(dir, '.claude/skills/cospec-propose'), { recursive: true })
    writeFileSync(join(dir, '.claude/skills/cospec-propose/SKILL.md'), OLD_COPY)
    expect(harnessMarkdownFiles(dir).map((f) => f.relpath)).toEqual([
      '.claude/skills/cospec-propose/SKILL.md',
    ])
  })
})
