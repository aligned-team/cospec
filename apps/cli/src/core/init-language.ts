// `init --language <lang>` (workflow-profiles design D8): the value the binary normalises, the
// three-line directive it writes as the new config's `context`, and the two checks it makes
// against the target before anything is written. Every message is the binary's, verbatim; the
// caller prefixes `cospec: `.

import { accessSync, constants, existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { parse as parseYaml, YAMLParseError } from 'yaml'

import { resolveConfigFilePath } from '../harness/copilot-cloud.ts'
import { assertPathWithin } from './spec-paths.ts'

/** `MAX_CONTEXT_SIZE` in the pinned binary's `core/project-config.js`. */
export const MAX_CONTEXT_SIZE = 50 * 1024

/** Control and bidi-control characters, and the zero-width and line-separator format marks. */
const INVISIBLE = new RegExp(
  `\\p{Cc}|\\p{Bidi_Control}|[${[0x200b, 0x2028, 0x2029, 0xfeff].map((c) => String.fromCharCode(c)).join('')}]`,
  'u',
)

/** The binary's `formatLanguageContext`: three lines, no trailing newline. */
export function languageDirective(language: string): string {
  return [
    `Language: ${language}`,
    `All artifacts must be written in ${language}.`,
    'Keep OpenSpec structural headings and SHALL/MUST keywords in English.',
  ].join('\n')
}

export type LanguageValue = { ok: true; language: string } | { ok: false; message: string }

/** The binary's `normalizeLanguage`: trim, then refuse blank, multi-line, invisible or too long. */
export function normalizeLanguage(raw: string): LanguageValue {
  const language = raw.trim()
  if (language === '') {
    return { ok: false, message: 'The --language option requires a non-empty value.' }
  }
  if (INVISIBLE.test(language)) {
    return {
      ok: false,
      message:
        'The --language option must be a single line without control or invisible formatting characters.',
    }
  }
  if (Buffer.byteLength(`${languageDirective(language)}\n`, 'utf8') > MAX_CONTEXT_SIZE) {
    return {
      ok: false,
      message: `The --language option is too long for OpenSpec's ${MAX_CONTEXT_SIZE / 1024}KB project context limit.`,
    }
  }
  return { ok: true, language }
}

/**
 * The binary's `hasWritableModeAndAccess` on POSIX: some write bit set (and, for a directory,
 * some execute bit), and the process can actually write there.
 */
function writableByMode(path: string): boolean {
  try {
    const stats = statSync(path)
    if ((stats.mode & 0o222) === 0) return false
    if (stats.isDirectory() && (stats.mode & 0o111) === 0) return false
    accessSync(path, stats.isDirectory() ? constants.W_OK | constants.X_OK : constants.W_OK)
    return true
  } catch {
    // Not writable is this function's answer for any stat or access failure, as the binary's.
    return false
  }
}

/** The first directory at or above `dir` that exists; null when one on the way is not a directory. */
function firstExistingDirectory(dir: string): string | null {
  let current = dir
  for (;;) {
    try {
      return statSync(current).isDirectory() ? current : null
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return null
      const parent = dirname(current)
      if (parent === current) return null
      current = parent
    }
  }
}

/** The binary's `canWriteFile` for a config path that does not exist yet. */
function canCreate(configPath: string): boolean {
  const existing = firstExistingDirectory(dirname(configPath))
  return existing !== null && writableByMode(existing)
}

/**
 * The binary's `assertLanguageCanBeApplied`: the message to refuse with, or undefined when the
 * directive can be applied. With no config file the destination must be a writable path inside
 * the project; with one, its `context` must already carry the directive.
 */
export function languageRefusal(project: string, directive: string): string | undefined {
  const configPath = join(project, 'openspec', 'config.yaml')
  if (resolveConfigFilePath(project) === undefined) {
    try {
      assertPathWithin(project, configPath)
    } catch (error) {
      if (!(error instanceof Error)) throw error
      return `Cannot create openspec/config.yaml for --language: ${error.message}`
    }
    if (!canCreate(configPath)) {
      return 'Cannot create openspec/config.yaml for --language: the destination is not writable.'
    }
    return undefined
  }
  return existingContext(project)?.includes(directive) === true
    ? undefined
    : '--language does not overwrite an existing OpenSpec config. ' +
        'Add the language instruction to its context field instead.'
}

/**
 * The config's `context`, as `readProjectConfig` reads it: a string within the size limit,
 * else nothing (a file that is not a YAML object, or a context of another type or over the
 * limit, reads as no context).
 */
function existingContext(project: string): string | undefined {
  const path = resolveConfigFilePath(project)
  if (path === undefined || !existsSync(path)) return undefined
  let raw: unknown
  try {
    raw = parseYaml(readFileSync(path, 'utf8'))
  } catch (error) {
    // The binary reads a config it cannot parse as having no context, and refuses on that.
    if (error instanceof YAMLParseError) return undefined
    throw error
  }
  if (raw === null || typeof raw !== 'object') return undefined
  const { context } = raw as { context?: unknown }
  if (typeof context !== 'string' || Buffer.byteLength(context, 'utf8') > MAX_CONTEXT_SIZE) {
    return undefined
  }
  return context
}
