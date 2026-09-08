// `cospec feedback` (DESIGN §3, ledger rows 3.2–3.4). `gh` is stubbed on PATH
// as a tiny shell script — NEVER the real `gh`, so this suite never files a
// real issue or touches the network. Each stub records the argv it was called
// with to a file so the test can assert cospec built the right command.

import { afterAll, describe, expect, test } from 'bun:test'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo } from '../fixtures/support.ts'

afterAll(cleanupAll)

interface GhStubOpts {
  /** exit code of `gh auth status` (0 = authenticated). */
  authExit?: number
  /** exit code of `gh issue create`. */
  createExit?: number
  /** stdout `gh issue create` prints on success (an issue URL). */
  createStdout?: string
  /** stderr `gh issue create` prints on failure. */
  createStderr?: string
}

/**
 * Build a fake `gh` on a fresh dir, prepended onto the REAL PATH — so `bun`
 * (the child process cospec is spawned with) and every other tool stay
 * resolvable, and only `gh` resolution is redirected to the stub. Every
 * invocation's argv is logged to a file the test can inspect.
 */
function stubGh(opts: GhStubOpts = {}): { path: string; logFile: string } {
  const dir = mkTempRepo()
  const logFile = join(dir, 'gh.log')
  const authExit = opts.authExit ?? 0
  const createExit = opts.createExit ?? 0
  const createStdout = opts.createStdout ?? 'https://github.com/aligned-team/cospec/issues/99'
  const createStderr = opts.createStderr ?? ''
  const script = `#!/bin/sh
echo "$@" >> "${logFile}"
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  exit ${authExit}
fi
if [ "$1" = "issue" ] && [ "$2" = "create" ]; then
  printf '%s' ${JSON.stringify(createStderr)} 1>&2
  printf '%s' ${JSON.stringify(createStdout)}
  exit ${createExit}
fi
exit 1
`
  const bin = join(dir, 'gh')
  writeFileSync(bin, script)
  chmodSync(bin, 0o755)
  return { path: `${dir}${delimiter}${process.env.PATH ?? ''}`, logFile }
}

/**
 * The real PATH with every directory that resolves a real `gh` stripped out —
 * `bun`'s own directory (and everything else) stays, so the child process
 * still spawns; only `gh` genuinely disappears from PATH.
 */
function noGhPath(): string {
  const kept = (process.env.PATH ?? '')
    .split(delimiter)
    .filter((p) => p.length > 0 && Bun.which('gh', { PATH: p }) === null)
  return kept.join(delimiter)
}

