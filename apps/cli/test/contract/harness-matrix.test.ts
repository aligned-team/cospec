// The tool matrix: every tool the pinned OpenSpec binary supports is a `HARNESS_TABLE` row
// whose fields, command paths, rendered files and detection agree with the binary's own
// `init --tools <id>` output (`test/fixtures/upstream-init/<id>.json`, re-taken against the
// pin by `upstream-init-fixtures.test.ts`). The pinned `AI_TOOLS`, `LEGACY_TOOL_ROOTS` and
// command adapters are imported here, in tests only; cospec never calls them at runtime.
//
// One test per pinned id except `github-copilot` (a pending entry owned by a later change).
// A row that has not landed yet is listed in `PENDING_ROWS` with the task that lands it, and
// its test is `test.failing`; bun fails a `test.failing` that starts passing, so landing the
// row forces the entry's removal in the same commit. A gap in a shipped row (a detection or
// legacy-root field a later task aligns) is listed in `SHIPPED_GAPS` the same way. Both
// tables are empty when the change closes.
//
// Comparison rule for the render (design decision 14), against the capture's tool files
// (everything outside `openspec/` except the shared-root marker, which `generate()` writes):
// - the same path set after `opsx-`/`opsx/`/`openspec-` are respelled `cospec` (the one
//   command whose id differs is upstream's `sync`, cospec's `sync-specs`) and the same scope;
// - the same wrapper rule: YAML frontmatter, Markdown header, TOML preamble or none;
// - YAML frontmatter keys equal upstream's, plus cospec's `metadata` provenance, minus
//   `allowed-tools`: upstream's value is `Bash(openspec:*)`, a permission for the bare
//   `openspec` binary that cospec never grants (its one permission is `Bash(cospec *)`);
// - header and TOML wrappers have the same shape (the title, description and body are
//   cospec's canon, so their values are not compared).
// `setupNote` is asserted to include upstream's note, not to equal it.

import { afterAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { parse } from 'yaml'

import { openspecPackageDir } from '../../src/core/openspec.ts'
import {
  adapterFor,
  commandPath,
  HARNESS_NAMES,
  type HarnessAdapter,
} from '../../src/harness/adapters.ts'
import { type HarnessName, renderHarnessFiles } from '../../src/harness/render.ts'
import { cleanupAll, cospec, mkTempRepo, oracleEnv } from '../fixtures/support.ts'
import { TEST_VERSION, TYPE_TABLE } from '../unit/harness/fixtures.ts'
import { cutHead, readFixture, type UpstreamInitCapture } from './support/upstream-init-capture.ts'

afterAll(cleanupAll)

const DIST = join(openspecPackageDir(), 'dist')

interface UpstreamTool {
  name: string
  value: string
  skillsDir?: string
  globalSkillsDir?: string
  legacySkillsDirs?: string[]
  detectionPaths?: string[]
  requiresIdeRestart?: boolean
  setupNote?: string
  searchAliases?: string[]
}
interface UpstreamLegacyRoot {
  root: string
  needsConsent: boolean
  timing?: 'before-generation' | 'after-generation'
}
interface UpstreamAdapter {
  toolId: string
  getFilePath(commandId: string): string
}

const { AI_TOOLS } = (await import(join(DIST, 'core/config.js'))) as { AI_TOOLS: UpstreamTool[] }
const { LEGACY_TOOL_ROOTS } = (await import(join(DIST, 'core/migration.js'))) as {
  LEGACY_TOOL_ROOTS: Record<string, UpstreamLegacyRoot[]>
}
const { CommandAdapterRegistry } = (await import(
  join(DIST, 'core/command-generation/registry.js')
)) as {
  CommandAdapterRegistry: { get(id: string): UpstreamAdapter | undefined }
}

/** Every pinned id except `github-copilot`, in `AI_TOOLS` order. */
const UPSTREAM_TOOLS = AI_TOOLS.filter((t) => t.value !== 'github-copilot')

/** The rows `HARNESS_TABLE` shipped before this change; their output stays byte-identical. */
const SHIPPED_ROWS = ['claude', 'codex', 'opencode', 'agents']

// --- what is not yet true, and the task that makes it true ---------------------------

/** Rows not yet in `HARNESS_TABLE`, each with the tasks.md item that adds it. */
const PENDING_ROWS = new Map<string, string>([
  ['codeartsagent', '6.2'],
  ['forgecode', '6.2'],
  ['vibe', '6.2'],
  ['hermes', '6.3'],
  ['kimi', '6.4'],
  ['minimax-code', '6.5'],
  ['rovodev', '6.6'],
  ['zed', '6.7'],
  ['oh-my-pi', '7.5'],
  ['command-code', '7.6'],
  ['roocode', '7.7'],
  ['amazon-q', '8.2'],
  ['antigravity', '8.3'],
  ['cline', '8.4'],
  ['devin', '8.5'],
  ['kilocode', '8.6'],
  ['pi', '8.6'],
  ['codebuddy', '8.7'],
  ['crush', '8.7'],
  ['lingma', '8.7'],
  ['qoder', '8.7'],
  ['zcode', '8.7'],
  ['continue', '8.8'],
  ['kiro', '8.8'],
  ['gemini', '8.8'],
])

type Check = 'detectionPaths' | 'legacyToolRoots' | 'initDetection'

/** Checks a shipped row does not yet pass, each with the task that aligns it. */
const SHIPPED_GAPS: Record<string, Partial<Record<Check, string>>> = {
  codex: { detectionPaths: '4.3', legacyToolRoots: '9.2', initDetection: '4.3' },
}

/** The table's id order lands whole only with the last row (task 8.9). */
const TABLE_ORDER_TASK: string | undefined = '8.9'

// --- helpers -------------------------------------------------------------------------

const OMITTED_UPSTREAM_KEYS = new Set(['allowed-tools'])
const WORKFLOWS = readFixture('claude').globalConfig.workflows

/** Upstream's command id for a workflow is cospec's, except `sync` (cospec: `sync-specs`). */
function cospecCommand(upstreamWorkflow: string): string {
  return upstreamWorkflow === 'sync' ? 'sync-specs' : upstreamWorkflow
}

/** Respell one upstream tool-file path as cospec writes it. */
function respellPath(path: string): string {
  const segments = path.split('/').map((seg) => {
    if (seg === 'opsx') return 'cospec'
    return seg.replace(/^opsx-/, 'cospec-').replace(/^openspec-/, 'cospec-')
  })
  const last = segments.length - 1
  segments[last] = segments[last]!.replace(/^(cospec-)?sync(\.[a-z.]+)$/, '$1sync-specs$2')
  return segments.join('/')
}

function yamlKeys(head: string): string[] {
  const body = head.replace(/^---\n/, '').replace(/\n---\n$/, '\n')
  return Object.keys(parse(body) as Record<string, unknown>).toSorted()
}

/** The capture's tool files: outside `openspec/`, and not the shared-root marker. */
function toolFiles(fixture: UpstreamInitCapture): UpstreamInitCapture['files'] {
  return fixture.files.filter(
    (f) => !f.path.startsWith('openspec/') && !f.path.endsWith('/.openspec-target'),
  )
}

interface LegacyRootRow {
  root: string
  needsConsent: boolean
  timing?: 'before-generation' | 'after-generation'
}

/** `legacyToolRoots` is a row field a later task adds; read it without widening the table type. */
function legacyToolRootsOf(row: HarnessAdapter): LegacyRootRow[] {
  return [
    ...((row as HarnessAdapter & { legacyToolRoots?: readonly LegacyRootRow[] }).legacyToolRoots ??
      []),
  ]
}

function normaliseRoots(roots: readonly LegacyRootRow[]): Required<LegacyRootRow>[] {
  return roots.map((r) => ({
    root: r.root,
    needsConsent: r.needsConsent,
    timing: r.timing ?? 'before-generation',
  }))
}

function expectedDetectionPaths(tool: UpstreamTool): string[] {
  // The set upstream's `getAvailableTools` checks: `detectionPaths`, else the project
  // `skillsDir`; a home-skills tool has no project path at all.
  if (tool.detectionPaths !== undefined && tool.detectionPaths.length > 0)
    return tool.detectionPaths
  return tool.skillsDir === undefined ? [] : [tool.skillsDir]
}

function checkDetectionPaths(row: HarnessAdapter, tool: UpstreamTool): void {
  expect([...row.detectionPaths]).toEqual(expectedDetectionPaths(tool))
}

function checkLegacyToolRoots(row: HarnessAdapter, tool: UpstreamTool): void {
  expect(normaliseRoots(legacyToolRootsOf(row))).toEqual(
    normaliseRoots(LEGACY_TOOL_ROOTS[tool.value] ?? []),
  )
}

function checkFields(row: HarnessAdapter, tool: UpstreamTool): void {
  expect(row.id).toBe(tool.value)
  expect(row.displayName).toBe(tool.name)
  expect(row.skillsDir).toBe(tool.skillsDir)
  expect(row.globalSkillsDir).toBe(tool.globalSkillsDir)
  expect([...(row.legacySkillsDirs ?? [])]).toEqual(tool.legacySkillsDirs ?? [])
  expect(row.requiresIdeRestart).toBe(tool.requiresIdeRestart ?? false)
  expect([...(row.searchAliases ?? [])]).toEqual(tool.searchAliases ?? [])
  if (tool.setupNote !== undefined) expect(row.setupNote ?? '').toContain(tool.setupNote)
}

function checkAdapterPaths(row: HarnessAdapter, tool: UpstreamTool): void {
  const upstream = CommandAdapterRegistry.get(tool.value)
  if (upstream === undefined) {
    expect(row.commands).toBeUndefined()
    return
  }
  expect(row.commands).toBeDefined()
  for (const workflow of WORKFLOWS) {
    const posix = upstream.getFilePath(workflow).split('\\').join('/')
    expect(commandPath(row, cospecCommand(workflow))).toBe(respellPath(posix))
  }
}

function checkRender(tool: UpstreamTool): void {
  const fixture = readFixture(tool.value)
  expect(fixture.exitCode).toBe(0)
  const rendered = renderHarnessFiles({
    harnesses: [tool.value as HarnessName],
    typeTable: TYPE_TABLE,
    version: 'cospec@test',
  }).filter((f) => f.kind === 'command' || f.kind === 'skill')
  const byPath = new Map(rendered.map((f) => [f.path, f]))

  const upstreamFiles = toolFiles(fixture)
  expect(rendered.map((f) => `${f.scope}:${f.path}`).toSorted()).toEqual(
    upstreamFiles.map((f) => `${f.scope}:${respellPath(f.path)}`).toSorted(),
  )

  for (const upstream of upstreamFiles) {
    const file = byPath.get(respellPath(upstream.path))!
    const ours = cutHead(file.path, file.content)
    expect({ path: file.path, headRule: ours.headRule }).toEqual({
      path: file.path,
      headRule: upstream.headRule,
    })
    if (upstream.headRule === 'yaml-frontmatter') {
      const want = new Set(yamlKeys(upstream.head).filter((k) => !OMITTED_UPSTREAM_KEYS.has(k)))
      want.add('metadata')
      expect({ path: file.path, keys: yamlKeys(ours.head) }).toEqual({
        path: file.path,
        keys: [...want].toSorted(),
      })
    } else if (upstream.headRule === 'markdown-header') {
      expect(ours.head).toMatch(/^# [^\n]+\n\n[^\n]+\n\n$/)
    } else if (upstream.headRule === 'toml') {
      expect(ours.head).toMatch(/^description = "[^\n]*"\n\nprompt = """\n$/)
    } else {
      expect(ours.head).toBe('')
    }
  }
}

/**
 * Select the tool alone, then require `update --json` and a bare `init --json` to detect
 * exactly it. HOME, USERPROFILE and the XDG/Codex dirs are a private sandbox, so a home
 * skills root never touches the real one.
 */
async function checkRoundTripDetection(id: string, skip: ReadonlySet<Check>): Promise<void> {
  const sandbox = mkTempRepo()
  const env = { ...oracleEnv(sandbox), USERPROFILE: oracleEnv(sandbox).HOME! }
  const repo = mkTempRepo({ git: true })

  const init = await cospec(['init', '--harness', id, '--json'], { cwd: repo, env })
  expect(init.exitCode).toBe(0)

  const update = await cospec(['update', '--json'], { cwd: repo, env })
  expect(update.exitCode).toBe(0)
  expect((JSON.parse(update.stdout) as { harnesses: string[] }).harnesses).toEqual([id])

  if (skip.has('initDetection')) return
  const bare = await cospec(['init', '--json'], { cwd: repo, env })
  expect(bare.exitCode).toBe(0)
  expect((JSON.parse(bare.stdout) as { harnesses: string[] }).harnesses).toEqual([id])
}

async function checkRow(tool: UpstreamTool, skip: ReadonlySet<Check>): Promise<void> {
  const row = adapterFor(tool.value)
  checkFields(row, tool)
  if (!skip.has('detectionPaths')) checkDetectionPaths(row, tool)
  if (!skip.has('legacyToolRoots')) checkLegacyToolRoots(row, tool)
  checkAdapterPaths(row, tool)
  checkRender(tool)
  if (!SHIPPED_ROWS.includes(tool.value)) checkGolden(tool.value)
  await checkRoundTripDetection(tool.value, skip)
}

// --- the per-row golden (design decision 14) -----------------------------------------

/**
 * A landed row's own render, pinned as cospec wrote it: every path with its kind, workflow,
 * content hash, byte length and sha256, plus the full bytes of the `propose` skill and
 * command. It pins cospec's output, so it is written from the row (COSPEC_GOLDEN_WRITE=1)
 * and never stands in for the oracle comparison above.
 */
const GOLDEN_ROOT = join(import.meta.dir, '../unit/__golden__/harness-render')

function goldenOf(id: string): { index: unknown[]; full: { path: string; content: string }[] } {
  const files = renderHarnessFiles({
    harnesses: [id as HarnessName],
    typeTable: TYPE_TABLE,
    version: TEST_VERSION,
  })
  const index = files
    .map((f) => ({
      path: f.path,
      kind: f.kind,
      workflow: f.workflow,
      harness: f.harness,
      contentHash: f.contentHash,
      bytes: Buffer.byteLength(f.content, 'utf8'),
      sha256: createHash('sha256').update(f.content, 'utf8').digest('hex'),
    }))
    .toSorted((a, b) => a.path.localeCompare(b.path))
  return { index, full: files.filter((f) => f.workflow === 'propose') }
}

function checkGolden(id: string): void {
  const dir = join(GOLDEN_ROOT, id)
  const { index, full } = goldenOf(id)
  if (process.env.COSPEC_GOLDEN_WRITE === '1') {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
    for (const f of full) {
      mkdirSync(dirname(join(dir, f.path)), { recursive: true })
      writeFileSync(join(dir, f.path), f.content)
    }
    return
  }
  expect(existsSync(join(dir, 'index.json'))).toBe(true)
  expect(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))).toEqual(index)
  for (const f of full) {
    expect(Buffer.from(f.content, 'utf8').equals(readFileSync(join(dir, f.path)))).toBe(true)
  }
}

function fixtureFacts(name: string): unknown[] {
  return readFixture(name).files.map((f) => [f.path, f.scope, f.bytes, f.sha256, f.head])
}

// --- the matrix ----------------------------------------------------------------------

describe('harness matrix', () => {
  for (const tool of UPSTREAM_TOOLS) {
    const pending = PENDING_ROWS.get(tool.value)
    const gaps = SHIPPED_GAPS[tool.value] ?? {}
    const skip = new Set(Object.keys(gaps) as Check[])
    const run = pending === undefined ? test : test.failing
    const suffix = pending === undefined ? '' : ` (row lands in task ${pending})`

    run(
      `${tool.value}: row, adapter paths, render and detection match the pinned binary${suffix}`,
      () => checkRow(tool, skip),
      120_000,
    )

    for (const [check, task] of Object.entries(gaps) as [Check, string][]) {
      test.failing(
        `${tool.value}: ${check} matches the pinned binary (task ${task})`,
        async () => {
          const row = adapterFor(tool.value)
          if (check === 'detectionPaths') checkDetectionPaths(row, tool)
          else if (check === 'legacyToolRoots') checkLegacyToolRoots(row, tool)
          else await checkRoundTripDetection(tool.value, new Set())
        },
        120_000,
      )
    }
  }

  const tableOrder = (): void => {
    expect<string[]>([...HARNESS_NAMES]).toEqual([
      ...SHIPPED_ROWS,
      ...UPSTREAM_TOOLS.map((t) => t.value).filter((id) => !SHIPPED_ROWS.includes(id)),
    ])
  }
  if (TABLE_ORDER_TASK === undefined) {
    test('the table is the pinned AI_TOOLS minus github-copilot, shipped rows first', tableOrder)
  } else {
    test.failing(
      `the table is the pinned AI_TOOLS minus github-copilot, shipped rows first (task ${TABLE_ORDER_TASK})`,
      tableOrder,
    )
  }

  test('every capture agrees with the pinned adapters, so the rule below has an oracle', () => {
    for (const tool of UPSTREAM_TOOLS) {
      const files = toolFiles(readFixture(tool.value))
      const skills = files.filter((f) => f.path.endsWith('/SKILL.md'))
      const root = `${tool.skillsDir ?? tool.globalSkillsDir}/skills/`
      expect(skills).toHaveLength(WORKFLOWS.length)
      for (const f of skills) {
        expect(f.path.startsWith(root)).toBe(true)
        expect(f.scope).toBe(tool.globalSkillsDir === undefined ? 'project' : 'home')
      }
      const upstream = CommandAdapterRegistry.get(tool.value)
      const expectedCommands =
        upstream === undefined
          ? []
          : WORKFLOWS.map((w) => upstream.getFilePath(w).split('\\').join('/')).toSorted()
      expect(
        files
          .filter((f) => !f.path.endsWith('/SKILL.md'))
          .map((f) => f.path)
          .toSorted(),
      ).toEqual(expectedCommands)
      for (const f of files) expect(respellPath(f.path)).not.toMatch(/opsx|openspec-/)
    }
  })

  test('the windsurf alias writes exactly what devin writes', () => {
    expect(fixtureFacts('windsurf')).toEqual(fixtureFacts('devin'))
  })
})
