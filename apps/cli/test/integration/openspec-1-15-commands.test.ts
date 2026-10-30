// The commands change openspec-1-15-parity adds or rebuilds, end to end from
// source: the native `cospec view` dashboard (task 5.3), `cospec version`
// against a local registry fixture (task 5.1 — never the live registry), and
// `cospec update --dry-run` writing nothing (task 5.5).

import { afterAll, describe, expect, test } from 'bun:test'

import pkg from '../../package.json'
import { NAME_WIDTH } from '../../src/commands/view.ts'
import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'
import { authorCi, authorFeat, blockersHard } from './support.ts'

afterAll(cleanupAll)

async function initRoot(harness = 'none'): Promise<string> {
  const root = mkTempRepo({ git: true })
  const init = await cospec(['init', '--harness', harness, '--no-gate', '--yes'], { cwd: root })
  expect(init.exitCode).toBe(0)
  return root
}

function git(root: string, ...args: string[]): string {
  const run = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' })
  return run.stdout.toString()
}

function commitAll(root: string): void {
  Bun.spawnSync(['git', 'add', '-A'], { cwd: root })
  Bun.spawnSync(
    [
      'git',
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.invalid',
      'commit',
      '-qm',
      'fixture',
      '--no-verify',
    ],
    { cwd: root },
  )
}

// --- view ---------------------------------------------------------------------------

/** The section of `stdout` under `heading`, up to the next blank line. */
function section(stdout: string, heading: string): string[] {
  const lines = stdout.split('\n')
  const start = lines.indexOf(heading)
  if (start < 0) return []
  const out: string[] = []
  for (const line of lines.slice(start + 2)) {
    if (line.trim() === '') break
    out.push(line)
  }
  return out
}

describe('cospec view (native dashboard)', () => {
  test('3 active and 40 archived: the active section lists 3, archived shown separately', async () => {
    const root = await initRoot()
    authorFeat(root, 'add-widgets', 'widgets')
    authorCi(root, 'tune-ci')
    authorCi(root, 'a-change-whose-name-is-exactly-forty-chars')
    const archived: Record<string, string> = {}
    for (let i = 1; i <= 40; i++) {
      const day = String((i % 28) + 1).padStart(2, '0')
      archived[`openspec/changes/archive/2026-02-${day}-old-${i}/.openspec.yaml`] = 'schema: fix\n'
    }
    writeFiles(root, archived)

    const res = await cospec(['view'], { cwd: root, env: { NO_COLOR: '1' } })
    expect(res.exitCode).toBe(0)
    const active = section(res.stdout, 'Active Changes').filter((l) => l.startsWith('  ◉ '))
    expect(active.map((l) => l.slice(4).trim().split(/\s+/)[0])).toEqual([
      'a-change-whose-name-is-exactly-forty-chars',
      'add-widgets',
      'tune-ci',
    ])
    expect(res.stdout).toContain('Active Changes: 3')
    expect(res.stdout).toContain('Archived Changes: 40')
    const archivedLines = section(res.stdout, 'Archived Changes')
    expect(archivedLines.filter((l) => l.startsWith('  ✓ ')).length).toBe(10)
    expect(archivedLines.at(-1)).toContain('… and 30 more (cospec list --archived)')
    // No archived change leaks into the active section.
    expect(active.some((l) => l.includes('old-'))).toBe(false)
  }, 60_000)

  test('progress bars start in one column for names up to 48 characters', async () => {
    const root = await initRoot()
    const long = 'x'.repeat(NAME_WIDTH)
    authorCi(root, 'ab')
    authorCi(root, long)
    const res = await cospec(['view'], { cwd: root, env: { NO_COLOR: '1' } })
    expect(res.exitCode).toBe(0)
    const rows = res.stdout.split('\n').filter((l) => l.startsWith('  ◉ '))
    expect(rows).toHaveLength(2)
    const columns = rows.map((l) => l.indexOf('['))
    expect(new Set(columns).size).toBe(1)
    expect(columns[0]).toBe(4 + NAME_WIDTH + 1)
  }, 60_000)

  test('an unshipped Blocked by entry: the row shows blocked and archive-ready no', async () => {
    const root = await initRoot()
    authorFeat(root, 'needs-other', 'widgets', { blockers: blockersHard('not-shipped-yet') })
    const res = await cospec(['view'], { cwd: root, env: { NO_COLOR: '1' } })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('gate: blocked (1 hard)')
    expect(res.stdout).toContain('archive-ready: no')
    expect(res.stdout).toContain('[feat]')
    expect(res.stdout).toContain('[x] proposal')
    expect(res.stdout).toMatch(/ledger: \d+\/\d+ verified|gate: blocked/)
  }, 60_000)

  test('a change whose schema cannot load still shows task progress and names the failure', async () => {
    const root = await initRoot()
    writeFiles(root, {
      'openspec/changes/odd-one/.openspec.yaml': 'schema: no-such-schema\n',
      'openspec/changes/odd-one/tasks.md': '## 1. Work\n\n- [x] 1.1 Done\n- [ ] 1.2 Not yet\n',
    })
    const res = await cospec(['view'], { cwd: root, env: { NO_COLOR: '1' } })
    expect(res.exitCode).toBe(0)
    const row = res.stdout.split('\n').find((l) => l.includes('odd-one'))!
    expect(row).toContain('1/2 tasks')
    expect(res.stdout).toContain('[no-such-schema] workflow status unavailable:')
  }, 60_000)

  test('NO_COLOR and a piped stdout: no escape codes, written once', async () => {
    const root = await initRoot()
    authorCi(root, 'tune-ci')
    for (const env of [{ NO_COLOR: '1' }, {}] as Record<string, string>[]) {
      const res = await cospec(['view'], { cwd: root, env })
      expect(res.exitCode).toBe(0)
      expect(res.stdout).not.toContain('\x1b[')
      expect(res.stdout).not.toContain('\r')
    }
    const flagged = await cospec(['view', '--no-color'], { cwd: root })
    expect(flagged.stdout).not.toContain('\x1b[')
  }, 60_000)

  test('--json is refused with one document', async () => {
    const root = await initRoot()
    const res = await cospec(['view', '--json'], { cwd: root })
    expect(res.exitCode).toBe(1)
    expect(JSON.parse(res.stdout)).toMatchObject({ command: 'view', ok: false })
  }, 60_000)
})

