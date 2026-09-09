import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { detectHarnesses, generate } from '../../../src/commands/update.ts'
import { computeContentHash, readManifest } from '../../../src/core/managed-files.ts'
import { cleanup, makeRepo, managedMarkdown } from './helpers.ts'

describe('generate engine (DESIGN §6.5)', () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  test('first run creates schemas, templates, harness files, and the manifest', () => {
    const { results, manifest } = generate(dir, { harnesses: ['claude'] })
    // 11 schema.yaml files.
    for (const t of ['feat', 'ci', 'fix', 'revert']) {
      expect(existsSync(join(dir, `openspec/schemas/${t}/schema.yaml`))).toBe(true)
    }
    // Every result is a fresh create.
    expect(results.every((r) => r.outcome === 'created')).toBe(true)
    // Harness files.
    expect(existsSync(join(dir, '.claude/skills/cospec-propose/SKILL.md'))).toBe(true)
    expect(existsSync(join(dir, '.claude/commands/cospec/propose.md'))).toBe(true)
    // Manifest tracks the frontmatter-less files (schemas + templates), not the md skills.
    expect(existsSync(join(dir, 'openspec/.cospec-manifest.json'))).toBe(true)
    expect(manifest.files['openspec/schemas/feat/schema.yaml']).toMatch(/^sha256:/)
    expect(manifest.files['.claude/skills/cospec-propose/SKILL.md']).toBeUndefined()
  })

  test('second consecutive run is a byte no-op (idempotence)', () => {
    generate(dir, { harnesses: ['claude', 'codex'] })
    const { results } = generate(dir, { harnesses: ['claude', 'codex'] })
    expect(results.every((r) => r.outcome === 'unchanged')).toBe(true)
  })

  test('a user-modified schema is preserved with a .cospec-new sidecar', () => {
    generate(dir, { harnesses: ['claude'] })
    const schema = join(dir, 'openspec/schemas/ci/schema.yaml')
    writeFileSync(schema, `${readFileSync(schema, 'utf8')}\n# hand edit\n`)
    const { results } = generate(dir, { harnesses: ['claude'] })
    const ci = results.find((r) => r.path === 'openspec/schemas/ci/schema.yaml')
    expect(ci?.outcome).toBe('preserved-modified')
    expect(existsSync(`${schema}.cospec-new`)).toBe(true)
  })

  test('a user-modified managed markdown file is preserved', () => {
    generate(dir, { harnesses: ['claude'] })
    const skill = join(dir, '.claude/skills/cospec-propose/SKILL.md')
    writeFileSync(skill, `${readFileSync(skill, 'utf8')}\n<!-- edit -->\n`)
    const { results } = generate(dir, { harnesses: ['claude'] })
    const r = results.find((x) => x.path === '.claude/skills/cospec-propose/SKILL.md')
    expect(r?.outcome).toBe('preserved-modified')
    expect(existsSync(`${skill}.cospec-new`)).toBe(true)
  })

  test('--force clobbers a user-modified managed file', () => {
    generate(dir, { harnesses: ['claude'] })
    const schema = join(dir, 'openspec/schemas/ci/schema.yaml')
    writeFileSync(schema, 'garbage\n')
    const { results } = generate(dir, { harnesses: ['claude'], force: true })
    const ci = results.find((r) => r.path === 'openspec/schemas/ci/schema.yaml')
    expect(ci?.outcome).toBe('forced')
    expect(readFileSync(schema, 'utf8')).not.toBe('garbage\n')
  })

  test('dryRun writes nothing to disk', () => {
    const { results } = generate(dir, { harnesses: ['claude'], dryRun: true })
    expect(results.length).toBeGreaterThan(0)
    expect(existsSync(join(dir, 'openspec/schemas/feat/schema.yaml'))).toBe(false)
    expect(existsSync(join(dir, 'openspec/.cospec-manifest.json'))).toBe(false)
  })

  test('a foreign (non-cospec) file at a managed path is preserved, not clobbered', () => {
    generate(dir, { harnesses: ['claude'] })
    // Foreign markdown at a skill path (no cospec metadata).
    const skill = join(dir, '.claude/skills/cospec-explore/SKILL.md')
    writeFileSync(skill, '---\nname: mine\n---\nhand-written\n')
    const { results } = generate(dir, { harnesses: ['claude'] })
    const r = results.find((x) => x.path === '.claude/skills/cospec-explore/SKILL.md')
    expect(r?.outcome).toBe('preserved-foreign')
  })

  test('an orphaned managed skill (no longer emitted) is removed when unmodified', () => {
    generate(dir, { harnesses: ['claude'] })
    const orphanDir = join(dir, '.claude/skills/cospec-obsolete')
    mkdirSync(orphanDir, { recursive: true })
    writeFileSync(join(orphanDir, 'SKILL.md'), managedMarkdown('cospec-obsolete', 'gone'))
    const { results } = generate(dir, { harnesses: ['claude'] })
    const r = results.find((x) => x.path === '.claude/skills/cospec-obsolete/SKILL.md')
    expect(r?.outcome).toBe('removed')
    expect(existsSync(join(orphanDir, 'SKILL.md'))).toBe(false)
  })

  test('a stale manifest-tracked frontmatter-less file is removed when unmodified', () => {
    generate(dir, { harnesses: ['claude'] })
    // Seed a tracked-but-no-longer-emitted file into the manifest.
    const rel = 'openspec/schemas/legacy/schema.yaml'
    const abs = join(dir, rel)
    mkdirSync(join(dir, 'openspec/schemas/legacy'), { recursive: true })
    const content = 'name: legacy\n'
    writeFileSync(abs, content)
    const manifest = readManifest(dir)!
    manifest.files[rel] = computeContentHash(content)
    writeFileSync(
      join(dir, 'openspec/.cospec-manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    )
    const { results } = generate(dir, { harnesses: ['claude'] })
    const r = results.find((x) => x.path === rel)
    expect(r?.outcome).toBe('removed')
    expect(existsSync(abs)).toBe(false)
  })

  test('a forked/custom schema dir (never in the manifest) is untouched by generate — never tracked or flagged', () => {
    generate(dir, { harnesses: ['claude'] })
    // Simulate `cospec schema fork feat my-fork`: a project-local schema dir
    // that the canon never emits and the manifest never recorded.
    const rel = 'openspec/schemas/my-fork/schema.yaml'
    const abs = join(dir, rel)
    mkdirSync(join(dir, 'openspec/schemas/my-fork'), { recursive: true })
    const content = 'name: my-fork\nversion: 1\n'
    writeFileSync(abs, content)

    const { results, manifest } = generate(dir, { harnesses: ['claude'] })
    // Never appears in the result set — the drift engine only iterates canon
    // paths (11 schemas) plus whatever the previous manifest tracked.
    expect(results.some((r) => r.path === rel)).toBe(false)
    // Never absorbed into the manifest either.
    expect(manifest.files[rel]).toBeUndefined()
    // Untouched on disk — byte-identical to what the fork wrote.
    expect(readFileSync(abs, 'utf8')).toBe(content)

    // A second run (== `generate:check`'s dry-run) reports the same: no drift
    // for the fork, and every canon path still unchanged.
    const { results: checkResults } = generate(dir, { harnesses: ['claude'], dryRun: true })
    expect(checkResults.some((r) => r.path === rel)).toBe(false)
    expect(checkResults.filter((r) => r.outcome !== 'unchanged')).toEqual([])
  })
})

describe('detectHarnesses', () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  test('returns only harnesses whose sentinel cospec skill is present', () => {
    expect(detectHarnesses(dir)).toEqual([])
    generate(dir, { harnesses: ['claude', 'opencode'] })
    expect(detectHarnesses(dir).toSorted()).toEqual(['claude', 'opencode'])
  })

  test('ignores a non-cospec skill file at the sentinel path', () => {
    mkdirSync(join(dir, '.codex/skills/cospec-propose'), { recursive: true })
    writeFileSync(
      join(dir, '.codex/skills/cospec-propose/SKILL.md'),
      '---\nname: x\nmetadata:\n  author: someone-else\n---\nbody\n',
    )
    expect(detectHarnesses(dir)).toEqual([])
  })

  // `codex` and `agents` both render `.agents/skills/cospec-*`, byte-identically;
  // only `codex` leaves further evidence (`.codex/rules/cospec.rules`). These
  // cases pin how that ambiguity is resolved.

  test('a codex install stays codex-only across repeated detect/generate cycles', () => {
    generate(dir, { harnesses: ['codex'] })
    expect(existsSync(join(dir, '.agents/skills/cospec-propose/SKILL.md'))).toBe(true)
    expect(detectHarnesses(dir)).toEqual(['codex'])
    // What `cospec update` / `cospec doctor` actually do: re-generate from the
    // detected set. Detection must not acquire `agents` from its own output.
    generate(dir, { harnesses: detectHarnesses(dir) })
    expect(detectHarnesses(dir)).toEqual(['codex'])
  })

  test('detects agents alone from the shared root when no codex rules file exists', () => {
    generate(dir, { harnesses: ['agents'] })
    expect(existsSync(join(dir, '.agents/skills/cospec-propose/SKILL.md'))).toBe(true)
    expect(existsSync(join(dir, '.codex/rules/cospec.rules'))).toBe(false)
    expect(detectHarnesses(dir)).toEqual(['agents'])
    generate(dir, { harnesses: detectHarnesses(dir) })
    expect(detectHarnesses(dir)).toEqual(['agents'])
  })

  test('a repo that selected both reports codex, whose output is the superset', () => {
    generate(dir, { harnesses: ['codex', 'agents'] })
    // `agents` is dropped rather than invented: re-generating from the detected
    // set is a byte no-op, so nothing the user selected is lost.
    expect(detectHarnesses(dir)).toEqual(['codex'])
    const { results } = generate(dir, { harnesses: detectHarnesses(dir) })
    expect(results.every((r) => r.outcome === 'unchanged')).toBe(true)
  })

  test('detects a pre-migration .codex/skills install as codex, not agents', () => {
    mkdirSync(join(dir, '.codex/skills/cospec-propose'), { recursive: true })
    writeFileSync(
      join(dir, '.codex/skills/cospec-propose/SKILL.md'),
      managedMarkdown('cospec-propose', 'legacy body'),
    )
    // No `.agents/skills` and no rules file yet — the legacy tree is the only evidence.
    expect(detectHarnesses(dir)).toEqual(['codex'])

    // After the migrating run the legacy tree is gone and the rules-file marker
    // is what keeps the install detectable.
    generate(dir, { harnesses: detectHarnesses(dir) })
    expect(existsSync(join(dir, '.codex/skills/cospec-propose/SKILL.md'))).toBe(false)
    expect(existsSync(join(dir, '.codex/rules/cospec.rules'))).toBe(true)
    expect(detectHarnesses(dir)).toEqual(['codex'])
  })

  test('a bare .agents/ dir without a skills tree is not a harness', () => {
    mkdirSync(join(dir, '.agents'), { recursive: true })
    writeFileSync(join(dir, '.agents/shared.md'), '# notes\n')
    expect(detectHarnesses(dir)).toEqual([])
  })

  test('detects every harness of a four-target install (agents folded into codex)', () => {
    generate(dir, { harnesses: ['claude', 'codex', 'opencode', 'agents'] })
    expect(detectHarnesses(dir)).toEqual(['claude', 'codex', 'opencode'])
  })
})
