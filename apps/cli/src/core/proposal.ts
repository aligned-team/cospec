// proposal.md parser: H2 section extraction plus the special-section detectors
// (Benchmarks table, Reverts citation) that DESIGN §4.3 proposal/* rules consume.

const H2_RE = /^##\s+(.+?)\s*$/
/** A markdown table separator row, e.g. `| --- | :-: |`. */
const TABLE_SEPARATOR_RE = /^\|[\s|:-]+\|?\s*$/
const TABLE_ROW_RE = /^\|/
/** A 7–40 hex commit sha. */
const SHA_RE = /\b[0-9a-f]{7,40}\b/
const BACKTICK_TOKEN_RE = /`([a-z][a-z0-9-]*)`/g

export interface ProposalSection {
  title: string
  line: number
  body: string
}

export interface ParsedProposal {
  sections: Map<string, ProposalSection>
  /** H2 titles in document order. */
  order: string[]
}

export function parseProposal(text: string): ParsedProposal {
  const lines = text.split('\n')
  const sections = new Map<string, ProposalSection>()
  const order: string[] = []
  let inFence = false
  let current: { title: string; line: number; body: string[] } | undefined

  const flush = () => {
    if (current !== undefined) {
      sections.set(current.title.toLowerCase(), {
        title: current.title,
        line: current.line,
        body: current.body.join('\n').trim(),
      })
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    if (/^\s*```/.test(raw)) {
      inFence = !inFence
      if (current !== undefined) current.body.push(raw)
      continue
    }
    if (!inFence) {
      const h2 = raw.match(H2_RE)
      if (h2 !== null) {
        flush()
        current = { title: h2[1]!, line: i + 1, body: [] }
        order.push(h2[1]!)
        continue
      }
    }
    if (current !== undefined) current.body.push(raw)
  }
  flush()

  return { sections, order }
}

export function hasSection(p: ParsedProposal, title: string): boolean {
  return p.sections.has(title.toLowerCase())
}

export function getSection(p: ParsedProposal, title: string): ProposalSection | undefined {
  return p.sections.get(title.toLowerCase())
}

/** Count non-separator, non-header data rows in a Benchmarks table. */
export function benchmarkDataRows(body: string): number {
  const pipeRows = body.split('\n').filter((l) => TABLE_ROW_RE.test(l.trim()))
  const nonSeparator = pipeRows.filter((l) => !TABLE_SEPARATOR_RE.test(l.trim()))
  // First non-separator pipe row is the header; the rest are data rows.
  return Math.max(0, nonSeparator.length - 1)
}

/** Backticked slug tokens in a Reverts section body. */
export function revertSlugs(body: string): string[] {
  const out: string[] = []
  for (const m of body.matchAll(BACKTICK_TOKEN_RE)) out.push(m[1]!)
  return out
}

export function hasCommitSha(body: string): boolean {
  return SHA_RE.test(body)
}
