// An errno failure a command lets escape (an unreadable directory, say),
// answered under `--json` as the binary's `failWithError` answers it (design
// D10): one document, exit 1. Every other error keeps propagating.

/** An errno failure's message (`EACCES: permission denied, scandir '…'`); undefined for anything else. */
export function errnoMessage(error: unknown): string | undefined {
  const { code, syscall } = (error ?? {}) as NodeJS.ErrnoException
  return error instanceof Error && typeof code === 'string' && typeof syscall === 'string'
    ? error.message
    : undefined
}

/**
 * Run `command`, answering an errno failure it throws (an unreadable
 * `openspec/changes/`, say) under `--json` with the binary's one
 * `{...payload, status: [{severity: 'error', code, message}]}` document and
 * exit 1. In text mode, and for anything that is not an errno failure, the
 * error propagates to the top-level handler, which prints its message.
 */
export async function answeringErrno(
  json: boolean,
  failure: { code: string; payload?: Readonly<Record<string, unknown>> },
  command: () => Promise<number>,
): Promise<number> {
  try {
    return await command()
  } catch (error) {
    const message = errnoMessage(error)
    if (!json || message === undefined) throw error
    const status = [{ severity: 'error', code: failure.code, message }]
    process.stdout.write(`${JSON.stringify({ ...failure.payload, status }, null, 2)}\n`)
    return 1
  }
}
