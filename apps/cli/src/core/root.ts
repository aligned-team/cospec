// Operating-root resolution (store-awareness). Every command resolves exactly
// one `Root` up front — the local repo cwd, or a registered OpenSpec store — and
// then threads it: `root.base` to the filesystem readers, `root` to the wrapped
// openspec calls (which append `root.storeArgs`). Resolution order mirrors
// upstream `src/core/root-selection.ts` (openspec >=1.5.0) so cospec and bare
// openspec agree on which root a command targets:
//
//   1. an explicit `--store <id>` global flag, else
//   2. a `store:` pointer in the local `openspec/config.yaml`, else
//   3. the local repo at cwd, when `openspec/` exists there, else
//   4. a machine-global `defaultStore` (`openspec config get defaultStore`),
//      consulted ONLY as a fallback once local-root resolution has failed —
//      it never outranks an existing local root, an explicit `--store`, or a
//      config `store:` pointer. This changes the failure path, never the
//      precedence, exactly as upstream's comment states.
//
// When neither a local root nor a defaultStore resolves, callers fall through
// to the local repo anyway (unchanged pre-1.11 behaviour) — each command's own
// `existsSync(openspecDir(base))` check reports the missing root, so this
// module never has to invent a new error shape for that case.
//
// A `references:` list in config.yaml is read-only upstream context (openspec
// surfaces it in `instructions`) and is deliberately NOT a root override — it
// never redirects where a change is created or gated.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse as parseYaml } from 'yaml'

import { openspecDir } from './change.ts'
import { localRoot, openspecStoreList, runOpenspec, type Root } from './openspec.ts'

export type { Root } from './openspec.ts'
export { localRoot } from './openspec.ts'

/**
 * Read a `store:` pointer from `<cwd>/openspec/config.yaml`, if present. Returns
 * undefined when there is no config, it is unparseable, or `store:` is absent or
 * not a non-empty string — every such case falls through to a local root rather
 * than erroring (a malformed config is the validate command's concern).
 */
export function configStorePointer(cwd: string): string | undefined {
  const path = join(openspecDir(cwd), 'config.yaml')
  if (!existsSync(path)) return undefined
  let doc: unknown
  try {
    doc = parseYaml(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
  if (doc === null || typeof doc !== 'object') return undefined
  const store = (doc as Record<string, unknown>).store
  return typeof store === 'string' && store.length > 0 ? store : undefined
}

/**
 * Resolve a store id to a `Root` via the machine registry
 * (`openspec store ls --json`). Throws an actionable error naming the known
 * stores when the id is not registered on this machine — this is the one place
 * a mistyped `--store` fails loudly rather than silently falling back to local.
 */
export async function resolveStore(cwd: string, id: string): Promise<Root> {
  const { stores } = await openspecStoreList(cwd)
  const found = stores.find((s) => s.id === id)
  if (found === undefined) {
    const known = stores.map((s) => s.id).join(', ') || '(none registered)'
    throw new Error(
      `unknown store '${id}' — register it with 'cospec store register <path>' or check ` +
        `'cospec store ls'. Registered stores: ${known}`,
    )
  }
  return { base: found.root, cwd, storeArgs: ['--store', id], store: id }
}

/**
 * Read the machine-global `defaultStore` via `openspec config get defaultStore`.
 * That subcommand takes no `--json` (upstream `src/commands/config.ts`): it
 * prints the raw value on stdout and exits 1 when the key is unset. Both are
 * ordinary outcomes here, not wrapped-call violations, so both exit codes are
 * accepted; only exit 0 with a non-empty stdout counts as "set".
 */
export async function readDefaultStore(cwd: string): Promise<string | undefined> {
  const result = await runOpenspec(['config', 'get', 'defaultStore'], {
    cwd,
    expect: { exitCodes: [0, 1] },
  })
  if (result.exitCode !== 0) return undefined
  const value = result.stdout.trim()
  return value.length > 0 ? value : undefined
}

/**
 * The operating root for a command: `--store` flag, else the config `store:`
 * pointer, else the local repo at cwd when it has an `openspec/` dir, else the
 * machine-global `defaultStore` fallback, else the local repo anyway (letting
 * the caller's own missing-root check report the failure). The common (local
 * root already present) case resolves synchronously with no wrapped call;
 * a store target, or a missing local root, spawns a wrapped call to resolve
 * further.
 *
 * A stale `defaultStore` (naming a store id no longer registered) fails the
 * same way an unknown `--store` does — `resolveStore` throws an actionable
 * error naming the known stores — rather than silently falling back further.
 */
export async function resolveRoot(ctx: { cwd: string; flags: { store?: string } }): Promise<Root> {
  const id = ctx.flags.store ?? configStorePointer(ctx.cwd)
  if (id !== undefined) return resolveStore(ctx.cwd, id)
  if (existsSync(openspecDir(ctx.cwd))) return localRoot(ctx.cwd)
  const defaultId = await readDefaultStore(ctx.cwd)
  if (defaultId === undefined) return localRoot(ctx.cwd)
  return resolveStore(ctx.cwd, defaultId)
}
