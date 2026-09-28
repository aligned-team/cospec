// The main spec openspec's archive writes, rebuilt the way it rebuilds it, and
// the validation it runs on that spec before writing anything (1.13.1:
// `buildUpdatedSpec` in `specs-apply.ts`, then `Validator.validateSpecContent`
// in `archive.ts`). The binary's `validate` dry run stops before that second
// step, so a living spec the delta never touches — a `### Notes` above the
// first requirement, a requirement with no scenario — passes it and aborts the
// archive. Ported here so `archive/rebuilt-spec-invalid` can say so at
// validate time.
//
// Every line of the rebuilt spec carries where it came from, so a finding can
// name the living-spec or delta line an author has to edit.

import {
  buildCodeFenceMask,
  findLivingStructureIssues,
  foldRequirementName,
  normalizeBlockRaw,
  normalizeRequirementName,
  scenarioNameFromHeader,
  type DeltaOp,
  type LivingStructureIssue,
  type ParsedDelta,
} from './deltas.ts'

/** Where a line of the rebuilt spec came from. */
export interface LineOrigin {
  /** `skeleton`: the spec archive writes for a brand-new capability. */
  source: 'living' | 'delta' | 'skeleton'
  /** 1-based line in that source. */
  line: number
}

export interface RebuiltLine {
  text: string
  /** absent for the separators and headers the merge itself writes. */
  origin?: LineOrigin
}

/** openspec's `REQUIREMENT_HEADER_REGEX` (`requirement-blocks.ts`). */
const REQUIREMENT_HEADER_RE = /^###\s*Requirement:\s*(.+)\s*$/i
const REQUIREMENTS_SECTION_RE = /^##\s+Requirements\s*$/i
const TOP_LEVEL_RE = /^##\s+/

type Piece = RebuiltLine[]

function linesOf(text: string, source: LineOrigin['source'], firstLine: number): Piece {
  return text
    .split('\n')
    .map((line, i) => ({ text: line, origin: { source, line: firstLine + i } }))
}

const blankLine = (line: RebuiltLine): boolean => line.text.trim() === ''

/** `String.prototype.trimEnd` on the text the lines spell. */
function trimEnd(piece: Piece): Piece {
  const out = [...piece]
  while (out.length > 0 && blankLine(out.at(-1)!)) out.pop()
  if (out.length > 0) out[out.length - 1] = { ...out.at(-1)!, text: out.at(-1)!.text.trimEnd() }
  return out
}

/** `String.prototype.trim` on the text the lines spell. */
function trim(piece: Piece): Piece {
  const out = trimEnd(piece)
  while (out.length > 0 && blankLine(out[0]!)) out.shift()
  if (out.length > 0) out[0] = { ...out[0]!, text: out[0]!.text.trimStart() }
  return out
}

/** `pieces.join('\n\n')`: one empty line between consecutive pieces. */
function joinBlank(pieces: readonly Piece[]): Piece {
  const out: Piece = []
  pieces.forEach((piece, i) => {
    if (i > 0) out.push({ text: '' })
    out.push(...piece)
  })
  return out
}

const textOf = (piece: Piece): string => piece.map((l) => l.text).join('\n')

/** openspec's `collapseBlankRunsOutsideFences`: at most one empty line in a row, fences untouched. */
function collapseBlankRuns(piece: Piece): Piece {
  const mask = buildCodeFenceMask(piece.map((l) => l.text))
  const kept: Piece = []
  let run = 0
  piece.forEach((line, i) => {
    if (mask[i] === true) {
      run = 0
      kept.push(line)
    } else if (line.text === '') {
      run++
      if (run <= 1) kept.push(line)
    } else {
      run = 0
      kept.push(line)
    }
  })
  return kept
}

interface SectionBlock {
  name: string
  /** indices into `lines`, `[start, end)`, before the block's trimEnd. */
  start: number
  end: number
}

/** openspec's `extractRequirementsSection`, by line index. */
interface RequirementsSection {
  /** BOM-stripped, LF-folded lines. */
  lines: string[]
  /** -1 when the spec has no `## Requirements`. */
  header: number
  /** first line after the section. */
  end: number
  /** first requirement header, or `end`: the preamble is `[header + 1, preambleEnd)`. */
  preambleEnd: number
  blocks: SectionBlock[]
}

