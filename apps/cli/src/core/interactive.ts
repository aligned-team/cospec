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
