// Where each shell's completion script lives, how the shell is wired to load
// it, and the reversible rc-file edit that does the wiring. One table of
// targets (`TARGETS`), not one class per shell: the four shells differ in a
// path, an rc file and a block of lines, never in how a block is inserted,
// replaced or removed.
//
// Names and markers are cospec's own (`_cospec`, `# COSPEC:START`), so this
// module never reads, replaces or removes what the wrapped binary's
// `completion install` wrote (`_openspec`, `# OPENSPEC:START`), and nothing it
// writes contains the token `openspec`. Paths derive from the home directory
// the caller passes, never from `ZDOTDIR` or `XDG_CONFIG_HOME`, as upstream's
// do. Everything takes its environment, home, platform and clock as
// parameters, so a test never touches process state.

import { copyFileSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const INSTALL_SHELLS = ['bash', 'zsh', 'fish', 'powershell'] as const
export type InstallShell = (typeof INSTALL_SHELLS)[number]

const START_MARKER = '# COSPEC:START'
const END_MARKER = '# COSPEC:END'
const BLOCK_COMMENT = '# cospec shell completions configuration'

/** Where the system bash-completion package lives, as upstream looks for it. */
const BASH_COMPLETION_DIRS: readonly string[] = [
  '/usr/share/bash-completion',
  '/usr/local/share/bash-completion',
  '/opt/homebrew/etc/bash_completion.d',
  '/usr/local/etc/bash_completion.d',
  '/etc/bash_completion.d',
]

export interface InstallContext {
  readonly env: Readonly<Record<string, string | undefined>>
  readonly home: string
  /** Default `process.platform`: only the PowerShell profile defaults differ. */
  readonly platform?: NodeJS.Platform
  /** Default `() => new Date()`: names the backup of a changed script. */
  readonly now?: () => Date
  /** Default the five system paths upstream checks: tests pin it. */
  readonly bashCompletionDirs?: readonly string[]
}

export interface CompletionTarget {
  readonly shell: InstallShell
  readonly scriptPath: string
  /** The rc files wired to load the script; empty for fish and Oh My Zsh. */
  readonly rcFiles: readonly string[]
  readonly ohMyZsh: boolean
}

export type RcStatus = 'configured' | 'unchanged' | 'disabled' | 'failed'

export interface RcOutcome {
  readonly path: string
  readonly status: RcStatus
  /** Why `failed`: names the path. */
  readonly reason?: string
  /** The lines between the markers, for the manual instructions. */
  readonly block: readonly string[]
}

export interface InstallResult {
  readonly shell: InstallShell
  readonly scriptPath: string
  readonly status: 'installed' | 'updated' | 'unchanged'
  readonly backupPath?: string
  readonly ohMyZsh: boolean
  readonly rc: readonly RcOutcome[]
  readonly warnings: readonly string[]
}

export type RcRemovalStatus = 'removed' | 'absent' | 'failed'

export interface UninstallResult {
  readonly shell: InstallShell
  readonly scriptPath: string
  readonly scriptRemoved: boolean
  readonly ohMyZsh: boolean
  readonly rc: readonly {
    readonly path: string
    readonly status: RcRemovalStatus
    readonly reason?: string
  }[]
}

/** An expected failure the command reports as `✗ <message>`; anything else propagates. */
export class CompletionInstallError extends Error {
  override readonly name = 'CompletionInstallError'
}

function errnoCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined
  const code = (error as NodeJS.ErrnoException).code
  return typeof code === 'string' ? code : undefined
}

