// Guards the two-part fix for the prose-wrap truncation bug: the repo's
// bunfig.toml `[fmt]` excludes `verification.md` from markdown proseWrap, so a row
// whose recorded evidence pushes past the 80-column wrap width is left on one
// physical line rather than hard-wrapped onto an indented continuation the
// parser would otherwise drop. Runs the repo's formatter (`bun fmt`, built into
// the Bun running this test) against the repo config.

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { REPO_ROOT } from '../fixtures/support.ts'

const LONG_ROW =
  '- [x] 1.1 @e2e (agent) drive the real flow end to end -> observed the widget hydrate and settle after a long detailed evidence note that easily exceeds the wrap width'
const DOC = `## 1. Widget works end to end [critical]\n\n${LONG_ROW}\n`

const tmpDirs: string[] = []
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true })
})

async function format(name: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-fmt-'))
  tmpDirs.push(dir)
  const file = join(dir, name)
  writeFileSync(file, DOC)
  // --cwd pins the repo's bunfig.toml `[fmt]`, which bun fmt finds from the
  // working directory up: the temp dir sits outside the repo.
  const proc = Bun.spawn([process.execPath, 'fmt', `--cwd=${REPO_ROOT}`, file], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  expect(await proc.exited).toBe(0)
  return readFileSync(file, 'utf8')
}

describe('verification.md is excluded from bun fmt prose-wrapping', () => {
  test('bun fmt leaves a >80-char row byte-identical', async () => {
    // The long row survives on a single physical line — no indented continuation.
    expect(await format('verification.md')).toBe(DOC)
  })

  test('the same row in any other markdown file is wrapped', async () => {
    // Control: proves the formatter ran with the repo config, so the case above
    // passes because of the verification.md override and not a no-op.
    expect(await format('notes.md')).not.toBe(DOC)
  })
})
