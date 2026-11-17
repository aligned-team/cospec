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

import { materializePreload, type PreloadFile, writePreloadInto } from './preload-file.ts'
import { readdirPreload } from './readdir-preload.ts'

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

const HANDOVER_PRELOAD: PreloadFile = {
  stem: 'handover-preload',
  extension: 'mjs',
  source: HANDOVER_PRELOAD_SOURCE,
}

/** Writes the handover preload into `root` (see `writePreloadInto`) and returns its path. */
export function writeHandoverPreloadInto(root: string): string {
  return writePreloadInto(root, HANDOVER_PRELOAD)
}

/**
 * The handover preload's path: in cospec's cache, or — when that directory
 * cannot be written — under the temp dir (see `materializePreload`), so a
 * read-only cache never stops a handover the binary would run.
 */
export function handoverPreload(): string {
  return materializePreload(HANDOVER_PRELOAD)
}

/**
 * The argv that runs `bin` with `argv` under the current executable's Bun: the
 * readdir preload first (it must patch `fs` before anything imports it), then
 * the handover preload.
 */
export function preloadedArgv(bin: string, argv: readonly string[]): string[] {
  return [
    process.execPath,
    '--preload',
    readdirPreload(),
    '--preload',
    handoverPreload(),
    bin,
    ...argv,
  ]
}
