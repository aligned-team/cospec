// Delta-spec parser (change-side specs/<cap>/spec.md) and living-spec requirement
// extractor. Regexes mirror openspec-core §5.5 so cospec's diagnostics agree with
// the binary; the archive-precondition inputs (living requirement names, structural
// validity) feed DESIGN §4.3's archive/* family.

export type DeltaOperation = 'ADDED' | 'MODIFIED' | 'REMOVED' | 'RENAMED'

const REQUIREMENT_RE = /^###\s*Requirement:\s*(.+?)\s*$/
const SECTION_RE = /^##\s+(.+?)\s*$/
const SCENARIO_RE = /^####\s+/
/** 3-hashtag scenario heading — the probe §5.4 mis-parse (DESIGN deltas/scenario-depth). */
const SCENARIO_DEPTH_RE = /^###\s+Scenario:/
const SHALL_MUST_RE = /\b(SHALL|MUST)\b/
/** REMOVED bullet form: `- \`### Requirement: X\``. */
const REMOVED_BULLET_RE = /^-\s*`?###\s*Requirement:\s*(.+?)`?\s*$/
const RENAMED_FROM_RE = /^-?\s*FROM:\s*`?###\s*Requirement:\s*(.+?)`?\s*$/
const RENAMED_TO_RE = /^-?\s*TO:\s*`?###\s*Requirement:\s*(.+?)`?\s*$/

const SECTION_TITLES: Record<string, DeltaOperation> = {
  'added requirements': 'ADDED',
  'modified requirements': 'MODIFIED',
  'removed requirements': 'REMOVED',
  'renamed requirements': 'RENAMED',
}

export interface DeltaOp {
  operation: DeltaOperation
  /** ADDED/MODIFIED/REMOVED requirement name (trimmed). */
  name?: string
  fromName?: string
  toName?: string
  line: number
  hasShallMust: boolean
  scenarioCount: number
}

export interface ParsedDelta {
  path: string
  capability: string
  headerPresent: boolean
  ops: DeltaOp[]
  /** section headers present but yielding zero entries. */
  emptySections: DeltaOperation[]
  scenarioDepthIssues: { line: number }[]
}

function normalize(name: string): string {
  return name.trim()
}

/** Parse a change-side delta spec. `capability` is the dir name (e.g. `widgets`). */
export function parseDeltaSpec(text: string, path: string, capability: string): ParsedDelta {
  const lines = text.split('\n')
  const ops: DeltaOp[] = []
  const scenarioDepthIssues: { line: number }[] = []
  const sectionCounts = new Map<DeltaOperation, number>()
  const sectionsSeen = new Set<DeltaOperation>()
  let headerPresent = false

  let currentOp: DeltaOperation | undefined
  let inFence = false
  // Track the requirement currently being accumulated (ADDED/MODIFIED).
  let openReq: DeltaOp | undefined

  const closeReq = () => {
    if (openReq !== undefined) {
      ops.push(openReq)
      sectionCounts.set(openReq.operation, (sectionCounts.get(openReq.operation) ?? 0) + 1)
      openReq = undefined
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const lineNo = i + 1

    if (/^\s*```/.test(raw)) {
      inFence = !inFence
      continue
    }
    if (inFence) {
      if (openReq !== undefined && SHALL_MUST_RE.test(raw)) openReq.hasShallMust = true
      continue
    }

    if (SCENARIO_DEPTH_RE.test(raw)) scenarioDepthIssues.push({ line: lineNo })

    const section = raw.match(SECTION_RE)
    if (section !== null) {
      const title = section[1]!.toLowerCase()
      const op = SECTION_TITLES[title]
      closeReq()
      if (op !== undefined) {
        headerPresent = true
        currentOp = op
        sectionsSeen.add(op)
        if (!sectionCounts.has(op)) sectionCounts.set(op, 0)
      } else {
        currentOp = undefined
      }
      continue
    }

    if (currentOp === undefined) continue

    if (currentOp === 'ADDED' || currentOp === 'MODIFIED') {
      const req = raw.match(REQUIREMENT_RE)
      if (req !== null) {
        closeReq()
        openReq = {
          operation: currentOp,
          name: normalize(req[1]!),
          line: lineNo,
          hasShallMust: false,
          scenarioCount: 0,
        }
        continue
      }
      if (openReq !== undefined) {
        if (SCENARIO_RE.test(raw)) openReq.scenarioCount++
        else if (SHALL_MUST_RE.test(raw)) openReq.hasShallMust = true
      }
      continue
    }

    if (currentOp === 'REMOVED') {
      const bullet = raw.match(REMOVED_BULLET_RE)
      const req = raw.match(REQUIREMENT_RE)
      const name = bullet?.[1] ?? req?.[1]
      if (name !== undefined) {
        ops.push({
          operation: 'REMOVED',
          name: normalize(name),
          line: lineNo,
          hasShallMust: false,
          scenarioCount: 0,
        })
        sectionCounts.set('REMOVED', (sectionCounts.get('REMOVED') ?? 0) + 1)
      }
      continue
    }

    if (currentOp === 'RENAMED') {
      const from = raw.match(RENAMED_FROM_RE)
      if (from !== null) {
        openReq = {
          operation: 'RENAMED',
          fromName: normalize(from[1]!),
          line: lineNo,
          hasShallMust: false,
          scenarioCount: 0,
        }
        continue
      }
      const to = raw.match(RENAMED_TO_RE)
      if (to !== null && openReq !== undefined && openReq.operation === 'RENAMED') {
        openReq.toName = normalize(to[1]!)
        ops.push(openReq)
        sectionCounts.set('RENAMED', (sectionCounts.get('RENAMED') ?? 0) + 1)
        openReq = undefined
      }
      continue
    }
  }
  closeReq()

  const emptySections: DeltaOperation[] = []
  for (const op of sectionsSeen) if ((sectionCounts.get(op) ?? 0) === 0) emptySections.push(op)

  return { path, capability, headerPresent, ops, emptySections, scenarioDepthIssues }
}

export interface LivingSpec {
  requirementNames: Set<string>
  hasPurpose: boolean
  hasRequirements: boolean
  /** a delta header (## ADDED/… Requirements) appearing in a living spec — invalid. */
  hasDeltaHeaders: boolean
  purposeText: string
}

/** Parse a living spec (openspec/specs/<cap>/spec.md) for archive precondition checks. */
export function parseLivingSpec(text: string): LivingSpec {
  const lines = text.split('\n')
  const requirementNames = new Set<string>()
  let hasPurpose = false
  let hasRequirements = false
  let hasDeltaHeaders = false
  let inFence = false
  let inPurpose = false
  const purposeLines: string[] = []

  for (const raw of lines) {
    if (/^\s*```/.test(raw)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const section = raw.match(SECTION_RE)
    if (section !== null) {
      const title = section[1]!.toLowerCase()
      if (SECTION_TITLES[title] !== undefined) hasDeltaHeaders = true
      inPurpose = title === 'purpose'
      if (title === 'purpose') hasPurpose = true
      if (title === 'requirements') hasRequirements = true
      continue
    }

    if (inPurpose) purposeLines.push(raw)

    const req = raw.match(REQUIREMENT_RE)
    if (req !== null) requirementNames.add(normalize(req[1]!))
  }

  return {
    requirementNames,
    hasPurpose,
    hasRequirements,
    hasDeltaHeaders,
    purposeText: purposeLines.join('\n').trim(),
  }
}
