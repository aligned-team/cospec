// `cospec context` (WI-3) — proves the disciplined passthrough of
// `openspec context` end to end: `--json` in a store-backed repo returns a
// `members[]` brief, and `--code-workspace` writes the workspace file then
// refuses to clobber it without `--force`.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo } from '../fixtures/support.ts'

afterAll(cleanupAll)

const STORE_ID = 'context-store'

describe('cospec context', () => {
  test('--json in a store-backed repo returns a members[] brief', async () => {
    const workspace = mkTempRepo() // an unrelated cwd with no openspec/ of its own
    const storeDir = join(workspace, 'store')
    const xdg = join(workspace, 'xdg')
    const env = { XDG_DATA_HOME: xdg, OPENSPEC_TELEMETRY: '0' }

    mkdirSync(join(storeDir, '.openspec-store'), { recursive: true })
    writeFileSync(join(storeDir, '.openspec-store', 'store.yaml'), `version: 1\nid: ${STORE_ID}\n`)
    mkdirSync(join(storeDir, 'openspec', 'changes', 'archive'), { recursive: true })
    mkdirSync(join(storeDir, 'openspec', 'specs'), { recursive: true })
    writeFileSync(join(storeDir, 'openspec', 'config.yaml'), 'schema: feat\n')
    mkdirSync(join(xdg, 'openspec', 'stores'), { recursive: true })
    writeFileSync(
      join(xdg, 'openspec', 'stores', 'registry.yaml'),
      `version: 1\nstores:\n  ${STORE_ID}:\n    backend:\n      type: git\n      local_path: ${storeDir}\n`,
    )

    const res = await cospec(['context', '--store', STORE_ID, '--json'], { cwd: workspace, env })
    expect(res.exitCode).toBe(0)
    const body = JSON.parse(res.stdout) as { root: { source: string }; members: unknown[] }
    expect(body.root.source).toBe('store')
    expect(Array.isArray(body.members)).toBe(true)
  })

  test('--code-workspace writes the file; a second run without --force is refused', async () => {
    const repo = mkTempRepo()
    mkdirSync(join(repo, 'openspec', 'specs'), { recursive: true })
    mkdirSync(join(repo, 'openspec', 'changes'), { recursive: true })

    const first = await cospec(['context', '--code-workspace', 'ws.code-workspace'], {
      cwd: repo,
    })
    expect(first.exitCode).toBe(0)
    const wsPath = join(repo, 'ws.code-workspace')
    expect(existsSync(wsPath)).toBe(true)
    const written = readFileSync(wsPath, 'utf8')

    const second = await cospec(['context', '--code-workspace', 'ws.code-workspace'], {
      cwd: repo,
    })
    expect(second.exitCode).toBe(1)
    // refused: the file on disk is untouched
    expect(readFileSync(wsPath, 'utf8')).toBe(written)

    const forced = await cospec(['context', '--code-workspace', 'ws.code-workspace', '--force'], {
      cwd: repo,
    })
    expect(forced.exitCode).toBe(0)
    expect(existsSync(wsPath)).toBe(true)
  })

  test('--json with no OpenSpec root anywhere surfaces the error status and exits 1', async () => {
    const repo = mkTempRepo()
    const res = await cospec(['context', '--json'], { cwd: repo })
    expect(res.exitCode).toBe(1)
    const body = JSON.parse(res.stdout) as { status: Array<{ severity: string }> }
    expect(body.status.some((s) => s.severity === 'error')).toBe(true)
  })
})
