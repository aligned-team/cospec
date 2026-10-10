// The pinned binary's `readProjectConfig` (`core/project-config.js`) as `init --language`
// reads it: the config's `context`, and every resilience warning the binary prints on the
// way, in its order and with its words. A field that fails its check is dropped with a
// warning, never an error, so a config the binary can half-read refuses the way the binary
// does, with the same lines before the refusal.

import { existsSync, readFileSync } from 'node:fs'

import { parse as parseYaml } from 'yaml'

/** `MAX_CONTEXT_SIZE` in the pinned binary's `core/project-config.js`. */
export const MAX_CONTEXT_SIZE = 50 * 1024

/** `OPERATION_IDS`: the operations a config may carry guidance for. */
const OPERATION_IDS = ['apply', 'archive']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')

function operationWarnings(raw: unknown, warn: (line: string) => void): void {
  if (raw === undefined) return
  if (!isRecord(raw)) {
    warn(`Invalid 'operations' field in config (must be object)`)
    return
  }
  for (const [id, value] of Object.entries(raw)) {
    if (!OPERATION_IDS.includes(id)) {
      warn(
        `Unknown operation ID '${id}' in config. Supported operation IDs: ${OPERATION_IDS.join(', ')}`,
      )
      continue
    }
    if (!isRecord(value)) {
      warn(`Invalid 'operations.${id}' field in config (must be object), ignoring this operation`)
      continue
    }
    const unknown = Object.keys(value).filter((field) => field !== 'guidance')
    if (unknown.length > 0) {
      warn(
        `Unknown field(s) in 'operations.${id}': ${unknown.join(', ')}. Supported fields: guidance`,
      )
    }
    if (value.guidance === undefined) continue
    if (!isStringArray(value.guidance)) {
      warn(
        `Guidance for operation '${id}' must be an array of strings, ignoring this operation's guidance`,
      )
      continue
    }
    if (value.guidance.some((entry) => entry.length === 0)) {
      warn(`Some guidance for operation '${id}' are empty strings, ignoring them`)
    }
  }
}

function referenceWarnings(raw: unknown, warn: (line: string) => void): void {
  if (raw === undefined) return
  if (!Array.isArray(raw)) {
    warn(`Invalid 'references' field in config (must be an array of store ids)`)
    return
  }
  let droppedEntries = false
  let droppedRemotes = false
  for (const entry of raw as unknown[]) {
    if (typeof entry === 'string') continue
    if (isRecord(entry) && typeof entry.id === 'string') {
      if (
        !(typeof entry.remote === 'string' && entry.remote.length > 0) &&
        entry.remote !== undefined
      ) {
        droppedRemotes = true
      }
      continue
    }
    droppedEntries = true
  }
  if (droppedEntries) warn(`Some 'references' entries are invalid, ignoring them`)
  if (droppedRemotes) {
    warn(
      `Some 'references' remotes are not non-empty strings; the ids are kept without a clone source`,
    )
  }
}

function ruleWarnings(raw: unknown, warn: (line: string) => void): void {
  if (raw === undefined) return
  if (!isRecord(raw)) {
    warn(`Invalid 'rules' field in config (must be object)`)
    return
  }
  for (const [artifactId, rules] of Object.entries(raw)) {
    if (!isStringArray(rules)) {
      warn(`Rules for '${artifactId}' must be an array of strings, ignoring this artifact's rules`)
    } else if (rules.some((rule) => rule.length === 0)) {
      warn(`Some rules for '${artifactId}' are empty strings, ignoring them`)
    }
  }
}

/**
 * The `context` the binary's `readProjectConfig` returns for the config at `configPath` (a
 * string within the size limit, else undefined), calling `warn` with each line it prints. A
 * file that cannot be read or parsed, or is not a YAML object, reads as no context.
 */
export function readConfigContext(
  configPath: string,
  warn: (line: string) => void,
): string | undefined {
  if (!existsSync(configPath)) return undefined
  let raw: unknown
  try {
    raw = parseYaml(readFileSync(configPath, 'utf8'))
  } catch (error) {
    // The binary catches whatever the read or the parse throws, names the first line of it
    // and carries on with no config.
    const detail = error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error)
    warn(`Warning: could not parse ${configPath} (${detail}); ignoring it.`)
    return undefined
  }
  if (!raw || typeof raw !== 'object') {
    warn('openspec/config.yaml is not a valid YAML object')
    return undefined
  }
  const config = raw as Record<string, unknown>
  if (
    config.schema !== undefined &&
    !(typeof config.schema === 'string' && config.schema.length > 0)
  ) {
    warn(`Invalid 'schema' field in config (must be non-empty string)`)
  }
  let context: string | undefined
  if (config.context !== undefined) {
    if (typeof config.context !== 'string') {
      warn(`Invalid 'context' field in config (must be string)`)
    } else {
      const size = Buffer.byteLength(config.context, 'utf8')
      if (size > MAX_CONTEXT_SIZE) {
        warn(
          `Context too large (${(size / 1024).toFixed(1)}KB, limit: ${MAX_CONTEXT_SIZE / 1024}KB)`,
        )
        warn('Ignoring context field')
      } else {
        context = config.context
      }
    }
  }
  ruleWarnings(config.rules, warn)
  operationWarnings(config.operations, warn)
  referenceWarnings(config.references, warn)
  if (config.store !== undefined && typeof config.store !== 'string') {
    warn(
      `Warning: ignoring invalid store: field in ${configPath} (must be a single store id string).`,
    )
  }
  if (config.githubCopilot !== undefined) {
    if (isRecord(config.githubCopilot)) {
      const { cloudAgent } = config.githubCopilot
      if (cloudAgent !== undefined && typeof cloudAgent !== 'boolean') {
        warn(`Invalid 'githubCopilot.cloudAgent' field in config (must be a boolean)`)
      }
    } else {
      warn(`Invalid 'githubCopilot' field in config (must be an object)`)
    }
  }
  return context
}
