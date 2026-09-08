// `cospec completion [bash|zsh|fish]` — print the completion script for a
// shell to stdout. Generate-only by design: there is no `install`/`uninstall`
// subcommand, because rc-file mutation with backups and a matching uninstaller
// is a separate change, and because cospec must never write a line into a
// user's dotfiles that runs bare `openspec` (which is what relaying upstream's
// installer would do). The docs carry the per-shell copy-paste one-liner.

import { basename } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { renderBashCompletion } from '../core/completions/bash.ts'
import { renderFishCompletion } from '../core/completions/fish.ts'
import { buildCompletionSpec } from '../core/completions/spec.ts'
import { renderZshCompletion } from '../core/completions/zsh.ts'

export const SUPPORTED_SHELLS = ['bash', 'zsh', 'fish'] as const
export type SupportedShell = (typeof SUPPORTED_SHELLS)[number]

function isSupportedShell(name: string): name is SupportedShell {
  return (SUPPORTED_SHELLS as readonly string[]).includes(name)
}

/**
 * Detect the shell from `$SHELL`'s basename, stripping the leading `-` a login
 * shell carries. No `ps` fork: upstream probes the parent process, which is not
 * worth a spawn for a value the user can always pass explicitly.
 */
export function detectShell(shellEnv: string | undefined): SupportedShell | undefined {
  if (shellEnv === undefined || shellEnv.length === 0) return undefined
  const name = basename(shellEnv).replace(/^-/, '')
  return isSupportedShell(name) ? name : undefined
}

/** Render the completion script for one shell from cospec's own command table. */
export function renderCompletion(shell: SupportedShell): string {
  const spec = buildCompletionSpec()
  if (shell === 'bash') return renderBashCompletion(spec)
  if (shell === 'zsh') return renderZshCompletion(spec)
  return renderFishCompletion(spec)
}

export function run(ctx: CommandContext): number {
  // A shell script is not a JSON document, so `--json` is refused rather than
  // faked — but the refusal is still exactly one JSON document on stdout, which
  // is what a `--json` caller is entitled to.
  if (ctx.flags.json) {
    process.stdout.write(
      `${JSON.stringify({
        version: 1,
        command: 'completion',
        ok: false,
        message: 'cospec completion emits a shell script and cannot emit JSON',
      })}\n`,
    )
    return EXIT.failure
  }

  const requested = ctx.args[0]
  if (requested !== undefined && !isSupportedShell(requested)) {
    process.stderr.write(
      `cospec completion: unsupported shell '${requested}' ` +
        `(supported: ${SUPPORTED_SHELLS.join(', ')})\n`,
    )
    return EXIT.failure
  }

  const shell = requested ?? detectShell(process.env.SHELL)
  if (shell === undefined) {
    process.stderr.write(
      'cospec completion: could not detect the shell from $SHELL — ' +
        `run 'cospec completion <${SUPPORTED_SHELLS.join('|')}>'\n`,
    )
    return EXIT.failure
  }

  process.stdout.write(renderCompletion(shell))
  return EXIT.success
}
