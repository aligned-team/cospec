import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { AgentTelemetry } from '../../src/agent.ts'
import type { Cell } from '../../src/matrix.ts'
import type { MechanicalMetrics } from '../../src/mechanical.ts'
import {
  buildProvenance,
  commitUrl,
  parseGitHubRemote,
  publishFromReportDir,
  publishResults,
  renderProvenanceLines,
  renderReadmeBlock,
  renderResultsMarkdown,
  replaceMarkerBlock,
  type GitInfo,
} from '../../src/publish.ts'
import type { CellResult, RunMeta } from '../../src/report.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = join(HERE, '..', 'fixtures')

const roots: string[] = []

function makeRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-bench-publish-'))
  roots.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

function gitInfo(overrides: Partial<GitInfo> = {}): GitInfo {
  return {
    sha: 'abcdef1234567890abcdef1234567890abcdef12',
    org: 'aligned-team',
    repo: 'cospec',
    dirty: false,
    branch: 'main',
    ...overrides,
  }
}

function cell(overrides: Partial<Cell> = {}): Cell {
  return { scenarioId: 'ci', arm: 'cospec', model: 'claude-sonnet-5', repeat: 1, ...overrides }
}

function telemetry(overrides: Partial<AgentTelemetry> = {}): AgentTelemetry {
  return {
    isError: false,
    durationMs: 1000,
    totalCostUsd: 0.01,
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    },
    ...overrides,
  }
}

function mechanical(overrides: Partial<MechanicalMetrics> = {}): MechanicalMetrics {
  return {
    changeProduced: true,
    changeArchived: false,
    armNativeValidatePass: true,
    schemaConformance: { errors: 0, warnings: 0, byRule: {} },
    artifactFiles: ['proposal.md'],
    forbiddenArtifacts: [],
    missingRequiredArtifacts: [],
    tasksAllChecked: true,
    taskCompleted: true,
    hiddenTests: null,
    plantedBugCaught: null,
    ...overrides,
  }
}

function result(overrides: Partial<CellResult> = {}): CellResult {
  return { cell: cell(), scenarioId: 'ci', ...overrides }
}

const NO_SENTINELS = {}

const META: RunMeta = {
  version: 1,
  startedAt: '2026-07-17T00:00:00.000Z',
  claudeCodeVersion: '2.1.211',
  judgeEnabled: false,
  totalCells: 1,
  ranCells: 1,
  skippedCells: 0,
}

describe('parseGitHubRemote', () => {
  test('parses an https remote url', () => {
    expect(parseGitHubRemote('https://github.com/aligned-team/cospec.git')).toEqual({
      org: 'aligned-team',
      repo: 'cospec',
    })
  })

  test('parses an https remote url without .git', () => {
    expect(parseGitHubRemote('https://github.com/aligned-team/cospec')).toEqual({
      org: 'aligned-team',
      repo: 'cospec',
    })
  })

  test('parses an ssh remote url', () => {
    expect(parseGitHubRemote('git@github.com:aligned-team/cospec.git')).toEqual({
      org: 'aligned-team',
      repo: 'cospec',
    })
  })

  test('throws on a non-GitHub remote', () => {
    expect(() => parseGitHubRemote('https://gitlab.com/aligned-team/cospec.git')).toThrow(
      /non-GitHub remote/,
    )
  })
})

describe('commitUrl', () => {
  test('builds a GitHub commit URL from org/repo/sha, never hardcoding the org or repo', () => {
    expect(
      commitUrl(gitInfo({ org: 'some-other-org', repo: 'some-other-repo', sha: 'deadbeef' })),
    ).toBe('https://github.com/some-other-org/some-other-repo/commit/deadbeef')
  })
})