/** Codes of a path that is simply not there or not readable: an answer, not a crash. */
const ABSENT_CODES = new Set(['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'ELOOP'])

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch (error) {
    const code = errnoCode(error)
    if (code !== undefined && ABSENT_CODES.has(code)) return false
    throw error
  }
}

/** A POSIX single-quoted literal: no expansion survives, an apostrophe is closed and reopened. */
function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** A PowerShell single-quoted literal; PowerShell reads the typographic quotes as quotes too. */
function powershellSingleQuote(value: string): string {
  return `'${value.replace(/['‘’‚‛]/g, (quote) => quote + quote)}'`
}

interface TargetSpec {
  /** Block placement in an existing rc file (zsh and bash read their rc top-down). */
  readonly placement: 'top' | 'append'
  readonly reloadCommand: string
  scriptPath(ctx: ResolvedContext): string
  rcFiles(ctx: ResolvedContext, scriptPath: string): readonly string[]
  rcBlock(scriptPath: string): readonly string[]
}

interface ResolvedContext {
  readonly env: Readonly<Record<string, string | undefined>>
  readonly home: string
  readonly platform: NodeJS.Platform
}

function ohMyZshRoot(ctx: ResolvedContext): string {
  const root = ctx.env.ZSH
  return root !== undefined && root !== '' ? root : join(ctx.home, '.oh-my-zsh')
}

function isOhMyZsh(ctx: ResolvedContext): boolean {
  const root = ctx.env.ZSH
  if (root !== undefined && root !== '') return true
  return isDirectory(join(ctx.home, '.oh-my-zsh'))
}

function powershellProfile(ctx: ResolvedContext): string {
  const profile = ctx.env.PROFILE
  if (profile !== undefined && profile !== '') return profile
  return ctx.platform === 'win32'
    ? join(ctx.home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1')
    : join(ctx.home, '.config', 'powershell', 'Microsoft.PowerShell_profile.ps1')
}

const TARGETS: Readonly<Record<InstallShell, TargetSpec>> = {
  zsh: {
    placement: 'top',
    reloadCommand: 'exec zsh',
    scriptPath: (ctx) => {
      if (!isOhMyZsh(ctx)) return join(ctx.home, '.zsh', 'completions', '_cospec')
      const custom = ctx.env.ZSH_CUSTOM
      const customDir =
        custom !== undefined && custom !== '' ? custom : join(ohMyZshRoot(ctx), 'custom')
      return join(customDir, 'completions', '_cospec')
    },
    // Oh My Zsh loads custom/completions and runs compinit itself.
    rcFiles: (ctx) => (isOhMyZsh(ctx) ? [] : [join(ctx.home, '.zshrc')]),
    rcBlock: (scriptPath) => [
      BLOCK_COMMENT,
      `fpath=(${shellSingleQuote(dirname(scriptPath))} $fpath)`,
      'autoload -Uz compinit',
      'compinit',
    ],
  },
  bash: {
    placement: 'top',
    reloadCommand: 'exec bash',
    scriptPath: (ctx) =>
      join(ctx.home, '.local', 'share', 'bash-completion', 'completions', 'cospec'),
    rcFiles: (ctx) => [join(ctx.home, '.bashrc')],
    rcBlock: (scriptPath) => {
      const dir = shellSingleQuote(dirname(scriptPath))
      return [
        BLOCK_COMMENT,
        `if [ -d ${dir} ]; then`,
        `  for f in ${dir}/*; do`,
        '    [ -f "$f" ] && . "$f"',
        '  done',
        'fi',
      ]
    },
  },
  // fish autoloads ~/.config/fish/completions: it needs no rc edit, and
  // upstream's fish installer makes none either.
  fish: {
    placement: 'top',
    reloadCommand: 'exec fish',
    scriptPath: (ctx) => join(ctx.home, '.config', 'fish', 'completions', 'cospec.fish'),
    rcFiles: () => [],
    rcBlock: () => [],
  },
  powershell: {
    placement: 'append',
    reloadCommand: '. $PROFILE',
    scriptPath: (ctx) => join(dirname(powershellProfile(ctx)), 'CospecCompletion.ps1'),
    rcFiles: (ctx) => {
      const profile = ctx.env.PROFILE
      if (profile !== undefined && profile !== '') return [profile]
      if (ctx.platform !== 'win32') return [powershellProfile(ctx)]
      return [
        // PowerShell Core 6+, then Windows PowerShell 5.1.
        powershellProfile(ctx),
        join(ctx.home, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
      ]
    },
    rcBlock: (scriptPath) => [
      BLOCK_COMMENT,
      `if (Test-Path ${powershellSingleQuote(scriptPath)}) {`,
      `    . ${powershellSingleQuote(scriptPath)}`,
      '}',
    ],
  },
}

function resolveContext(ctx: Pick<InstallContext, 'env' | 'home' | 'platform'>): ResolvedContext {
  return { env: ctx.env, home: ctx.home, platform: ctx.platform ?? process.platform }
}

/** The command that makes a running shell pick the wiring up. */
export function reloadCommand(shell: InstallShell): string {
  return TARGETS[shell].reloadCommand
}

export function resolveTarget(
  shell: InstallShell,
  ctx: Pick<InstallContext, 'env' | 'home' | 'platform'>,
): CompletionTarget {
  const resolved = resolveContext(ctx)
  const spec = TARGETS[shell]
  const scriptPath = spec.scriptPath(resolved)
  return {
    shell,
    scriptPath,
    rcFiles: spec.rcFiles(resolved, scriptPath),
    ohMyZsh: shell === 'zsh' && isOhMyZsh(resolved),
  }
}

/** Whether the shell's script is on disk, read from the same target `install` writes. */
export function isCompletionInstalled(
  shell: InstallShell,
  env: Readonly<Record<string, string | undefined>>,
  home: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const { scriptPath } = resolveTarget(shell, { env, home, platform })
  try {
    // stat, not exists: a directory at the script path is not a script.
    return statSync(scriptPath).isFile()
  } catch (error) {
    const code = errnoCode(error)
    if (code !== undefined && ABSENT_CODES.has(code)) return false
    throw error
  }
}

// --- the marker block ------------------------------------------------------------

function isMarkerOnOwnLine(content: string, index: number, length: number): boolean {
  for (let i = index - 1; i >= 0 && content[i] !== '\n'; i--) {
    const char = content[i]
    if (char !== ' ' && char !== '\t' && char !== '\r') return false
  }
  for (let i = index + length; i < content.length && content[i] !== '\n'; i++) {
    const char = content[i]
    if (char !== ' ' && char !== '\t' && char !== '\r') return false
  }
  return true
}

function findMarker(content: string, marker: string, from = 0): number {
  let index = content.indexOf(marker, from)
  while (index !== -1) {
    if (isMarkerOnOwnLine(content, index, marker.length)) return index
    index = content.indexOf(marker, index + marker.length)
  }
  return -1
}

interface MarkerSpan {
  readonly start: number
  readonly end: number
}

/** The marker pair, undefined when neither is there; a lone or reversed marker throws. */
function findSpan(content: string): MarkerSpan | undefined {
  const start = findMarker(content, START_MARKER)
  const end =
    start === -1
      ? findMarker(content, END_MARKER)
      : findMarker(content, END_MARKER, start + START_MARKER.length)
  if (start === -1 && end === -1) return undefined
  if (start === -1 || end === -1) {
    throw new CompletionInstallError(
      `Invalid marker state: found start marker ${start !== -1}, end marker ${end !== -1}. ` +
        `Remove the stray ${START_MARKER} / ${END_MARKER} line by hand and retry.`,
    )
  }
  return { start, end }
}

function eolOf(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n'
}

/**
 * The rc text with the marker block holding `inner`: bare for a missing file,
 * replaced in place when one is there, else inserted at the top (one blank line
 * after) or appended (one blank line before). `removeBlock` is its exact inverse.
 */
export function insertBlock(
  content: string | undefined,
  inner: readonly string[],
  placement: 'top' | 'append',
): string {
  if (content === undefined) return [START_MARKER, ...inner, END_MARKER].join('\n')
  const eol = eolOf(content)
  const block = [START_MARKER, ...inner, END_MARKER].join(eol)
  const span = findSpan(content)
  if (span !== undefined) {
    const before = content.slice(0, span.start)
    const after = content.slice(span.end + END_MARKER.length)
    return before + block + after
  }
  if (placement === 'top') return `${block}${eol}${eol}${content}`
  return `${content}${content === '' ? '' : eol}${block}${eol}`
}

/** The rc text without the marker block, and whether there was one. */
export function removeBlock(content: string): { content: string; removed: boolean } {
  const span = findSpan(content)
  if (span === undefined) return { content, removed: false }
  const eol = eolOf(content)
  let lineStart = span.start
  while (lineStart > 0 && content[lineStart - 1] !== '\n') lineStart--
  let lineEnd = span.end + END_MARKER.length
  while (lineEnd < content.length && content[lineEnd] !== '\n') lineEnd++
  if (lineEnd < content.length) lineEnd++
  let before = content.slice(0, lineStart)
  let after = content.slice(lineEnd)
  // The one blank line install added: after a block at the top, before one at the end.
  if (before === '' && after.startsWith(eol)) after = after.slice(eol.length)
  else if (after === '' && before.endsWith(eol)) before = before.slice(0, -eol.length)
  return { content: before + after, removed: true }
}

// --- reading and writing an rc file, byte-transparent ------------------------------

interface RcFile {
  readonly text: string | undefined
  /** `binary`: bytes as latin1 chars, so a byte this module never reads survives a rewrite. */
  readonly encoding: 'binary' | 'utf16le'
  readonly bom: Buffer
}

function readRc(path: string, powershell: boolean): RcFile {
  let raw: Buffer
  try {
    raw = readFileSync(path)
  } catch (error) {
    if (errnoCode(error) === 'ENOENT')
      return { text: undefined, encoding: 'binary', bom: Buffer.alloc(0) }
    throw error
  }
  if (!powershell) return { text: raw.toString('latin1'), encoding: 'binary', bom: Buffer.alloc(0) }
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    if ((raw.length - 2) % 2 !== 0)
      throw new CompletionInstallError('File is not valid UTF-16 LE (odd number of bytes).')
    return {
      text: raw.subarray(2).toString('utf16le'),
      encoding: 'utf16le',
      bom: raw.subarray(0, 2),
    }
  }
  if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) {
    throw new CompletionInstallError(
      'File is encoded as UTF-16 BE which is not supported. ' +
        'Please re-save as UTF-8 or UTF-16 LE, then retry.',
    )
  }
  const bom =
    raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf
      ? raw.subarray(0, 3)
      : Buffer.alloc(0)
  return { text: raw.subarray(bom.length).toString('latin1'), encoding: 'binary', bom }
}

function writeRc(path: string, file: RcFile, text: string): void {
  const body = Buffer.from(text, file.encoding === 'utf16le' ? 'utf16le' : 'latin1')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, Buffer.concat([file.bom, body]))
}

