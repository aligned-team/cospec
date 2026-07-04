// blocking-changes.md parser, canonical serializer, and sync engine.
// Grammar is binding per DESIGN §3.8; the sync classes (STALE / DANGLING /
// MANUAL-CHECK / FORMAT) and fix semantics are binding per DESIGN §5.3. One
// parser serves validate / apply / archive / sync-blockers.

/** Entry grammar (DESIGN §3.8) — separator tolerant of hyphen/en-dash/em-dash. */
const ENTRY_RE =
  /^- \[( |x|X)\] `([a-z][a-z0-9-]*)`(?:\s+([—–-])\s+(.+?))?(?:\s*(\*\(archived (\d{4}-\d{2}-\d{2})(?:[^)]*)?\)\*))?\s*$/

/** Exact gated headings (DESIGN §3.8). */
const HEADING_BLOCKED = /^## Blocked by\s*$/
const HEADING_SOFT = /^## Soft-blocked by\s*$/
/** Any H2 — a section boundary. */
const H2 = /^## /
/** A generic H2 heading, for near-miss detection. */
const H2_TITLE = /^##\s+(.+?)\s*$/
/** A bullet carrying a backticked slug but no checkbox (lint candidate). */
const LOOSE_SLUG_BULLET = /^[-*]\s+`[a-z][a-z0-9-]*`/
/** A checkbox-like bullet (candidate for a malformed entry). */
const CHECKBOX_LIKE = /^\s*[-*]\s*\[[^\]]*\]/

export type SectionKey = 'blocked' | 'soft'

export interface BlockerEntry {
  raw: string
  line: number
  checked: boolean
  slug: string
  description?: string
  /** the separator character actually used (`—` when none/canonical). */
  separator: string
  archivedDate?: string
  /** the verbatim `*(archived …)*` suffix, preserved on rewrite. */
  archivedSuffixRaw?: string
}

export interface MalformedEntry {
  raw: string
  line: number
  corrected?: string
}

export interface GatedSection {
  key: SectionKey
  /** canonical heading text without the leading `## `. */
  title: string
  present: boolean
  headingLine?: number
  entries: BlockerEntry[]
  malformed: MalformedEntry[]
  hasNone: boolean
  noneLine?: number
}

export interface NearMiss {
  key: SectionKey
  line: number
  raw: string
  /** the canonical heading it should be. */
  expected: string
}

export interface LooseSlugBullet {
  line: number
  raw: string
}

export interface ParsedBlockers {
  blocked: GatedSection
  soft: GatedSection
  nearMisses: NearMiss[]
  /** backticked-slug bullets missing a checkbox, OUTSIDE the gated sections. */
  looseSlugBullets: LooseSlugBullet[]
}

function emptySection(key: SectionKey, title: string): GatedSection {
  return { key, title, present: false, entries: [], malformed: [], hasNone: false }
}

