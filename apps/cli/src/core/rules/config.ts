// config/* rules over `openspec/config.yaml`, read as YAML rather than as a spec
// document, so no view in `rules/views.ts` applies. Rule IDs are frozen public API.

import { describeYamlType, nonStringRuleItems } from '../project-config-read.ts'
import type { Issue } from './issue.ts'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A scalar as it would read back from YAML, for the quoted form of an item. */
function scalarText(value: unknown): string | undefined {
  if (value === null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  return undefined
}

/**
 * The item as the author most likely wrote it, quoted so YAML keeps it a string:
 * a one-key mapping `{ Use: tabs }` came from `- Use: tabs`, so `- "Use: tabs"`.
 * `undefined` when the shape says nothing about the text it came from.
 */
export function quotedRuleItem(value: unknown): string | undefined {
  let text: string | undefined
  if (isRecord(value)) {
    const entries = Object.entries(value)
    if (entries.length !== 1) return undefined
    const [key, inner] = entries[0]!
    const rest = scalarText(inner)
    if (rest === undefined) return undefined
    text = rest === '' ? `${key}:` : `${key}: ${rest}`
  } else {
    text = scalarText(value)
    if (text === undefined || value === null) return undefined
  }
  return `- ${JSON.stringify(text)}`
}

/**
 * `config/rules-item-type` — a `rules.<artifact>` item that is not a string. The
 * binary (1.14.x `describeRulesShapeError`) then ignores every rule for that
 * artifact; this names the artifact, the index, what YAML parsed the item as,
 * and the quoting fix, one finding per item. `path` is the config file as the
 * report names it.
 */
export function configRulesIssues(doc: unknown, path: string): Issue[] {
  if (!isRecord(doc) || !isRecord(doc.rules)) return []
  const issues: Issue[] = []
  for (const [artifactId, rules] of Object.entries(doc.rules)) {
    for (const { index, value } of nonStringRuleItems(artifactId, rules)) {
      const quoted = quotedRuleItem(value)
      const mapping = isRecord(value)
      issues.push({
        level: 'WARNING',
        rule: 'config/rules-item-type',
        path,
        message: `rules.${artifactId}[${index}] parsed as ${describeYamlType(value)}, not a string, so every rule for '${artifactId}' is ignored`,
        hint: `${
          mapping
            ? 'an unquoted ": " makes YAML read the item as a key/value pair; quote the whole item'
            : 'quote the item so YAML keeps it a string'
        }${quoted === undefined ? '' : `: ${quoted}`}`,
      })
    }
  }
  return issues
}
