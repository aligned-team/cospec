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

/** The errnos a generated file's write, sidecar or removal may fail with and be isolated. */
const ISOLATED_WRITE_ERRNOS: ReadonlySet<string> = new Set([
  'EACCES',
  'EPERM',
  'EROFS',
  'ENOTDIR',
  'EISDIR',
])

/** The temp file `atomicWrite` stages a write in: its name varies per run and means nothing to a reader. */
const STAGING_SUFFIX = /\.cospec-tmp-\d+-\d+/g

/**
 * The message of a permission or path-type errno failure (tool-matrix design decision 10),
 * naming the generated file rather than the staging file a write went through; undefined
 * for every other error, which the caller must rethrow.
 */
export function isolatedWriteFailure(error: unknown): string | undefined {
  const message = errnoMessage(error)
  if (message === undefined) return undefined
  const { code } = error as NodeJS.ErrnoException
  return code !== undefined && ISOLATED_WRITE_ERRNOS.has(code)
    ? message.replace(STAGING_SUFFIX, '')
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
