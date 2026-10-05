import { afterAll, describe, expect, test } from 'bun:test'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { changeMetadataRefused, userSchemasDir } from '../../../src/core/change-metadata.ts'
import {
  changeLookupNameProblem,
  changesDir,
  COSPEC_TYPES,
  describeNestedChange,
  findNestedChanges,
  findNestedChangesIn,
  isCospecType,
  listChanges,
  readArchiveIndex,
  readOpenspecYaml,
  resolveChange,
  resolveSchema,
} from '../../../src/core/change.ts'

const roots: string[] = []

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-change-'))
  roots.push(dir)
  mkdirSync(join(dir, 'openspec', 'changes', 'archive'), { recursive: true })
  return dir
}

function makeChange(cwd: string, id: string, yaml: string | null): void {
  const dir = join(cwd, 'openspec', 'changes', id)
  mkdirSync(dir, { recursive: true })
  if (yaml !== null) writeFileSync(join(dir, '.openspec.yaml'), yaml)
}

function makeArchived(cwd: string, dirName: string): void {
  mkdirSync(join(cwd, 'openspec', 'changes', 'archive', dirName), { recursive: true })
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

describe('type table', () => {
  test('has the 11 conventional-commit types', () => {
    expect(COSPEC_TYPES).toHaveLength(11)
    expect(isCospecType('feat')).toBe(true)
    expect(isCospecType('spec-driven')).toBe(false)
  })
})

describe('readOpenspecYaml', () => {
  test('reads schema and created', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'add-widget', 'schema: feat\ncreated: 2026-07-03\n')
    const yaml = readOpenspecYaml(join(cwd, 'openspec', 'changes', 'add-widget'))
    expect(yaml).toEqual({ schema: 'feat', created: '2026-07-03' })
  })

  test('undefined when absent, unparseable, or schema missing', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'no-yaml', null)
    expect(readOpenspecYaml(join(cwd, 'openspec', 'changes', 'no-yaml'))).toBeUndefined()
    makeChange(cwd, 'bad', ': : not yaml :\n  - [')
    expect(readOpenspecYaml(join(cwd, 'openspec', 'changes', 'bad'))).toBeUndefined()
    makeChange(cwd, 'no-schema', 'created: 2026-07-03\n')
    expect(readOpenspecYaml(join(cwd, 'openspec', 'changes', 'no-schema'))).toBeUndefined()
  })

  test('reads a positive-integer schemaVersion', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'v2', 'schema: feat\nschemaVersion: 2\n')
    expect(readOpenspecYaml(join(cwd, 'openspec', 'changes', 'v2'))?.schemaVersion).toBe(2)
  })

  test('treats a non-positive-integer schemaVersion as absent (v1 semantics)', () => {
    const cwd = makeRepo()
    // 0/negative/fractional are not stamped versions — leaving them as `undefined`
    // keeps callers on the v1 fallback instead of grandfathering everything out.
    makeChange(cwd, 'zero', 'schema: feat\nschemaVersion: 0\n')
    expect(
      readOpenspecYaml(join(cwd, 'openspec', 'changes', 'zero'))?.schemaVersion,
    ).toBeUndefined()
    makeChange(cwd, 'neg', 'schema: feat\nschemaVersion: -1\n')
    expect(readOpenspecYaml(join(cwd, 'openspec', 'changes', 'neg'))?.schemaVersion).toBeUndefined()
    makeChange(cwd, 'frac', 'schema: feat\nschemaVersion: 1.5\n')
    expect(
      readOpenspecYaml(join(cwd, 'openspec', 'changes', 'frac'))?.schemaVersion,
    ).toBeUndefined()
  })

  test('reads boolean skip_specs and retire_capabilities', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'skip', 'schema: feat\nskip_specs: true\n')
    expect(readOpenspecYaml(join(cwd, 'openspec', 'changes', 'skip'))?.skipSpecs).toBe(true)
    makeChange(cwd, 'retire', 'schema: feat\nretire_capabilities: false\n')
    expect(readOpenspecYaml(join(cwd, 'openspec', 'changes', 'retire'))?.retireCapabilities).toBe(
      false,
    )
  })

  test('treats a non-boolean skip_specs / retire_capabilities as absent', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'skip-bad', 'schema: feat\nskip_specs: yes\n')
    expect(
      readOpenspecYaml(join(cwd, 'openspec', 'changes', 'skip-bad'))?.skipSpecs,
    ).toBeUndefined()
    makeChange(cwd, 'retire-bad', 'schema: feat\nretire_capabilities: "true"\n')
    expect(
      readOpenspecYaml(join(cwd, 'openspec', 'changes', 'retire-bad'))?.retireCapabilities,
    ).toBeUndefined()
  })

  test('leaves skip_specs / retire_capabilities undefined when absent', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'plain', 'schema: feat\n')
    const yaml = readOpenspecYaml(join(cwd, 'openspec', 'changes', 'plain'))
    expect(yaml?.skipSpecs).toBeUndefined()
    expect(yaml?.retireCapabilities).toBeUndefined()
  })
})

