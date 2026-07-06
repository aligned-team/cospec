// verification.md parser (DESIGN §1.1). Reuses cospec's house checkbox grammar
// (`## N. behavior` groups + `- [state] N.M …` rows) rather than a new YAML
// paradigm. A group is one observable behavior (optional trailing `[critical]`);
// a row is `- [<state>] N.M @<layer> [(<owner>)] <probe> -> <result>`. Grammar is
// fail-closed: a checkbox-like line that does not match the row shape is reported
// as `verification/row-grammar` (the rule layer emits; this module only parses).

import { splitLines } from './lines.ts'

/** The closed core layer vocabulary (DESIGN §1.1). Projects extend via config. */
export const CORE_LAYERS = [
  'unit',
  'integration',
  'e2e',
  'manual',
  'runtime',
  'regression',
  'equivalence',
  'benchmark',
  'eval',
] as const

export type CoreLayer = (typeof CORE_LAYERS)[number]

/** The closed owner vocabulary (DESIGN §1.1). No project extension. */
export const OWNERS = ['agent', 'human'] as const

export type Owner = (typeof OWNERS)[number]

export type RowState = 'planned' | 'verified' | 'deferred'

/** A checkbox-like line — candidate for a grammar violation. */
const CHECKBOX_LIKE = /^\s*[-*]\s*\[[^\]]*\]/
/** `## N. Title` group heading. */
const GROUP_RE = /^##\s+(\d+)\.\s+(.+?)\s*$/
/** Trailing `[critical]` marker on a group heading. */
const CRITICAL_RE = /\s*\[critical\]\s*$/i
/** A conforming row prefix: state box + `N.M` + the remainder. */
const ROW_PREFIX = /^- \[([ xX~])\] (\d+)\.(\d+)\s+(.*)$/
/** `@<layer>` followed by the rest of the row. */
const LAYER_RE = /^@(\S+)\s*(.*)$/
/** A leading `(<owner>)` token. */
const OWNER_RE = /^\(([^)]*)\)\s*(.*)$/
/** The required result separator. */
const ARROW = ' -> '
/** `defer: <reason>` on a deferred row's right-hand side. */
const DEFER_RE = /^defer:\s*(.*)$/

export interface VerificationRow {
  raw: string
  line: number
  /** group number N. */
  group: number
  /** row index M. */
  index: number
  state: RowState
  /** layer token without the leading `@` (validated by the rule layer). */
  layer: string
  /** resolved owner (explicit token if valid, else defaulted by layer). */
  owner: Owner
  /** the explicit owner token exactly as written, when present (for owner-unknown). */
  ownerRaw?: string
  probe: string
  /** text after ` -> `, trimmed (may be empty). */
  result: string
  /** for a deferred row whose result is `defer: <reason>`, the reason trimmed. */
  deferReason?: string
  /** a `(human)` or `@manual` row — cannot be auto-verified in CI. */
  ciUncatchable: boolean
}

export interface MalformedVerificationRow {
  raw: string
  line: number
}

export interface VerificationGroup {
  raw: string
  line: number
  num: number
  title: string
  critical: boolean
  /** grammatical rows that belong to this group. */
  rows: VerificationRow[]
}

export interface ParsedVerification {
  groups: VerificationGroup[]
  /** every grammatical row, in document order. */
  rows: VerificationRow[]
  malformed: MalformedVerificationRow[]
}

/** Default owner by layer (DESIGN §1.1): @manual ⇒ human, everything else ⇒ agent. */
export function defaultOwner(layer: string): Owner {
  return layer === 'manual' ? 'human' : 'agent'
}

function stateFromBox(box: string): RowState {
  if (box === 'x' || box === 'X') return 'verified'
  if (box === '~') return 'deferred'
  return 'planned'
}

/** Parse one row line into a structured row, or undefined when it is malformed. */
function parseRow(raw: string, line: number): VerificationRow | undefined {
  const prefix = raw.match(ROW_PREFIX)
  if (prefix === null) return undefined
  const state = stateFromBox(prefix[1]!)
  const group = Number(prefix[2])
  const index = Number(prefix[3])

  const afterLayer = prefix[4]!.match(LAYER_RE)
  if (afterLayer === null) return undefined
  const layer = afterLayer[1]!
  let rest = afterLayer[2]!

  let ownerRaw: string | undefined
  const ownerMatch = rest.match(OWNER_RE)
  if (ownerMatch !== null) {
    ownerRaw = ownerMatch[1]!.trim()
    rest = ownerMatch[2]!
  }

  const arrowAt = rest.indexOf(ARROW)
  if (arrowAt === -1) return undefined
  const probe = rest.slice(0, arrowAt).trim()
  if (probe.length === 0) return undefined
  const result = rest.slice(arrowAt + ARROW.length).trim()

  const owner: Owner = ownerRaw === 'agent' || ownerRaw === 'human' ? ownerRaw : defaultOwner(layer)

  let deferReason: string | undefined
  if (state === 'deferred') {
    const m = result.match(DEFER_RE)
    if (m !== null) {
      const reason = m[1]!.trim()
      deferReason = reason.length > 0 ? reason : ''
    }
  }

  return {
    raw,
    line,
    group,
    index,
    state,
    layer,
    owner,
    ownerRaw,
    probe,
    result,
    deferReason,
    ciUncatchable: owner === 'human' || layer === 'manual',
  }
}

