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
/**
 * A bullet inside a MODIFIED requirement's body noting why its scenario count
 * intentionally shrank. This was `archive/scenario-preservation`'s escape hatch
 * (DESIGN §3.5) until openspec 1.8.0 started refusing every scenario-dropping
 * MODIFIED block outright — see `findScenarioDrops`. It is still parsed so the
 * gate can tell an author who wrote the note that it no longer excuses the drop.
 */
const SCENARIO_REMOVED_RE = /^\s*-?\s*Scenario removed:\s*(\S.*)$/i

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
  /**
   * Ordered scenario names in this requirement's block (ADDED/MODIFIED), one
   * per non-fenced `#### ` header, extracted with `scenarioNameFromHeader`.
   */
  scenarioNames: string[]
  /**
   * Verbatim source text of the requirement block — header line through the
   * last line before the next `### Requirement:` header, the next `## `
   * section header, or end of input, `trimEnd`ed. Empty for REMOVED/RENAMED
   * ops, which name a requirement rather than carrying a block. Compare two
   * blocks with `normalizeBlockRaw`, never with `===`.
   */
  raw: string
  /** `Scenario removed: <reason>` notes found in this requirement's body
   * (MODIFIED only). Retired as an escape hatch — see `findScenarioDrops`;
   * kept so the gate can address an author who wrote one. */
  scenarioRemovalReasons: string[]
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

/**
 * openspec's own requirement-block comparison (`normalizeBlockRaw`,
 * `src/core/specs-apply.ts`): fold CR/CRLF to LF, then one outer trim.
 * Nothing else. Folding interior whitespace, scenario order or heading case
 * here would make cospec *looser* than the binary — it would call a real
 * collision "identical" and manufacture a false archive PASS.
 */
export function normalizeBlockRaw(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').trim()
}

/**
 * The scenario name a `#### ` header renders to, ported from openspec's
 * `scenarioNameAt` (`src/core/parsers/requirement-blocks.ts`): strip the
 * leading `####`, an optional CommonMark closing `#` run, and an optional
 * `Scenario:` prefix, then trim. Case is preserved — upstream compares
 * scenario names case-sensitively, so `Foo` and `foo` are two names.
 *
 * The ATX close uses `[ \t]`, not `\s`: CommonMark only closes on a `#` run
 * preceded by a space or tab, so a looser class could fold two distinct names
 * into one after an exotic space and mask a real loss.
 */
export function scenarioNameFromHeader(line: string): string {
  return line
    .replace(SCENARIO_RE, '')
    .replace(/[ \t]+#+[ \t]*$/, '')
    .replace(/^Scenario:\s*/i, '')
    .trim()
}

interface ActiveFence {
  marker: '`' | '~'
  length: number
}

const FENCE_OPEN_RE = /^\s*(`{3,}|~{3,})/
const FENCE_CLOSE_RE = /^\s*(`{3,}|~{3,})\s*$/

function fenceMarker(line: string): ActiveFence | undefined {
  const m = line.match(FENCE_OPEN_RE)
  if (m === null) return undefined
  return { marker: m[1]![0] as '`' | '~', length: m[1]!.length }
}

/**
 * Per-line mask marking every line inside a fenced code block, delimiters
 * included. Ported from openspec's `buildCodeFenceMask` (`src/core/parsers/
 * code-fence.ts`): a fence closes only on a line whose marker *matches* the
 * opener's and is at least as long. cospec's previous naive ``` toggle inverted
 * its in-fence state for the rest of the file the moment a spec documented
 * markdown inside a longer (````) fence or used a ~~~ fence at all — and both
 * hard archive gates read that state.
 */
export function buildCodeFenceMask(lines: readonly string[]): boolean[] {
  const mask: boolean[] = Array.from({ length: lines.length }, () => false)
  let active: ActiveFence | undefined
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (active === undefined) {
      const fence = fenceMarker(line)
      if (fence !== undefined) {
        active = fence
        mask[i] = true
      }
      continue
    }
    mask[i] = true
    const close = line.match(FENCE_CLOSE_RE)
    if (close !== null && close[1]![0] === active.marker && close[1]!.length >= active.length)
      active = undefined
  }
  return mask
}

/** Replace every non-newline character with a space, keeping the line count. */
function blank(s: string): string {
  return s.replace(/[^\n]/g, ' ')
}

