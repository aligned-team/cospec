// Guards the two-part fix for the prose-wrap truncation bug: the repo's
// `.oxfmtrc.json` excludes `verification.md` from markdown proseWrap, so a row
// whose recorded evidence pushes past the 80-column wrap width is left on one
// physical line rather than hard-wrapped onto an indented continuation the
// parser would otherwise drop. Runs the real oxfmt binary against the repo
// config; skipped only when oxfmt is not on PATH (a non-mise direct `bun test`).

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { REPO_ROOT } from '../fixtures/support.ts'

const OXFMT = Bun.which('oxfmt')
const CONFIG = join(REPO_ROOT, '.oxfmtrc.json')

const LONG_ROW =
  '- [x] 1.1 @e2e (agent) drive the real flow end to end -> observed the widget hydrate and settle after a long detailed evidence note that easily exceeds the wrap width'
const DOC = `## 1. Widget works end to end [critical]\n\n${LONG_ROW}\n`

const tmpDirs: string[] = []
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true })
})

describe('verification.md is excluded from oxfmt prose-wrapping', () => {
  test.skipIf(OXFMT === null)('oxfmt leaves a >80-char row byte-identical', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cospec-oxfmt-'))
    tmpDirs.push(dir)
    const file = join(dir, 'verification.md')
    writeFileSync(file, DOC)

    const proc = Bun.spawn([OXFMT!, '--config', CONFIG, file], { stdout: 'pipe', stderr: 'pipe' })
    await proc.exited

    // The long row survives on a single physical line — no indented continuation.
    expect(readFileSync(file, 'utf8')).toBe(DOC)
  })
})