describe('renderProvenanceLines (mocked git info)', () => {
  test('renders commit link, date, claude code, models, cells, judge — no warning on a clean main branch', () => {
    const provenance = buildProvenance(gitInfo(), '2026-07-17T12:00:00.000Z', META, [
      result({ cell: cell({ model: 'claude-sonnet-5' }) }),
    ])
    const lines = renderProvenanceLines(provenance).join('\n')
    expect(lines).not.toContain('WARNING')
    expect(lines).toContain(
      '[`abcdef123456`](https://github.com/aligned-team/cospec/commit/abcdef1234567890abcdef1234567890abcdef12)',
    )
    expect(lines).toContain('on branch `main`')
    expect(lines).toContain('published: 2026-07-17T12:00:00.000Z')
    expect(lines).toContain('claude code: 2.1.211')
    expect(lines).toContain('claude-sonnet-5/high')
    expect(lines).toContain('cells: 1 ran, 0 skipped, 1 total (repeats=1)')
    expect(lines).toContain('judge: disabled (no DEEPSEEK_API_KEY)')
  })

  test('notes the tag when HEAD is exactly tagged', () => {
    const provenance = buildProvenance(
      gitInfo({ tag: 'v0.5.2' }),
      '2026-07-17T12:00:00.000Z',
      META,
      [result()],
    )
    expect(renderProvenanceLines(provenance).join('\n')).toContain('(tag `v0.5.2`)')
  })

  test('emits a WARNING banner when the working tree is dirty', () => {
    const provenance = buildProvenance(gitInfo({ dirty: true }), '2026-07-17T12:00:00.000Z', META, [
      result(),
    ])
    const lines = renderProvenanceLines(provenance).join('\n')
    expect(lines).toContain('WARNING')
    expect(lines).toContain('uncommitted changes')
    expect(lines).toContain('point-in-time snapshot')
  })

  test('emits a WARNING banner when the branch is not main', () => {
    const provenance = buildProvenance(
      gitInfo({ branch: 'worktree-bench-cospec-vs-openspec' }),
      '2026-07-17T12:00:00.000Z',
      META,
      [result()],
    )
    const lines = renderProvenanceLines(provenance).join('\n')
    expect(lines).toContain('WARNING')
    expect(lines).toContain('worktree-bench-cospec-vs-openspec')
  })

  test('still publishes (renders normally) even with the warning present — the caller decides, this never throws', () => {
    const provenance = buildProvenance(
      gitInfo({ dirty: true, branch: 'some-branch' }),
      '2026-07-17T12:00:00.000Z',
      META,
      [result()],
    )
    expect(() => renderProvenanceLines(provenance)).not.toThrow()
  })

  test('reports judge model/status when enabled', () => {
    const provenance = buildProvenance(
      gitInfo(),
      '2026-07-17T12:00:00.000Z',
      { ...META, judgeEnabled: true, judgeModel: 'deepseek-v4-flash' },
      [result()],
    )
    expect(renderProvenanceLines(provenance).join('\n')).toContain('judge: deepseek-v4-flash')
  })
})

describe('renderResultsMarkdown / renderReadmeBlock', () => {
  test('RESULTS.md content carries the provenance header then the shared summary body (table + legend)', () => {
    const provenance = buildProvenance(gitInfo(), '2026-07-17T12:00:00.000Z', META, [
      result({ telemetry: telemetry(), mechanical: mechanical() }),
    ])
    const text = renderResultsMarkdown(provenance, [
      result({ telemetry: telemetry(), mechanical: mechanical() }),
    ])
    expect(text).toContain('# cospec vs openspec — results')
    expect(text).toContain('commit:')
    expect(text).toContain('| scenario | arm | model | n | quality |')
    expect(text).toContain("cospec's OWN opinionated rubric")
    expect(text).toContain('## Paired comparison')
  })

  test('README block carries a compact arm×model table and links out to RESULTS.md', () => {
    const provenance = buildProvenance(gitInfo(), '2026-07-17T12:00:00.000Z', META, [
      result({ telemetry: telemetry(), mechanical: mechanical() }),
    ])
    const block = renderReadmeBlock(provenance, [
      result({ telemetry: telemetry(), mechanical: mechanical() }),
    ])
    expect(block).toContain('## Benchmark: cospec vs openspec')
    expect(block).toContain('| arm | model | n |')
    expect(block).toContain('[`packages/bench/RESULTS.md`](packages/bench/RESULTS.md)')
    // Compact — no per-scenario legend/paired-comparison noise in the README block.
    expect(block).not.toContain('## Paired comparison')
  })
})

