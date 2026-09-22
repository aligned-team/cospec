// Delta-spec parser (change-side specs/<cap>/spec.md) and living-spec requirement
// extractor. Regexes mirror openspec-core §5.5 so cospec's diagnostics agree with
// the binary; the archive-precondition inputs (living requirement names, structural
// validity) feed DESIGN §4.3's archive/* family.

export type DeltaOperation = 'ADDED' | 'MODIFIED' | 'REMOVED' | 'RENAMED'

const REQUIREMENT_RE = /^###\s*Requirement:\s*(.+?)\s*$/
const SECTION_RE = /^##\s+(.+?)\s*$/
const SCENARIO_RE = /^####\s+/
/**
 * A header at scenario level or above (`#` through `####`) — where a scenario's
 * body ends. Ported from openspec's `SCENARIO_BODY_END`
 * (`src/core/parsers/requirement-text.ts`, 1.13.1): a `#####` header is *inside*
 * the body, not a boundary, so a scenario documenting sub-cases still has one.
 */
const SCENARIO_BODY_END_RE = /^#{1,4}\s/
/** 3-hashtag scenario heading — the probe §5.4 mis-parse (DESIGN deltas/scenario-depth). */
const SCENARIO_DEPTH_RE = /^###\s+Scenario:/
const SHALL_MUST_RE = /\b(SHALL|MUST)\b/
/**
 * REMOVED bullet form: `- \`### Requirement: X\``.
 *
 * The marker class is CommonMark's full bullet set (`-`, `*`, `+`) and leading
 * whitespace is allowed, matching openspec's own delta reader
 * (`src/core/parsers/requirement-blocks.ts`, 1.13.1). Anchoring on `-` at
 * column 0 — as cospec did through 0.7.1 — dropped every `*`/`+`/indented
 * REMOVED entry before it reached `ops`, so `archive/target-missing` and
 * `archive/scenario-preservation` never saw it: a false archive PASS.
 * Fenced lines are still excluded upstream of these regexes by the fence mask.
 *
 * Against the 1.11.0 pin the two halves differ, and the difference is load-
 * bearing for anyone reasoning across the accepted `>=1.0.0 <2.0.0` range:
 * leading whitespace was already accepted there, but `*` and `+` were not —
 * 1.11.0 reads REMOVED as ``/^\s*-\s*`?###\s*Requirement:…/`` and FROM/TO with
 * an optional single hyphen. So these regexes deliberately LEAD the pin, and a
 * `*`/`+` delta stays non-portable below 1.13.1: the binary refuses it with
 * `… but no requirement entries parsed`, which reaches the user through the
 * delegated `openspec validate` relay. `test/contract/delta-bullet-markers.test.ts`
 * pins both binaries' real behaviour and flips at the 1.13.1 bump.
 */
const REMOVED_BULLET_RE = /^\s*[-*+]\s*`?###\s*Requirement:\s*(.+?)`?\s*$/
/**
 * RENAMED pair lines; the bullet marker is optional, as 1.13.1's is. 1.11.0
 * allows only `-` there — see `REMOVED_BULLET_RE` above.
 */
const RENAMED_FROM_RE = /^\s*[-*+]?\s*FROM:\s*`?###\s*Requirement:\s*(.+?)`?\s*$/
const RENAMED_TO_RE = /^\s*[-*+]?\s*TO:\s*`?###\s*Requirement:\s*(.+?)`?\s*$/
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
   * Every header, bodyless ones included — see `scenarioReader` for why the
   * name arm and the count arm deliberately disagree there.
   */
  scenarioNames: string[]
  /**
   * `#### ` headers in this block that carry no body, and so counted as no
   * scenario. Mirrors openspec's `countEmptyScenarios` and exists for the same
   * reason: it is the only way `deltas/requirement-shape` can tell an author
   * staring at a visible scenario header *why* the requirement has none.
   */
  emptyScenarioCount: number
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

