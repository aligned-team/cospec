import { describe, expect, test } from 'bun:test'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  HANDOVER_PRELOAD_SOURCE,
  handoverPreload,
  writeHandoverPreloadInto,
} from '../../../src/core/handover-preload.ts'

describe('writeHandoverPreloadInto', () => {
  test('writes the source at a content-addressed path, and nothing else', () => {
    const root = join(mkdtempSync(join(tmpdir(), 'cospec-preload-')), 'cospec')
    const path = writeHandoverPreloadInto(root)
    expect(path.startsWith(join(root, 'handover-preload-'))).toBe(true)
    expect(path.endsWith('.mjs')).toBe(true)
    expect(readFileSync(path, 'utf8')).toBe(HANDOVER_PRELOAD_SOURCE)
    expect(writeHandoverPreloadInto(root)).toBe(path)
    expect(readdirSync(root)).toEqual([path.slice(root.length + 1)])
  })

  test('repairs a file whose content is not the source', () => {
    const root = mkdtempSync(join(tmpdir(), 'cospec-preload-'))
    const path = writeHandoverPreloadInto(root)
    writeFileSync(path, '// tampered\n')
    expect(writeHandoverPreloadInto(root)).toBe(path)
    expect(readFileSync(path, 'utf8')).toBe(HANDOVER_PRELOAD_SOURCE)
  })
})

describe('handoverPreload', () => {
  // A cache directory cospec cannot write (`chmod 555`) must not stop a
  // handover: the preload lands in a directory of this process's own under the
  // temp dir instead. (Root ignores the mode, so the row cannot run as root.)
  test.skipIf(process.getuid?.() === 0)(
    'an unwritable cache falls back to a per-process directory under the temp dir',
    () => {
      const cache = mkdtempSync(join(tmpdir(), 'cospec-cache-'))
      const previous = process.env.XDG_CACHE_HOME
      chmodSync(cache, 0o555)
      process.env.XDG_CACHE_HOME = cache
      try {
        expect(() => mkdirSync(join(cache, 'probe'))).toThrow()
        const path = handoverPreload()
        expect(path.startsWith(cache)).toBe(false)
        expect(dirname(dirname(path))).toBe(tmpdir())
        expect(readFileSync(path, 'utf8')).toBe(HANDOVER_PRELOAD_SOURCE)
        expect(handoverPreload()).toBe(path)
      } finally {
        if (previous === undefined) delete process.env.XDG_CACHE_HOME
        else process.env.XDG_CACHE_HOME = previous
        chmodSync(cache, 0o755)
        rmSync(cache, { recursive: true, force: true })
      }
    },
  )
})

describe('the preload keeps every console line behind a backlogged stream', () => {
  // Under Bun the console writes past `process.stdout`'s queue: once inquirer's
  // redraws have backlogged a pipe (a `yes` feeder makes one per `y`), a line
  // the binary then `console.log`s is lost at exit on Linux, while everything
  // written through the stream arrives (issue #58). Under Node the console
  // writes through the stream. Each run backlogs both pipes, then prints its
  // answer through the console; every run must end with it.
  const backlog = `const redraw = '\\u001b[43G\\u001b[44G'
for (let i = 0; i < 20000; i++) { process.stdout.write(redraw); process.stderr.write(redraw) }
console.log('answer %s', 'line')
console.error('failure %s', 'line')`
  test('20 runs of a Bun child that backlogs stdout and stderr, then answers', async () => {
    const preload = writeHandoverPreloadInto(mkdtempSync(join(tmpdir(), 'cospec-preload-')))
    const ends: string[] = []
    for (let run = 0; run < 20; run++) {
      const proc = Bun.spawn([process.execPath, '--preload', preload, '-e', backlog], {
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])
      ends.push(`${exitCode} ${stdout.slice(-12)} ${stderr.slice(-13)}`)
    }
    expect(ends).toEqual(Array(20).fill('0 answer line\n failure line\n'))
  }, 30_000)
})

/**
 * A Bun child that waits until the reader of its `closed` stream has exited,
 * prints twice there, then says it is still alive on the other stream and sets
 * its own exit code.
 */
function closedStreamChild(closed: 'stdout' | 'stderr'): string {
  const [gone, alive] = closed === 'stdout' ? ['log', 'error'] : ['error', 'log']
  return `await new Promise((resolve) => setTimeout(resolve, 300))
console.${gone}('lost %s', 1)
console.${gone}('lost %s', 2)
console.${alive}('still alive')
process.exitCode = 7`
}

/**
 * `sh` gives the child's closed stream a pipe to `true`, and its other stream
 * (and its exit code) the captured stdout, through fd 3.
 */
const CLOSED_STREAM_SHELL = {
  stdout: '{ { "$@" 2>&3; echo "rc=$?" >&3; } | true; } 3>&1',
  stderr: '{ { "$@" 2>&1 1>&3; echo "rc=$?" >&3; } | true; } 3>&1',
}

describe('the preload ignores a console write whose reader has gone, as Node does', () => {
  // A handover's stdout or stderr is whatever the user gave it: `cospec
  // workset open w1 | head -0` hands over with stdout a pipe whose reader has
  // exited. A write there fails with EPIPE, delivered as the stream's `error`
  // event (on Bun and Node alike, never thrown); Node's console swallows it,
  // as Bun's native console does, and the binary carries on.
  for (const closed of ['stdout', 'stderr'] as const)
    test(`console.${closed === 'stdout' ? 'log' : 'error'} to a ${closed} whose reader has exited`, async () => {
      const preload = writeHandoverPreloadInto(mkdtempSync(join(tmpdir(), 'cospec-preload-')))
      const proc = Bun.spawn(
        [
          'sh',
          '-c',
          CLOSED_STREAM_SHELL[closed],
          'sh',
          process.execPath,
          '--preload',
          preload,
          '-e',
          closedStreamChild(closed),
        ],
        {
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, BUN_BE_BUN: '1' },
        },
      )
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])
      expect({ stdout, stderr }).toEqual({ stdout: 'still alive\nrc=7\n', stderr: '' })
    }, 10_000)
})
