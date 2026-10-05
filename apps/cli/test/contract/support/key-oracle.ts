// The key oracle (design D5): walks the pinned binary's `--json` document and
// cospec's document for the same invocation together, and says where cospec
// drops an upstream key, reports an upstream value differently, or collides
// with one outside the named collision list. A second check proves cospec's own
// pre-existing keys still carry the values cospec computes natively.
//
// Paths are written with `.` between keys and `[]` for an array entry
// (`changes[].artifacts[].status`); a pattern segment `*` matches one key and
// `**` any run of segments, none included. Arrays of objects are matched entry
// by entry through an identity per path, never by index, so the two tools may
// order a sweep differently; any other array is compared whole.

import { respellWholeRemedy } from '../../../src/core/remedies.ts'

/** How a shared path is compared. */
export type PathClass =
  | 'exempt'
  | 'timing'
  | 'verdict'
  | 'kept'
  | 'collision'
  | 'respelled'
  | 'equal'

/** One side's identity for an array entry; `undefined` for an entry with none. */
export type Identity = (entry: Record<string, unknown>) => string | undefined

export interface ArrayIdentity {
  /** The binary's entry identity (`name`, `changeName`, `type:id`). */
  readonly upstream: Identity
  /** cospec's entry identity for the same entry (`change`, `kind:id`). */
  readonly cospec: Identity
}

/**
 * A key both tools emit whose values differ by design. `check` sees the two
 * parent objects, so an entry can prove the mapping it names (cospec's `kind`
 * carries the binary's `type`).
 */
export interface NamedCollision {
  readonly path: string
  readonly reason: string
  readonly check?: (
    upstreamParent: Record<string, unknown>,
    cospecParent: Record<string, unknown>,
  ) => string | undefined
}

/**
 * The named collision list. Every other key both tools emit must carry the
 * binary's value, and `compareDocuments` fails on any collision not named here.
 */
export const NAMED_COLLISIONS: readonly NamedCollision[] = [
  {
    path: 'version',
    reason:
      'cospec\'s envelopes keep their own format marker, `version: 1`; the binary\'s `version` is its report format (`"1.0"`), which cospec never takes',
  },
  {
    path: 'items[].type',
    reason:
      "cospec's documented `type` is a change's schema (absent on a spec); the binary's `type` is the item kind, which cospec reports as `kind`",
    check: (up, cs) => {
      if (cs.kind !== up.type)
        return `kind is ${JSON.stringify(cs.kind)} where the binary's type is ${JSON.stringify(up.type)}`
      if (cs.kind === 'spec' && cs.type !== undefined)
        return `a spec item carries type ${JSON.stringify(cs.type)}`
      if (cs.kind === 'change' && cs.type !== undefined && typeof cs.type !== 'string')
        return `type is not a schema name: ${JSON.stringify(cs.type)}`
      return undefined
    },
  },
]

export interface OracleSpec {
  /** Identity per array-of-objects path. */
  readonly identities?: Readonly<Record<string, ArrayIdentity>>
  /** Compared by presence and JSON type (`durationMs`, `lastModified`). */
  readonly timing?: readonly string[]
  /** Each lane keeps its own findings: presence and JSON type only. */
  readonly verdict?: readonly string[]
  /** Upstream values cospec relays with each remedy spelled through cospec. */
  readonly respelled?: readonly string[]
  /**
   * Keys whose value is cospec's own pre-existing one (the in-progress
   * status entry's empty `artifacts`): presence and JSON type only here, the
   * value proven against cospec's native document by the row itself.
   */
  readonly kept?: readonly string[]
  /** The named collisions this command's document may carry (from `NAMED_COLLISIONS`). */
  readonly collisions?: readonly string[]
}

export interface OracleResult {
  /** One line per defect, each naming the offending path. */
  readonly failures: string[]
  /**
   * Array paths the binary's document left empty in every instance, so a row
   * can prove its fixture exercises at least one entry of each array.
   */
  readonly emptyArrays: string[]
}

type Segments = string[]

function segments(pattern: string): Segments {
  return pattern
    .split('.')
    .flatMap((part) => (part.endsWith('[]') ? [part.slice(0, -2), '[]'] : [part]))
    .filter((s) => s.length > 0)
}

function render(path: Segments): string {
  return path.reduce(
    (out, seg) => (seg === '[]' ? `${out}[]` : out === '' ? seg : `${out}.${seg}`),
    '',
  )
}

