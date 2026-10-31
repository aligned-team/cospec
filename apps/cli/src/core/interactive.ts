import { readSync } from 'node:fs'

/**
 * The binary's `isInteractive()` (`utils/interactive.js`): `OPEN_SPEC_INTERACTIVE=0` or a
 * `CI` variable turns it off, and otherwise stdin must be a TTY.
 */
export function isInteractive(
  env: Readonly<Record<string, string | undefined>> = process.env,
  stdinIsTTY: boolean = process.stdin.isTTY === true,
): boolean {
  if (env.OPEN_SPEC_INTERACTIVE === '0') return false
  if ('CI' in env) return false
  return stdinIsTTY
}

/** The part of a stream `canRedraw` reads: whether it is a terminal, and how wide. */
export interface DrawTarget {
  isTTY?: boolean
  columns?: number
}

/**
 * Whether a spinner or an in-place redraw may run on `stream` — the binary's
 * `canRenderSpinner` (1.14.3, `utils/interactive.js`) plus the two switches its
 * spinner callers also honour. A non-terminal never redraws; a terminal that
 * reports zero columns cannot (ora's erase count is `ceil(width / columns)`, so
 * zero columns never stops clearing — a pty inherited from a hook runner such as
 * lefthook, or `script -qec`); `CI` and `OPEN_SPEC_INTERACTIVE=0` turn it off.
 * Callers fall back to plain, write-once output.
 */
export function canRedraw(
  stream: DrawTarget = process.stdout,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (env.OPEN_SPEC_INTERACTIVE === '0') return false
  if ('CI' in env) return false
  if (stream.isTTY !== true) return false
  return (stream.columns ?? 0) > 0
}

/**
 * What a wrapped call's environment adds so the child draws nothing this
 * process could not: on a zero-width terminal, `OPEN_SPEC_INTERACTIVE=0`. `CI`
 * and an explicit `OPEN_SPEC_INTERACTIVE` already reach the child, which
 * inherits the parent's environment, so they are left as they are.
 */
export function noRedrawEnv(
  stream: DrawTarget = process.stdout,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string> {
  if (env.OPEN_SPEC_INTERACTIVE !== undefined) return {}
  return stream.isTTY === true && (stream.columns ?? 0) <= 0 ? { OPEN_SPEC_INTERACTIVE: '0' } : {}
}

/**
 * Print `question` and read one line from stdin. `undefined` when stdin ends before a line
 * does, so a closed stdin is told apart from an empty answer.
 */
export function askLine(question: string): string | undefined {
  process.stdout.write(`${question} `)
  const buf = Buffer.alloc(256)
  let answer = ''
  while (!answer.includes('\n')) {
    const n = readSync(0, buf, 0, buf.length, null)
    if (n === 0) return answer === '' ? undefined : answer
    answer += buf.toString('utf8', 0, n)
  }
  return answer.slice(0, answer.indexOf('\n'))
}
