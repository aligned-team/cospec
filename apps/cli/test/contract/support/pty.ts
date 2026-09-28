// A run on a pseudo-terminal whose input ends at once, through `script -q`:
// the child's stdin and stdout are a TTY, and `script` sends the terminal's
// EOF (Ctrl-D) the moment its own stdin (`/dev/null`) ends — what a user's
// Ctrl-D at a prompt delivers. Used to compare a terminal-handover leaf with
// the pinned binary on a terminal, where a piped run takes another branch.
//
// BSD `script` (macOS) takes the command as trailing arguments and exits with
// the child's status; util-linux `script` (the Linux CI runners) takes it as
// one shell string after `-c` and needs `-e` to return the child's status.

/** What one pseudo-terminal run observed: the terminal's text and the child's exit code. */
export interface PtyRun {
  exitCode: number
  /** Everything written to the terminal, the echoed Ctrl-D included. */
  output: string
}

function shellQuote(token: string): string {
  return `'${token.replaceAll("'", `'\\''`)}'`
}

/** The `script` argv that runs `cmd` on a pseudo-terminal on this platform. */
export function scriptArgv(cmd: readonly string[]): string[] {
  if (Bun.which('script') === null) throw new Error('pty: `script` is not on PATH')
  return process.platform === 'darwin'
    ? ['script', '-q', '/dev/null', ...cmd]
    : ['script', '-q', '-e', '-c', cmd.map(shellQuote).join(' '), '/dev/null']
}

/** Runs `cmd` on a pseudo-terminal in `cwd` under exactly `env`, its input ended at once. */
export async function ptyRun(
  cmd: readonly string[],
  opts: { cwd: string; env: Record<string, string> },
): Promise<PtyRun> {
  const proc = Bun.spawn(scriptArgv(cmd), {
    cwd: opts.cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: opts.env,
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { exitCode, output: stdout + stderr }
}

/** CSI escapes: color, cursor moves and cursor visibility. */
const CSI = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;?]*[A-Za-z]`, 'g')

/** The echoed `^D` and the two backspaces the line discipline writes after it. */
const ECHOED_EOF = `^D${String.fromCharCode(0x08).repeat(2)}`

/**
 * A terminal's text without its control sequences: CSI escapes and carriage
 * returns dropped, and the echoed Ctrl-D. What is left is the words a user
 * reads.
 */
export function terminalText(output: string): string {
  return output.replace(CSI, '').replaceAll(ECHOED_EOF, '').replaceAll('\r', '')
}