export function parseVerification(text: string): ParsedVerification {
  const lines = splitLines(text)
  const groups: VerificationGroup[] = []
  const rows: VerificationRow[] = []
  const malformed: MalformedVerificationRow[] = []
  let inFence = false
  let current: VerificationGroup | undefined
  // Marker indent of the row on the immediately-preceding content line (when it
  // was a conforming row or a wrapped continuation of one). A deeper-indented,
  // non-checkbox, non-empty line right after a row is a prose-wrap continuation
  // — oxfmt hard-wraps a row past printWidth onto an indented line — and is
  // reported as a grammar violation so evidence/defer text is never silently
  // dropped. `undefined` means the previous line was not a row.
  let rowIndent: number | undefined

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const lineNo = i + 1

    if (/^\s*```/.test(raw)) {
      inFence = !inFence
      rowIndent = undefined
      continue
    }
    if (inFence) continue

    const group = raw.match(GROUP_RE)
    if (group !== null) {
      const rawTitle = group[2]!
      const critical = CRITICAL_RE.test(rawTitle)
      current = {
        raw,
        line: lineNo,
        num: Number(group[1]),
        title: rawTitle.replace(CRITICAL_RE, '').trim(),
        critical,
        rows: [],
      }
      groups.push(current)
      rowIndent = undefined
      continue
    }

    if (!CHECKBOX_LIKE.test(raw)) {
      if (rowIndent !== undefined && raw.trim().length > 0) {
        const indent = raw.length - raw.trimStart().length
        // Keep rowIndent set so a row wrapped onto multiple lines flags each.
        if (indent > rowIndent) {
          malformed.push({ raw, line: lineNo })
          continue
        }
      }
      rowIndent = undefined
      continue
    }

    const row = parseRow(raw, lineNo)
    if (row === undefined) {
      malformed.push({ raw, line: lineNo })
      rowIndent = undefined
      continue
    }
    rows.push(row)
    if (current !== undefined) current.rows.push(row)
    rowIndent = raw.length - raw.trimStart().length
  }

  return { groups, rows, malformed }
}

/** True when a layer token is in the core set or the project extension. */
export function isKnownLayer(layer: string, extraLayers: readonly string[] = []): boolean {
  return (CORE_LAYERS as readonly string[]).includes(layer) || extraLayers.includes(layer)
}

/**
 * The read-only `status --json` verification verdict (DESIGN §3.6) — shared
 * with the `archive/verification-incomplete` gate so both derive from the same
 * computation. Never a gate itself: `blockedReasons` names what would block
 * `cospec archive`, but this function has no opinion on exit codes.
 */
export interface VerificationVerdict {
  declared: boolean
  total: number
  verified: number
  deferred: number
  unresolved: number
  ciUncatchable: number
  blockedReasons: string[]
}

const EMPTY_VERDICT: VerificationVerdict = {
  declared: false,
  total: 0,
  verified: 0,
  deferred: 0,
  unresolved: 0,
  ciUncatchable: 0,
  blockedReasons: [],
}

/** `text` is `verification.md`'s content, or `undefined` when the file does not exist. */
export function computeVerificationVerdict(
  declared: boolean,
  text: string | undefined,
): VerificationVerdict {
  if (!declared) return EMPTY_VERDICT
  if (text === undefined)
    return {
      ...EMPTY_VERDICT,
      declared: true,
      blockedReasons: ['verification.md is not created yet'],
    }

  const parsed = parseVerification(text)
  const verified = parsed.rows.filter((r) => r.state === 'verified').length
  const deferred = parsed.rows.filter((r) => r.state === 'deferred').length
  const unresolved = parsed.rows.filter((r) => r.state === 'planned').length
  const ciUncatchable = parsed.rows.filter((r) => r.ciUncatchable).length

  const blockedReasons: string[] = []
  if (unresolved > 0) blockedReasons.push(`${unresolved} row(s) still unresolved (bare [ ])`)
  if (parsed.malformed.length > 0)
    blockedReasons.push(`${parsed.malformed.length} row(s) do not parse`)

  return {
    declared: true,
    total: parsed.rows.length,
    verified,
    deferred,
    unresolved,
    ciUncatchable,
    blockedReasons,
  }
}
