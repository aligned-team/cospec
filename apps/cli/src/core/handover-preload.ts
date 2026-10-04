// The script Bun preloads ahead of the wrapped binary wherever the binary may
// prompt: every terminal handover, and `config reset --all` run piped.
//
// Under Node, the binary's inquirer prompts answer a closed input (Ctrl-D on
// a terminal, an ended pipe) through signal-exit: readline closes, the event
// loop empties, Node emits `exit` through `process.emit` — which signal-exit
// has patched — and the listener signal-exit fires rejects the pending prompt
// with `ExitPromptError`; the binary's catch then prints its cancellation line
// and sets exit 130 in a microtask Node drains before it exits. Under Bun,
// which runs every wrapped call (no node, no peer binary), readline closes the
// same way, but Bun dispatches `beforeExit`/`exit` natively, never through the
// patched `process.emit`, and drains no microtask an `exit` listener queues:
// the prompt is never rejected and the process exits 0 having printed only the
// prompt. The preload closes that gap at the one hook where work may still be
// scheduled — `beforeExit`, which both runtimes fire once the loop is empty —
// by emitting signal-exit's own `exit` on its process-wide emitter, as Node's
// patched emit would a moment later, once. Bun drains no microtask a
// `beforeExit` listener queues either, unless the loop turns again, so the
// preload schedules one empty immediate: the rejected prompt's handlers run,
// and the process exits as the binary then leaves it.
//
// Bun's console also writes past `process.stdout`'s queue, straight to the fd.
// inquirer draws its prompt through `process.stdout`, once per answer it reads
// (a `yes` feeder makes thousands of redraws); once that output has backlogged
// a pipe, the stream queues and flushes it before exit, but a line the binary
// then prints with `console.log` — its answer — is lost (on Linux), so the
// piped `config reset --all` reset the config and relayed no answer line. Node's
// console writes through the process streams; the preload routes every
// console method the binary calls (`CONSOLE_ROUTES`) through them the same
// way — to the stream Node's console writes it to — formatted by `node:util`
// `format` as Node's console formats them. A method left on Bun's console
// would still write past the queue: a line lost from the middle of the
// output, or printed ahead of an earlier one.
//
// A write to a stream whose reader has gone (`… | head -0`, a closed pipe on
// stdout or stderr) fails with EPIPE, delivered on both runtimes as the
// stream's `error` event, never thrown — so no `catch` can see it, and with no
// listener it crashes the process. Node's console (`ignoreErrors`, its default)
// swallows it with a no-op `error` listener held for the write, re-armed from
// the write's callback when the failure is reported before the event; Bun's
// native console ignores it too. The preload's writes do the same, so a
// handover whose output reader has exited carries on and exits as the binary
// leaves it.

import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cacheRoot } from './openspec-embedded.ts'

/**
 * Every console method the pinned binary calls, and the process stream Node's
 * console writes it to. A contract row fails a pin whose dist calls another.
 */
export const CONSOLE_ROUTES = {
  log: 'stdout',
  info: 'stdout',
  debug: 'stdout',
  warn: 'stderr',
  error: 'stderr',
} as const

/** The preload's source: plain JavaScript, run by the child's Bun before the binary. */
export const HANDOVER_PRELOAD_SOURCE = `// cospec: answer a closed prompt input as the binary does under Node.
import { format } from 'node:util'
const ignore = () => {}
const write = (stream, args) => {
  try {
    if (stream.listenerCount('error') === 0) stream.once('error', ignore)
    stream.write(format(...args) + '\\n', (error) => {
      if (error != null && !stream._writableState?.errorEmitted && stream.listenerCount('error') === 0)
        stream.once('error', ignore)
    })
  } finally {
    stream.removeListener('error', ignore)
  }
}
${Object.entries(CONSOLE_ROUTES)
  .map(([method, stream]) => `console.${method} = (...args) => write(process.${stream}, args)\n`)
  .join('')}let emitted = false
process.on('beforeExit', (code) => {
  const emitter = globalThis[Symbol.for('signal-exit emitter')]
  if (emitted || emitter === undefined) return
  emitted = true
  emitter.emit('exit', process.exitCode ?? code, null)
  setImmediate(() => {})
})
`

/**
 * Writes the preload into `root` (content-addressed, atomic, self-healing
 * like the embedded bundle's extraction) and returns its path. Throws when
 * the file on disk does not hold the source afterwards.
 */
export function writeHandoverPreloadInto(root: string): string {
  const digest = createHash('sha256').update(HANDOVER_PRELOAD_SOURCE).digest('hex')
  const path = join(root, `handover-preload-${digest.slice(0, 16)}.mjs`)
  if (existsSync(path) && readFileSync(path, 'utf8') === HANDOVER_PRELOAD_SOURCE) return path
  mkdirSync(root, { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, HANDOVER_PRELOAD_SOURCE)
  renameSync(tmp, path)
  if (!existsSync(path) || readFileSync(path, 'utf8') !== HANDOVER_PRELOAD_SOURCE)
    throw new Error(`cospec: could not write the handover preload to ${path}`)
  return path
}

/** The `errno` codes that mean a directory cannot take the preload's file. */
const UNWRITABLE = new Set(['EACCES', 'EPERM', 'EROFS', 'ENOTDIR', 'EEXIST'])

function isUnwritable(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code !== undefined && UNWRITABLE.has(code)
}

let fallback: string | undefined

/**
 * The preload's path: in cospec's cache (`${XDG_CACHE_HOME:-~/.cache}/cospec`),
 * or — when that directory cannot be written — in a directory of this
 * process's own under the temp dir, removed when the process exits, so a
 * read-only cache never stops a handover the binary would run.
 */
export function handoverPreload(): string {
  try {
    return writeHandoverPreloadInto(cacheRoot())
  } catch (error) {
    if (!isUnwritable(error)) throw error
  }
  if (fallback === undefined) {
    const dir = mkdtempSync(join(tmpdir(), 'cospec-preload-'))
    process.once('exit', () => rmSync(dir, { recursive: true, force: true }))
    fallback = writeHandoverPreloadInto(dir)
  }
  return fallback
}

/** The argv that runs `bin` with `argv` under the current executable's Bun, the preload first. */
export function preloadedArgv(bin: string, argv: readonly string[]): string[] {
  return [process.execPath, '--preload', handoverPreload(), bin, ...argv]
}
