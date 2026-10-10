// `init --language <lang>` (workflow-profiles design D8): the value the binary normalises, the
// three-line directive it writes as the new config's `context`, and the two checks it makes
// against the target before anything is written. Every message is the binary's, verbatim; the
// caller prefixes `cospec: `.

import { accessSync, constants, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { resolveConfigFilePath } from '../harness/copilot-cloud.ts'
import { MAX_CONTEXT_SIZE, readConfigContext } from './project-config-read.ts'
import { assertPathWithin } from './spec-paths.ts'

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

/** A line the binary's config reader prints (`console.warn`): stderr, whole. */
function warnOnStderr(line: string): void {
  process.stderr.write(`${line}\n`)
}

/**
 * The binary's `assertLanguageCanBeApplied`: the message to refuse with, or undefined when the
 * directive can be applied. With no config file the destination must be a writable path inside
 * the project; with one, its `context` must already carry the directive. Reading an existing
 * config prints the binary's own warnings through `warn`, as its `readProjectConfig` does,
 * whether the check then passes or refuses.
 */
export function languageRefusal(
  project: string,
  directive: string,
  warn: (line: string) => void = warnOnStderr,
): string | undefined {
  const configPath = join(project, 'openspec', 'config.yaml')
  const existing = resolveConfigFilePath(project)
  if (existing === undefined) {
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
  return readConfigContext(existing, warn)?.includes(directive) === true
    ? undefined
    : '--language does not overwrite an existing OpenSpec config. ' +
        'Add the language instruction to its context field instead.'
}