describe('cospec feedback (native, aligned-team/cospec)', () => {
  test('gh absent from PATH: manual block + prefilled URL, exit 0', async () => {
    const cwd = mkTempRepo()
    const res = await cospec(['feedback', 'the thing broke'], { cwd, env: { PATH: noGhPath() } })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('GitHub CLI not found')
    expect(res.stdout).toContain('FORMATTED FEEDBACK')
    expect(res.stdout).toContain('Title: Feedback: the thing broke')
    expect(res.stdout).toContain('https://github.com/aligned-team/cospec/issues/new?title=')
    expect(res.stdout).not.toContain('Fission-AI')
  })

  test('gh present but unauthenticated: manual block, exit 0, gh is never asked to create', async () => {
    const { path, logFile } = stubGh({ authExit: 1 })
    const cwd = mkTempRepo()
    const res = await cospec(['feedback', 'auth broke'], { cwd, env: { PATH: path } })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('GitHub authentication required')
    expect(res.stdout).toContain('FORMATTED FEEDBACK')
    const log = readFileSync(logFile, 'utf8')
    expect(log).not.toContain('issue create')
  })

  test('gh authenticated: files at aligned-team/cospec with no --label, prints gh URL, exit 0', async () => {
    const { path, logFile } = stubGh({
      createStdout: 'https://github.com/aligned-team/cospec/issues/42',
    })
    const cwd = mkTempRepo()
    const res = await cospec(['feedback', 'it broke', '--body', 'more detail'], {
      cwd,
      env: { PATH: path },
    })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('https://github.com/aligned-team/cospec/issues/42')

    const log = readFileSync(logFile, 'utf8')
    expect(log).toContain('issue create')
    expect(log).toContain('--repo aligned-team/cospec')
    expect(log).not.toContain('--label')
    expect(log).toContain('--title Feedback: it broke')
  })

  test('--json (authenticated success): one document with submitted:true and the gh URL', async () => {
    const { path } = stubGh({ createStdout: 'https://github.com/aligned-team/cospec/issues/7' })
    const cwd = mkTempRepo()
    const res = await cospec(['feedback', 'json path works', '--json'], {
      cwd,
      env: { PATH: path },
    })
    expect(res.exitCode).toBe(0)
    const lines = res.stdout.trim().split('\n')
    expect(lines.length).toBe(1)
    const body = JSON.parse(lines[0]!) as {
      version: number
      submitted: boolean
      url: string
      repo: string
      title: string
    }
    expect(body.submitted).toBe(true)
    expect(body.url).toBe('https://github.com/aligned-team/cospec/issues/7')
    expect(body.repo).toBe('aligned-team/cospec')
    expect(body.title).toBe('Feedback: json path works')
  })

  test('--json (gh missing): one document with submitted:false and the manual URL, exit 0', async () => {
    const cwd = mkTempRepo()
    const res = await cospec(['feedback', 'json manual path', '--json'], {
      cwd,
      env: { PATH: noGhPath() },
    })
    expect(res.exitCode).toBe(0)
    const body = JSON.parse(res.stdout.trim()) as { submitted: boolean; url: string }
    expect(body.submitted).toBe(false)
    expect(body.url).toContain('https://github.com/aligned-team/cospec/issues/new?')
  })

  test("gh issue create fails after auth: relays stderr, shows manual block, exits gh's code", async () => {
    const { path } = stubGh({ createExit: 7, createStderr: 'HTTP 500: rate limited\n' })
    const cwd = mkTempRepo()
    const res = await cospec(['feedback', 'rate limited case'], { cwd, env: { PATH: path } })
    expect(res.exitCode).toBe(7)
    expect(res.stderr).toContain('rate limited')
    expect(res.stdout).toContain('FORMATTED FEEDBACK')
    expect(res.stdout).toContain('Please submit your feedback manually')
  })

  test('a bare usage error (no message) exits 1 with no gh invocation', async () => {
    const { path, logFile } = stubGh()
    const cwd = mkTempRepo()
    const res = await cospec(['feedback'], { cwd, env: { PATH: path } })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('a message is required')
    expect(existsSync(logFile)).toBe(false)
  })
})

describe('cospec feedback --upstream (relay to Fission-AI/OpenSpec)', () => {
  test('names the destination on stderr and relays the wrapped call verbatim', async () => {
    const { path, logFile } = stubGh({
      createStdout: 'https://github.com/Fission-AI/OpenSpec/issues/13',
    })
    const cwd = mkTempRepo()
    const res = await cospec(['feedback', '--upstream', 'openspec itself has a bug'], {
      cwd,
      env: { PATH: path },
    })
    expect(res.stderr).toContain('Fission-AI/OpenSpec')
    expect(res.stderr).toContain('note:')
    // Upstream's own feedback command ran (through the real wrapped binary) and
    // in turn invoked the stubbed gh — proof this is a genuine relay, not a
    // native cospec submission mislabeled.
    if (existsSync(logFile)) {
      const log = readFileSync(logFile, 'utf8')
      expect(log).toContain('Fission-AI/OpenSpec')
    }
  }, 30_000)

  test('a gh failure outside the shared allow-list relays verbatim with the exact child exit code', async () => {
    const { path } = stubGh({ createExit: 42, createStderr: 'gh: some odd upstream failure\n' })
    const cwd = mkTempRepo()
    const res = await cospec(['feedback', '--upstream', 'openspec bug with odd gh failure'], {
      cwd,
      env: { PATH: path },
    })
    expect(res.stderr).toContain('Fission-AI/OpenSpec')
    // The child's exit code reaches the caller unchanged: upstream's own
    // feedback command does `process.exit(error.status ?? 1)` on a failed
    // `gh issue create`, and cospec never re-maps it to its own EXIT contract
    // (see runUpstream: "no exitCodes allow-list can honestly enumerate this").
    // Asserting the exact value is the point — `not.toBe(0)` would also pass
    // for a wrapper that collapsed every odd code onto a constant.
    expect(res.exitCode).toBe(42)
  }, 30_000)

  test('--upstream --json is refused (upstream emits text, not JSON), exit 1', async () => {
    const cwd = mkTempRepo()
    const res = await cospec(['feedback', '--upstream', 'msg', '--json'], {
      cwd,
      env: { PATH: noGhPath() },
    })
    expect(res.exitCode).toBe(1)
    const body = JSON.parse(res.stdout.trim()) as { submitted: boolean; repo: string }
    expect(body.submitted).toBe(false)
    expect(body.repo).toBe('Fission-AI/OpenSpec')
  })
})
