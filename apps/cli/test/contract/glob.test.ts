// `core/glob.ts`, cospec's port of the pinned binary's `resolveArtifactOutputs` /
// `artifactOutputExists` over the glob stack cospec pins (tinyglobby, picomatch,
// brace-expansion), held to those modules as the pinned package resolves them: the
// same package versions, the binary's own `isGlobPattern`, and the binary's
// `resolveArtifactOutputs` answer (its file list, or the message it throws with) over
// one change directory, including the nesting and expansion bounds.

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'

import { parse as parseYaml } from 'yaml'

import { COSPEC_TYPES } from '../../src/core/change.ts'
import { openspecPackageDir } from '../../src/core/openspec.ts'
import { cleanupAll, mkTempRepo, REPO_ROOT } from '../fixtures/support.ts'

afterAll(cleanupAll)

interface GlobPort {
  isGlobPattern: (pattern: string) => boolean
  resolveArtifactOutputs: (changeDir: string, generates: string) => string[]
  artifactOutputExists: (changeDir: string, generates: string) => boolean
}

// Loaded at run time, so a missing or incomplete port fails its rows rather
// than the file.
const PORT_MODULE = join(import.meta.dir, '../../src/core', 'glob.ts')
const port = async (): Promise<GlobPort> => (await import(PORT_MODULE)) as GlobPort

const requireFromOpenspec = createRequire(join(openspecPackageDir(), 'package.json'))

const upstream = (await import(
  join(openspecPackageDir(), 'dist/core/artifact-graph/outputs.js')
)) as GlobPort

function generatesOf(schemaFile: string): string[] {
  const doc = parseYaml(readFileSync(schemaFile, 'utf8')) as { artifacts: { generates: string }[] }
  return doc.artifacts.map((a) => a.generates)
}

/** Every `generates` the pinned dist's schemas and cospec's types declare, and one per glob feature. */
const PATTERNS = [
  ...new Set([
    ...readdirSync(join(openspecPackageDir(), 'schemas')).flatMap((name) =>
      generatesOf(join(openspecPackageDir(), 'schemas', name, 'schema.yaml')),
    ),
    ...COSPEC_TYPES.flatMap((name) =>
      generatesOf(join(REPO_ROOT, 'openspec/schemas', name, 'schema.yaml')),
    ),
    'rfc/{proposal,design}*.md',
    'rfc/{proposal,design}.md',
    'rfc/{a,b{c,d}}*.md',
    '{rfc,adr}/**/*.md',
    '{,rfc/}*.md',
    'notes/{1..3}-*.md',
    'notes/{01..10}-*.md',
    'notes/{a..c}*.md',
    'rfc/@(proposal|design)*.md',
    'rfc/!(README)*.md',
    'rfc/+([a-z])-notes.md',
    'rfc/?(draft-)proposal.md',
    'rfc/*(draft-)proposal.md',
    '!rfc/*.md',
    '**/*.md',
    '*.md',
    'rfc/*/notes.md',
    'rfc/?.md',
    'rfc/[pd]*.md',
    'rfc/[!R]*.md',
    'rfc/[[:alpha:]]*.md',
    'rfc/\\*.md',
    '.hidden/*.md',
    'rfc/{draft}/{1..2}.md',
    'rfc/{draft}*.md',
    'rfc//*.md',
    '{../outside,rfc}/*.md',
    'rfc/**/../*.md',
  ]),
]

/** Patterns at and past the nesting (16) and expansion (1024) bounds. */
const BOUND_PATTERNS = [
  `rfc/${'{a,'.repeat(17)}b${'}'.repeat(17)}*.md`,
  `rfc/${'{a,'.repeat(16)}b${'}'.repeat(16)}*.md`,
  `rfc/${'('.repeat(17)}a${')'.repeat(17)}*.md`,
  `rfc/${'{a,b}'.repeat(11)}.md`,
  `rfc/${'{a,b}'.repeat(10)}.md`,
  'rfc/{1..1025}.md',
  'rfc/{1..1024}.md',
  'rfc/{1..1000000000}.md',
]

/** One change directory holding a file each pattern above can match, and some none can. */
const FILES = [
  'proposal.md',
  'design.md',
  'tasks.md',
  'README.md',
  'specs/widgets/spec.md',
  'rfc/proposal.md',
  'rfc/design-v2.md',
  'rfc/abc-notes.md',
  'rfc/draft-proposal.md',
  'rfc/x/notes.md',
  'rfc/p.md',
  'rfc/README.md',
  'rfc/*.md',
  'rfc/bd.md',
  'notes/2-first.md',
  'notes/07-later.md',
  'notes/b.md',
  'adr/0001/decision.md',
  '.hidden/a.md',
  'other/file.txt',
]

/** A `resolveArtifactOutputs` answer, relative to `dir`, or the message it throws with. */
function outcome(dir: string, run: () => string[]): { paths: string[] } | { throws: string } {
  try {
    return { paths: run().map((p) => relative(realpathSync(dir), p)) }
  } catch (error) {
    return { throws: (error as Error).message }
  }
}

function changeDir(files: readonly string[]): string {
  const dir = join(mkTempRepo(), 'change')
  mkdirSync(dir, { recursive: true })
  for (const rel of files) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), '# content\n')
  }
  return dir
}

const GLOB_PACKAGES = ['tinyglobby', 'picomatch', 'brace-expansion'] as const

describe("core/glob.ts answers as the pinned binary's glob modules", () => {
  test('cospec resolves the glob packages the pinned binary resolves', () => {
    const own = createRequire(PORT_MODULE)
    const version = (req: NodeJS.Require, name: string) =>
      (req(req.resolve(`${name}/package.json`)) as { version: string }).version
    for (const name of GLOB_PACKAGES)
      expect({ name, version: version(own, name) }).toEqual({
        name,
        version: version(requireFromOpenspec, name),
      })
  })

  test('every pattern reads as a glob exactly when the binary says so', async () => {
    const { isGlobPattern } = await port()
    for (const pattern of [...PATTERNS, ...BOUND_PATTERNS])
      expect({ pattern, glob: isGlobPattern(pattern) }).toEqual({
        pattern,
        glob: upstream.isGlobPattern(pattern),
      })
  })

  test("resolveArtifactOutputs is the binary's over a populated change", async () => {
    const { resolveArtifactOutputs } = await port()
    const dir = changeDir(FILES)
    for (const pattern of [...PATTERNS, ...BOUND_PATTERNS])
      expect({ pattern, ...outcome(dir, () => resolveArtifactOutputs(dir, pattern)) }).toEqual({
        pattern,
        ...outcome(dir, () => upstream.resolveArtifactOutputs(dir, pattern)),
      })
  }, 60_000)

  test("artifactOutputExists is the binary's with each file alone", async () => {
    const { artifactOutputExists } = await port()
    for (const file of FILES) {
      const dir = changeDir([file])
      for (const pattern of PATTERNS)
        expect({ file, pattern, ...exists(() => artifactOutputExists(dir, pattern)) }).toEqual({
          file,
          pattern,
          ...exists(() => upstream.artifactOutputExists(dir, pattern)),
        })
    }
  }, 60_000)
})

function exists(run: () => boolean): { exists: boolean } | { throws: string } {
  try {
    return { exists: run() }
  } catch (error) {
    return { throws: (error as Error).message }
  }
}