function readRequirementsSection(text: string): RequirementsSection {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  const fenced = buildCodeFenceMask(lines)
  const header = lines.findIndex((l, i) => fenced[i] !== true && REQUIREMENTS_SECTION_RE.test(l))
  if (header === -1)
    return { lines, header, end: lines.length, preambleEnd: lines.length, blocks: [] }
  let end = lines.length
  for (let i = header + 1; i < lines.length; i++)
    if (fenced[i] !== true && TOP_LEVEL_RE.test(lines[i]!)) {
      end = i
      break
    }
  const isRequirement = (i: number): boolean =>
    fenced[i] !== true && REQUIREMENT_HEADER_RE.test(lines[i]!)
  let cursor = header + 1
  while (cursor < end && !isRequirement(cursor)) cursor++
  const preambleEnd = cursor
  const blocks: SectionBlock[] = []
  while (cursor < end) {
    const start = cursor
    const name = normalizeRequirementName(lines[cursor]!.match(REQUIREMENT_HEADER_RE)![1]!)
    cursor++
    while (cursor < end && !isRequirement(cursor)) cursor++
    blocks.push({ name, start, end: cursor })
  }
  return { lines, header, end, preambleEnd, blocks }
}

/**
 * openspec's `parseScenarioBlocks` names: every non-fenced `#### ` header of a
 * requirement block, in order.
 */
function scenarioNamesOf(raw: string): string[] {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const fenced = buildCodeFenceMask(lines)
  return lines.flatMap((line, i) =>
    fenced[i] !== true && /^####\s+/.test(line) ? [scenarioNameFromHeader(line)] : [],
  )
}

/** openspec's `findMissingCurrentScenarios`, multiplicity-aware. */
function dropsScenario(current: string, incoming: string): boolean {
  const remaining = new Map<string, number>()
  for (const name of scenarioNamesOf(incoming)) remaining.set(name, (remaining.get(name) ?? 0) + 1)
  for (const name of scenarioNamesOf(current)) {
    const left = remaining.get(name) ?? 0
    if (left === 0) return true
    remaining.set(name, left - 1)
  }
  return false
}

// --- the Purpose a new capability starts with --------------------------------------------

/** openspec's `maskHtmlComments` (`specs-apply.ts`): a whole-text scan, unterminated to EOF. */
function blankComments(content: string): string {
  const blank = (text: string): string => text.replace(/[^\n]/g, ' ')
  let out = ''
  let index = 0
  for (;;) {
    const open = content.indexOf('<!--', index)
    if (open === -1) return out + content.slice(index)
    out += content.slice(index, open)
    let close = -1
    for (let i = open + 4; i < content.length; i++) {
      if (content.startsWith('-->', i)) {
        close = i + 3
        break
      }
      if (content.startsWith('--!>', i)) {
        close = i + 4
        break
      }
    }
    if (close === -1) return out + blank(content.slice(open))
    out += blank(content.slice(open, close))
    index = close
  }
}