/**
 * A `FROM:` or `TO:` line that never formed a rename pair — the shapes
 * openspec's `parseRenamedPairs` (`src/core/parsers/requirement-blocks.ts`,
 * 1.13.1) refuses to guess at: a `FROM:` displaced by a second `FROM:`, a
 * `TO:` with no pending `FROM:`, and a `FROM:` still pending when the section
 * ends.
 */
export interface UnpairedRename {
  side: 'FROM' | 'TO'
  /** requirement name as written (normalized). */
  name: string
  /** 1-based line of the offending FROM:/TO: line. */
  line: number
}

/**
 * A canonical `### Requirement:` block written outside all four delta sections
 * — the shape openspec's `findOrphanedRequirements`
 * (`src/core/parsers/requirement-blocks.ts`, 1.13.1) reports. cospec's reader
 * only acts inside a delta section, so such a block is silently discarded at
 * the `currentOp === undefined` branch: it never reaches `ops`, never merges,
 * and the change still archives clean.
 */
export interface OrphanedRequirement {
  /** requirement name as written (normalized). */
  name: string
  /** the `## ` section it sits under, or `undefined` above the first one. */
  section?: string
  /** 1-based line of the `### Requirement:` header. */
  line: number
}

export interface ParsedDelta {
  path: string
  capability: string
  headerPresent: boolean
  ops: DeltaOp[]
  /** section headers present but yielding zero entries. */
  emptySections: DeltaOperation[]
  scenarioDepthIssues: { line: number }[]
  /**
   * FROM:/TO: lines that formed no pair, in line order. A half-built RENAMED
   * op is never pushed to `ops` for these — see the RENAMED arm of
   * `parseDeltaSpec`.
   */
  unpairedRenames: UnpairedRename[]
  /**
   * `### Requirement:` blocks sitting outside every delta section, in document
   * order — reported as the WARNING `deltas/orphaned-requirement`.
   */
  orphanedRequirements: OrphanedRequirement[]
}

/**
 * openspec's `normalizeRequirementName` (`src/core/parsers/requirement-blocks.ts`,
 * 1.13.1), ported verbatim: strip a CommonMark closing ATX run, then trim.
 *
 * `### Requirement: Foo ###` renders as `Foo`, so the run is not part of the
 * name — and the binary keys every delta lookup, collision check and spec merge
 * on the stripped form. Leaving it in made cospec read `Foo ###` where the
 * binary read `Foo`: `archive/target-missing` refused a delta the binary
 * applies, and `Foo` vs `Foo ###` read as two requirements where the binary
 * saw one collision.
 *
 * The class is `[ \t]`, not `\s`, for the same reason `scenarioNameFromHeader`
 * uses it: CommonMark only closes a heading on a `#` run preceded by a space or
 * tab, so `C#` keeps its `#` and an NBSP-separated run stays in the name.
 */
