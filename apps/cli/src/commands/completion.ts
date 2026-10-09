// `cospec completion [bash|zsh|fish|powershell]` prints the completion script
// for a shell to stdout (and writes nothing). `completion install [shell]
// [--verbose]` writes that same script to the shell's completions location and
// wires the shell to load it; `completion uninstall [shell] [-y]` removes both.
// The installed script is `renderCompletion()`'s output byte for byte, so the
// installed lines call cospec by construction. The file layout, the rc-file
// edit and its exact inverse live in core/completions/install.ts, and this
// module is only the shell resolver, the prompt and the words.
//
// cospec never relays upstream's installer: it writes bare `openspec` into a
// user's dotfiles, and its names and markers would collide with this one's.

import { homedir } from 'node:os'
import { basename, dirname } from 'node:path'
import { createInterface } from 'node:readline'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { hasFlag, jsonRefusal } from '../core/command-table.ts'
import { renderBashCompletion } from '../core/completions/bash.ts'
import { renderFishCompletion } from '../core/completions/fish.ts'
import {
  CompletionInstallError,
  type InstallContext,
  type InstallResult,
  installCompletion,
  reloadCommand,
  resolveTarget,
  type UninstallResult,
  uninstallCompletion,
} from '../core/completions/install.ts'
import { renderPowerShellCompletion } from '../core/completions/powershell.ts'
import { buildCompletionSpec } from '../core/completions/spec.ts'
import { renderZshCompletion } from '../core/completions/zsh.ts'

export const SUPPORTED_SHELLS = ['bash', 'zsh', 'fish', 'powershell'] as const
export type SupportedShell = (typeof SUPPORTED_SHELLS)[number]

export type CompletionOperation = 'generate' | 'install' | 'uninstall'

type Env = Readonly<Record<string, string | undefined>>

function isSupportedShell(name: string): name is SupportedShell {
  return (SUPPORTED_SHELLS as readonly string[]).includes(name)
}

/**
 * Detect the shell from `$SHELL`'s basename, stripping the leading `-` a login
 * shell carries; with `$SHELL` unset, a set `PSModulePath` means PowerShell.
 * No `ps` fork: upstream probes the parent process, which is not worth a spawn
 * for a value the user can always pass explicitly.
 */
export function detectShell(
  shellEnv: string | undefined,
  psModulePath?: string,
): SupportedShell | undefined {
  if (shellEnv === undefined || shellEnv.length === 0) {
    return psModulePath !== undefined && psModulePath.length > 0 ? 'powershell' : undefined
  }
  const name = basename(shellEnv).replace(/^-/, '')
  return isSupportedShell(name) ? name : undefined
}

/**
 * The shell an operation acts on: the argument read case-insensitively, else
 * the environment's. A refusal names the supported shells and the explicit form
 * of the operation that was asked.
 */
export function resolveShell(
  operation: CompletionOperation,
  requested: string | undefined,
  env: Env,
): { shell: SupportedShell } | { error: string } {
  const form = operation === 'generate' ? 'cospec completion' : `cospec completion ${operation}`
  const supported = SUPPORTED_SHELLS.join(', ')
  const normalized = requested?.toLowerCase()
  if (normalized !== undefined) {
    if (isSupportedShell(normalized)) return { shell: normalized }
    return { error: `${form}: unsupported shell '${normalized}' (supported: ${supported})` }
  }
  const detected = detectShell(env.SHELL, env.PSModulePath)
  if (detected !== undefined) return { shell: detected }
  return {
    error:
      `${form}: could not detect the shell from $SHELL — ` +
      `run '${form} <${SUPPORTED_SHELLS.join('|')}>' (supported: ${supported})`,
  }
}

/** Render the completion script for one shell from cospec's own command table. */
export function renderCompletion(shell: SupportedShell): string {
  const spec = buildCompletionSpec()
  if (shell === 'bash') return renderBashCompletion(spec)
  if (shell === 'zsh') return renderZshCompletion(spec)
  if (shell === 'powershell') return renderPowerShellCompletion(spec)
  return renderFishCompletion(spec)
}

export interface CompletionDeps extends Pick<
  InstallContext,
  'platform' | 'now' | 'bashCompletionDirs'
> {
  readonly env?: Env
  readonly home?: string
  /** Default: whether `process.stdin` is a terminal. */
  readonly stdinIsTTY?: boolean
  /** Default: a `readline` question on the terminal. */
  readonly ask?: (question: string) => Promise<string>
}

