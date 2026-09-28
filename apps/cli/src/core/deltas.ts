// Delta-spec parser (change-side specs/<cap>/spec.md) and living-spec requirement
// extractor. Regexes mirror openspec-core §5.5 so cospec's diagnostics agree with
// the binary; the archive-precondition inputs (living requirement names, structural
// validity) feed DESIGN §4.3's archive/* family.

export type DeltaOperation = 'ADDED' | 'MODIFIED' | 'REMOVED' | 'RENAMED'

/**
 * The canonical requirement header. The `Requirement:` keyword is matched
 * case-insensitively because both of openspec's readers are: the delta reader's
 * `REQUIREMENT_HEADER_REGEX` (`src/core/parsers/requirement-blocks.ts`,
 * 1.13.1) and the spec reader's `REQUIREMENT_HEADER`
 * (`src/core/parsers/spec-structure.ts`) both carry the `i` flag. Anchoring on
 * the exact spelling — as cospec did through 0.8.0 — made `### requirement: X`
 * and `### REQUIREMENT: X` invisible here while the binary parsed and applied
 * them: the op never reached `ops`, so `archive/target-missing` and
 * `archive/scenario-preservation` never saw it, and a scenario-dropping
 * MODIFIED under a case-variant header archived at exit 0. Worse inside a
 * section, a case-variant header did not close the block above it, so its
 * scenarios were credited to the preceding requirement.
 *
 * Only the keyword folds. The captured name keeps its case, and every
 * comparison against it (living names, collisions, rename chains) stays
 * case-sensitive, matching openspec's `normalizeRequirementName` consumers.
 * The tolerance also stops here: `REMOVED_BULLET_RE` and the `FROM:`/`TO:`
 * pair regexes below have no `i` flag because upstream's have none either —
 * probed against the 1.13.1 binary, a lowercase bullet or `from:`/`to:` line
 * parses no delta at all. `test/contract/archive-parity.test.ts` pins both
 * halves of that asymmetry.
 */
const REQUIREMENT_RE = /^###\s*Requirement:\s*(.+?)\s*$/i
const SECTION_RE = /^##\s+(.+?)\s*$/
const SCENARIO_RE = /^####\s+/
/**
 * A header at scenario level or above (`#` through `####`) — where a scenario's
 * body ends. Ported from openspec's `SCENARIO_BODY_END`
 * (`src/core/parsers/requirement-text.ts`, 1.13.1): a `#####` header is *inside*
 * the body, not a boundary, so a scenario documenting sub-cases still has one.
 */
const SCENARIO_BODY_END_RE = /^#{1,4}\s/
/** Any header, `#` to `######` — where a requirement's statement ends (openspec's `HEADER_LINE`). */
const ANY_HEADER_RE = /^#{1,6}\s/
/** 3-hashtag scenario heading — the probe §5.4 mis-parse (DESIGN deltas/scenario-depth). */
const SCENARIO_DEPTH_RE = /^###\s+Scenario:/
export const SHALL_MUST_RE = /\b(SHALL|MUST)\b/
/**
 * Any level-3 header. Inside an ADDED/MODIFIED section, one that is not a
 * requirement header is skipped by both readers — the binary's
 * `parseRequirementBlocksFromSection` (`src/core/parsers/requirement-blocks.ts`,
 * 1.13.1) records it with this exact pattern, so cospec records the same lines.
 */
const LEVEL3_HEADER_RE = /^###\s+(.+?)\s*$/
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
  /**
   * ADDED/MODIFIED only: the name read off the header line as written,
   * normalized like `name` but never comment-masked — the name openspec's own
   * validator quotes. Equal to `name` except under the `masked` view, where a
   * header's trailing `<!-- … -->` is blanked out of `name` (`Foo`) but is part
   * of the binary's (`Foo <!-- note -->`). Findings the binary also reports
   * quote this one, so the two agree on which requirement they mean.
   */
  verbatimName?: string
  fromName?: string
  toName?: string
  line: number
  /**
   * ADDED/MODIFIED: the requirement's statement — its body as openspec's
   * `extractRequirementBody` reads it — contains SHALL or MUST. A keyword in
   * the header, a scenario step or a fenced example is not in the statement.
   */
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
  /**
   * ADDED/MODIFIED only: the block cut at each skipped `###` header inside it
   * (`SkippedHeader`), in order. The first part is the requirement's own, from
   * its header; each later one opens at a skipped header. See
   * `findRequirementSplits` (`rebuilt-spec.ts`) for why the cut matters.
   */
  parts?: RequirementPart[]
}