/** Lines to insert into a `binary` file: their UTF-8 bytes, one latin1 char each. */
function innerFor(file: RcFile, lines: readonly string[]): string[] {
  return file.encoding === 'utf16le'
    ? [...lines]
    : lines.map((line) => Buffer.from(line, 'utf8').toString('latin1'))
}

function describeFailure(path: string, error: unknown): string | undefined {
  if (error instanceof CompletionInstallError) return `${path}: ${error.message}`
  if (errnoCode(error) !== undefined) return `${path}: ${(error as Error).message}`
  return undefined
}

function wireRc(
  path: string,
  shell: InstallShell,
  block: readonly string[],
): { status: 'configured' | 'unchanged' } {
  const spec = TARGETS[shell]
  const file = readRc(path, shell === 'powershell')
  const next = insertBlock(file.text, innerFor(file, block), spec.placement)
  if (next === file.text) return { status: 'unchanged' }
  writeRc(path, file, next)
  return { status: 'configured' }
}

// --- install and uninstall -----------------------------------------------------------

function backupName(path: string, now: Date): string {
  return `${path}.backup-${now.toISOString().replace(/[:.]/g, '-')}`
}

function bashCompletionWarning(): string[] {
  return [
    '⚠️  Warning: bash-completion package not detected',
    '',
    'The completion script requires bash-completion to function.',
    'Install it with:',
    '  brew install bash-completion@2',
    '',
    'Then add to your ~/.bash_profile:',
    '  [[ -r "/opt/homebrew/etc/profile.d/bash_completion.sh" ]] && . "/opt/homebrew/etc/profile.d/bash_completion.sh"',
  ]
}

