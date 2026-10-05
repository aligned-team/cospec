// The namespace-folder detector (design D2) against the pinned binary's own
// `findNestedChangesIn` (`dist/utils/nested-change.js`), loaded in-process
// from the pinned package. Every schema the pinned dist ships and every cospec
// type is a row, plus project schemas whose `generates` use braces, extglobs
// and a negation: for each artifact, a hand-made change holding only that
// artifact's output, and a folder wrapping one. A real change must never be
// reported as a namespace folder, and every answer must be the binary's.

import { afterAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { parse as parseYaml } from 'yaml'

import { COSPEC_TYPES, findNestedChangesIn } from '../../src/core/change.ts'
import { openspecPackageDir } from '../../src/core/openspec.ts'
import { cleanupAll, mkTempRepo, REPO_ROOT } from '../fixtures/support.ts'

afterAll(cleanupAll)

type Finding = { name: string; nested: string[] } | undefined

const upstream = (await import(join(openspecPackageDir(), 'dist/utils/nested-change.js'))) as {
  findNestedChangesIn: (changesDir: string, name: string) => Promise<Finding>
}

/** A concrete file each `generates` pattern matches, as the binary's glob reads it. */
const EXAMPLE_PATH: Record<string, string> = {
  'specs/**/*.md': 'specs/widgets/spec.md',
  'rfc/{proposal,design}*.md': 'rfc/proposal.md',
  'rfc/@(proposal|design)*.md': 'rfc/design-v2.md',
  'rfc/!(README)*.md': 'rfc/proposal.md',
  'rfc/+([a-z])-notes.md': 'rfc/abc-notes.md',
  'notes/{1..3}-*.md': 'notes/2-first.md',
  'rfc/?(draft-)proposal.md': 'rfc/draft-proposal.md',
  '{rfc,adr}/**/*.md': 'adr/0001/decision.md',
  '!rfc/*.md': 'rfc/negated.md',
}

/** Project schemas whose outputs sit in a subdirectory, one glob feature each. */
const CUSTOM_SCHEMAS: Record<string, string[]> = {
  'rfc-braces': ['rfc/{proposal,design}*.md'],
  'rfc-extglob-at': ['rfc/@(proposal|design)*.md'],
  'rfc-extglob-negate': ['rfc/!(README)*.md'],
  'rfc-extglob-plus': ['rfc/+([a-z])-notes.md'],
  'rfc-extglob-qmark': ['rfc/?(draft-)proposal.md'],
  'notes-range': ['notes/{1..3}-*.md'],
  'rfc-brace-globstar': ['{rfc,adr}/**/*.md'],
  'rfc-negated': ['!rfc/*.md'],
}

function exampleFor(generates: string): string {
  return EXAMPLE_PATH[generates] ?? generates
}

function schemaYaml(name: string, generates: string[]): string {
  const artifacts = generates
    .map(
      (g, i) =>
        `  - id: a${i}\n    generates: '${g}'\n    description: artifact ${i}\n    template: t.md\n    instruction: Write it.\n    requires: []\n`,
    )
    .join('')
  return `name: ${name}\nversion: 1\ndescription: ${name}\nartifacts:\n${artifacts}`
}

interface SchemaRow {
  name: string
  /** Installs the schema into the root and returns its `generates` values. */
  install: (root: string) => string[]
}

function generatesOf(schemaFile: string): string[] {
  const doc = parseYaml(readFileSync(schemaFile, 'utf8')) as { artifacts: { generates: string }[] }
  return doc.artifacts.map((a) => a.generates)
}

const PACKAGE_SCHEMAS: SchemaRow[] = readdirSync(join(openspecPackageDir(), 'schemas')).map(
  (name) => ({
    name,
    install: () => generatesOf(join(openspecPackageDir(), 'schemas', name, 'schema.yaml')),
  }),
)

const COSPEC_SCHEMAS: SchemaRow[] = COSPEC_TYPES.map((name) => ({
  name,
  install: (root) => {
    cpSync(join(REPO_ROOT, 'openspec/schemas', name), join(root, 'openspec/schemas', name), {
      recursive: true,
    })
    return generatesOf(join(root, 'openspec/schemas', name, 'schema.yaml'))
  },
}))

const GLOB_SCHEMAS: SchemaRow[] = Object.entries(CUSTOM_SCHEMAS).map(([name, generates]) => ({
  name,
  install: (root) => {
    const dir = join(root, 'openspec/schemas', name)
    mkdirSync(join(dir, 'templates'), { recursive: true })
    writeFileSync(join(dir, 'schema.yaml'), schemaYaml(name, generates))
    writeFileSync(join(dir, 'templates/t.md'), '# t\n')
    return generates
  },
}))

function write(root: string, rel: string): void {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, '# content\n')
}

/**
 * A root whose `config.yaml` names `row`'s schema, holding for each artifact a
 * hand-made change `real-<i>` with only that output, and a folder `ns-<i>`
 * wrapping such a change. Returns every candidate name.
 */
function schemaRoot(row: SchemaRow): { root: string; names: string[] } {
  const root = mkTempRepo()
  mkdirSync(join(root, 'openspec/changes'), { recursive: true })
  writeFileSync(join(root, 'openspec/config.yaml'), `schema: ${row.name}\n`)
  const generates = row.install(root)
  const names: string[] = []
  generates.forEach((g, i) => {
    write(root, `openspec/changes/real-${i}/${exampleFor(g)}`)
    write(root, `openspec/changes/ns-${i}/child/${exampleFor(g)}`)
    names.push(`real-${i}`, `ns-${i}`)
  })
  return { root, names }
}

async function compare(row: SchemaRow): Promise<void> {
  const { root, names } = schemaRoot(row)
  const changesDir = join(root, 'openspec/changes')
  for (const name of names) {
    const want = await upstream.findNestedChangesIn(changesDir, name)
    const got = findNestedChangesIn(changesDir, name)
    expect({ schema: row.name, name, finding: got ?? null }).toEqual({
      schema: row.name,
      name,
      finding: want ?? null,
    })
  }
}

describe("the namespace-folder detector answers as the binary's findNestedChangesIn", () => {
  for (const row of PACKAGE_SCHEMAS)
    test(`the pinned dist's ${row.name} schema`, () => compare(row))

  for (const row of COSPEC_SCHEMAS) test(`cospec's ${row.name} schema`, () => compare(row))

  for (const row of GLOB_SCHEMAS)
    test(`a project schema generating ${CUSTOM_SCHEMAS[row.name]!.join(', ')}`, () => compare(row))

  test('no hand-made change holding only its schema output is reported as a folder', () => {
    for (const row of [...PACKAGE_SCHEMAS, ...COSPEC_SCHEMAS, ...GLOB_SCHEMAS]) {
      const { root, names } = schemaRoot(row)
      const changesDir = join(root, 'openspec/changes')
      for (const name of names.filter((n) => n.startsWith('real-')))
        expect({
          schema: row.name,
          name,
          finding: findNestedChangesIn(changesDir, name) ?? null,
        }).toEqual({ schema: row.name, name, finding: null })
    }
  })
})