export interface CommandOutcome {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

function installContext(deps: CompletionDeps): InstallContext {
  return {
    env: deps.env ?? process.env,
    home: deps.home ?? homedir(),
    ...(deps.platform !== undefined ? { platform: deps.platform } : {}),
    ...(deps.now !== undefined ? { now: deps.now } : {}),
    ...(deps.bashCompletionDirs !== undefined
      ? { bashCompletionDirs: deps.bashCompletionDirs }
      : {}),
  }
}

function askOnTerminal(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    // Resolve before closing: `close()` fires the listener below, which would
    // otherwise settle the promise with '' first and reject every answer.
    rl.question(question, (answer) => {
      resolve(answer)
      rl.close()
    })
    // A closed stdin (Ctrl-D) is a "no", not a hang.
    rl.once('close', () => resolve(''))
  })
}

const SHELL_LABELS: Readonly<Record<SupportedShell, string>> = {
  bash: 'Bash',
  zsh: 'Zsh',
  fish: 'Fish',
  powershell: 'PowerShell',
}

const RC_LABELS: Readonly<Record<SupportedShell, string>> = {
  bash: '.bashrc',
  zsh: '.zshrc',
  fish: '',
  powershell: 'PowerShell profile',
}

function fpathGuidance(dir: string): string[] {
  const quoted = `'${dir.replace(/'/g, `'\\''`)}'`
  return [
    'Note: Oh My Zsh typically auto-loads completions from custom/completions.',
    `Verify that ${dir} is in your fpath by running:`,
    `  printf '%s\\n' $fpath | grep -F ${quoted}`,
    '',
    'If not found, completions may not work. Restart your shell to ensure changes take effect.',
  ]
}

function installMessage(result: InstallResult, wired: boolean, rcWritten: boolean): string {
  if (result.status === 'unchanged') {
    return rcWritten
      ? `Completion script is up to date and ${RC_LABELS[result.shell]} configured successfully`
      : 'Completion script is already installed (up to date)'
  }
  if (result.status === 'updated') {
    return result.backupPath === undefined
      ? 'Completion script updated successfully'
      : 'Completion script updated successfully (previous version backed up)'
  }
  if (result.ohMyZsh) return 'Completion script installed successfully for Oh My Zsh'
  if (wired)
    return `Completion script installed and ${RC_LABELS[result.shell]} configured successfully`
  return `Completion script installed successfully for ${SHELL_LABELS[result.shell]}`
}

/** The lines to add by hand to an rc file that was not edited. */
function manualInstructions(result: InstallResult): string[] {
  const lines = [`Completion script installed to ${result.scriptPath}`]
  for (const rc of result.rc) {
    if (rc.status !== 'disabled' && rc.status !== 'failed') continue
    lines.push(
      '',
      `To enable completions, add the following to ${rc.path}:`,
      '',
      ...rc.block.map((line) => `  ${line}`),
    )
  }
  lines.push('', `Then restart your shell or run: ${reloadCommand(result.shell)}`)
  return lines
}

function formatInstall(result: InstallResult, verbose: boolean): CommandOutcome {
  const wired = result.rc.some((rc) => rc.status === 'configured' || rc.status === 'unchanged')
  // An up-to-date script does not mean an untouched rc file: a block the user
  // removed is written back, and that edit is reported even without --verbose.
  const rcWritten = result.rc.some((rc) => rc.status === 'configured')
  const out: string[] = [`✓ ${installMessage(result, wired, rcWritten)}`]
  if (verbose) {
    out.push(`  Installed to: ${result.scriptPath}`)
    if (result.backupPath !== undefined) out.push(`  Backup created: ${result.backupPath}`)
  }
  if (verbose || (result.status === 'unchanged' && rcWritten)) {
    for (const rc of result.rc)
      if (rc.status === 'configured') out.push(`  ${rc.path} configured automatically`)
  }
  if (result.warnings.length > 0) out.push('', ...result.warnings)

  const reload = reloadCommand(result.shell)
  if (result.shell === 'fish') {
    // Fish autoloads its completions directory: there is nothing to restart.
    out.push(
      '',
      ...(result.status === 'unchanged'
        ? [
            'The completion script is already installed and up to date.',
            'Fish automatically loads completions - they should be available immediately.',
          ]
        : [
            'Fish automatically loads completions from ~/.config/fish/completions/',
            'Completions are available immediately - no shell restart needed.',
          ]),
    )
  } else if (result.status === 'unchanged' && !rcWritten && (wired || result.rc.length === 0)) {
    out.push(
      '',
      'The completion script is already installed and up to date.',
      `If completions are not working, try: ${reload}`,
    )
  } else if (result.rc.length > 0 && !wired) {
    out.push('', ...manualInstructions(result))
  } else {
    out.push('', `Restart your shell or run: ${reload}`)
    if (result.ohMyZsh) {
      out.push('', ...fpathGuidance(dirname(result.scriptPath)))
    }
  }

  const stderr = result.rc
    .filter((rc) => rc.status === 'failed')
    .map((rc) => `Warning: could not configure ${rc.reason}\n`)
    .join('')
  return { stdout: `${out.join('\n')}\n`, stderr, exitCode: EXIT.success }
}

/** `completion install`: write the script, wire the shell, report both. */
export function runInstall(
  shell: SupportedShell,
  verbose: boolean,
  deps: CompletionDeps = {},
): Promise<CommandOutcome> {
  try {
    const result = installCompletion(shell, renderCompletion(shell), installContext(deps))
    return Promise.resolve(formatInstall(result, verbose))
  } catch (error) {
    if (error instanceof CompletionInstallError)
      return Promise.resolve({ stdout: '', stderr: `✗ ${error.message}\n`, exitCode: EXIT.failure })
    throw error
  }
}

function formatUninstall(result: UninstallResult): CommandOutcome {
  const parts: string[] = []
  if (result.scriptRemoved) parts.push(`Completion script removed from ${result.scriptPath}`)
  for (const rc of result.rc)
    if (rc.status === 'removed') parts.push(`Removed cospec configuration from ${rc.path}`)
  const failures = result.rc.filter((rc) => rc.status === 'failed')
  if (parts.length === 0 && failures.length === 0) {
    return { stdout: '', stderr: '✗ Completion script is not installed\n', exitCode: EXIT.failure }
  }
  return {
    stdout: parts.length > 0 ? `✓ ${parts.join('. ')}\n` : '',
    stderr: failures.map((rc) => `✗ ${rc.reason}\n`).join(''),
    exitCode: failures.length > 0 ? EXIT.failure : EXIT.success,
  }
}

/**
 * `completion uninstall`: remove the script and the rc block after a
 * confirmation. Without `-y` and without a terminal it refuses rather than
 * read an answer from whatever happens to be piped in.
 */
export async function runUninstall(
  shell: SupportedShell,
  yes: boolean,
  deps: CompletionDeps = {},
): Promise<CommandOutcome> {
  const ctx = installContext(deps)
  if (!yes) {
    if (!(deps.stdinIsTTY ?? process.stdin.isTTY === true)) {
      return {
        stdout: '',
        stderr:
          '✗ cospec completion uninstall needs a terminal to confirm: ' +
          'pass -y to remove without asking\n',
        exitCode: EXIT.failure,
      }
    }
    const { rcFiles } = resolveTarget(shell, ctx)
    const subject =
      rcFiles.length > 0
        ? `completion script and its ${rcFiles.join(' and ')} block`
        : 'completion script'
    const answer = await (deps.ask ?? askOnTerminal)(`Remove cospec's ${subject}? (y/N) `)
    if (!['y', 'yes'].includes(answer.trim().toLowerCase())) {
      return { stdout: 'Uninstall cancelled.\n', stderr: '', exitCode: EXIT.success }
    }
  }
  try {
    return formatUninstall(uninstallCompletion(shell, ctx))
  } catch (error) {
    if (error instanceof CompletionInstallError)
      return { stdout: '', stderr: `✗ ${error.message}\n`, exitCode: EXIT.failure }
    throw error
  }
}

