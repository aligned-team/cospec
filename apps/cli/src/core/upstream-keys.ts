// The additive merge (design D3): upstream's keys join cospec's `--json`
// documents from one delegated call, and no cospec key or value is ever
// removed or changed. A key both documents carry keeps cospec's value; when the
// two differ the key is reported as a collision, so the key oracle
// (`test/contract/support/key-oracle.ts`) can prove that only its named
// collisions ever arise.

import {
  RawSelectionError,
  resolveRoot,
  RootSelectionError,
  rootSelectionDocument,
  type ResolvedRoot,
  type RootSource,
} from './root.ts'

/** The binary's `root` object (`toRootOutput`): `{path, source, store_id?}`. */
export interface RootOutput {
  path: string
  source: RootSource
  store_id?: string
}

/** `root` as the binary prints it, from the root cospec resolved. */
export function rootOutput(root: ResolvedRoot): RootOutput {
  return {
    path: root.base,
    source: root.source,
    ...(root.store === undefined ? {} : { store_id: root.store }),
  }
}

/**
 * How the entries of an array of objects are paired: the key each side names
 * the entry by (`change` and `changeName`, `name`, an artifact's `id`).
 */
export interface EntryIdentity {
  readonly cospec: string
  readonly upstream: string
}

/**
 * Identities by path: `changes[]`, `changes[].artifacts[]` — keys joined by
 * `.`, an array entry written `[]`.
 */
export type Identities = Readonly<Record<string, EntryIdentity>>

export interface MergeResult<T> {
  value: T
  /** Paths where both documents carry a key with different values; cospec's won. */
  collisions: string[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * `cospec` with every key of `upstream` it lacks added, recursing into keys
 * both carry as plain objects and merging arrays of objects entry by entry by
 * `identities` (an upstream entry with no cospec counterpart is appended). A
 * key present on both sides keeps cospec's value; a differing one is listed in
 * `collisions`.
 */
export function mergeUpstream<T>(
  cospec: T,
  upstream: unknown,
  identities: Identities = {},
): MergeResult<T> {
  const collisions: string[] = []

  const merge = (cs: unknown, up: unknown, path: string): unknown => {
    if (isPlainObject(cs) && isPlainObject(up)) {
      const out: Record<string, unknown> = { ...cs }
      for (const [key, value] of Object.entries(up)) {
        const at = path === '' ? key : `${path}.${key}`
        out[key] = key in cs ? merge(cs[key], value, at) : value
      }
      return out
    }
    const identity = identities[`${path}[]`]
    if (Array.isArray(cs) && Array.isArray(up) && identity !== undefined) {
      const out = cs.map((entry) => {
        if (!isPlainObject(entry)) return entry
        const twin = up.find(
          (u) => isPlainObject(u) && u[identity.upstream] === entry[identity.cospec],
        )
        return twin === undefined ? entry : merge(entry, twin, `${path}[]`)
      })
      for (const u of up) {
        if (!isPlainObject(u)) continue
        const matched = cs.some(
          (entry) => isPlainObject(entry) && entry[identity.cospec] === u[identity.upstream],
        )
        if (!matched) out.push(u)
      }
      return out
    }
    if (!sameJson(cs, up)) collisions.push(path)
    return cs
  }

  return { value: merge(cospec, upstream, '') as T, collisions }
}

/**
 * `resolveRoot` for a command answering `--json` with its own failure
 * document (design D10): a selection failure prints one
 * `{...payload, status}` document — `payload` the command's null-shape, as
 * the binary's `failurePayload` is — and the command exits 1, so nothing
 * reaches the top-level handler. A selection diagnostic keeps its own code; a
 * raw resolver failure (`RawSelectionError`, which the binary rethrows rather
 * than diagnoses) carries the command's code, as the binary's per-command
 * handler reports it. `undefined` means the document is written. Outside
 * `--json` the error propagates unchanged.
 */
export async function resolveRootOrDocument(
  ctx: { cwd: string; flags: { store?: string; json?: boolean } },
  code: string,
  payload: Readonly<Record<string, unknown>> = {},
): Promise<ResolvedRoot | undefined> {
  try {
    return await resolveRoot(ctx)
  } catch (error) {
    if (ctx.flags.json !== true || !(error instanceof RootSelectionError)) throw error
    const reported =
      error instanceof RawSelectionError
        ? new RootSelectionError({ code, message: error.diagnostic.message })
        : error
    process.stdout.write(rootSelectionDocument(reported, payload))
    return undefined
  }
}