/** One piece of a requirement block, as the archive's rebuilt spec reads it. */
export interface RequirementPart {
  /** The skipped header opening this part, after `### `; absent for the first. */
  header?: string
  /** 1-based line of the part's first line (the requirement header for the first). */
  line: number
  /** `#### ` headers in this part that carry a body. */
  scenarioCount: number
  /**
   * The part has a statement of its own: a non-blank, non-fenced line before
   * its first header — for the first part, exactly a non-empty
   * `extractRequirementBody`. The archive reads a skipped header whose text is
   * blank (`###   `) as a requirement named by that statement, so without one
   * it is a requirement with no text.
   */
  hasText: boolean
}

/** openspec's `METADATA_LINE` (`parsers/requirement-text.ts`): `**ID**: …` / `**Priority**: …`. */
const METADATA_LINE_RE = /^\*\*[^*]+\*\*:/

/**
 * openspec's `extractRequirementBody` (`src/core/parsers/requirement-text.ts`,
 * 1.13.1), ported line for line: the requirement's statement, read off the
 * lines under its header. Every line up to the first header on a non-fenced
 * line, skipping blank lines and every line inside a fenced block (masked on
 * these lines alone, as upstream masks them); `**metadata**:` lines are the
 * statement only when nothing else is. An HTML comment is text here, as it is
 * to the binary — so a statement written inside one is a statement, and one
 * that is only a comment has no SHALL/MUST.
 *
 * This is what the binary's validate grades (empty: `is missing requirement
 * text`; no SHALL/MUST: `should contain SHALL or MUST`) and what its archive
 * reads, so every gate that asks whether a requirement has a statement, or a
 * normative one, asks it of this text.
 */