describe('replaceMarkerBlock', () => {
  test('replaces an existing marker block in place, leaving surrounding content untouched', () => {
    const content = [
      '# repo',
      '',
      'intro text',
      '',
      '<!-- bench:start -->',
      'OLD BLOCK',
      '<!-- bench:end -->',
      '',
      '## License',
      '',
      'MIT',
    ].join('\n')
    const updated = replaceMarkerBlock(content, 'NEW BLOCK')
    expect(updated).toContain('NEW BLOCK')
    expect(updated).not.toContain('OLD BLOCK')
    expect(updated).toContain('intro text')
    expect(updated).toContain('## License')
    expect(updated.indexOf('NEW BLOCK')).toBeLessThan(updated.indexOf('## License'))
  })

  test('is idempotent: replacing twice with the same body yields the same final content', () => {
    const content = ['# repo', '', '## License', '', 'MIT'].join('\n')
    const once = replaceMarkerBlock(content, 'SAME BLOCK')
    const twice = replaceMarkerBlock(once, 'SAME BLOCK')
    expect(twice).toBe(once)
  })

  test('inserts the block before a "## License" heading when markers are absent', () => {
    const content = ['# repo', '', 'intro', '', '## License', '', 'MIT'].join('\n')
    const updated = replaceMarkerBlock(content, 'NEW BLOCK')
    expect(updated).toContain('<!-- bench:start -->')
    expect(updated).toContain('<!-- bench:end -->')
    expect(updated.indexOf('NEW BLOCK')).toBeLessThan(updated.indexOf('## License'))
    expect(updated).toContain('intro')
  })

  test('appends at the end when there is no license section and no markers', () => {
    const content = ['# repo', '', 'intro only, no license section'].join('\n')
    const updated = replaceMarkerBlock(content, 'NEW BLOCK')
    expect(updated).toContain('NEW BLOCK')
    expect(updated.indexOf('intro only')).toBeLessThan(updated.indexOf('NEW BLOCK'))
  })

  test('appending then replacing (no markers -> markers present) is idempotent on the second call', () => {
    const content = ['# repo', '', '## License', '', 'MIT'].join('\n')
    const inserted = replaceMarkerBlock(content, 'BODY')
    const replacedAgain = replaceMarkerBlock(inserted, 'BODY')
    expect(replacedAgain).toBe(inserted)
  })
})

