// A run on a pseudo-terminal, through the pinned Bun's own PTY (`Bun.spawn`'s
// `terminal` option, POSIX-only: the macOS and Linux CI runners alike), with
// no helper process between the driver and the child: the child's stdin,
// stdout and stderr are the terminal, and a key is the byte a user's keyboard
// sends. Used to compare a terminal-handover leaf with the pinned binary on a
// terminal, where a piped run takes another branch.
//
// A key is written only once its prompt has been drawn, never typed ahead: an
// inquirer prompt puts the terminal in raw mode before it draws, where Ctrl-C
// (0x03) and Ctrl-D (0x04) reach it as keypresses; typed ahead, the line
// discipline would still be canonical and answer them itself (SIGINT, EOF).

/** What one pseudo-terminal run observed: the terminal's text and the child's exit code. */
export interface PtyRun {
  exitCode: number
  /** Everything the child wrote to the terminal. */
  output: string
}

/** The byte a user's Ctrl-C sends. */
export const CTRL_C = String.fromCharCode(0x03)

/** The byte a user's Ctrl-D sends. */
export const CTRL_D = String.fromCharCode(0x04)

/** A key pressed at a prompt: `send`, once the terminal shows `after`. */
export interface PtyKey {
  /** Text the prompt draws; the key is pressed once it is on the terminal. */
  after: string
  /** The bytes the key sends (`CTRL_C`, `CTRL_D`). */
  send: string
}

/** How long a run may take before the driver kills it and fails with what it saw. */
const DEADLINE_MS = 20_000

/** How long the driver waits after the prompt's text, so the whole prompt is drawn. */
const SETTLE_MS = 250

/**
 * Runs `cmd` on a pseudo-terminal in `cwd` under exactly `env`, pressing
 * `key` (if any) at its prompt; resolves once the child has exited and the
 * terminal has delivered everything it wrote. Throws, with the terminal's
 * text so far, when the run outlives the deadline or the prompt never shows.
 */
export async function ptyRun(
  cmd: readonly string[],
  opts: { cwd: string; env: Record<string, string>; key?: PtyKey },
): Promise<PtyRun> {
  const chunks: Uint8Array[] = []
  const decoder = new TextDecoder()
  let seen = ''
  let prompted = (): void => {}
  const promptShown = new Promise<void>((resolve) => (prompted = resolve))
  let drained = (): void => {}
  const eof = new Promise<void>((resolve) => (drained = resolve))
  const proc = Bun.spawn([...cmd], {
    cwd: opts.cwd,
    env: opts.env,
    terminal: {
      cols: 80,
      rows: 24,
      data(_terminal, data) {
        chunks.push(data.slice())
        seen += decoder.decode(data, { stream: true })
        if (opts.key !== undefined && seen.includes(opts.key.after)) prompted()
      },
      // The terminal's end of output (on Linux an EIO once the child's side
      // closes, status 1): everything the child wrote has been delivered.
      exit() {
        drained()
      },
    },
  })
  const terminal = proc.terminal!
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    proc.kill('SIGKILL')
  }, DEADLINE_MS)
  const text = (): string => new TextDecoder().decode(Buffer.concat(chunks))
  try {
    if (opts.key !== undefined) {
      const key = opts.key
      const shown = await Promise.race([
        promptShown.then(() => true),
        proc.exited.then(() => false),
      ])
      if (shown) {
        await Bun.sleep(SETTLE_MS)
        terminal.write(key.send)
      }
    }
    const exitCode = await proc.exited
    await Promise.race([eof, Bun.sleep(2_000)])
    if (timedOut)
      throw new Error(
        `pty: ${cmd.join(' ')} outlived ${DEADLINE_MS}ms; terminal: ${JSON.stringify(text())}`,
      )
    return { exitCode, output: text() }
  } finally {
    clearTimeout(timer)
    if (!terminal.closed) terminal.close()
  }
}

/** CSI escapes: color, cursor moves and cursor visibility. */
const CSI = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;?]*[A-Za-z]`, 'g')

/**
 * A terminal's text without its control sequences: CSI escapes and carriage
 * returns dropped. What is left is the words a user reads.
 */
export function terminalText(output: string): string {
  return output.replace(CSI, '').replaceAll('\r', '')
}