export function extractRequirementBody(bodyLines: readonly string[]): string {
  const mask = buildCodeFenceMask(bodyLines)
  const captured: string[] = []
  const metadata: string[] = []
  for (let i = 0; i < bodyLines.length; i++) {
    if (mask[i] === true) continue
    const line = bodyLines[i]!
    if (ANY_HEADER_RE.test(line)) break
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    if (METADATA_LINE_RE.test(trimmed)) metadata.push(trimmed)
    else captured.push(trimmed)
  }
  return captured.length > 0 ? captured.join('\n') : metadata.join('\n')
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

/**
 * A `###` header inside an ADDED/MODIFIED section that is not a named
 * `### Requirement:` header (a divider, a nameless `### Requirement:`, a
 * `### Scenario:` one level too shallow). Neither reader validates what sits
 * under it as a requirement of its own; it stays part of the block it is in.
 */
export interface SkippedHeader {
  /** header text after `### `, trimmed. */
  header: string
  /** the section's `## ` title, first spelling as written (`ADDED Requirements`). */
  section: string
  /** 1-based line of the header. */
  line: number
}

export interface ParsedDelta {
  path: string
  capability: string
  headerPresent: boolean
  ops: DeltaOp[]
  /** section headers present but yielding zero entries. */
  emptySections: DeltaOperation[]
  /**
   * `### Scenario:` lines, one level too shallow. `header` is the text after
   * `### ` as written and trimmed — the text openspec quotes when it reports
   * the same line as a skipped header.
   */
  scenarioDepthIssues: { line: number; header: string }[]
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
  /**
   * Skipped `###` headers in ADDED/MODIFIED sections, in line order — the
   * binary's `skippedHeaders`. Fenced lines are never recorded. Recording them
   * changes nothing else this parser reports.
   */
  skippedHeaders: SkippedHeader[]
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
 * Body lines come from the view the caller parses (`ReadView`): under
 * `masked` a body written entirely inside an HTML comment is invisible here,
 * as it is to every other structural decision on that view; under `verbatim`
 * it counts, as it does to openspec. Fenced lines *are* body content, matching
 * openspec's `readScenarioBodies`, which slices masked lines into the body
 * rather than skipping them.
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

const COMMENT_OPEN = '<!--'
const COMMENT_CLOSE_RE = /--!?>/g

/**
 * Blank out `<!-- … -->` spans line by line, preserving every line's length so
 * line numbers never shift. `--!>` terminates a comment too, and an
 * unterminated `<!--` comments out the rest of the file (openspec #1413).
 *
 * Fence-aware: `fenced` is the code-fence mask of the same raw lines, built
 * first, and a comment can neither open nor close on a fenced line. A `<!--`
 * shown inside a fenced example is code, not a comment — masking the text
 * after it, as a whole-file regex did, hid every scenario below the example,
 * and the scenario-preservation gate refused a merge openspec performs. A
 * comment already open when a fence starts stays open across it, and the
 * fenced lines inside it are blanked with the rest of the comment.
 */
export function maskHtmlComments(lines: readonly string[], fenced: readonly boolean[]): string[] {
  const masked: string[] = []
  let open = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (fenced[i] === true) {
      masked.push(open ? blank(line) : line)
      continue
    }
    let out = ''
    let pos = 0
    while (pos < line.length) {
      if (open) {
        COMMENT_CLOSE_RE.lastIndex = pos
        const close = COMMENT_CLOSE_RE.exec(line)
        const end = close === null ? line.length : close.index + close[0].length
        out += blank(line.slice(pos, end))
        pos = end
        if (close !== null) open = false
        continue
      }
      const start = line.indexOf(COMMENT_OPEN, pos)
      if (start === -1) {
        out += line.slice(pos)
        break
      }
      out += line.slice(pos, start) + blank(COMMENT_OPEN)
      pos = start + COMMENT_OPEN.length
      open = true
    }
    masked.push(out)
  }
  return masked
}

/**
 * One document, scanned once: the raw lines, their fence mask, and the
 * comment-masked copy. Both `ReadView`s are read off this one scan, so the two
 * can never disagree about where a fence starts or which line is which.
 */
export interface DocumentScan {
  /** LF-normalized lines; BOM-stripped unless the scan was asked to keep it. */
  source: string[]
  /** `true` where `source[i]` sits inside a fenced code block — found on the raw lines. */
  fenced: boolean[]
  /** `source` with HTML comments blanked (`maskHtmlComments`). */
  masked: string[]
}

/**
 * Scan a markdown document. CR/CRLF fold to LF (a trailing `\r` leaks into
 * every `(.+)$` capture), and a UTF-8 BOM is stripped as openspec's
 * `MarkdownParser`, delta reader and `extractRequirementsSection` strip it.
 * `keepBom` is for the one upstream reader that does not:
 * `findMainSpecStructureIssues` (`spec-structure.ts`, 1.13.1) folds line
 * endings only, so a BOM before a first-line `## Requirements` hides that
 * header from it and the archive refuses the spec. Line counts never change.
 */
export function scanDocument(text: string, opts: { keepBom?: boolean } = {}): DocumentScan {
  const folded = text.replace(/\r\n?/g, '\n')
  const source = (opts.keepBom === true ? folded : folded.replace(/^﻿/, '')).split('\n')
  const fenced = buildCodeFenceMask(source)
  return { source, fenced, masked: maskHtmlComments(source, fenced) }
}

export interface ScannedMarkdown {
  /** The chosen view's lines (see `ReadView`), index-aligned with `source`. */
  lines: string[]
  /** Verbatim lines: BOM-stripped and LF-normalized only. */
  source: string[]
  /** `true` where line `i` sits inside a fenced code block. */
  fenced: boolean[]
}

/**
 * Which view of the one scan a reader takes. Fences are masked in both — they
 * are found on the raw lines before anything else — and the two differ only
 * in HTML comments.
 *
 * - `verbatim` keeps comments. It is exactly what openspec's own readers see
 *   (`requirement-blocks.ts`, `spec-structure.ts`, `markdown-parser.ts`,
 *   1.13.1: each builds a code-fence mask and nothing else), and so what its
 *   archive merges and re-validates: an op written inside `<!-- … -->` is
 *   parsed and applied, and a header's trailing comment is part of its name.
 *   Every `archive/*` rule reads it.
 * - `masked` also blanks comments. Only the advisory `deltas/*` and `specs/*`
 *   rules read it (and the hard archive gate, which is not a rule), so a
 *   commented-out draft never draws an authoring finding.
 */
export type ReadView = 'masked' | 'verbatim'

export function scanMarkdown(text: string, view: ReadView = 'masked'): ScannedMarkdown {
  const { source, fenced, masked } = scanDocument(text)
  return { lines: view === 'verbatim' ? source : masked, source, fenced }
}

/**
 * Parse a change-side delta spec. `capability` is the dir name (e.g. `widgets`).
 * `view` picks the reader's view (see `ReadView`): advisory rules take the
 * default `masked` one, the `archive/*` family the `verbatim` one.
 */
export function parseDeltaSpec(
  text: string,
  path: string,
  capability: string,
  view: ReadView = 'masked',
): ParsedDelta {
  const { lines, source, fenced } = scanMarkdown(text, view)
  const ops: DeltaOp[] = []
  const scenarioDepthIssues: ParsedDelta['scenarioDepthIssues'] = []
  const unpairedRenames: UnpairedRename[] = []
  const orphanedRequirements: OrphanedRequirement[] = []
  const skippedHeaders: SkippedHeader[] = []
  /**
   * Each operation's first `## ` spelling. The binary folds every copy of a
   * section into one and quotes the first title it met, so a header under a
   * second `## Added Requirements` copy still reads `ADDED Requirements`.
   */
  const sectionTitles = new Map<DeltaOperation, string>()
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
  /** `openReq`'s lines under its header, on this parse's view — its statement's source. */
  let openBody: string[] | undefined
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
  // The same scenarios credited to the part of the block they sit in. Fed
  // every call `scenarios` gets, so the two can never disagree on a boundary.
  const partScenarios = scenarioReader<RequirementPart>({
    header: () => {},
    counted: (part) => {
      part.scenarioCount++
    },
  })
  const currentPart = (): RequirementPart | undefined => openReq?.parts?.at(-1)
  /** Parts whose statement has ended at their first header (`RequirementPart.hasText`). */
  const statementClosed = new WeakSet<RequirementPart>()

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
    partScenarios.close()
    if (openReq !== undefined) {
      if (openRaw !== undefined) openReq.raw = openRaw.join('\n').trimEnd()
      if (openBody !== undefined) {
        const statement = extractRequirementBody(openBody)
        openReq.hasShallMust = SHALL_MUST_RE.test(statement)
        const head = openReq.parts?.[0]
        if (head !== undefined) head.hasText = statement.length > 0
      }
      ops.push(openReq)
      sectionCounts.set(openReq.operation, (sectionCounts.get(openReq.operation) ?? 0) + 1)
      openReq = undefined
    }
    openRaw = undefined
    openBody = undefined
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const lineNo = i + 1

    // Fenced lines carry no structure, and no statement: a SHALL/MUST in an
    // example block is not one (`extractRequirementBody` skips them).
    if (fenced[i] === true) {
      // Fenced content is part of the block verbatim, but never structure: a
      // `#### ` line inside a fence is retained in `raw` and is not a scenario.
      // It is still *body*: a scenario whose steps are a fenced example has one.
      openRaw?.push(source[i] ?? '')
      openBody?.push(raw)
      scenarios.body(raw)
      partScenarios.body(raw)
      continue
    }

    if (SCENARIO_DEPTH_RE.test(raw))
      scenarioDepthIssues.push({
        line: lineNo,
        header: ((source[i] ?? '').match(LEVEL3_HEADER_RE)?.[1] ?? raw.slice(3)).trim(),
      })

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
        if (!sectionTitles.has(op)) sectionTitles.set(op, currentSection)
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
        const name = normalize(req[1]!)
        openReq = {
          operation: currentOp,
          name,
          verbatimName: normalize((source[i] ?? '').match(REQUIREMENT_RE)?.[1] ?? name),
          line: lineNo,
          hasShallMust: false,
          scenarioCount: 0,
          scenarioNames: [],
          emptyScenarioCount: 0,
          raw: '',
          scenarioRemovalReasons: [],
          parts: [{ line: lineNo, scenarioCount: 0, hasText: false }],
        }
        openRaw = [source[i] ?? '']
        openBody = []
        continue
      }
      // Detected on the masked line, quoted from the source one: the binary's
      // reader quotes the header as written.
      const skipped = raw.match(LEVEL3_HEADER_RE)
      if (skipped !== null) {
        const quoted = (source[i] ?? '').match(LEVEL3_HEADER_RE)?.[1] ?? skipped[1]!
        skippedHeaders.push({
          header: quoted.trim(),
          section: sectionTitles.get(currentOp) ?? '',
          line: lineNo,
        })
      }
      if (openReq !== undefined) {
        openRaw?.push(source[i] ?? '')
        openBody?.push(raw)
        const part = currentPart()
        if (part !== undefined && !statementClosed.has(part)) {
          if (ANY_HEADER_RE.test(raw)) statementClosed.add(part)
          else if (raw.trim() !== '') part.hasText = true
        }
        if (SCENARIO_RE.test(raw)) {
          scenarios.open(openReq, scenarioNameFromHeader(source[i] ?? ''))
          const part = currentPart()
          if (part !== undefined) partScenarios.open(part, '')
        } else {
          if (SCENARIO_BODY_END_RE.test(raw)) {
            scenarios.close()
            partScenarios.close()
          } else {
            scenarios.body(raw)
            partScenarios.body(raw)
          }
        }
        if (skipped !== null)
          openReq.parts?.push({
            header: skippedHeaders.at(-1)!.header,
            line: lineNo,
            scenarioCount: 0,
            hasText: false,
          })
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
    skippedHeaders,
  }
}