/** openspec's `extractPurposeSection`, with the delta line its body starts on. */
function deltaPurpose(content: string): { body: string; line: number } | undefined {
  const normalized = content.replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  const masked = blankComments(normalized).split('\n')
  const fenced = buildCodeFenceMask(masked)
  const start = masked.findIndex((l, i) => fenced[i] !== true && /^##\s+Purpose\s*$/i.test(l))
  if (start === -1) return undefined
  let end = masked.length
  for (let i = start + 1; i < masked.length; i++)
    if (fenced[i] !== true && TOP_LEVEL_RE.test(masked[i]!)) {
      end = i
      break
    }
  const prose = masked
    .slice(start + 1, end)
    .filter((_, offset) => fenced[start + 1 + offset] !== true)
    .join('\n')
    .trim()
  if (prose === '') return undefined
  const body = lines
    .slice(start + 1, end)
    .join('\n')
    .trim()
  if (body === '') return undefined
  let first = start + 1
  while (first < end && lines[first]!.trim() === '') first++
  return { body, line: first + 1 }
}

const PURPOSE_PLACEHOLDER = (changeName: string): string =>
  `TBD - created by archiving change ${changeName}. Update Purpose after archive.`

/** openspec's `buildSpecSkeleton`, a carried delta Purpose tagged with its delta lines. */
function skeleton(
  capability: string,
  changeName: string,
  purpose?: { body: string; line: number },
): Piece {
  const tag = (text: string): RebuiltLine => ({ text, origin: { source: 'skeleton', line: 1 } })
  const body =
    purpose === undefined
      ? [tag(PURPOSE_PLACEHOLDER(changeName))]
      : linesOf(purpose.body, 'delta', purpose.line)
  return [
    tag(`# ${capability} Specification`),
    tag(''),
    tag('## Purpose'),
    ...body,
    tag(''),
    tag('## Requirements'),
    tag(''),
  ]
}

/** openspec's `readableOverview`: whether a carried Purpose leaves a spec its readers can parse. */
function readableOverview(text: string): boolean {
  if (text.includes('<!--')) return false
  if (findLivingStructureIssues(text).length > 0) return false
  const parsed = parseSpec(text.split('\n'))
  return parsed.kind === 'spec' && parsed.overview.trim() !== ''
}

// --- the merge ------------------------------------------------------------------------------

interface Block {
  name: string
  raw: Piece
}

export interface RebuildInput {
  capability: string
  /** the change being archived — only the new-spec placeholder Purpose names it. */
  changeName: string
  /** the living spec's text; undefined for a capability that has none yet. */
  living: string | undefined
  /** the delta file's text and its `verbatim` parse. */
  deltaText: string
  delta: ParsedDelta
}

/**
 * The spec `buildUpdatedSpec` would write, or `undefined` wherever it throws
 * instead — every one of those refusals is a precondition another rule (or the
 * relayed binary validate) reports, and the archive never reaches the rebuilt
 * spec behind it.
 */
export function rebuildSpec(input: RebuildInput): RebuiltLine[] | undefined {
  const { delta } = input
  const byOp = (operation: DeltaOp['operation']): DeltaOp[] =>
    delta.ops.filter((op) => op.operation === operation)
  const added = byOp('ADDED')
  const modified = byOp('MODIFIED')
  const removed = byOp('REMOVED').map((op) => op.name ?? '')
  const renamed = byOp('RENAMED').map((op) => ({ from: op.fromName ?? '', to: op.toName ?? '' }))

  // Pre-validation: unpaired renames, duplicates, cross-section conflicts.
  if (delta.unpairedRenames.length > 0) return undefined
  const unique = (names: readonly string[]): Set<string> | undefined => {
    const seen = new Set<string>()
    for (const name of names) {
      if (seen.has(name)) return undefined
      seen.add(name)
    }
    return seen
  }
  const addedNames = unique(added.map((op) => op.name ?? ''))
  const modifiedNames = unique(modified.map((op) => op.name ?? ''))
  const removedNames = unique(removed)
  const fromNames = unique(renamed.map((r) => r.from))
  const toNames = unique(renamed.map((r) => r.to))
  if (!addedNames || !modifiedNames || !removedNames || !fromNames || !toNames) return undefined
  for (const n of modifiedNames) if (removedNames.has(n) || addedNames.has(n)) return undefined
  for (const n of addedNames) if (removedNames.has(n)) return undefined
  for (const { from, to } of renamed) {
    if ([...removedNames].some((r) => foldRequirementName(r) === foldRequirementName(from)))
      return undefined
    if (modifiedNames.has(from) || addedNames.has(to)) return undefined
  }
  if (added.length + modified.length + removed.length + renamed.length === 0) return undefined

  // The target: the living spec, or the skeleton a new capability starts from.
  let target: Piece
  const isNew = input.living === undefined
  if (input.living === undefined) {
    if (modified.length > 0 || renamed.length > 0) return undefined
    const purpose = deltaPurpose(input.deltaText)
    target = skeleton(input.capability, input.changeName, purpose)
    if (purpose !== undefined && !readableOverview(textOf(target)))
      target = skeleton(input.capability, input.changeName)
  } else {
    target = linesOf(input.living.replace(/\r\n?/g, '\n'), 'living', 1)
  }
  const targetText = textOf(target)
  if (findLivingStructureIssues(targetText).length > 0) return undefined

  const section = readRequirementsSection(targetText)
  // `readRequirementsSection` strips a BOM, which never changes a line index.
  const at = (i: number): RebuiltLine => ({
    text: section.lines[i]!,
    origin: target[i]?.origin,
  })
  const range = (from: number, to: number): Piece =>
    Array.from({ length: Math.max(0, to - from) }, (_, k) => at(from + k))

  const nameToBlock = new Map<string, Block>()
  for (const b of section.blocks)
    nameToBlock.set(b.name, { name: b.name, raw: trimEnd(range(b.start, b.end)) })
  const orderedKeys = section.blocks.map((b) => b.name)
  const keysNear = (name: string, exempt?: string): string | undefined =>
    [...nameToBlock.keys()].find(
      (k) => k !== exempt && foldRequirementName(k) === foldRequirementName(name),
    )

  for (const { from, to } of renamed) {
    if (!nameToBlock.has(from)) {
      if (nameToBlock.has(to) && keysNear(from, to) === undefined) continue
      return undefined
    }
    if (nameToBlock.has(to) || keysNear(to, from) !== undefined) return undefined
    const block = nameToBlock.get(from)!
    const raw = [...block.raw]
    raw[0] = { text: `### Requirement: ${to}`, origin: raw[0]?.origin }
    nameToBlock.delete(from)
    nameToBlock.set(to, { name: to, raw })
    const index = orderedKeys.indexOf(from)
    if (index >= 0) orderedKeys[index] = to
  }

  for (const name of removed) {
    if (!nameToBlock.has(name)) {
      if (!isNew && keysNear(name) !== undefined) return undefined
      continue
    }
    nameToBlock.delete(name)
  }

  for (const op of modified) {
    const key = op.name ?? ''
    const current = nameToBlock.get(key)
    if (current === undefined) return undefined
    const header = op.raw.split('\n')[0]!.match(REQUIREMENT_HEADER_RE)
    if (header === null || normalizeRequirementName(header[1]!) !== key) return undefined
    if (dropsScenario(textOf(current.raw), op.raw)) return undefined
    nameToBlock.set(key, { name: key, raw: linesOf(op.raw, 'delta', op.line) })
  }

  for (const op of added) {
    const key = op.name ?? ''
    const existing = nameToBlock.get(key)
    if (existing !== undefined) {
      if (normalizeBlockRaw(textOf(existing.raw)) === normalizeBlockRaw(op.raw)) continue
      return undefined
    }
    if (keysNear(key) !== undefined) return undefined
    nameToBlock.set(key, { name: key, raw: linesOf(op.raw, 'delta', op.line) })
  }
  // Recompose, keeping the living order and appending what is new.
  const kept: Block[] = []
  const seen = new Set<string>()
  orderedKeys.forEach((key) => {
    const block = nameToBlock.get(key)
    if (block !== undefined) {
      kept.push(block)
      seen.add(key)
    }
  })
  for (const [key, block] of nameToBlock) if (!seen.has(key)) kept.push(block)

  let before: Piece
  let headerLine: Piece
  let preamble: Piece
  let after: Piece
  if (section.header === -1) {
    // No `## Requirements`: the merge appends one, keeping the spec as it was
    // read — BOM and all — above it.
    before = trimEnd(target)
    headerLine = [{ text: '## Requirements' }]
    preamble = []
    after = []
  } else {
    before = trimEnd(range(0, section.header))
    headerLine = [at(section.header)]
    preamble = trimEnd(range(section.header + 1, section.preambleEnd))
    after = trim(range(section.end, section.lines.length))
  }
  const hasPreamble = preamble.some((l) => !blankLine(l))
  const body = trimEnd(joinBlank([...(hasPreamble ? [preamble] : []), ...kept.map((b) => b.raw)]))
  const nonEmpty = [before, headerLine, body, after].filter((p) => textOf(p) !== '')
  return trimEnd(collapseBlankRuns(joinBlank(nonEmpty)))
}

// --- the validation archive runs on it --------------------------------------------------------

interface Section {
  level: number
  title: string
  /** line index of the header. */
  line: number
  content: string
  children: Section[]
}

const HEADER_RE = /^(#{1,6})\s+(.+)$/
const HEADER_START_RE = /^(#{1,6})\s+/
const BODY_END_RE = /^#{1,6}\s/
const METADATA_RE = /^\*\*[^*]+\*\*:/

/** openspec's `MarkdownParser.parseSections`, keeping each header's line. */
function parseSections(lines: readonly string[]): Section[] {
  const fenced = buildCodeFenceMask(lines)
  const contentUntilNextHeader = (start: number, level: number): string => {
    const out: string[] = []
    for (let i = start; i < lines.length; i++) {
      const header = fenced[i] === true ? null : lines[i]!.match(HEADER_START_RE)
      if (header !== null && header[1]!.length <= level) break
      out.push(lines[i]!)
    }
    return out.join('\n').trim()
  }
  const sections: Section[] = []
  const stack: Section[] = []
  lines.forEach((line, i) => {
    if (fenced[i] === true) return
    const header = line.match(HEADER_RE)
    if (header === null) return
    const level = header[1]!.length
    const section: Section = {
      level,
      title: header[2]!.trim(),
      line: i,
      content: contentUntilNextHeader(i + 1, level),
      children: [],
    }
    while (stack.length > 0 && stack.at(-1)!.level >= level) stack.pop()
    if (stack.length === 0) sections.push(section)
    else stack.at(-1)!.children.push(section)
    stack.push(section)
  })
  return sections
}

function findSection(sections: readonly Section[], title: string): Section | undefined {
  for (const section of sections) {
    if (section.title.toLowerCase() === title.toLowerCase()) return section
    const child = findSection(section.children, title)
    if (child !== undefined) return child
  }
  return undefined
}

/** openspec's `extractRequirementBody` (`requirement-text.ts`). */
function requirementBody(bodyLines: readonly string[]): string {
  const fenced = buildCodeFenceMask(bodyLines)
  const captured: string[] = []
  const metadata: string[] = []
  for (let i = 0; i < bodyLines.length; i++) {
    if (fenced[i] === true) continue
    const line = bodyLines[i]!
    if (BODY_END_RE.test(line)) break
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    if (METADATA_RE.test(trimmed)) metadata.push(trimmed)
    else captured.push(trimmed)
  }
  return captured.length > 0 ? captured.join('\n') : metadata.join('\n')
}

type ParsedSpec =
  | { kind: 'spec'; overview: string; requirements: Section; sections: Section[] }
  | { kind: 'no-purpose' }
  | { kind: 'no-requirements-section' }

/** openspec's `MarkdownParser.parseSpec`: throws become the first two kinds. */
function parseSpec(rawLines: readonly string[]): ParsedSpec {
  const lines = rawLines.map((l, i) => (i === 0 ? l.replace(/^﻿/, '') : l))
  const sections = parseSections(lines)
  const purpose = findSection(sections, 'Purpose')?.content ?? ''
  if (purpose === '') return { kind: 'no-purpose' }
  const requirements = findSection(sections, 'Requirements')
  if (requirements === undefined) return { kind: 'no-requirements-section' }
  return { kind: 'spec', overview: purpose.trim(), requirements, sections }
}

/** One ERROR the archive's validation of the rebuilt spec reports. */
export type RebuiltSpecIssue =
  | { kind: 'no-purpose' }
  | { kind: 'no-requirements-section' }
  /** `line`: the header read as the Requirements section. */
  | { kind: 'no-requirements'; line: number; title: string; level: number }
  /**
   * A header under the Requirements section, which the archive reads as a
   * requirement. `cutBy`: the next sibling header, when it took scenarios.
   */
  | {
      kind: 'requirement'
      line: number
      header: string
      noText: boolean
      noScenario: boolean
      cutBy?: { line: number; header: string }
    }
  /** A canonical requirement block with no statement under its header. */
  | { kind: 'no-body'; line: number; name: string }
  | { kind: 'structure'; issue: LivingStructureIssue }

const hasBody = (content: string): boolean => content.trim().length > 0

/**
 * `Validator.validateSpecContent` on the rebuilt spec, ERRORs only — the
 * archive calls a non-strict validator, so a WARNING never stops it.
 */
export function validateRebuiltSpec(lines: readonly string[]): RebuiltSpecIssue[] {
  const parsed = parseSpec(lines)
  if (parsed.kind !== 'spec') return [{ kind: parsed.kind }]
  const text = lines.join('\n')
  const issues: RebuiltSpecIssue[] = []
  const children = parsed.requirements.children
  if (children.length === 0)
    issues.push({
      kind: 'no-requirements',
      line: parsed.requirements.line,
      title: parsed.requirements.title,
      level: parsed.requirements.level,
    })
  children.forEach((child, i) => {
    const statement = requirementBody(child.content.split('\n')) || child.title.trim()
    const scenarios = child.children.filter((s) => hasBody(s.content)).length
    if (statement !== '' && scenarios > 0) return
    const next = children[i + 1]
    const cutBy =
      scenarios === 0 &&
      next !== undefined &&
      !REQUIREMENT_HEADER_RE.test(lines[next.line]!) &&
      next.children.some((s) => hasBody(s.content))
        ? { line: next.line, header: lines[next.line]!.trim() }
        : undefined
    issues.push({
      kind: 'requirement',
      line: child.line,
      header: lines[child.line]!.trim(),
      noText: statement === '',
      noScenario: scenarios === 0,
      ...(cutBy === undefined ? {} : { cutBy }),
    })
  })
  for (const issue of findLivingStructureIssues(text)) issues.push({ kind: 'structure', issue })
  const section = readRequirementsSection(text)
  for (const block of section.blocks) {
    const raw = section.lines.slice(block.start, block.end).join('\n').trimEnd()
    if (requirementBody(raw.split('\n').slice(1)) === '')
      issues.push({ kind: 'no-body', line: block.start, name: block.name })
  }
  return issues
}