function normalizeHeading(title: string): string {
  return title.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Best-effort reconstruction of a canonical entry line from a malformed one. */
function correctEntry(raw: string): string | undefined {
  const slugMatch = raw.match(/`([a-z][a-z0-9-]*)`/)
  if (slugMatch === null) return undefined
  const slug = slugMatch[1]!
  const checked = /\[\s*[xX]/.test(raw)
  // description: text following the slug, stripped of separators and archive suffix.
  const after = raw.slice(raw.indexOf(slugMatch[0]) + slugMatch[0].length)
  const archived = after.match(/\*\(archived (\d{4}-\d{2}-\d{2})(?:[^)]*)?\)\*/)
  let desc = after
  if (archived !== null) desc = desc.slice(0, archived.index)
  desc = desc.replace(/^[\s—–-]+/, '').trim()
  return serializeEntry({
    raw,
    line: 0,
    checked,
    slug,
    description: desc.length > 0 ? desc : undefined,
    separator: '—',
    archivedDate: archived?.[1],
    archivedSuffixRaw: archived?.[0],
  })
}

/** Canonical serialization (DESIGN §3.8: always em-dash). */
export function serializeEntry(e: BlockerEntry): string {
  const box = e.checked ? 'x' : ' '
  let line = `- [${box}] \`${e.slug}\``
  if (e.description !== undefined && e.description.length > 0) line += ` — ${e.description}`
  const suffix =
    e.archivedSuffixRaw ??
    (e.archivedDate !== undefined ? `*(archived ${e.archivedDate})*` : undefined)
  if (suffix !== undefined) line += ` ${suffix}`
  return line
}

/** Is a line inside a gated section a legal HTML comment / blank / continuation? */
function isIgnorableLine(line: string): boolean {
  const t = line.trim()
  if (t.length === 0) return true
  if (t.startsWith('<!--')) return true
  return false
}

export function parseBlockers(text: string): ParsedBlockers {
  const lines = text.split('\n')
  const parsed: ParsedBlockers = {
    blocked: emptySection('blocked', 'Blocked by'),
    soft: emptySection('soft', 'Soft-blocked by'),
    nearMisses: [],
    looseSlugBullets: [],
  }

  let current: GatedSection | undefined
  let inComment = false

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const lineNo = i + 1

    // Track multi-line HTML comments so their bodies never trip entry parsing.
    if (inComment) {
      if (raw.includes('-->')) inComment = false
      continue
    }
    const trimmed = raw.trim()
    if (trimmed.startsWith('<!--') && !trimmed.includes('-->')) {
      inComment = true
      continue
    }

    if (H2.test(raw)) {
      // A new H2 closes any current gated section.
      if (HEADING_BLOCKED.test(raw)) {
        current = parsed.blocked
        current.present = true
        current.headingLine = lineNo
        continue
      }
      if (HEADING_SOFT.test(raw)) {
        current = parsed.soft
        current.present = true
        current.headingLine = lineNo
        continue
      }
      // Near-miss detection for a non-exact H2.
      const title = raw.match(H2_TITLE)?.[1]
      if (title !== undefined) {
        const norm = normalizeHeading(title)
        if (norm === 'blocked by' && !parsed.blocked.present) {
          parsed.nearMisses.push({
            key: 'blocked',
            line: lineNo,
            raw,
            expected: '## Blocked by',
          })
        } else if (norm === 'soft blocked by' && !parsed.soft.present) {
          parsed.nearMisses.push({ key: 'soft', line: lineNo, raw, expected: '## Soft-blocked by' })
        }
      }
      current = undefined
      continue
    }

    if (current === undefined) {
      // Outside gated sections: only lint loose slug bullets.
      if (LOOSE_SLUG_BULLET.test(trimmed)) parsed.looseSlugBullets.push({ line: lineNo, raw })
      continue
    }

    if (isIgnorableLine(raw)) continue

    const m = raw.match(ENTRY_RE)
    if (m !== null) {
      current.entries.push({
        raw,
        line: lineNo,
        checked: m[1] === 'x' || m[1] === 'X',
        slug: m[2]!,
        separator: m[3] ?? '—',
        description: m[4],
        archivedSuffixRaw: m[5],
        archivedDate: m[6],
      })
      continue
    }

    if (trimmed === 'None.') {
      current.hasNone = true
      current.noneLine = lineNo
      continue
    }

    // Continuation line: indented, follows an entry — legal, ignored.
    if (/^\s{2,}\S/.test(raw) && current.entries.length > 0) continue

    // A line that looks like an entry attempt but failed the grammar.
    if (CHECKBOX_LIKE.test(raw) || LOOSE_SLUG_BULLET.test(trimmed)) {
      current.malformed.push({ raw, line: lineNo, corrected: correctEntry(raw) })
      continue
    }

    // Anything else after None./entries is free prose — legal and ignored.
  }

  return parsed
}

// ---------------------------------------------------------------------------
// Sync engine (DESIGN §5.3 / §5.1 self-heal)
// ---------------------------------------------------------------------------