export function normalizeRequirementName(name: string): string {
  return name.replace(/[ \t]+#+[ \t]*$/, '').trim()
}

function normalize(name: string): string {
  return normalizeRequirementName(name)
}

/**
 * openspec's `foldRequirementName` (`src/core/parsers/requirement-blocks.ts`),
 * ported verbatim: lowercase, then collapse every whitespace run to one space.
 *
 * Requirement *matching* stays case-sensitive — this fold exists only for
 * typo detection, where two spellings differing in case or interior whitespace
 * mean a mistake rather than two requirements. Using it to match would make
 * cospec looser than the binary.
 */
export function foldRequirementName(name: string): string {
  return normalize(name).toLowerCase().replace(/\s+/g, ' ')
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

/**
 * openspec's `hasScenarioBody` (`src/core/parsers/requirement-text.ts`, 1.13.1),
 * ported: a `#### ` header is a scenario only once its body holds at least one
 * non-blank line.
 *
 * A bare header is not a scenario to the binary either — the spec reader drops
 * it — so counting one broke `archive/scenario-preservation` in both
 * directions. Probed at the 1.11.0 pin: a MODIFIED block that keeps a living
 * scenario's header and deletes its `- **WHEN**`/`- **THEN**` steps validates
 * clean and archives at exit 0, leaving the living spec holding a hollow
 * header — real content silently lost, and cospec's gate the only thing that
 * can refuse it. In the other direction, a living block carrying a bare header
 * reported one more scenario than the delta faithfully reproducing it, so the
 * count arm refused a merge the binary performs.
 */
export function hasScenarioBody(body: readonly string[]): boolean {
  return body.some((line) => line.trim().length > 0)
}

/**
 * Streaming `#### ` header reader, shared by the delta and living parsers so
 * one definition of "a scenario" feeds every counter and both hard gates.
 *
 * A header is held open until its body ends — the next non-fenced level-1-to-4
 * header, the end of the requirement block, or end of input — because whether
 * it counts as a scenario is not knowable at the header line. `owner` is
 * captured at `open`, so a scenario is always credited to the requirement whose
 * block it sits in, never to the one the parser has moved on to.
 *
 * **The count is gated on the body; the NAME is not.** That asymmetry is
 * openspec's own (`countScenarios` filters on `hasScenarioBody`,
 * `parseScenarioBlocks` — which feeds `findMissingCurrentScenarios` — does not),
 * and dropping a bodyless header from `scenarioNames` would make cospec quieter
 * than the pinned binary, not closer to it: probed at 1.11.0, a MODIFIED block
 * that omits a bodyless living header is refused by `openspec validate` and
 * `openspec archive` alike (`omits scenario(s) the current spec still has`,
 * exit 1). Withholding the name only trades cospec's own rule id and remedy for
 * the delegated `openspec/validate` twin.
 *
 * Body lines come from the masked structural view, the view every other
 * structural decision in this module reads: a body written entirely inside an
 * HTML comment is invisible here exactly as it is everywhere else. Fenced lines
 * *are* body content, matching openspec's `readScenarioBodies`, which slices
 * masked lines into the body rather than skipping them.
 */
function scenarioReader<T>(on: {
  /** Every `#### ` header, body or not — the name arm of the gate. */
  header: (owner: T, name: string) => void
  /** Headers whose body has content — the count arm. */
  counted: (owner: T, name: string) => void
  /** Headers with no body, for the `deltas/requirement-shape` hint. */
  empty?: (owner: T, name: string) => void
}) {
  let pending: { owner: T; name: string; body: string[] } | undefined
  const close = () => {
    if (pending === undefined) return
    if (hasScenarioBody(pending.body)) on.counted(pending.owner, pending.name)
    else on.empty?.(pending.owner, pending.name)
    pending = undefined
  }
  return {
    /** A `#### ` header: ends the scenario before it, opens this one. */
    open(owner: T, name: string) {
      close()
      on.header(owner, name)
      pending = { owner, name, body: [] }
    },
    /** A body line of the open scenario (fenced lines included). */
    body(line: string) {
      if (pending !== undefined) pending.body.push(line)
    },
    /** A boundary: a level-1-to-4 header, the end of the block, or EOF. */
    close,
  }
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
 *
 * Deliberate deviation: upstream re-masks each requirement block on its own
 * when it extracts scenario names; cospec builds this mask once per file and
 * both parsers and both hard gates read the one result. A block's retained
 * raw therefore keeps its fenced lines verbatim while contributing no
 * scenario name — the shape the `fenced content is retained verbatim but
 * yields no scenario` unit case pins. One fence primitive across the whole
 * module is worth more here than byte-identical masking.
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
  const unpairedRenames: UnpairedRename[] = []
  const orphanedRequirements: OrphanedRequirement[] = []
  const sectionCounts = new Map<DeltaOperation, number>()
  const sectionsSeen = new Set<DeltaOperation>()
  let headerPresent = false

  let currentOp: DeltaOperation | undefined
  /** Title of the `## ` section being read, undefined above the first one. */
  let currentSection: string | undefined
  // Track the requirement currently being accumulated (ADDED/MODIFIED).
  let openReq: DeltaOp | undefined
  /** Verbatim (unmasked) block lines for `openReq`. */
  let openRaw: string[] | undefined
  /** The `FROM:` awaiting its `TO:` inside the current RENAMED section. */
  let pendingRename: { name: string; line: number } | undefined
  const scenarios = scenarioReader<DeltaOp>({
    header: (op, name) => op.scenarioNames.push(name),
    counted: (op) => {
      op.scenarioCount++
    },
    empty: (op) => {
      op.emptyScenarioCount++
    },
  })

  const dropRename = (side: 'FROM' | 'TO', name: string, line: number) => {
    unpairedRenames.push({ side, name, line })
  }

  /**
   * Pairs are read per section, exactly as openspec's `parseRenamedPairs` does:
   * a `FROM:` left pending when a `## ` header arrives (or at EOF) is reported
   * unpaired rather than carried into the next section, so a `FROM:` under one
   * copy of `## RENAMED Requirements` can never pair with a `TO:` under another.
   */
  const closePendingRename = () => {
    if (pendingRename !== undefined) dropRename('FROM', pendingRename.name, pendingRename.line)
    pendingRename = undefined
  }

  const closeReq = () => {
    // Before the op is pushed: the last scenario's body ends with its block, and
    // `scenarios` still holds the op it belongs to.
    scenarios.close()
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
      // It is still *body*: a scenario whose steps are a fenced example has one.
      openRaw?.push(source[i] ?? '')
      scenarios.body(raw)
      if (openReq !== undefined && SHALL_MUST_RE.test(raw)) openReq.hasShallMust = true
      continue
    }

    if (SCENARIO_DEPTH_RE.test(raw)) scenarioDepthIssues.push({ line: lineNo })

    const section = raw.match(SECTION_RE)
    if (section !== null) {
      const title = section[1]!.toLowerCase()
      const op = SECTION_TITLES[title]
      closeReq()
      closePendingRename()
      currentSection = section[1]!.trim()
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

    // Outside every delta section. A requirement header here is invisible to
    // the reader below, so record it rather than dropping it in silence.
    if (currentOp === undefined) {
      const orphan = raw.match(REQUIREMENT_RE)
      if (orphan !== null) {
        orphanedRequirements.push({
          name: normalize(orphan[1]!),
          section: currentSection,
          line: lineNo,
        })
      }
      continue
    }

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
          emptyScenarioCount: 0,
          raw: '',
          scenarioRemovalReasons: [],
        }
        openRaw = [source[i] ?? '']
        continue
      }
      if (openReq !== undefined) {
        openRaw?.push(source[i] ?? '')
        if (SCENARIO_RE.test(raw)) {
          scenarios.open(openReq, scenarioNameFromHeader(source[i] ?? ''))
        } else {
          if (SCENARIO_BODY_END_RE.test(raw)) scenarios.close()
          else scenarios.body(raw)
          if (SHALL_MUST_RE.test(raw)) openReq.hasShallMust = true
        }
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
          emptyScenarioCount: 0,
          raw: '',
          scenarioRemovalReasons: [],
        })
        sectionCounts.set('REMOVED', (sectionCounts.get('REMOVED') ?? 0) + 1)
      }
      continue
    }

    // Only a complete FROM:/TO: pair becomes an op, ported from openspec's
    // `parseRenamedPairs`. cospec used to open a RENAMED op on the bare `FROM:`
    // and let `closeReq()` push it with `toName` undefined: a phantom op that
    // counted towards `sectionCounts` (suppressing `emptySections` and
    // `archive/no-ops`) while the RENAMED-TO collision check skipped it for
    // want of a `toName` — a false archive PASS over a rename that never
    // happened. Interleaved lines were worse: a second `FROM:` overwrote the
    // first in silence, so `FROM a / FROM b / TO x` renamed `b` to `x`, a
    // requirement pairing the author never wrote. Every stray line is now
    // reported through `unpairedRenames` (`deltas/unpaired-rename`).
    if (currentOp === 'RENAMED') {
      const from = raw.match(RENAMED_FROM_RE)
      if (from !== null) {
        if (pendingRename !== undefined) dropRename('FROM', pendingRename.name, pendingRename.line)
        pendingRename = { name: normalize(from[1]!), line: lineNo }
        continue
      }
      const to = raw.match(RENAMED_TO_RE)
      if (to !== null) {
        const toName = normalize(to[1]!)
        if (pendingRename === undefined) {
          dropRename('TO', toName, lineNo)
          continue
        }
        // The op is anchored on its FROM: line, which is where an author fixes
        // a rename and where the archive gates have always pointed.
        ops.push({
          operation: 'RENAMED',
          fromName: pendingRename.name,
          toName,
          line: pendingRename.line,
          hasShallMust: false,
          scenarioCount: 0,
          scenarioNames: [],
          emptyScenarioCount: 0,
          raw: '',
          scenarioRemovalReasons: [],
        })
        sectionCounts.set('RENAMED', (sectionCounts.get('RENAMED') ?? 0) + 1)
        pendingRename = undefined
      }
      continue
    }
  }
  closeReq()
  closePendingRename()

  const emptySections: DeltaOperation[] = []
  for (const op of sectionsSeen) if ((sectionCounts.get(op) ?? 0) === 0) emptySections.push(op)

  // `unpairedRenames` is already in line order: a pending FROM: is only ever
  // dropped by a later line, and every other drop reports the line it is on.
  return {
    path,
    capability,
    headerPresent,
    ops,
    emptySections,
    scenarioDepthIssues,
    unpairedRenames,
    orphanedRequirements,
  }
}