/**
 * Write `script` for `shell` and wire the shell to load it. A script that
 * cannot be written throws `CompletionInstallError` before any rc file is
 * touched; an rc file that cannot be edited is reported in `rc` while the
 * script stays installed.
 */
export function installCompletion(
  shell: InstallShell,
  script: string,
  ctx: InstallContext,
): InstallResult {
  const target = resolveTarget(shell, ctx)
  const { scriptPath } = target
  const bytes = Buffer.from(script, 'utf8')

  let status: InstallResult['status'] = 'installed'
  let backupPath: string | undefined
  try {
    let existing: Buffer | undefined
    try {
      existing = readFileSync(scriptPath)
    } catch (error) {
      if (errnoCode(error) !== 'ENOENT') throw error
    }
    if (existing !== undefined && existing.equals(bytes)) {
      status = 'unchanged'
    } else {
      mkdirSync(dirname(scriptPath), { recursive: true })
      if (existing !== undefined) {
        backupPath = backupName(scriptPath, (ctx.now ?? (() => new Date()))())
        copyFileSync(scriptPath, backupPath)
        status = 'updated'
      }
      writeFileSync(scriptPath, bytes)
    }
  } catch (error) {
    if (errnoCode(error) === undefined) throw error
    throw new CompletionInstallError(
      `Path is not writable: ${scriptPath} (${(error as Error).message})`,
    )
  }

  const block = TARGETS[shell].rcBlock(scriptPath)
  const noAutoConfig = ctx.env.OPENSPEC_NO_AUTO_CONFIG === '1'
  const rc: RcOutcome[] = target.rcFiles.map((path): RcOutcome => {
    if (noAutoConfig) return { path, status: 'disabled', block }
    try {
      return { path, ...wireRc(path, shell, block), block }
    } catch (error) {
      const reason = describeFailure(path, error)
      if (reason === undefined) throw error
      return { path, status: 'failed', reason, block }
    }
  })

  const warnings: string[] = []
  if (shell === 'bash' && status !== 'unchanged') {
    const dirs = ctx.bashCompletionDirs ?? BASH_COMPLETION_DIRS
    if (!dirs.some((dir) => isDirectory(dir))) warnings.push(...bashCompletionWarning())
  }

  return {
    shell,
    scriptPath,
    status,
    ...(backupPath !== undefined ? { backupPath } : {}),
    ohMyZsh: target.ohMyZsh,
    rc,
    warnings,
  }
}