/**
 * A structural defect in a living spec that openspec's archive refuses to
 * update past — the three kinds its `findMainSpecStructureIssues`
 * (`src/core/parsers/spec-structure.ts`, 1.13.1) reports. The archive throws
 * `target spec is structurally invalid and cannot be updated until fixed`
 * before merging anything.
 */
export interface LivingStructureIssue {
  kind: 'delta-header' | 'requirement-outside-requirements' | 'duplicate-requirement'
  /** 1-based line of the offending header. */
  line: number
  /** delta-header: the header as written, trimmed; otherwise the requirement's normalized name. */
  name: string
  /** duplicate only: the line that first declared the name. */
  firstLine?: number
}

const MAIN_REQUIREMENTS_HEADER_RE = /^##\s+Requirements\s*$/i
const MAIN_SECTION_RE = /^##\s+/
/** upstream's `DELTA_HEADER`: `\s+` between the words, case-insensitive. */
const MAIN_DELTA_HEADER_RE = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/i
/** The spec-structure reader's header: `\s+` after `###`, unlike the delta reader's `\s*`. */
const MAIN_REQUIREMENT_RE = /^###\s+Requirement:\s*(.+)\s*$/i

/**
 * openspec's `findMainSpecStructureIssues`, ported whole. Read exactly as
 * upstream reads it: line endings folded, the BOM KEPT (that reader alone does
 * not strip it — see `scanDocument`), fenced lines blanked, HTML comments NOT
 * masked — a commented-out requirement under `## Purpose`, or a `## ADDED
 * Requirements` on its own line inside a comment, is refused by the archive
 * all the same.
 */