function emit(outcome: CommandOutcome): number {
  if (outcome.stdout.length > 0) process.stdout.write(outcome.stdout)
  if (outcome.stderr.length > 0) process.stderr.write(outcome.stderr)
  return outcome.exitCode
}

export async function run(ctx: CommandContext, deps: CompletionDeps = {}): Promise<number> {
  // A shell script is not a JSON document, so `--json` is refused rather than
  // faked — but the refusal is still exactly one JSON document on stdout, which
  // is what a `--json` caller is entitled to. `cli.ts` already answers this
  // before the module loads (the row is `json: 'refused'`); kept here too so
  // a direct call to `run()` gets the same one-document refusal.
  if (ctx.flags.json) {
    process.stdout.write(
      jsonRefusal('completion', 'cospec completion emits a shell script and cannot emit JSON'),
    )
    return EXIT.failure
  }

  const parsed = ctx.parsed!
  const operation: CompletionOperation =
    parsed.subcommand === 'install' || parsed.subcommand === 'uninstall'
      ? parsed.subcommand
      : 'generate'

  // `completion [shell]` and upstream's `completion generate [shell]` alike:
  // the parser hands either spelling's `[shell]` over as the first positional.
  const resolved = resolveShell(operation, parsed.positionals[0], deps.env ?? process.env)
  if ('error' in resolved) {
    process.stderr.write(`${resolved.error}\n`)
    return EXIT.failure
  }

  if (operation === 'install')
    return emit(await runInstall(resolved.shell, hasFlag(parsed, '--verbose'), deps))
  if (operation === 'uninstall')
    return emit(await runUninstall(resolved.shell, hasFlag(parsed, '--yes'), deps))

  process.stdout.write(renderCompletion(resolved.shell))
  return EXIT.success
}
