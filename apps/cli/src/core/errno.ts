// Recognising an errno failure a command lets escape (an unreadable directory,
// say), as distinct from every other error, which keeps propagating.

/** An errno failure's message (`EACCES: permission denied, scandir '…'`); undefined for anything else. */
export function errnoMessage(error: unknown): string | undefined {
  const { code, syscall } = (error ?? {}) as NodeJS.ErrnoException
  return error instanceof Error && typeof code === 'string' && typeof syscall === 'string'
    ? error.message
    : undefined
}
