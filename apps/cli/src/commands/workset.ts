// `cospec workset <sub>` — disciplined passthrough of `openspec workset
// create|list|remove` plus a terminal-handover exec for `workset open` (WI-4).
// Worksets are purely local/personal working views (openspec 1.5.0) — unlike
// `store`/`context`, the wrapped `openspec workset` subcommands take no
// `--store` flag at all (verified against the pinned binary: `--store` is an
// "unknown option" here), so this command never threads `root.storeArgs` the
// way `passthrough-command.ts` does for root-scoped commands. `cospec` adds no
// gate of its own — every non-zero wrapped exit relays verbatim.

import { join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { extractEmbeddedOpenspec } from '../core/openspec-embedded.ts'
import { passthroughOpenspec, resolveOpenspec, spawnOpenspec } from '../core/openspec.ts'

const SUBCOMMANDS = ['create', 'list', 'ls', 'remove'] as const
type PassthroughSub = (typeof SUBCOMMANDS)[number]

function isPassthroughSub(sub: string): sub is PassthroughSub {
  return (SUBCOMMANDS as readonly string[]).includes(sub)
}

/**
 * Run `create`/`list`/`ls`/`remove` through `passthroughOpenspec`, threading
 * only `--json`/`--no-color` (never `--store` — see module header) and relaying
 * stdout/stderr verbatim. Mirrors `passthrough-command.ts`'s `runPassthrough`
 * but is reimplemented locally because that helper always threads
 * `root.storeArgs`, which `openspec workset` rejects outright.
 */
async function runWorksetPassthrough(
  ctx: CommandContext,
  sub: PassthroughSub,
  rest: string[],
): Promise<number> {
  const args = ['workset', sub, ...rest]
  if (ctx.flags.json) args.push('--json')
  if (ctx.flags.noColor) args.push('--no-color')
  const result = await passthroughOpenspec(args, { cwd: ctx.cwd })
  if (result.stdout.length > 0) process.stdout.write(result.stdout)
  if (result.stderr.length > 0) process.stderr.write(result.stderr)
  return result.exitCode === 0 ? EXIT.success : EXIT.failure
}

/**
 * Resolve the wrapped `openspec` binary the same way `core/openspec.ts`'s
 * private `openspecBin()` does, reusing only its exported primitives (this
 * module must not edit `core/openspec.ts` — that file is WI-1's territory).
 * `spawnOpenspec(['--version'], cwd)` triggers (and memoizes) the version
 * assertion every wrapped call owes before `workset open` hands the terminal
 * over — an inherited-stdio child that never returns machine-readable output
 * for this module to check.
 */
async function resolveWorksetOpenBin(cwd: string): Promise<string> {
  await spawnOpenspec(['--version'], cwd)
  const resolved = resolveOpenspec()
  return resolved.source === 'project'
    ? join(resolved.packageDir, 'bin', 'openspec.js')
    : extractEmbeddedOpenspec(resolved.version)
}

/**
 * `workset open` hands the terminal to the chosen tool (editor window / agent
 * session) — it is a handover exec, not a gated or JSON-checked call: inherit
 * stdio, `shell: false` (array argv, no shell interpolation), and propagate the
 * child's exact exit code. Never threads `--json`/`--no-color` — openspec's own
 * `workset open` rejects `--json` (`workset_open_json_unsupported`), and this
 * module deliberately never adds it either.
 */
async function runWorksetOpen(ctx: CommandContext, rest: string[]): Promise<number> {
  const bin = await resolveWorksetOpenBin(ctx.cwd)
  const proc = Bun.spawn([process.execPath, bin, 'workset', 'open', ...rest], {
    cwd: ctx.cwd,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, BUN_BE_BUN: '1', OPENSPEC_TELEMETRY: '0' },
  })
  return await proc.exited
}

export async function run(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.args
  if (sub === undefined) {
    process.stderr.write('cospec workset: a subcommand is required (create|list|remove|open)\n')
    return EXIT.failure
  }
  if (sub === 'open') return runWorksetOpen(ctx, rest)
  if (isPassthroughSub(sub)) return runWorksetPassthrough(ctx, sub, rest)
  process.stderr.write(`cospec workset: unknown subcommand '${sub}'\n`)
  return EXIT.failure
}