export function findLivingStructureIssues(text: string): LivingStructureIssue[] {
  const { source, fenced } = scanDocument(text, { keepBom: true })
  const lines = source.map((line, i) => (fenced[i] === true ? '' : line))
  const issues: LivingStructureIssue[] = []
  const firstLines = new Map<string, number>()
  const start = lines.findIndex((line) => MAIN_REQUIREMENTS_HEADER_RE.test(line))
  let end = lines.length
  if (start !== -1)
    for (let i = start + 1; i < lines.length; i++)
      if (MAIN_SECTION_RE.test(lines[i]!)) {
        end = i
        break
      }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.trim().length === 0) continue
    if (MAIN_DELTA_HEADER_RE.test(line)) {
      issues.push({ kind: 'delta-header', line: i + 1, name: line.trim() })
      continue
    }
    const header = line.match(MAIN_REQUIREMENT_RE)
    if (header === null) continue
    const name = normalize(header[1]!)
    if (start === -1 || i <= start || i >= end) {
      issues.push({ kind: 'requirement-outside-requirements', line: i + 1, name })
      continue
    }
    const firstLine = firstLines.get(name)
    if (firstLine !== undefined)
      issues.push({ kind: 'duplicate-requirement', line: i + 1, name, firstLine })
    else firstLines.set(name, i + 1)
  }
  return issues
}

/**
 * What a split leaves wanting: `head` and `own` a scenario (see
 * `RequirementSplit.empty`), `text` a statement — a blank-titled header whose
 * part has scenarios but no line of its own before them.
 */