export type SyncClass = 'STALE' | 'DANGLING' | 'MANUAL-CHECK' | 'FORMAT'

export interface SyncFinding {
  class: SyncClass
  section: SectionKey
  slug?: string
  line: number
  message: string
}

export interface SyncResult {
  findings: SyncFinding[]
  output: string
  changed: boolean
  /** slugs whose box this run checked off (STALE fixes applied). */
  synced: string[]
  /** true when every Blocked-by entry is checked or the section is None. */
  fullyUnblocked: boolean
}

/**
 * Reconcile one blocking-changes.md against the archive/active indexes.
 * `archiveIndex`: slug → archived date (YYYY-MM-DD). `activeIndex`: active slugs.
 * `fix` rewrites STALE boxes and normalizes separators; DANGLING/FORMAT are
 * never auto-fixed. Pure and idempotent: `sync(fix(x)) === fix(x)`.
 */
export function syncBlockers(
  text: string,
  archiveIndex: Map<string, string>,
  activeIndex: Set<string>,
  opts: { fix: boolean },
): SyncResult {
  const parsed = parseBlockers(text)
  const lines = text.split('\n')
  const findings: SyncFinding[] = []
  const synced: string[] = []
  let changed = false

  const sections: GatedSection[] = [parsed.blocked, parsed.soft]
  for (const section of sections) {
    for (const mal of section.malformed) {
      findings.push({
        class: 'FORMAT',
        section: section.key,
        line: mal.line,
        message: `malformed blocker entry${mal.corrected !== undefined ? ` — expected: ${mal.corrected}` : ''}`,
      })
    }

    for (const entry of section.entries) {
      const archivedDate = archiveIndex.get(entry.slug)
      if (!entry.checked && archivedDate !== undefined) {
        // STALE: dependency shipped; check the box + stamp the date.
        findings.push({
          class: 'STALE',
          section: section.key,
          slug: entry.slug,
          line: entry.line,
          message: `\`${entry.slug}\` is archived (${archivedDate}) but still unchecked`,
        })
        if (opts.fix) {
          const fixed = serializeEntry({
            ...entry,
            checked: true,
            separator: '—',
            archivedDate: entry.archivedDate ?? archivedDate,
            archivedSuffixRaw: entry.archivedSuffixRaw,
          })
          if (fixed !== entry.raw) {
            lines[entry.line - 1] = fixed
            changed = true
          }
          synced.push(entry.slug)
        }
        continue
      }

      if (!entry.checked && archivedDate === undefined && !activeIndex.has(entry.slug)) {
        findings.push({
          class: 'DANGLING',
          section: section.key,
          slug: entry.slug,
          line: entry.line,
          message: `\`${entry.slug}\` is neither an active change nor an archive entry`,
        })
        continue
      }

      if (entry.checked && archivedDate === undefined) {
        findings.push({
          class: 'MANUAL-CHECK',
          section: section.key,
          slug: entry.slug,
          line: entry.line,
          message: `\`${entry.slug}\` is checked but not archived`,
        })
      }

      // Separator normalization (fix mode only; not a finding).
      if (opts.fix && entry.separator !== '—') {
        const normalized = serializeEntry({ ...entry, separator: '—' })
        if (normalized !== entry.raw) {
          lines[entry.line - 1] = normalized
          changed = true
        }
      }
    }
  }

  // A change is fully unblocked when every hard blocker has shipped — i.e. each
  // Blocked-by entry is already checked or its slug is archived (fix mode will
  // have checked it, and check mode reports the would-be state). Reflects the
  // POST-sync state so archive's fan-out (§5.2 step 11) surfaces it correctly.
  const blockedResolved = parsed.blocked.entries.every((e) => e.checked || archiveIndex.has(e.slug))
  const fullyUnblocked = parsed.blocked.present && blockedResolved

  return { findings, output: lines.join('\n'), changed, synced, fullyUnblocked }
}