describe('listChanges / resolveChange', () => {
  test('lists active changes sorted, excluding archive, and resolves by id', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'zeta', 'schema: ci\n')
    makeChange(cwd, 'alpha', 'schema: feat\n')
    makeArchived(cwd, '2026-01-01-old')
    const changes = listChanges(cwd)
    expect(changes.map((c) => c.id)).toEqual(['alpha', 'zeta'])
    expect(changes[0]!.schema).toBe('feat')
    const resolved = resolveChange(cwd, 'zeta')
    expect(resolved?.schema).toBe('ci')
    expect(resolveChange(cwd, 'missing')).toBeUndefined()
  })

  test('propagates skip_specs / retire_capabilities onto listChanges and resolveChange', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'skippable', 'schema: feat\nskip_specs: true\nretire_capabilities: true\n')
    const changes = listChanges(cwd)
    expect(changes[0]!.skipSpecs).toBe(true)
    expect(changes[0]!.retireCapabilities).toBe(true)
    const resolved = resolveChange(cwd, 'skippable')
    expect(resolved?.skipSpecs).toBe(true)
    expect(resolved?.retireCapabilities).toBe(true)
  })

  test('change with missing yaml has empty schema', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'bare', null)
    expect(resolveChange(cwd, 'bare')?.schema).toBe('')
  })

  test('refuses what the binary refuses as a lookup name, before touching disk', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'real', 'schema: feat\n')
    // `../changes/real` would join back onto an existing change dir, so the
    // guard must reject the traversal id before resolveChange touches disk.
    for (const bad of ['../changes/real', '../../etc', 'a/b', 'a\\b', '..', '.', '', 'a\0b']) {
      expect(changeLookupNameProblem(bad)).toBeDefined()
      expect(resolveChange(cwd, bad)).toBeUndefined()
    }
    expect(resolveChange(cwd, 'real')?.schema).toBe('feat')
  })

  test('looks a change up by its directory name, as the binary does (verification 16.7, 16.8)', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'Add_Auth', 'schema: feat\n')
    makeChange(cwd, '.hidden', 'schema: feat\n')
    makeChange(cwd, 'archive', 'schema: feat\n')
    writeFileSync(join(cwd, 'openspec/changes/todo'), 'not a change\n')
    // A directory name outside the kebab grammar is still a change.
    expect(resolveChange(cwd, 'Add_Auth')?.schema).toBe('feat')
    // A hidden or reserved name is refused even when its directory exists.
    expect(resolveChange(cwd, '.hidden')).toBeUndefined()
    expect(resolveChange(cwd, 'archive')).toBeUndefined()
    // A regular file is no change.
    expect(resolveChange(cwd, 'todo')).toBeUndefined()
  })
})

describe('readArchiveIndex', () => {
  test('indexes by slug with date, warns on duplicate slug and keeps latest', () => {
    const cwd = makeRepo()
    makeArchived(cwd, '2026-01-01-add-auth')
    makeArchived(cwd, '2026-05-05-add-auth')
    makeArchived(cwd, '2026-02-02-add-widget')
    const index = readArchiveIndex(cwd)
    expect(index.bySlug.get('add-widget')?.date).toBe('2026-02-02')
    expect(index.bySlug.get('add-auth')?.date).toBe('2026-05-05')
    expect(index.warnings.some((w) => w.includes("duplicate archived slug 'add-auth'"))).toBe(true)
  })

  test('warns on and ignores non-conforming archive dirs', () => {
    const cwd = makeRepo()
    makeArchived(cwd, 'not-a-date-prefix')
    const index = readArchiveIndex(cwd)
    expect(index.entries).toHaveLength(0)
    expect(index.warnings.some((w) => w.includes('non-conforming'))).toBe(true)
  })
})

