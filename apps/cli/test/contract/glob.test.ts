// `core/glob.ts`, cospec's port of the pinned binary's `artifactOutputExists`
// over the fast-glob cospec pins (fast-glob 3, micromatch 4, picomatch 2,
// braces 3), held to those modules as the pinned package resolves them: the
// same fast-glob version, fast-glob's brace expansion, the regex fast-glob
// matches each pattern with (under its own default settings' micromatch
// options), and the binary's `artifactOutputExists` answer over one change
// directory. The port's surface is `expandBraces(pattern)`, `makeRe(pattern)`
// and `artifactOutputExists(changeDir, generates)`.

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { parse as parseYaml } from 'yaml'

import { COSPEC_TYPES } from '../../src/core/change.ts'
import { openspecPackageDir } from '../../src/core/openspec.ts'
import { cleanupAll, mkTempRepo, REPO_ROOT } from '../fixtures/support.ts'

afterAll(cleanupAll)

interface GlobPort {
  expandBraces: (pattern: string) => string[]
  makeRe: (pattern: string) => RegExp
  artifactOutputExists: (changeDir: string, generates: string) => boolean
}

// Loaded at run time, so a missing or incomplete port fails its rows rather
// than the file.
const PORT_MODULE = join(import.meta.dir, '../../src/core', 'glob.ts')
const port = async (): Promise<GlobPort> => (await import(PORT_MODULE)) as GlobPort

const requireFromOpenspec = createRequire(join(openspecPackageDir(), 'package.json'))
const fastGlobOut = dirname(requireFromOpenspec.resolve('fast-glob'))
const fgPattern = requireFromOpenspec(join(fastGlobOut, 'utils/pattern.js')) as {
  expandBraceExpansion: (pattern: string) => string[]
  makeRe: (pattern: string, options: object) => RegExp
}
const FgSettings = (
  requireFromOpenspec(join(fastGlobOut, 'settings.js')) as { default: new (o: object) => object }
).default
const FgProviderSync = (
  requireFromOpenspec(join(fastGlobOut, 'providers/sync.js')) as {
    default: new (settings: object) => { _getMicromatchOptions: () => object }
  }
).default
/** The micromatch options fast-glob matches with under its default settings. */
const FG_MATCH_OPTIONS = new FgProviderSync(new FgSettings({}))._getMicromatchOptions()

const upstream = (await import(
  join(openspecPackageDir(), 'dist/core/artifact-graph/outputs.js')
)) as { artifactOutputExists: (changeDir: string, generates: string) => boolean }

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
  ]),
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

/** An `artifactOutputExists` answer: its boolean, or the message it throws with. */
function outcome(run: () => boolean): { exists: boolean } | { throws: string } {
  try {
    return { exists: run() }
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

describe("core/glob.ts answers as the pinned binary's glob modules", () => {
  test('cospec resolves the fast-glob the pinned binary resolves', () => {
    const own = createRequire(PORT_MODULE)
    const version = (req: NodeJS.Require) =>
      (req(req.resolve('fast-glob/package.json')) as { version: string }).version
    expect(version(own)).toBe(version(requireFromOpenspec))
  })

  test('every pattern expands its braces as fast-glob does', async () => {
    const { expandBraces } = await port()
    for (const pattern of PATTERNS)
      expect({ pattern, expanded: expandBraces(pattern) }).toEqual({
        pattern,
        expanded: fgPattern.expandBraceExpansion(pattern),
      })
  })

  test("every pattern and each expansion compiles to fast-glob's regex", async () => {
    const { makeRe } = await port()
    for (const pattern of new Set(
      PATTERNS.flatMap((p) => [p, ...fgPattern.expandBraceExpansion(p)]),
    )) {
      const want = fgPattern.makeRe(pattern, FG_MATCH_OPTIONS)
      const got = makeRe(pattern)
      expect({ pattern, source: got.source, flags: got.flags }).toEqual({
        pattern,
        source: want.source,
        flags: want.flags,
      })
    }
  })

  test("artifactOutputExists is the binary's over a populated change", async () => {
    const { artifactOutputExists } = await port()
    const dir = changeDir(FILES)
    for (const pattern of PATTERNS)
      expect({ pattern, ...outcome(() => artifactOutputExists(dir, pattern)) }).toEqual({
        pattern,
        ...outcome(() => upstream.artifactOutputExists(dir, pattern)),
      })
  })

  test("artifactOutputExists is the binary's with each file alone", async () => {
    const { artifactOutputExists } = await port()
    for (const file of FILES) {
      const dir = changeDir([file])
      for (const pattern of PATTERNS)
        expect({ file, pattern, ...outcome(() => artifactOutputExists(dir, pattern)) }).toEqual({
          file,
          pattern,
          ...outcome(() => upstream.artifactOutputExists(dir, pattern)),
        })
    }
  })
})
