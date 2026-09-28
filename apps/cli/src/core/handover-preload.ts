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

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cacheRoot } from './openspec-embedded.ts'

/** The preload's source: plain JavaScript, run by the child's Bun before the binary. */
export const HANDOVER_PRELOAD_SOURCE = `// cospec: answer a closed prompt input as the binary does under Node.
let emitted = false
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

/** The preload's path in cospec's cache (`${XDG_CACHE_HOME:-~/.cache}/cospec`). */
export function handoverPreload(): string {
  return writeHandoverPreloadInto(cacheRoot())
}

/** The argv that runs `bin` with `argv` under the current executable's Bun, the preload first. */
export function preloadedArgv(bin: string, argv: readonly string[]): string[] {
  return [process.execPath, '--preload', handoverPreload(), bin, ...argv]
}
