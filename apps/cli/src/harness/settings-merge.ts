/** The single permission entry cospec needs — all agent calls route through `cospec` (DESIGN §6.4). */
export const COSPEC_PERMISSION = 'Bash(cospec *)'

/** Paste-ready snippet printed when the settings file is missing or unparseable. */
export const SETTINGS_SNIPPET = `{
  "permissions": {
    "allow": ["${COSPEC_PERMISSION}"]
  }
}
`

export interface SettingsMergeResult {
  /**
   * - `created`: no file existed; `content` is a fresh settings.json.
   * - `merged`: entry added to an existing parseable file; write `content`.
   * - `unchanged`: entry already present; no write needed.
   * - `unparseable`: file exists but is not a JSON object; print `snippet`, do not write.
   */
  status: 'created' | 'merged' | 'unchanged' | 'unparseable'
  /** The serialized settings.json to write (absent when unparseable). */
  content?: string
  /** Permission entries added by this merge (empty when unchanged/unparseable). */
  added: string[]
  snippet: string
}

/**
 * Additively merge `Bash(cospec *)` into `.claude/settings.json` `permissions.allow`. Never
 * touches any other key, never removes anything. `existing` is the raw file contents, or null
 * when the file is absent.
 */
export function mergeClaudeSettings(existing: string | null): SettingsMergeResult {
  if (existing === null || existing.trim() === '') {
    const obj = { permissions: { allow: [COSPEC_PERMISSION] } }
    return {
      status: 'created',
      content: serialize(obj),
      added: [COSPEC_PERMISSION],
      snippet: SETTINGS_SNIPPET,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(existing)
  } catch {
    return { status: 'unparseable', added: [], snippet: SETTINGS_SNIPPET }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { status: 'unparseable', added: [], snippet: SETTINGS_SNIPPET }
  }

  const obj = parsed as Record<string, unknown>
  const permissions = isObject(obj.permissions) ? obj.permissions : {}
  const allow = Array.isArray(permissions.allow) ? [...permissions.allow] : []

  if (allow.includes(COSPEC_PERMISSION)) {
    return { status: 'unchanged', content: serialize(obj), added: [], snippet: SETTINGS_SNIPPET }
  }

  allow.push(COSPEC_PERMISSION)
  const merged = { ...obj, permissions: { ...permissions, allow } }
  return {
    status: 'merged',
    content: serialize(merged),
    added: [COSPEC_PERMISSION],
    snippet: SETTINGS_SNIPPET,
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function serialize(obj: unknown): string {
  return `${JSON.stringify(obj, null, 2)}\n`
}
