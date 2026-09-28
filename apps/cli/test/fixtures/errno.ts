// An errno message (`EACCES: permission denied, open '/x'`) reduced to what a
// test can assert on every runtime and kernel: the errno code, the syscall
// token, and the quoted path. The sentence in between is the runtime's own
// wording, and the syscall token is not stable either: Bun names a failed
// `statSync` `statx` on a Linux kernel new enough to use that syscall and
// `stat` elsewhere, while Node always says `stat` — so a byte-for-byte compare
// of two errno messages passes on one machine and fails on another without
// either tool changing. The token is normalised to the name Node uses; the
// code and the path must match exactly.
//
// Whether a path is there at all is its own field, read from the message
// independently of the parse: a runtime can name the path on one errno and
// leave it off another (Bun's failed `read` says
// `EISDIR: illegal operation on a directory, read`, with none), so a shape
// that dropped an unparsed path to "no path" would let a message that names
// one pass as one that does not.

/** An errno message's code, syscall (`statx` read as `stat`) and quoted path. */
export interface ErrnoShape {
  code: string
  syscall: string
  /** Whether the message quotes any path at all. */
  hasPath: boolean
  /** The first quoted path, or null for a failure that names none (`read`'s EISDIR). */
  path: string | null
}

const ERRNO_MESSAGE = /^(E[A-Z0-9]+): [^\n]*?, ([a-z_]+)(?: '([^\n]*?)')?(?: -> '[^\n]*')?$/

/**
 * Parse `message` as one errno message. Throws on anything else, so a row that
 * expects an errno failure never passes on an unrelated message.
 */
export function errnoShape(message: string): ErrnoShape {
  const match = ERRNO_MESSAGE.exec(message)
  if (match === null) throw new Error(`not an errno message: ${JSON.stringify(message)}`)
  const [, code, syscall, path] = match
  const hasPath = message.includes("'")
  if (hasPath !== (path !== undefined))
    throw new Error(
      `errno message quotes a path the parse did not read: ${JSON.stringify(message)}`,
    )
  return {
    code: code!,
    syscall: syscall === 'statx' ? 'stat' : syscall!,
    hasPath,
    path: path ?? null,
  }
}