describe('resolveSchema', () => {
  test('cospec type', () => {
    const cwd = makeRepo()
    const res = resolveSchema(cwd, 'feat')
    expect(res.kind).toBe('cospec')
    expect(res.isCospecType).toBe(true)
  })

  test('legacy project schema', () => {
    const cwd = makeRepo()
    mkdirSync(join(cwd, 'openspec', 'schemas', 'atlas'), { recursive: true })
    writeFileSync(join(cwd, 'openspec', 'schemas', 'atlas', 'schema.yaml'), 'name: atlas\n')
    const res = resolveSchema(cwd, 'atlas')
    expect(res.kind).toBe('legacy')
    expect(res.source).toBe('project')
  })

  test('legacy package schema (spec-driven resolves from the bundled package)', () => {
    const cwd = makeRepo()
    const res = resolveSchema(cwd, 'spec-driven')
    expect(res.kind).toBe('legacy')
    expect(res.source).toBe('package')
  })

  test('unknown schema', () => {
    const cwd = makeRepo()
    const res = resolveSchema(cwd, 'nonexistent-schema-xyz')
    expect(res.kind).toBe('unknown')
    expect(res.isCospecType).toBe(false)
  })
})

describe('the namespace-folder detector (verification 4.5)', () => {
  /** A root whose `config.yaml` names a project schema generating into subdirectories. */
  function detectorRepo(): string {
    const cwd = makeRepo()
    const schema = join(cwd, 'openspec', 'schemas', 'subdir', 'schema.yaml')
    mkdirSync(dirname(schema), { recursive: true })
    writeFileSync(
      schema,
      [
        'name: subdir',
        'version: 1',
        'artifacts:',
        '  - id: rfc',
        '    generates: rfc/proposal.md',
        '    description: the rfc',
        '    template: rfc.md',
        '  - id: notes',
        '    generates: notes/**/*.md',
        '    description: notes',
        '    template: notes.md',
        '',
      ].join('\n'),
    )
    writeFileSync(join(cwd, 'openspec', 'config.yaml'), 'schema: subdir\n')
    return cwd
  }

  function put(cwd: string, rel: string, body = 'x\n'): void {
    const path = join(changesDir(cwd), rel)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, body)
  }

  const nestedOf = (cwd: string, name: string) => findNestedChangesIn(changesDir(cwd), name)?.nested

  test('each root marker makes a nested directory a change', () => {
    const cwd = detectorRepo()
    for (const marker of ['.openspec.yaml', 'proposal.md', 'tasks.md', 'design.md'])
      put(cwd, `m-${marker.replace('.', '')}/c/${marker}`)
    for (const marker of ['.openspec.yaml', 'proposal.md', 'tasks.md', 'design.md'])
      expect(nestedOf(cwd, `m-${marker.replace('.', '')}`)).toEqual([
        `m-${marker.replace('.', '')}/c`,
      ])
  })

  test('a delta file only under specs/ is a change; a dot-file there is not', () => {
    const cwd = detectorRepo()
    put(cwd, 'delta/c/specs/widgets/spec.md')
    put(cwd, 'dotspec/c/specs/.keep')
    expect(nestedOf(cwd, 'delta')).toEqual(['delta/c'])
    expect(nestedOf(cwd, 'dotspec')).toBeUndefined()
  })

  test("a schema output only is a change, at the schema's own subdirectory path", () => {
    const cwd = detectorRepo()
    put(cwd, 'rfc/c/rfc/proposal.md')
    put(cwd, 'notes/c/notes/a/b.md')
    put(cwd, 'wrong/c/rfc/other.md')
    expect(nestedOf(cwd, 'rfc')).toEqual(['rfc/c'])
    expect(nestedOf(cwd, 'notes')).toEqual(['notes/c'])
    expect(nestedOf(cwd, 'wrong')).toBeUndefined()
  })

  test('a file of its own keeps a directory a change; a dot-file of its own does not', () => {
    const cwd = detectorRepo()
    put(cwd, 'own/README.md')
    put(cwd, 'own/c/.openspec.yaml')
    put(cwd, 'owndot/.DS_Store')
    put(cwd, 'owndot/c/.openspec.yaml')
    expect(nestedOf(cwd, 'own')).toBeUndefined()
    expect(nestedOf(cwd, 'owndot')).toEqual(['owndot/c'])
  })

  test('depths one to three are searched, four is not', () => {
    const cwd = detectorRepo()
    put(cwd, 'd1/c/.openspec.yaml')
    put(cwd, 'd2/a/c/.openspec.yaml')
    put(cwd, 'd3/a/b/c/.openspec.yaml')
    put(cwd, 'd4/a/b/c/d/.openspec.yaml')
    expect(nestedOf(cwd, 'd1')).toEqual(['d1/c'])
    expect(nestedOf(cwd, 'd2')).toEqual(['d2/a/c'])
    expect(nestedOf(cwd, 'd3')).toEqual(['d3/a/b/c'])
    expect(nestedOf(cwd, 'd4')).toBeUndefined()
  })

  test('a dot-directory, archive and a change-looking child are never descended', () => {
    const cwd = detectorRepo()
    put(cwd, '.hidden/c/.openspec.yaml')
    put(cwd, 'archive/2026-01-01-x/c/.openspec.yaml')
    put(cwd, 'dotchild/.c/.openspec.yaml')
    put(cwd, 'shallow/c/.openspec.yaml')
    put(cwd, 'shallow/c/deeper/.openspec.yaml')
    expect(nestedOf(cwd, '.hidden')).toBeUndefined()
    expect(nestedOf(cwd, 'archive')).toBeUndefined()
    expect(nestedOf(cwd, 'dotchild')).toBeUndefined()
    expect(nestedOf(cwd, 'shallow')).toEqual(['shallow/c'])
  })

  test('nested ids are sorted, and the explanation is upstream’s sentence', () => {
    const cwd = detectorRepo()
    put(cwd, 'two/zeta/.openspec.yaml')
    put(cwd, 'two/eta/proposal.md')
    const finding = findNestedChangesIn(changesDir(cwd), 'two')!
    expect(finding).toEqual({ name: 'two', nested: ['two/eta', 'two/zeta'] })
    expect(describeNestedChange(finding)).toBe(
      '"two" is not a change: it is a folder wrapping openspec/changes/two/eta/, openspec/changes/two/zeta/. ' +
        'A change must be a directory directly under openspec/changes/, so those nested directories are ' +
        'invisible to OpenSpec while the folder around them is reported as a change. Nested paths are ' +
        'supported under openspec/specs/ only. Rename each nested change to a flat name (for example "two-eta").',
    )
    expect(findNestedChanges(changesDir(cwd), ['two', 'missing']).map((f) => f.name)).toEqual([
      'two',
    ])
  })

  test('a change with a root marker is never a namespace folder', () => {
    const cwd = detectorRepo()
    put(cwd, 'alpha/proposal.md')
    put(cwd, 'alpha/sub/.openspec.yaml')
    expect(nestedOf(cwd, 'alpha')).toBeUndefined()
  })

  const asRoot = process.getuid?.() === 0
  test.skipIf(asRoot)('an unreadable subdirectory reads as empty and nothing throws', () => {
    const cwd = detectorRepo()
    put(cwd, 'locked/c/.openspec.yaml')
    put(cwd, 'locked/d/.openspec.yaml')
    const locked = join(changesDir(cwd), 'locked', 'c')
    chmodSync(locked, 0o000)
    try {
      expect(nestedOf(cwd, 'locked')).toEqual(['locked/d'])
      chmodSync(join(changesDir(cwd), 'locked'), 0o000)
      expect(nestedOf(cwd, 'locked')).toBeUndefined()
    } finally {
      chmodSync(join(changesDir(cwd), 'locked'), 0o755)
      chmodSync(locked, 0o755)
    }
  })
})