function matches(pattern: Segments, path: Segments): boolean {
  if (pattern.length === 0) return path.length === 0
  const [head, ...rest] = pattern
  if (head === '**') {
    for (let i = 0; i <= path.length; i++) if (matches(rest, path.slice(i))) return true
    return false
  }
  if (path.length === 0) return false
  if (head !== '*' && head !== path[0]) return false
  return matches(rest, path.slice(1))
}

const EXEMPT = [segments('version')]

function jsonType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b) && jsonType(a) === jsonType(b)
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (isPlainObject(value))
    return Object.fromEntries(
      Object.keys(value)
        .toSorted()
        .map((k) => [k, canonical(value[k])]),
    )
  return value
}

function same(a: unknown, b: unknown): boolean {
  return deepEqual(canonical(a), canonical(b))
}

interface Compiled {
  identities: [Segments, ArrayIdentity][]
  timing: Segments[]
  verdict: Segments[]
  respelled: Segments[]
  kept: Segments[]
  collisions: [Segments, NamedCollision][]
}

function compile(spec: OracleSpec): Compiled {
  const named = new Map(NAMED_COLLISIONS.map((c) => [c.path, c]))
  return {
    identities: Object.entries(spec.identities ?? {}).map(([p, id]) => [segments(p), id]),
    timing: (spec.timing ?? []).map(segments),
    verdict: (spec.verdict ?? []).map(segments),
    respelled: (spec.respelled ?? []).map(segments),
    kept: (spec.kept ?? []).map(segments),
    collisions: (spec.collisions ?? []).map((p) => {
      const entry = named.get(p)
      if (entry === undefined) throw new Error(`key oracle: '${p}' is not a named collision`)
      return [segments(p), entry]
    }),
  }
}

function classify(c: Compiled, path: Segments): PathClass {
  if (EXEMPT.some((p) => matches(p, path))) return 'exempt'
  if (c.collisions.some(([p]) => matches(p, path))) return 'collision'
  if (c.timing.some((p) => matches(p, path))) return 'timing'
  if (c.verdict.some((p) => matches(p, path))) return 'verdict'
  if (c.kept.some((p) => matches(p, path))) return 'kept'
  if (c.respelled.some((p) => matches(p, path))) return 'respelled'
  return 'equal'
}

function identityFor(c: Compiled, path: Segments): ArrayIdentity | undefined {
  return c.identities.find(([p]) => matches(p, path))?.[1]
}

/**
 * Compare the binary's document with cospec's: every upstream key path must be
 * present in cospec's, with the binary's value unless its class says
 * otherwise. Extra cospec keys are never a failure here; `checkNativeKeys`
 * proves those.
 */
export function compareDocuments(
  upstream: unknown,
  cospec: unknown,
  spec: OracleSpec,
): OracleResult {
  const c = compile(spec)
  const failures: string[] = []
  const empty = new Set<string>()
  const filled = new Set<string>()

  const walk = (
    up: unknown,
    cs: unknown,
    path: Segments,
    parents: { up?: Record<string, unknown>; cs?: Record<string, unknown> },
  ): void => {
    const label = render(path) || '<document>'
    const cls = classify(c, path)
    if (cls === 'exempt') return
    if (cls === 'collision') {
      const entry = c.collisions.find(([p]) => matches(p, path))![1]
      const problem = entry.check?.(parents.up ?? {}, parents.cs ?? {})
      if (problem !== undefined) failures.push(`${label}: named collision broken: ${problem}`)
      return
    }
    if (cs === undefined) {
      failures.push(`${label}: missing (the binary has ${JSON.stringify(up)})`)
      return
    }
    if (cls === 'timing' || cls === 'verdict' || cls === 'kept') {
      if (jsonType(up) !== jsonType(cs))
        failures.push(
          `${label}: ${cls} value is a ${jsonType(cs)} where the binary's is a ${jsonType(up)}`,
        )
      return
    }
    if (cls === 'respelled') {
      const want = typeof up === 'string' ? respellWholeRemedy(up) : up
      if (!same(want, cs))
        failures.push(
          `${label}: ${JSON.stringify(cs)} is not the binary's value respelled (${JSON.stringify(want)})`,
        )
      return
    }
    if (jsonType(up) !== jsonType(cs)) {
      failures.push(
        `${label}: collision: cospec has a ${jsonType(cs)} (${JSON.stringify(cs)}) where the binary has a ${jsonType(up)} (${JSON.stringify(up)})`,
      )
      return
    }
    if (isPlainObject(up) && isPlainObject(cs)) {
      for (const key of Object.keys(up)) walk(up[key], cs[key], [...path, key], { up, cs })
      return
    }
    if (Array.isArray(up) && Array.isArray(cs)) {
      const elementPath = [...path, '[]']
      if (up.length === 0) empty.add(render(path))
      else filled.add(render(path))
      const identity = identityFor(c, elementPath)
      const hasRespelled = c.respelled.some((p) => matches(p, elementPath))
      if (identity === undefined && !hasRespelled) {
        if (!same(up, cs))
          failures.push(
            `${label}: collision: ${JSON.stringify(cs)} where the binary has ${JSON.stringify(up)}`,
          )
        return
      }
      if (identity === undefined) {
        if (up.length !== cs.length)
          failures.push(`${label}: ${cs.length} entries where the binary has ${up.length}`)
        up.forEach((entry, i) => walk(entry, cs[i], elementPath, {}))
        return
      }
      for (const entry of up) {
        if (!isPlainObject(entry)) {
          failures.push(`${label}: an entry is not an object: ${JSON.stringify(entry)}`)
          continue
        }
        const key = identity.upstream(entry)
        const twin = cs.find((e) => isPlainObject(e) && identity.cospec(e) === key)
        if (twin === undefined) {
          failures.push(`${label}: no cospec entry for the binary's ${JSON.stringify(key)}`)
          continue
        }
        walk(entry, twin, elementPath, { up: entry, cs: twin as Record<string, unknown> })
      }
      return
    }
    if (!same(up, cs))
      failures.push(
        `${label}: collision: cospec has ${JSON.stringify(cs)} where the binary has ${JSON.stringify(up)}`,
      )
  }

  walk(upstream, cospec, [], {})
  return { failures, emptyArrays: [...empty].filter((p) => !filled.has(p)) }
}

