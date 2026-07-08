// Operating-root resolution (store-awareness). Every command resolves exactly
// one `Root` up front — the local repo cwd, or a registered OpenSpec store — and
// then threads it: `root.base` to the filesystem readers, `root` to the wrapped
// openspec calls (which append `root.storeArgs`). Resolution order mirrors
// openspec 1.5.0's own precedence so cospec and bare openspec agree on which
// root a command targets:
//
//   1. an explicit `--store <id>` global flag, else
//   2. a `store:` pointer in the local `openspec/config.yaml`, else
//   3. the local repo at cwd.
//
// A `references:` list in config.yaml is read-only upstream context (openspec
// surfaces it in `instructions`) and is deliberately NOT a root override — it
// never redirects where a change is created or gated.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse as parseYaml } from 'yaml'

import { openspecDir } from './change.ts'
import { localRoot, openspecStoreList, type Root } from './openspec.ts'

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
      `unknown store '${id}' — register it with 'openspec store register <path>' or check ` +
        `'openspec store ls'. Registered stores: ${known}`,
    )
  }
  return { base: found.root, cwd, storeArgs: ['--store', id], store: id }
}

/**
 * The operating root for a command: `--store` flag, else the config `store:`
 * pointer, else the local repo. The common (local) case resolves synchronously
 * with no wrapped call; only a store target spawns `openspec store ls`.
 */
export async function resolveRoot(ctx: { cwd: string; flags: { store?: string } }): Promise<Root> {
  const id = ctx.flags.store ?? configStorePointer(ctx.cwd)
  if (id === undefined) return localRoot(ctx.cwd)
  return resolveStore(ctx.cwd, id)
}