/**
 * Blank out `<!-- … -->` spans in place, preserving every newline so line
 * numbers never shift. `--!>` terminates a comment too, and an unterminated
 * `<!--` comments out the rest of the file (openspec #1413).
 */
export function maskHtmlComments(text: string): string {
  const masked = text.replace(/<!--[\s\S]*?--!?>/g, blank)
  const unterminated = masked.indexOf('<!--')
  if (unterminated === -1) return masked
  return masked.slice(0, unterminated) + blank(masked.slice(unterminated))
}

export interface ScannedMarkdown {
  /** Structural view: BOM-stripped, LF-normalized, HTML comments blanked. */
  lines: string[]
  /** Verbatim view (same length/indices): BOM-stripped and LF-normalized only. */
  source: string[]
  /** `true` where `lines[i]` sits inside a fenced code block. */
  fenced: boolean[]
}

/**
 * Prepare a markdown document for structural scanning.
 *
 * A UTF-8 BOM is stripped (otherwise a BOM-prefixed `# Spec` never matches an
 * anchored header regex) and CR/CRLF are folded to LF (a trailing `\r` leaks
 * into every `(.+)$` capture). Both keep the line count intact, as does the
 * comment mask, so a reported line number always addresses the author's file.
 */
export function scanMarkdown(text: string): ScannedMarkdown {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const source = normalized.split('\n')
  const lines = maskHtmlComments(normalized).split('\n')
  return { lines, source, fenced: buildCodeFenceMask(lines) }
}