// --- version ------------------------------------------------------------------------

function registry(body: string | 'hang'): { url: string; stop: () => void } {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      body === 'hang'
        ? new Promise<Response>(() => {})
        : new Response(body, { headers: { 'content-type': 'application/json' } }),
  })
  return { url: `http://127.0.0.1:${server.port}/latest`, stop: () => server.stop(true) }
}

describe('cospec version', () => {
  test('plain report: cospec version, install type, wrapped OpenSpec; no network', async () => {
    const cwd = mkTempRepo()
    const res = await cospec(['version'], {
      cwd,
      env: { COSPEC_REGISTRY_URL: 'http://127.0.0.1:9/never-asked' },
    })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain(`cospec ${pkg.version} (source)`)
    expect(res.stdout).toMatch(/^OpenSpec \d+\.\d+\.\d+ \((package|embedded), in range/m)
    expect(res.stdout).not.toContain('Update')
  }, 30_000)

  test('top-level --version still prints only the bare version', async () => {
    const res = await cospec(['--version'], { cwd: mkTempRepo() })
    expect(res.stdout).toBe(`${pkg.version}\n`)
  }, 30_000)

  const cases: [string, string | 'hang', string, string][] = [
    [
      'a newer release',
      JSON.stringify({ version: '999.0.0' }),
      'available',
      'Update available: 999.0.0',
    ],
    ['this release', JSON.stringify({ version: pkg.version }), 'current', 'cospec is up to date.'],
    ['malformed JSON', '{not json', 'offline', 'Could not check for updates.'],
    [
      'an answer without a version',
      JSON.stringify({ name: 'x' }),
      'offline',
      'Could not check for updates.',
    ],
  ]
  for (const [label, body, status, line] of cases) {
    test(`--check with ${label}: ${status}, exit 0`, async () => {
      const fake = registry(body)
      try {
        const cwd = mkTempRepo()
        const env = { COSPEC_REGISTRY_URL: fake.url }
        const json = await cospec(['version', '--check', '--json'], { cwd, env })
        expect(json.exitCode).toBe(0)
        expect(JSON.parse(json.stdout).update.status).toBe(status)
        const text = await cospec(['version', '--check'], { cwd, env })
        expect(text.exitCode).toBe(0)
        expect(text.stdout).toContain(line)
      } finally {
        fake.stop()
      }
    }, 30_000)
  }

  test('--check times out at its budget as offline, exit 0', async () => {
    const fake = registry('hang')
    try {
      const started = Date.now()
      const res = await cospec(['version', '--check', '--json'], {
        cwd: mkTempRepo(),
        env: { COSPEC_REGISTRY_URL: fake.url },
      })
      expect(res.exitCode).toBe(0)
      expect(JSON.parse(res.stdout).update.status).toBe('offline')
      expect(Date.now() - started).toBeLessThan(15_000)
    } finally {
      fake.stop()
    }
  }, 30_000)

  test('COSPEC_NO_UPDATE_CHECK=1 disables the check without a request', async () => {
    const res = await cospec(['version', '--check', '--json'], {
      cwd: mkTempRepo(),
      env: { COSPEC_NO_UPDATE_CHECK: '1', COSPEC_REGISTRY_URL: 'http://127.0.0.1:9/never-asked' },
    })
    expect(res.exitCode).toBe(0)
    expect(JSON.parse(res.stdout).update).toEqual({
      status: 'disabled',
      latest: null,
      command: null,
      canSelfUpgrade: false,
    })
  }, 30_000)
})

// --- update --dry-run -----------------------------------------------------------------

describe('cospec update --dry-run', () => {
  test('a stale tree: changes[] lists the pending writes and git status stays clean', async () => {
    const root = await initRoot('claude')
    // Stale it: drop one managed command and edit one managed skill.
    Bun.spawnSync(['rm', '.claude/commands/cospec/apply.md'], { cwd: root })
    Bun.spawnSync(['sh', '-c', 'echo edited >> .claude/skills/cospec-explore/SKILL.md'], {
      cwd: root,
    })
    commitAll(root)
    const before = git(root, 'status', '--porcelain')
    expect(before).toBe('')

    const res = await cospec(['update', '--dry-run', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const doc = JSON.parse(res.stdout) as {
      changes: { path: string; action: string; tool: string; row: string | null; reason: string }[]
      notes: unknown[]
      failures: unknown[]
    }
    expect(doc.failures).toEqual([])
    expect(doc.changes).toContainEqual({
      path: '.claude/commands/cospec/apply.md',
      action: 'add',
      tool: 'claude',
      row: 'claude',
      reason: 'missing',
    })
    expect(doc.changes).toContainEqual({
      path: '.claude/skills/cospec-explore/SKILL.md.cospec-new',
      action: 'add',
      tool: 'claude',
      row: 'claude',
      reason: 'user-modified',
    })
    expect(git(root, 'status', '--porcelain')).toBe('')
  }, 60_000)

  test('--check exits 1 on the stale tree and --dry-run exits 0; neither writes', async () => {
    const root = await initRoot('claude')
    Bun.spawnSync(['rm', '.claude/commands/cospec/apply.md'], { cwd: root })
    commitAll(root)
    const check = await cospec(['update', '--check'], { cwd: root })
    expect(check.exitCode).toBe(1)
    const dry = await cospec(['update', '--dry-run'], { cwd: root })
    expect(dry.exitCode).toBe(0)
    expect(dry.stdout).toContain('1 file(s) would change:')
    expect(dry.stdout).toContain('add  .claude/commands/cospec/apply.md  (claude: missing)')
    expect(git(root, 'status', '--porcelain')).toBe('')
  }, 60_000)

  test('no project root: status and failures, exit nonzero', async () => {
    const res = await cospec(['update', '--dry-run', '--json'], { cwd: mkTempRepo() })
    expect(res.exitCode).toBe(1)
    const doc = JSON.parse(res.stdout)
    expect(doc).toMatchObject({ changes: [], notes: [], failures: [] })
    expect(doc.status[0]).toMatchObject({ severity: 'error', code: 'update_error' })
  }, 30_000)

  test('--check and --dry-run together are refused', async () => {
    const root = await initRoot()
    const res = await cospec(['update', '--check', '--dry-run'], { cwd: root })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('cannot be combined')
  }, 60_000)
})
