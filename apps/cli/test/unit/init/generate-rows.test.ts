// `generate()` over fixture rows injected through `GenerateOptions.adapters`
// (the same seam as `RenderOptions.adapters`): a home-scoped file is refused
// before anything is written (verification 3.6), and a frontmatter-less TOML
// command is manifest-tracked like the codex rules file (design decision 9).

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { generate } from '../../../src/commands/update.ts'
import { readManifest } from '../../../src/core/managed-files.ts'
import type { HarnessAdapter, HarnessName } from '../../../src/harness/adapters.ts'
import { cleanup, makeRepo } from './helpers.ts'

const HOME_ROW: HarnessAdapter = {
  id: 'home-fixture',
  displayName: 'Fixture tool with a home skills root',
  globalSkillsDir: '.home-fixture',
  invocationPrefix: '/',
  bodyDialect: 'shared',
  requiresIdeRestart: false,
  detectionPaths: [],
}

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
  bodyDialect: 'shared',
  requiresIdeRestart: false,
  detectionPaths: ['.toml-fixture'],
}

/** R9's `continue` shape: flat markdown commands with a `.prompt` extension. */
function promptRow(extension: '.md' | '.prompt' | '.prompt.md'): HarnessAdapter {
  return {
    id: 'prompt-fixture',
    displayName: 'Fixture tool with flat markdown commands',
    skillsDir: '.prompt-fixture',
    commands: {
      dir: '.prompt-fixture/prompts',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension,
      serializer: 'markdown',
      frontmatter: (w, version, contentHash) => ({
        description: w.description,
        metadata: { author: 'cospec', generatedBy: version, contentHash },
      }),
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: false,
    detectionPaths: ['.prompt-fixture'],
  }
}

describe('generate() over injected rows', () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  test('a home-scoped rendered file throws an internal error naming its path and writes nothing', () => {
    const run = (): unknown =>
      generate(dir, { harnesses: [HOME_ROW.id as HarnessName], adapters: [HOME_ROW] })
    expect(run).toThrow(
      /^internal: home-fixture rendered home-scoped \.home-fixture\/skills\/cospec-[a-z-]+\/SKILL\.md, which no managed root covers$/,
    )
    expect(readdirSync(dir)).toEqual([])
    expect(existsSync(join(dir, 'openspec/.cospec-manifest.json'))).toBe(false)
  })

  test('a home-scoped row selected beside a real row still writes nothing', () => {
    const run = (): unknown =>
      generate(dir, {
        harnesses: ['claude', HOME_ROW.id as HarnessName],
        adapters: [
          {
            id: 'claude',
            displayName: 'Claude-shaped fixture',
            skillsDir: '.claude',
            invocationPrefix: '/',
            bodyDialect: 'canonical',
            requiresIdeRestart: false,
            detectionPaths: ['.claude'],
          },
          HOME_ROW,
        ],
      })
    expect(run).toThrow(/^internal: home-fixture rendered home-scoped /)
    expect(readdirSync(dir)).toEqual([])
  })

  test('a TOML command file carries no frontmatter, so the manifest tracks it', () => {
    const opts = { harnesses: [TOML_ROW.id as HarnessName], adapters: [TOML_ROW] }
    const first = generate(dir, opts)
    const tomlPath = '.toml-fixture/commands/cospec/propose.toml'
    expect(existsSync(join(dir, tomlPath))).toBe(true)
    expect(first.manifest.files[tomlPath]).toMatch(/^sha256:/)
    expect(readManifest(dir)?.files[tomlPath]).toBe(first.manifest.files[tomlPath])
    // A skill file is self-describing markdown and stays out of the manifest.
    expect(first.manifest.files['.toml-fixture/skills/cospec-propose/SKILL.md']).toBeUndefined()
    const second = generate(dir, opts)
    expect(second.results.every((r) => r.outcome === 'unchanged')).toBe(true)
  })

  for (const extension of ['.md', '.prompt', '.prompt.md'] as const) {
    test(`an unmodified cospec command no longer emitted is removed (${extension})`, () => {
      const row = promptRow(extension)
      const opts = { harnesses: [row.id as HarnessName], adapters: [row] }
      generate(dir, opts)
      // A byte copy of a managed command is still cospec-authored with a valid
      // contentHash: exactly what a retired workflow leaves behind.
      const live = `.prompt-fixture/prompts/cospec-new${extension}`
      const orphan = `.prompt-fixture/prompts/cospec-retired${extension}`
      copyFileSync(join(dir, live), join(dir, orphan))
      const check = generate(dir, { ...opts, dryRun: true })
      expect(check.results.filter((r) => r.outcome === 'removed')).toEqual([
        { path: orphan, outcome: 'removed' },
      ])
      expect(existsSync(join(dir, orphan))).toBe(true)
      const second = generate(dir, opts)
      expect(second.results.filter((r) => r.outcome === 'removed')).toEqual([
        { path: orphan, outcome: 'removed' },
      ])
      expect(existsSync(join(dir, orphan))).toBe(false)
      expect(existsSync(join(dir, live))).toBe(true)
    })
  }

  test('the markdown orphan sweep never touches a TOML command dir', () => {
    const opts = { harnesses: [TOML_ROW.id as HarnessName], adapters: [TOML_ROW] }
    generate(dir, opts)
    // A cospec-authored markdown file in a TOML row's command dir is not a
    // command that row renders; only the manifest decides TOML removals.
    const stray = '.toml-fixture/commands/cospec/stray.md'
    copyFileSync(join(dir, '.toml-fixture/skills/cospec-propose/SKILL.md'), join(dir, stray))
    const second = generate(dir, opts)
    expect(second.results.filter((r) => r.outcome === 'removed')).toEqual([])
    expect(existsSync(join(dir, stray))).toBe(true)
  })
})