describe('listChanges drops dot-directories', () => {
  test('as the binary enumerates active changes', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'alpha', 'schema: feat\n')
    makeChange(cwd, '.hidden', 'schema: feat\n')
    expect(listChanges(cwd).map((c) => c.id)).toEqual(['alpha'])
  })
})

describe('the user schema tier (verification 10.1)', () => {
  test("userSchemasDir is the binary's getGlobalDataDir plus schemas in every case", () => {
    expect(userSchemasDir({ XDG_DATA_HOME: '/x' }, '/h', 'darwin')).toBe('/x/openspec/schemas')
    expect(userSchemasDir({ XDG_DATA_HOME: '/x' }, '/h', 'linux')).toBe('/x/openspec/schemas')
    expect(userSchemasDir({ XDG_DATA_HOME: '' }, '/h', 'linux')).toBe(
      '/h/.local/share/openspec/schemas',
    )
    expect(userSchemasDir({}, '/h', 'darwin')).toBe('/h/.local/share/openspec/schemas')
    expect(userSchemasDir({}, '/h', 'linux')).toBe('/h/.local/share/openspec/schemas')
    expect(userSchemasDir({ LOCALAPPDATA: '/l' }, '/h', 'win32')).toBe(
      join('/l', 'openspec', 'schemas'),
    )
    expect(userSchemasDir({ LOCALAPPDATA: '' }, '/h', 'win32')).toBe(
      join('/h', 'AppData', 'Local', 'openspec', 'schemas'),
    )
    expect(userSchemasDir({}, '/h', 'win32')).toBe(
      join('/h', 'AppData', 'Local', 'openspec', 'schemas'),
    )
  })

  test('change.ts, new.ts and change-metadata.ts compute the directory in one place', () => {
    const src = (rel: string) => readFileSync(join(import.meta.dir, '../../../src', rel), 'utf8')
    const definitions = ['core/change.ts', 'commands/new.ts', 'core/change-metadata.ts'].filter(
      (rel) => /function userSchemasDir\b/.test(src(rel)),
    )
    expect(definitions).toEqual(['core/change-metadata.ts'])
    for (const rel of ['core/change.ts', 'commands/new.ts'])
      expect(src(rel)).toMatch(
        /import \{[^}]*\buserSchemasDir\b[^}]*\} from '(?:\.\.\/core|\.)\/change-metadata\.ts'/,
      )
    expect(src('core/change.ts')).not.toContain("'.config'")
  })

  test('resolveSchema classifies a schema under XDG_DATA_HOME as user, never one under ~/.config', () => {
    const cwd = makeRepo()
    const data = mkdtempSync(join(tmpdir(), 'cospec-data-'))
    const home = mkdtempSync(join(tmpdir(), 'cospec-home-'))
    roots.push(data, home)
    const write = (dir: string, name: string) => {
      mkdirSync(join(dir, name), { recursive: true })
      writeFileSync(join(dir, name, 'schema.yaml'), `name: ${name}\n`)
    }
    write(join(data, 'openspec', 'schemas'), 'house-style')
    write(join(home, '.config', 'openspec', 'schemas'), 'config-style')
    const saved = { XDG_DATA_HOME: process.env.XDG_DATA_HOME, HOME: process.env.HOME }
    process.env.XDG_DATA_HOME = data
    process.env.HOME = home
    try {
      expect(resolveSchema(cwd, 'house-style')).toMatchObject({ kind: 'legacy', source: 'user' })
      expect(resolveSchema(cwd, 'config-style').kind).toBe('unknown')
    } finally {
      for (const [key, value] of Object.entries(saved))
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
    }
  })
})