export interface LivingSpec {
  requirementNames: Set<string>
  /**
   * requirement name → its current scenario count (archive/scenario-preservation):
   * `#### ` headers that carry a body, gated exactly as the delta side is.
   */
  requirementScenarioCounts: Map<string, number>
  /** requirement name → its ordered scenario names, every `#### ` header
   *  (`scenarioNameFromHeader`), bodyless ones included — see `scenarioReader`. */
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
  // Same reader, same definition of a scenario as the delta side. Gating one
  // side's count and not the other is what manufactures a phantom loss: a
  // MODIFIED block reproducing a living block that carries a bare header would
  // count one scenario against the living spec's inflated two, and the count arm
  // would refuse an archive the binary performs.
  const scenarios = scenarioReader<string>({
    header: (reqName, name) => {
      requirementScenarioNames.get(reqName)?.push(name)
    },
    counted: (reqName) => {
      requirementScenarioCounts.set(reqName, (requirementScenarioCounts.get(reqName) ?? 0) + 1)
    },
  })

  const closeReq = () => {
    scenarios.close()
    if (currentReqName !== undefined && currentBlock !== undefined)
      requirementBlocks.set(currentReqName, currentBlock.join('\n').trimEnd())
    currentReqName = undefined
    currentBlock = undefined
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    if (fenced[i] === true) {
      currentBlock?.push(source[i] ?? '')
      scenarios.body(raw)
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
      if (SCENARIO_RE.test(raw))
        scenarios.open(currentReqName, scenarioNameFromHeader(source[i] ?? ''))
      else if (SCENARIO_BODY_END_RE.test(raw)) scenarios.close()
      else scenarios.body(raw)
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

/**
 * Shared remedy text for a refused scenario drop (gate + validate rule).
 *
 * Only two remedies work. A same-delta REMOVE+ADD of one requirement name is
 * NOT one of them: openspec 1.11.0 refuses it outright with `Requirement
 * present in both ADDED and REMOVED`, so advising it sends the author into a
 * wall. Retiring a requirement and re-adding it takes two changes.
 */
export const SCENARIO_DROP_HINT =
  'copy the missing scenario back into the MODIFIED block, or — if the requirement really is being retired — REMOVE it in this change and ADD the replacement in a later one; openspec refuses a REMOVE and an ADD of one requirement name in the same delta'

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