/**
 * Cline's and Kilo Code's shapes: markdown commands with no frontmatter block at all. The
 * fixture sits under `.opencode`, a root the real table owns, because removal is contained to
 * the table's own roots.
 */
function bareRow(serializer: 'markdown-header' | 'plain'): HarnessAdapter {
  return {
    id: 'bare-fixture',
    displayName: 'Fixture tool with frontmatter-less commands',
    skillsDir: '.opencode',
    commands: {
      dir: '.opencode/workflows',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer,
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: false,
    detectionPaths: ['.opencode'],
  }
}

describe.each(['markdown-header', 'plain'] as const)('generate() over a %s row', (serializer) => {
  let dir: string
  const row = bareRow(serializer)
  const opts = { harnesses: [row.id as HarnessName], adapters: [row] }
  const command = '.opencode/workflows/cospec-propose.md'
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  test('its commands are manifest entries and its skills are not', () => {
    const first = generate(dir, opts)
    expect(first.manifest.files[command]).toMatch(/^sha256:/)
    expect(readManifest(dir)?.files[command]).toBe(first.manifest.files[command])
    expect(first.manifest.files['.opencode/skills/cospec-propose/SKILL.md']).toBeUndefined()
    const commands = Object.keys(first.manifest.files).filter((p) =>
      p.startsWith('.opencode/workflows/'),
    )
    expect(commands).toHaveLength(12)
    expect(generate(dir, opts).results.every((r) => r.outcome === 'unchanged')).toBe(true)
  })

  test('a hand edit is preserved and the regenerated file lands in a .cospec-new sidecar', () => {
    generate(dir, opts)
    const generated = readFileSync(join(dir, command), 'utf8')
    writeFileSync(join(dir, command), `${generated}\nmy own note\n`)
    const second = generate(dir, opts)
    expect(second.results.filter((r) => r.outcome === 'preserved-modified')).toEqual([
      { path: command, outcome: 'preserved-modified', sidecar: `${command}.cospec-new` },
    ])
    expect(readFileSync(join(dir, command), 'utf8')).toContain('my own note')
    expect(readFileSync(join(dir, `${command}.cospec-new`), 'utf8')).toBe(generated)
  })

  test('the markdown orphan sweep never touches its command dir', () => {
    generate(dir, opts)
    // A cospec-authored markdown file in the dir is not a command this row renders as
    // markdown; only the manifest decides this row's removals.
    const stray = '.opencode/workflows/cospec-stray.md'
    copyFileSync(join(dir, '.opencode/skills/cospec-propose/SKILL.md'), join(dir, stray))
    const second = generate(dir, opts)
    expect(second.results.filter((r) => r.outcome === 'removed')).toEqual([])
    expect(existsSync(join(dir, stray))).toBe(true)
  })

  test('a retired command the manifest tracked is removed, an edited one kept', () => {
    generate(dir, opts)
    const retired = '.opencode/workflows/cospec-retired.md'
    copyFileSync(join(dir, command), join(dir, retired))
    const manifest = readManifest(dir)!
    manifest.files[retired] = manifest.files[command]!
    writeFileSync(join(dir, 'openspec/.cospec-manifest.json'), `${JSON.stringify(manifest)}\n`)
    const second = generate(dir, opts)
    expect(second.results.filter((r) => r.outcome === 'removed')).toEqual([
      { path: retired, outcome: 'removed' },
    ])
    expect(existsSync(join(dir, retired))).toBe(false)
  })
})
