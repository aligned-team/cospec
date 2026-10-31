// `cospec validate --all` on a pseudo-terminal that reports zero columns (verification 4.5 of
// openspec-1-15-parity). A pty inherited from a hook runner can say it is a terminal yet be zero
// columns wide; a spinner then never stops erasing (ora's erase count is `ceil(width / columns)`)
// and the run hangs. cospec must notice, run the wrapped binary non-interactively, and finish
// with plain output.
//
// Bun's `terminal` spawn option treats a zero size as "default" (80 columns), so the pty is
// opened at a normal size and `stty` shrinks it to zero before `exec`ing cospec in the same
// session. A preload loaded into every Bun process of the run (through `BUN_OPTIONS`) records the
// width each one saw, so the test proves the child really ran on a zero-column terminal rather
// than trusting the setup.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  CLI_ENTRY,
  cleanupAll,
  cospec,
  envWithoutColorForcing,
  mkTempRepo,
  ptyAvailable,
} from '../fixtures/support.ts'
import { authorFeat } from './support.ts'

afterAll(cleanupAll)

const PROBE = `import { appendFileSync } from 'node:fs'

appendFileSync(
  process.env.COSPEC_TEST_PTY_LOG,
  JSON.stringify({
    argv: process.argv.slice(1),
    isTTY: process.stdout.isTTY === true,
    columns: process.stdout.columns ?? null,
    interactive: process.env.OPEN_SPEC_INTERACTIVE ?? null,
  }) + '\\n',
)
`

interface Probe {
  argv: string[]
  isTTY: boolean
  columns: number | null
  interactive: string | null
}

/** CSI escapes: color, cursor moves, erase-line and cursor visibility. */
const CSI = new RegExp(`${String.fromCharCode(0x1b)}\\[`)

const DEADLINE_MS = 30_000

describe('4.5: validate --all on a zero-column pty', () => {
  const stty = Bun.which('stty')
  const available = ptyAvailable() && stty !== null
  if (!available)
    test.skip(`no pseudo-terminal on ${process.platform} (Bun's terminal option is POSIX-only, and stty is required)`, () => {})

  test.if(available)(
    'the child sees columns === 0, and the run finishes in under 30 s with plain output',
    async () => {
      const root = mkTempRepo({ git: true })
      const init = await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
      expect(init.exitCode).toBe(0)
      authorFeat(root, 'add-widgets', 'widgets')

      const tools = mkTempRepo()
      const probe = join(tools, 'probe.mjs')
      const log = join(tools, 'probe.jsonl')
      writeFileSync(probe, PROBE)

      const env: Record<string, string> = {
        ...envWithoutColorForcing(),
        NO_COLOR: '1',
        BUN_OPTIONS: `--preload ${probe}`,
        COSPEC_TEST_PTY_LOG: log,
      }
      // A CI runner's own `CI` would make the binary non-interactive on its own and hide the case.
      delete env.CI
      delete env.OPEN_SPEC_INTERACTIVE

      const chunks: Uint8Array[] = []
      const started = performance.now()
      const proc = Bun.spawn(
        [
          '/bin/sh',
          '-c',
          '"$1" cols 0 rows 0 && shift && exec "$@"',
          'sh',
          stty!,
          process.execPath,
          CLI_ENTRY,
          'validate',
          '--all',
        ],
        {
          cwd: root,
          env,
          terminal: {
            cols: 80,
            rows: 24,
            data(_terminal, chunk) {
              chunks.push(chunk.slice())
            },
          },
        },
      )
      const timer = setTimeout(() => proc.kill('SIGKILL'), DEADLINE_MS + 5_000)
      const exitCode = await proc.exited
      clearTimeout(timer)
      const elapsed = performance.now() - started
      proc.terminal?.close()
      const output = Buffer.concat(chunks).toString('utf8')

      expect(elapsed).toBeLessThan(DEADLINE_MS)
      expect(exitCode).toBe(0)

      expect(existsSync(log)).toBe(true)
      const probes = readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Probe)
      const mine = probes.find((p) => p.argv[0] === CLI_ENTRY)
      expect(mine).toMatchObject({ isTTY: true, columns: 0 })
      // Every wrapped binary call ran with redraws off.
      const wrapped = probes.filter((p) => p.argv.some((a) => a.endsWith('openspec.js')))
      expect(wrapped.length).toBeGreaterThan(0)
      for (const call of wrapped) expect(call.interactive).toBe('0')

      // Plain output: the report, with no escape sequence and no carriage-return redraw.
      expect(output).toContain('add-widgets')
      expect(output).toContain('validation passed')
      expect(CSI.test(output)).toBe(false)
      expect(output.replaceAll('\r\n', '\n')).not.toContain('\r')
    },
    DEADLINE_MS + 10_000,
  )
})
