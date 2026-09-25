// `cospec context` (WI-3) — a disciplined passthrough of `openspec context`,
// the cross-repo working-set brief. Read-only: cospec adds no gate of its
// own, only wrapped-call discipline (declared exit codes, the one-JSON-doc
// invariant on `--json`) and one observable post-condition of its own — when
// `--code-workspace <path>` is requested and the wrapped call exits 0, the
// file must actually exist on disk afterward (never trust the exit code
// alone, per DESIGN §1).

import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { flagValue, hasFlag } from '../core/command-table.ts'
import { passthroughOpenspec } from '../core/openspec.ts'
import { resolveRoot } from '../core/root.ts'

export async function run(ctx: CommandContext): Promise<number> {
  const root = await resolveRoot(ctx)
  const parsed = ctx.parsed!
  const codeWorkspace = flagValue(parsed, '--code-workspace')
  const force = hasFlag(parsed, '--force')

  const args = ['context']
  if (codeWorkspace !== undefined) args.push('--code-workspace', codeWorkspace)
  if (force) args.push('--force')
  if (ctx.flags.json) args.push('--json')
  if (ctx.flags.noColor) args.push('--no-color')

  // openspec resolves a relative --code-workspace path against its own cwd,
  // which is root.cwd for every wrapped call cospec makes (§ Root contract).
  const workspacePath =
    codeWorkspace === undefined
      ? undefined
      : isAbsolute(codeWorkspace)
        ? codeWorkspace
        : join(root.cwd, codeWorkspace)

  const result = await passthroughOpenspec(args, {
    cwd: root.cwd,
    storeArgs: root.storeArgs,
    expect: {
      postCondition:
        workspacePath === undefined
          ? undefined
          : (res) =>
              res.exitCode !== 0 || existsSync(workspacePath)
                ? true
                : `openspec context reported success but did not write the expected ` +
                  `--code-workspace file at ${workspacePath}`,
    },
  })

  if (result.stdout.length > 0) process.stdout.write(result.stdout)
  if (result.stderr.length > 0) process.stderr.write(result.stderr)
  return result.exitCode === 0 ? EXIT.success : EXIT.failure
}