describe('publishResults (mocked git info)', () => {
  test('writes RESULTS.md and the README managed block, returning both paths', async () => {
    const repoRoot = makeRoot()
    await Bun.write(join(repoRoot, 'README.md'), ['# repo', '', '## License', '', 'MIT'].join('\n'))
    const out = await publishResults({
      repoRoot,
      meta: META,
      results: [result({ telemetry: telemetry(), mechanical: mechanical() })],
      sentinels: NO_SENTINELS,
      gitInfo: gitInfo(),
      now: () => new Date('2026-07-17T12:00:00.000Z'),
    })
    expect(out.resultsPath).toBe(join(repoRoot, 'packages', 'bench', 'RESULTS.md'))
    expect(out.readmePath).toBe(join(repoRoot, 'README.md'))
    const results = await Bun.file(out.resultsPath).text()
    expect(results).toContain('# cospec vs openspec — results')
    const readme = await Bun.file(out.readmePath).text()
    expect(readme).toContain('<!-- bench:start -->')
    expect(readme).toContain('## Benchmark: cospec vs openspec')
    expect(readme).toContain('## License')
  })

  test('creates README.md fresh (with the marker block appended) when it does not exist yet', async () => {
    const repoRoot = makeRoot()
    const out = await publishResults({
      repoRoot,
      meta: META,
      results: [result({ telemetry: telemetry(), mechanical: mechanical() })],
      sentinels: NO_SENTINELS,
      gitInfo: gitInfo(),
      now: () => new Date('2026-07-17T12:00:00.000Z'),
    })
    const readme = await Bun.file(out.readmePath).text()
    expect(readme).toContain('<!-- bench:start -->')
  })

  test('republishing (calling twice) replaces the marker block idempotently rather than duplicating it', async () => {
    const repoRoot = makeRoot()
    await Bun.write(join(repoRoot, 'README.md'), ['# repo', '', '## License', '', 'MIT'].join('\n'))
    const input = {
      repoRoot,
      meta: META,
      results: [result({ telemetry: telemetry(), mechanical: mechanical() })],
      sentinels: NO_SENTINELS,
      gitInfo: gitInfo(),
      now: () => new Date('2026-07-17T12:00:00.000Z'),
    }
    await publishResults(input)
    await publishResults(input)
    const readme = await Bun.file(join(repoRoot, 'README.md')).text()
    expect(readme.split('<!-- bench:start -->')).toHaveLength(2)
    expect(readme.split('<!-- bench:end -->')).toHaveLength(2)
  })

  test('throws the redaction self-check if a sentinel somehow survives into RESULTS.md', async () => {
    const repoRoot = makeRoot()
    await expect(
      publishResults({
        repoRoot,
        meta: { ...META, judgeEnabled: true, judgeModel: 'BENCH-SECRET-TOKEN' },
        results: [result({ telemetry: telemetry(), mechanical: mechanical() })],
        sentinels: { 'ref:ci:BENCH-SECRET-TOKEN': 'BENCH-SECRET-TOKEN' },
        gitInfo: gitInfo(),
        now: () => new Date('2026-07-17T12:00:00.000Z'),
      }),
    ).rejects.toThrow(/redaction self-check failed/)
  })
})

describe('publishFromReportDir', () => {
  test('publishes from a current-schema fixture report dir with no agent re-run', async () => {
    const repoRoot = makeRoot()
    await Bun.write(join(repoRoot, 'README.md'), ['# repo', '', '## License', '', 'MIT'].join('\n'))
    const out = await publishFromReportDir({
      repoRoot,
      runDir: join(FIXTURES_DIR, 'report-min'),
      gitInfo: gitInfo(),
      now: () => new Date('2026-07-17T12:00:00.000Z'),
    })
    const results = await Bun.file(out.resultsPath).text()
    expect(results).toContain('| ci | cospec | claude-sonnet-5 |')
    expect(results).toContain('| ci | openspec | claude-sonnet-5 |')
    const readme = await Bun.file(out.readmePath).text()
    expect(readme).toContain('| cospec | claude-sonnet-5 |')
    expect(readme).toContain('| openspec | claude-sonnet-5 |')
  })

  test('throws a clear error when the report dir has no aggregate.json', async () => {
    const repoRoot = makeRoot()
    const emptyDir = makeRoot()
    await expect(
      publishFromReportDir({ repoRoot, runDir: emptyDir, gitInfo: gitInfo() }),
    ).rejects.toThrow(/no aggregate\.json/)
  })

  test('rejects a report dir predating the scenarioId field, rather than publishing garbage', async () => {
    const repoRoot = makeRoot()
    await expect(
      publishFromReportDir({
        repoRoot,
        runDir: join(FIXTURES_DIR, 'report-stale'),
        gitInfo: gitInfo(),
      }),
    ).rejects.toThrow(/predates the scenarioId field/)
  })
})