/**
 * The snapshot check: every path in `snapshot` (cospec's key set before this
 * change) must be present in `cospec` with the value `native` — the document
 * cospec computes natively for the same fixture — carries. Array entries are
 * matched by the cospec side of `identities`.
 */
export function checkNativeKeys(
  cospec: unknown,
  native: unknown,
  snapshot: readonly string[],
  identities: Readonly<Record<string, ArrayIdentity>> = {},
): string[] {
  const wanted = snapshot.map(segments)
  const ids = Object.entries(identities).map(([p, id]) => [segments(p), id] as const)
  const failures: string[] = []
  const prefixOfWanted = (path: Segments): boolean =>
    wanted.some((w) => w.length > path.length && matches(w.slice(0, path.length), path))

  const walk = (nat: unknown, cs: unknown, path: Segments): void => {
    const label = render(path) || '<document>'
    if (wanted.some((w) => matches(w, path))) {
      if (cs === undefined) failures.push(`${label}: cospec key dropped`)
      else if (!same(nat, cs))
        failures.push(
          `${label}: cospec value changed: ${JSON.stringify(cs)}, natively ${JSON.stringify(nat)}`,
        )
      return
    }
    if (!prefixOfWanted(path)) return
    if (cs === undefined) {
      failures.push(`${label}: cospec key dropped`)
      return
    }
    if (isPlainObject(nat) && isPlainObject(cs)) {
      for (const key of Object.keys(nat)) walk(nat[key], cs[key], [...path, key])
      return
    }
    if (Array.isArray(nat) && Array.isArray(cs)) {
      const elementPath = [...path, '[]']
      const identity = ids.find(([p]) => matches(p, elementPath))?.[1]
      nat.forEach((entry, i) => {
        const twin =
          identity === undefined || !isPlainObject(entry)
            ? cs[i]
            : cs.find((e) => isPlainObject(e) && identity.cospec(e) === identity.cospec(entry))
        walk(entry, twin, elementPath)
      })
      return
    }
    failures.push(`${label}: shape changed: ${JSON.stringify(cs)}, natively ${JSON.stringify(nat)}`)
  }

  walk(native, cospec, [])
  return failures
}

/** Identity helpers for the rows. */
export const byKey =
  (key: string): Identity =>
  (entry) => {
    const value = entry[key]
    return typeof value === 'string' ? value : undefined
  }

export const byKindAndId =
  (kindKey: string): Identity =>
  (entry) =>
    typeof entry.id === 'string' ? `${String(entry[kindKey])}:${entry.id}` : undefined

export const byCodeAndName: Identity = (entry) =>
  `${String(entry.code)}:${typeof entry.name === 'string' ? entry.name : String(entry.message)}`