describe("changeMetadataRefused mirrors the binary's readChangeMetadata (verification 17.3)", () => {
  const listed = () => ['chore', 'feat']
  const changeWith = (yaml: string | null): string => {
    const cwd = makeRepo()
    makeChange(cwd, 'c1', yaml)
    return join(cwd, 'openspec', 'changes', 'c1')
  }

  test('a valid file, or none, is not refused', () => {
    expect(changeMetadataRefused(changeWith('schema: chore\ncreated: 2026-09-01\n'), listed)).toBe(
      false,
    )
    expect(changeMetadataRefused(changeWith(null), listed)).toBe(false)
  })

  test('each ChangeMetadataSchema failure is refused', () => {
    for (const extra of [
      'created: notadate',
      'skip_specs: "yes"',
      'retire_capabilities: 1',
      'goal: ""',
      'affected_areas: [""]',
      'initiative: {store: s1}',
      'initiative: {store: S1, id: i1}',
      'initiative: {store: s1, id: i1, extra: x}',
    ])
      expect({
        extra,
        refused: changeMetadataRefused(changeWith(`schema: chore\n${extra}\n`), listed),
      }).toEqual({ extra, refused: true })
  })

  test('a file that is not YAML, or names an unlisted schema, is refused', () => {
    expect(changeMetadataRefused(changeWith('schema: [chore\n'), listed)).toBe(true)
    expect(changeMetadataRefused(changeWith('schema: house-style\n'), listed)).toBe(true)
  })

  test.skipIf(process.getuid?.() === 0)('an unreadable file is refused', () => {
    const dir = changeWith('schema: chore\n')
    const file = join(dir, '.openspec.yaml')
    chmodSync(file, 0o000)
    try {
      expect(changeMetadataRefused(dir, listed)).toBe(true)
    } finally {
      chmodSync(file, 0o644)
    }
  })
})
