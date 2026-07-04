// blockers/* rules (DESIGN §4.3, grammar §3.8). Rule IDs are frozen public API.

import { parseBlockers, type GatedSection, type ParsedBlockers } from '../blockers.ts'
import type { Issue } from './issue.ts'
import type { LoadedChange, ValidateContext } from './schema-info.ts'

const FILE = 'blocking-changes.md'

function sectionRules(section: GatedSection, parsed: ParsedBlockers, issues: Issue[]): void {
  // blockers/sections
  if (!section.present) {
    const nearMiss = parsed.nearMisses.find((n) => n.key === section.key)
    issues.push({
      level: 'ERROR',
      rule: 'blockers/sections',
      path: FILE,
      line: nearMiss?.line,
      message:
        nearMiss !== undefined
          ? `heading '${nearMiss.raw.trim()}' should be '${nearMiss.expected}'`
          : `missing required heading '## ${section.title}'`,
      hint: nearMiss !== undefined ? `rename to '${nearMiss.expected}'` : undefined,
    })
    return
  }

  // blockers/entry-grammar
  for (const mal of section.malformed) {
    issues.push({
      level: 'ERROR',
      rule: 'blockers/entry-grammar',
      path: FILE,
      line: mal.line,
      message: 'blocker entry does not match the required grammar',
      hint: mal.corrected !== undefined ? `expected: ${mal.corrected}` : undefined,
    })
  }

  // blockers/none-conflict
  if (section.hasNone && section.entries.length > 0) {
    issues.push({
      level: 'ERROR',
      rule: 'blockers/none-conflict',
      path: FILE,
      line: section.noneLine,
      message: '`None.` cannot coexist with entries in the same section',
    })
  }
}

export function blockersRules(change: LoadedChange, ctx: ValidateContext): Issue[] {
  if (change.blockersText === undefined) return []
  const issues: Issue[] = []
  const parsed = parseBlockers(change.blockersText)

  sectionRules(parsed.blocked, parsed, issues)
  sectionRules(parsed.soft, parsed, issues)

  for (const section of [parsed.blocked, parsed.soft]) {
    for (const entry of section.entries) {
      const archived = ctx.archiveSlugs.has(entry.slug)
      const active = ctx.activeSlugs.has(entry.slug)

      // blockers/dangling-ref
      if (!archived && !active) {
        issues.push({
          level: 'ERROR',
          rule: 'blockers/dangling-ref',
          path: FILE,
          line: entry.line,
          message: `\`${entry.slug}\` is not an active or archived change`,
          hint: '`cospec list` shows active changes; fix the slug or remove the entry',
        })
        continue
      }

      // blockers/stale-unchecked
      if (!entry.checked && archived) {
        issues.push({
          level: 'WARNING',
          rule: 'blockers/stale-unchecked',
          path: FILE,
          line: entry.line,
          message: `\`${entry.slug}\` is archived but still unchecked`,
          hint: 'run `cospec sync-blockers` to check it off',
          fixable: true,
        })
      }

      // blockers/premature-checked
      if (entry.checked && !archived) {
        issues.push({
          level: 'WARNING',
          rule: 'blockers/premature-checked',
          path: FILE,
          line: entry.line,
          message: `\`${entry.slug}\` is checked but not archived`,
        })
      }
    }
  }

  return issues
}
