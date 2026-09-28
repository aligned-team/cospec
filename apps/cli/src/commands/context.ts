// `cospec context` (WI-3) — a disciplined passthrough of `openspec context`,
// the cross-repo working-set brief. Read-only: cospec adds no gate of its
// own, only wrapped-call discipline (declared exit codes, the one-JSON-doc
// invariant on `--json`) and one observable post-condition of its own — when
// `--code-workspace <path>` is requested and the wrapped call exits 0, the
// file must actually exist on disk afterward (never trust the exit code
// alone, per DESIGN §1). A refusal's `openspec` remedies are spelled through
// cospec (`relayRespelled`).

import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { flagValue, hasFlag } from '../core/command-table.ts'
import { relayRespelled } from '../core/forward-relay.ts'
import { passthroughOpenspec, threadedArgv, wrappedCallLabel } from '../core/openspec.ts'
import { resolveRoot } from '../core/root.ts'

export async function run(ctx: CommandContext): Promise<number> {
  const root = await resolveRoot(ctx)
  const parsed = ctx.parsed!
  const codeWorkspace = flagValue(parsed, '--code-workspace')
  const force = hasFlag(parsed, '--force')

  const args: string[] = []
  if (codeWorkspace !== undefined) args.push('--code-workspace', codeWorkspace)
  if (force) args.push('--force')
  const threaded = [
    ...(ctx.flags.json ? ['--json'] : []),
    ...(ctx.flags.noColor ? ['--no-color'] : []),
    ...root.storeArgs,
  ]

  // openspec resolves a relative --code-workspace path against its own cwd,
  // which is root.cwd for every wrapped call cospec makes (§ Root contract).
  const workspacePath =
    codeWorkspace === undefined
      ? undefined
      : isAbsolute(codeWorkspace)
        ? codeWorkspace
        : join(root.cwd, codeWorkspace)

  const result = await passthroughOpenspec(
    { command: ['context'], threaded, args },
    {
      cwd: root.cwd,
      expect: {
        postCondition:
          workspacePath === undefined
            ? undefined
            : (res) =>
                res.exitCode !== 0 || existsSync(workspacePath)
                  ? true
                  : `${wrappedCallLabel(threadedArgv(['context'], threaded, args))} reported success but did ` +
                    `not write the expected ` +
                    `--code-workspace file at ${workspacePath}`,
      },
    },
  )

  return relayRespelled(result, ctx.flags.json)
}
