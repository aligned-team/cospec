// The one-shot completion tip (design §11), ported from the pinned binary's
// `ll()`, with its suppression, raw config read and atomic write. The order is
// upstream's: suppression before the config is read, the flag recorded before
// the message, and a failed write leaves the tip unprinted.

import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { type InstallShell, isCompletionInstalled } from './completions/install.ts'

type Env = Readonly<Record<string, string | undefined>>

/** The values upstream reads as off for `CI`, compared trimmed and lowercased. */
const CI_OFF = new Set(['', 'false', '0', 'no', 'off'])
const ABSENT_CODES = new Set(['ENOENT', 'ENOTDIR'])
const MESSAGE = "Tip: Run 'cospec completion install' for shell completions"

export interface CompletionTipInput {
  /** The command's row name in the command table. */
  readonly command: string
  readonly hidden: boolean
  readonly json: boolean
  readonly env: Env
  readonly home: string
  readonly platform: NodeJS.Platform
  readonly stderrIsTTY: boolean
  readonly stderr: (text: string) => void
  /** Asked only once the tip is owed: a deferred run never detects a shell. */
  readonly detectShell: () => Promise<InstallShell | undefined>
}

export type CompletionTipOutcome =
  | 'suppressed'
  | 'unreadable'
  | 'seen'
  | 'deferred'
  | 'retired'
  | 'unrecorded'
  | 'shown'

export function ciSuppresses(env: Env): boolean {
  const value = env.CI
  return value !== undefined && !CI_OFF.has(value.trim().toLowerCase())
}

/** The machine-global config dir, as the binary's `getGlobalConfigDir` resolves it. */
export function globalConfigDir(env: Env, home: string, platform: NodeJS.Platform): string {
  if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, 'openspec')
  if (platform === 'win32') {
    return join(env.APPDATA || join(home, 'AppData', 'Roaming'), 'openspec')
  }
  return join(home, '.config', 'openspec')
}

type RawConfig =
  | { readonly kind: 'ok'; readonly value: Record<string, unknown> }
  | { readonly kind: 'unreadable' }

function errnoCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

/** The config as JSON, unmerged with any defaults; a missing file is an empty object. */
function readRaw(path: string): RawConfig {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    if (ABSENT_CODES.has(errnoCode(error) ?? '')) return { kind: 'ok', value: {} }
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return { kind: 'unreadable' }
    throw error
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'unreadable' }
  }
  return { kind: 'ok', value: parsed as Record<string, unknown> }
}

/**
 * Adds only `completionTipSeen: true` to the config as it is now, through a
 * randomly named owner-only temporary file renamed over it. False when the
 * write fails with an errno error; a config that turned unreadable is left alone.
 */
function recordSeen(configDir: string, configPath: string): boolean {
  const current = readRaw(configPath)
  if (current.kind === 'unreadable') return false
  const text = `${JSON.stringify({ ...current.value, completionTipSeen: true }, null, 2)}\n`
  const temp = join(configDir, `.config.json.${randomBytes(8).toString('hex')}.tmp`)
  // Cleanup only once the directory exists: under a file where it belongs, the
  // mkdir fails and there is no temporary file to remove.
  let dirReady = false
  try {
    mkdirSync(configDir, { recursive: true })
    dirReady = true
    writeFileSync(temp, text, { flag: 'wx', mode: 0o600 })
    renameSync(temp, configPath)
    return true
  } catch (error) {
    if (errnoCode(error) === undefined) throw error
    if (dirReady) rmSync(temp, { force: true })
    return false
  }
}

/**
 * Show the completion tip once on a terminal, after the command's own output.
 * Writes the machine-global config only when the tip is shown or retired.
 */
export async function offerCompletionTip(input: CompletionTipInput): Promise<CompletionTipOutcome> {
  if (input.env.OPENSPEC_NO_COMPLETIONS === '1' || ciSuppresses(input.env)) return 'suppressed'
  const configDir = globalConfigDir(input.env, input.home, input.platform)
  const configPath = join(configDir, 'config.json')
  const config = readRaw(configPath)
  if (config.kind === 'unreadable') return 'unreadable'
  if (config.value.completionTipSeen === true) return 'seen'
  // `help` and every hidden row (`__complete`, `check-commit`) are cospec's
  // machine or help entry points; `completion` is the shell setup itself.
  if (
    input.json ||
    input.hidden ||
    input.command === 'completion' ||
    input.command === 'help' ||
    !input.stderrIsTTY
  ) {
    return 'deferred'
  }
  const shell = await input.detectShell()
  if (shell === undefined || isCompletionInstalled(shell, input.env, input.home, input.platform)) {
    return recordSeen(configDir, configPath) ? 'retired' : 'unrecorded'
  }
  if (!recordSeen(configDir, configPath)) return 'unrecorded'
  input.stderr(`\n${MESSAGE}\n`)
  return 'shown'
}