export type SplitEmpty = 'head' | 'own' | 'text'

/** A skipped header that splits its requirement into a piece with no scenario. */
export interface RequirementSplit {
  op: DeltaOp
  /** The part the skipped header opens. */
  part: RequirementPart
  /**
   * Which piece is left wanting: `head` — the requirement's own, above this
   * (its first) skipped header, with no scenario — `own`, the header's part
   * with no scenario, or `text`, the header's part with no statement.
   */
  empty: SplitEmpty
}

/**
 * A living spec as one `ReadView` of its scan sees it. Both views are read by
 * the one reader, `readLivingView`, with the same block boundaries: a block
 * runs from its header to the next requirement header or `## ` section, fenced
 * lines included verbatim.
 */
export interface LivingView {
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

/**
 * The living spec as openspec's archive reads it: the `verbatim` view, what
 * `findMainSpecStructureIssues` refuses, and the text itself — the archive
 * rebuilds the spec from it (`rebuilt-spec.ts`). Every `archive/*` rule reads
 * this and nothing else.
 */
export interface LivingArchiveView extends LivingView {
  /** Defects the archive refuses to update past (`findLivingStructureIssues`). */
  structureIssues: LivingStructureIssue[]
  /** The living spec as read, which the archive merges the delta into. */
  text: string
}

/**
 * The living spec under both views. The top-level fields are the `masked`
 * view, read by the advisory `specs/*` rules and the hard archive gate in
 * `commands/archive.ts`; `archive` is the `verbatim` one.
 */
export interface LivingSpec extends LivingView {
  archive: LivingArchiveView
}

/** One reader for both views of a living spec's scan. */
function readLivingView(scan: DocumentScan, view: ReadView): LivingView {
  const { source, fenced } = scan
  const lines = view === 'verbatim' ? source : scan.masked
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

/** Parse a living spec (openspec/specs/<cap>/spec.md) under both views of one scan. */
export function parseLivingSpec(text: string): LivingSpec {
  const scan = scanDocument(text)
  return {
    ...readLivingView(scan, 'masked'),
    archive: {
      ...readLivingView(scan, 'verbatim'),
      structureIssues: findLivingStructureIssues(text),
      text,
    },
  }
}

/**
 * What `findScenarioDrops` reads of a living spec. Either view carries it: the
 * `archive/scenario-preservation` rule passes `LivingSpec.archive` (verbatim,
 * what the archive's own scenario-loss check reads), and the hard gate in
 * `commands/archive.ts` passes the `LivingSpec` itself.
 */
export type ScenarioBaseline = Pick<
  LivingView,
  'requirementNames' | 'requirementScenarioCounts' | 'requirementScenarioNames'
>

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
  livingSpecs: ReadonlyMap<string, ScenarioBaseline>,
): ScenarioDrop[] {
  const drops: ScenarioDrop[] = []
  for (const { capability, ops } of caps) {
    const living = livingSpecs.get(capability)
    if (living === undefined) continue
    // openspec applies RENAMED before MODIFIED, so a MODIFIED naming a header
    // this same delta renamed into existence is compared upstream against the
    // rename source's living block (`specs-apply.ts` reads `nameToBlock`,
    // which the RENAMED phase already re-keyed). Walking the chain back to the
    // living name is what keeps this gate from waving through a rename-then-
    // modify that drops a scenario — a false archive PASS, because the binary
    // aborts on it.
    const renamedFrom = new Map<string, string>()
    for (const op of ops)
      if (op.operation === 'RENAMED' && op.fromName !== undefined && op.toName !== undefined)
        renamedFrom.set(op.toName, op.fromName)
    const livingNameOf = (name: string): string => {
      const seen = new Set([name])
      let current = name
      while (!living.requirementNames.has(current)) {
        const from = renamedFrom.get(current)
        if (from === undefined || seen.has(from)) return name
        seen.add(from)
        current = from
      }
      return current
    }

    for (const op of ops) {
      if (op.operation !== 'MODIFIED' || op.name === undefined) continue
      const baseline = livingNameOf(op.name)
      const livingCount = living.requirementScenarioCounts.get(baseline) ?? 0
      const missingNames = missingCurrentScenarios(
        living.requirementScenarioNames.get(baseline) ?? [],
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