/** Parse a change-side delta spec. `capability` is the dir name (e.g. `widgets`). */
export function parseDeltaSpec(text: string, path: string, capability: string): ParsedDelta {
  const { lines, source, fenced } = scanMarkdown(text)
  const ops: DeltaOp[] = []
  const scenarioDepthIssues: { line: number }[] = []
  const sectionCounts = new Map<DeltaOperation, number>()
  const sectionsSeen = new Set<DeltaOperation>()
  let headerPresent = false

  let currentOp: DeltaOperation | undefined
  // Track the requirement currently being accumulated (ADDED/MODIFIED).
  let openReq: DeltaOp | undefined
  /** Verbatim (unmasked) block lines for `openReq`; undefined for RENAMED. */
  let openRaw: string[] | undefined

  const closeReq = () => {
    if (openReq !== undefined) {
      if (openRaw !== undefined) openReq.raw = openRaw.join('\n').trimEnd()
      ops.push(openReq)
      sectionCounts.set(openReq.operation, (sectionCounts.get(openReq.operation) ?? 0) + 1)
      openReq = undefined
    }
    openRaw = undefined
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const lineNo = i + 1

    // Fenced lines carry no structure, but a SHALL/MUST inside a requirement's
    // example block has always counted towards `hasShallMust` — keep that.
    if (fenced[i] === true) {
      // Fenced content is part of the block verbatim, but never structure: a
      // `#### ` line inside a fence is retained in `raw` and is not a scenario.
      openRaw?.push(source[i] ?? '')
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
          scenarioNames: [],
          raw: '',
          scenarioRemovalReasons: [],
        }
        openRaw = [source[i] ?? '']
        continue
      }
      if (openReq !== undefined) {
        openRaw?.push(source[i] ?? '')
        if (SCENARIO_RE.test(raw)) {
          openReq.scenarioCount++
          openReq.scenarioNames.push(scenarioNameFromHeader(source[i] ?? ''))
        } else if (SHALL_MUST_RE.test(raw)) openReq.hasShallMust = true
        const removedNote = raw.match(SCENARIO_REMOVED_RE)
        if (removedNote !== null) openReq.scenarioRemovalReasons.push(removedNote[1]!.trim())
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
          scenarioNames: [],
          raw: '',
          scenarioRemovalReasons: [],
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
          scenarioNames: [],
          raw: '',
          scenarioRemovalReasons: [],
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
  /** requirement name → its current `#### Scenario:` count (archive/scenario-preservation). */
  requirementScenarioCounts: Map<string, number>
  /** requirement name → its ordered scenario names (`scenarioNameFromHeader`). */
  requirementScenarioNames: Map<string, string[]>
  /** requirement name → the verbatim source of its block, `trimEnd`ed. */
  requirementBlocks: Map<string, string>
  hasPurpose: boolean
  hasRequirements: boolean
  /** a delta header (## ADDED/… Requirements) appearing in a living spec — invalid. */
  hasDeltaHeaders: boolean
  purposeText: string
}

/** Parse a living spec (openspec/specs/<cap>/spec.md) for archive precondition checks. */
export function parseLivingSpec(text: string): LivingSpec {
  const { lines, source, fenced } = scanMarkdown(text)
  const requirementNames = new Set<string>()
  const requirementScenarioCounts = new Map<string, number>()
  const requirementScenarioNames = new Map<string, string[]>()
  const requirementBlocks = new Map<string, string>()
  let hasPurpose = false
  let hasRequirements = false
  let hasDeltaHeaders = false
  let inPurpose = false
  let currentReqName: string | undefined
  let currentBlock: string[] | undefined
  const purposeLines: string[] = []

  const closeReq = () => {
    if (currentReqName !== undefined && currentBlock !== undefined)
      requirementBlocks.set(currentReqName, currentBlock.join('\n').trimEnd())
    currentReqName = undefined
    currentBlock = undefined
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    if (fenced[i] === true) {
      currentBlock?.push(source[i] ?? '')
      continue
    }

    const section = raw.match(SECTION_RE)
    if (section !== null) {
      // A requirement's scope ends at the next level-2 section, matching
      // openspec's requirement-block window. Without this, a `#### Scenario:`
      // under a trailing `## Notes` was credited to the last requirement and
      // inflated its living count into a phantom scenario drop.
      closeReq()
      const title = section[1]!.toLowerCase()
      if (SECTION_TITLES[title] !== undefined) hasDeltaHeaders = true
      inPurpose = title === 'purpose'
      if (title === 'purpose') hasPurpose = true
      if (title === 'requirements') hasRequirements = true
      continue
    }

    // Verbatim, not masked: an author's own HTML comment inside `## Purpose` is
    // prose they wrote, and blanking it would silently shorten the Purpose the
    // `specs/*` rules measure.
    if (inPurpose) purposeLines.push(source[i] ?? '')

    const req = raw.match(REQUIREMENT_RE)
    if (req !== null) {
      closeReq()
      currentReqName = normalize(req[1]!)
      currentBlock = [source[i] ?? '']
      requirementNames.add(currentReqName)
      requirementScenarioCounts.set(currentReqName, 0)
      requirementScenarioNames.set(currentReqName, [])
    } else if (currentReqName !== undefined) {
      currentBlock?.push(source[i] ?? '')
      if (SCENARIO_RE.test(raw)) {
        requirementScenarioCounts.set(
          currentReqName,
          (requirementScenarioCounts.get(currentReqName) ?? 0) + 1,
        )
        requirementScenarioNames.get(currentReqName)?.push(scenarioNameFromHeader(source[i] ?? ''))
      }
    }
  }
  closeReq()

  return {
    requirementNames,
    requirementScenarioCounts,
    requirementScenarioNames,
    requirementBlocks,
    hasPurpose,
    hasRequirements,
    hasDeltaHeaders,
    purposeText: purposeLines.join('\n').trim(),
  }
}

export interface ScenarioDrop {
  capability: string
  name: string
  deltaCount: number
  livingCount: number
  /**
   * The living scenario names the MODIFIED block no longer covers, in living
   * order, counted with multiplicity — the same list openspec names in its own
   * refusal. Empty only when the count arm fired alone (see
   * `findScenarioDrops`).
   */
  missingNames: string[]
  /**
   * The author wrote a `Scenario removed: <reason>` note. It no longer excuses
   * the drop — it only changes the advice the gate gives, because an author who
   * wrote the note followed documentation that is now wrong.
   */
  noted: boolean
}

/**
 * The current scenario names an incoming block fails to cover, ported from
 * openspec's `findMissingCurrentScenarios`
 * (`src/core/parsers/requirement-blocks.ts`): count the incoming names, then
 * walk the current names in order and spend one unit of the matching name per
 * hit. Multiplicity matters — a requirement carrying the same scenario name
 * twice that keeps it once has lost one scenario, not zero. Names compare
 * case-sensitively, matching `scenarioNameFromHeader`, so a case-only rename
 * reads as a drop plus an add.
 */
function missingCurrentScenarios(
  current: readonly string[],
  incoming: readonly string[],
): string[] {
  const remaining = new Map<string, number>()
  for (const name of incoming) remaining.set(name, (remaining.get(name) ?? 0) + 1)
  const missing: string[] = []
  for (const name of current) {
    const left = remaining.get(name) ?? 0
    if (left > 0) remaining.set(name, left - 1)
    else missing.push(name)
  }
  return missing
}

/**
 * MODIFIED requirements that drop a living scenario
 * (`archive/scenario-preservation`, DESIGN §3.5). ADDED/REMOVED/RENAMED ops and
 * capabilities with no living spec (new capability — nothing to shrink against)
 * are out of scope by construction: a requirement retired through
 * `## REMOVED Requirements` carries no MODIFIED op, so this gate never sees it.
 *
 * A drop is either living scenario NAMES the MODIFIED block no longer covers
 * (openspec's own identity check, ported in `missingCurrentScenarios`) or a
 * plain count shrink. The two arms agree whenever both parsers see the same
 * headers, so the count arm is belt and braces: it is the frozen contract this
 * gate shipped with, it still fires if name extraction ever diverges between
 * the two parsers, and keeping it can only ever make cospec stricter.
 * A same-count name swap — the shape the count arm alone waved through, and
 * which openspec 1.0.0–1.7.x merges at exit 0 — is now refused with the dropped
 * name.
 *
 * A `Scenario removed: <reason>` note used to excuse the drop. It no longer
 * can: openspec 1.8.0's `validate-scenario-loss-check` reports any MODIFIED
 * block that omits a living scenario as an ERROR, and 1.8.0's archive refuses
 * the merge outright ("current spec contains scenario(s) not present in the
 * modified block … Aborted. No files were changed.", exit 1) — neither has any
 * notion of cospec's note. Excusing the drop here would only move the refusal
 * later and hand the author openspec's message instead of cospec's; below the
 * 1.8.0 line, where the note did work, honouring it silently drops scenarios,
 * which is the regression this gate exists to stop. So the gate now refuses in
 * both directions and names the two remedies that actually work.
 */
export function findScenarioDrops(
  caps: readonly { capability: string; ops: readonly DeltaOp[] }[],
  livingSpecs: ReadonlyMap<string, LivingSpec>,
): ScenarioDrop[] {
  const drops: ScenarioDrop[] = []
  for (const { capability, ops } of caps) {
    const living = livingSpecs.get(capability)
    if (living === undefined) continue
    for (const op of ops) {
      if (op.operation !== 'MODIFIED' || op.name === undefined) continue
      const livingCount = living.requirementScenarioCounts.get(op.name) ?? 0
      const missingNames = missingCurrentScenarios(
        living.requirementScenarioNames.get(op.name) ?? [],
        op.scenarioNames,
      )
      if (missingNames.length > 0 || op.scenarioCount < livingCount)
        drops.push({
          capability,
          name: op.name,
          deltaCount: op.scenarioCount,
          livingCount,
          missingNames,
          noted: op.scenarioRemovalReasons.length > 0,
        })
    }
  }
  return drops
}

/** Shared remedy text for a refused scenario drop (gate + validate rule). */
export const SCENARIO_DROP_HINT =
  'copy the missing scenario back into the MODIFIED block, or REMOVE the requirement and ADD it back in the same delta — openspec 1.8.0+ refuses any MODIFIED block that omits a living scenario'

/** Extra line for an author who followed the retired `Scenario removed:` note. */
export const SCENARIO_DROP_NOTE_RETIRED =
  'a `Scenario removed: <reason>` note no longer excuses the drop'

/** `"a", "b"` — the dropped scenario names as the gate and the rule print them. */
export function quoteScenarioNames(names: readonly string[]): string {
  return names.map((n) => `"${n}"`).join(', ')
}

/**
 * The `archive/scenario-preservation` rule message. Names the dropped scenarios
 * when the identity arm found them; falls back to the original count-only
 * wording for a count-arm-only drop, which is the one shape with no names to
 * print. Both shapes start `MODIFIED "<name>" drops scenario`, which is the
 * prefix `validate.ts` keys the delegated-duplicate suppressor on.
 */
export function scenarioDropMessage(drop: ScenarioDrop): string {
  return drop.missingNames.length > 0
    ? `MODIFIED "${drop.name}" drops scenario(s) ${quoteScenarioNames(drop.missingNames)} (living ${drop.livingCount} -> delta ${drop.deltaCount})`
    : `MODIFIED "${drop.name}" drops scenario count from ${drop.livingCount} to ${drop.deltaCount}`
}