/**
 * Remove the script and the rc block, independently: a block whose script was
 * deleted by hand is still removed. A marker error leaves that rc file
 * untouched and is reported in `rc`.
 */
export function uninstallCompletion(shell: InstallShell, ctx: InstallContext): UninstallResult {
  const target = resolveTarget(shell, ctx)
  let scriptRemoved = false
  try {
    unlinkSync(target.scriptPath)
    scriptRemoved = true
  } catch (error) {
    const code = errnoCode(error)
    if (code === undefined) throw error
    if (code !== 'ENOENT')
      throw new CompletionInstallError(
        `Cannot remove ${target.scriptPath} (${(error as Error).message})`,
      )
  }

  const rc = target.rcFiles.map((path) => {
    try {
      const file = readRc(path, shell === 'powershell')
      if (file.text === undefined) return { path, status: 'absent' as const }
      const result = removeBlock(file.text)
      if (!result.removed) return { path, status: 'absent' as const }
      writeRc(path, file, result.content)
      return { path, status: 'removed' as const }
    } catch (error) {
      const reason = describeFailure(path, error)
      if (reason === undefined) throw error
      return { path, status: 'failed' as const, reason }
    }
  })

  return { shell, scriptPath: target.scriptPath, scriptRemoved, ohMyZsh: target.ohMyZsh, rc }
}
