// `cospec workset <sub>` — disciplined passthrough of `openspec workset
// create|list|remove` plus a terminal-handover exec for `workset open` (WI-4).
// Worksets are purely local/personal working views (added in openspec 1.5.0) — unlike
// `store`/`context`, the wrapped `openspec workset` subcommands take no
// `--store` flag at all (verified against the pinned binary: `--store` is an
// "unknown option" here), so this command never threads `root.storeArgs` the
// way `passthrough-command.ts` does for root-scoped commands. `cospec` adds no
// gate of its own — every non-zero wrapped exit relays verbatim.

import { join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { commandRow, storePathInOptionPosition, storePathRefusal } from '../core/command-table.ts'
import {
  forwardCall,
  isParseRejection,
  relayGroupRefusal,
  relayRespelled,
  relayStorePathRefusal,
  subcommandOf,
} from '../core/forward-relay.ts'
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
  const threaded = [
    ...(ctx.flags.json ? ['--json'] : []),
    ...(ctx.flags.noColor ? ['--no-color'] : []),
  ]
  const result = await forwardCall(() =>
    passthroughOpenspec({ command: ['workset', sub], threaded, args: rest }, { cwd: ctx.cwd }),
  )
  const refused = relayStorePathRefusal(result, ctx.flags.json)
  if (refused !== undefined) return refused
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
 * child's exact exit code. Under `--json` it never hands over: the binary has
 * no JSON mode for `open` and refuses it (`refuseOpenJson`).
 *
 * The handover class's one pre-spawn `--store-path` check (design decision
 * 2): with inherited stdio the binary's redirect would reach the terminal
 * naming bare `openspec`, with nothing to respell, so a `--store-path` in
 * option position is answered with cospec's redirect without spawning.
 */
async function runWorksetOpen(ctx: CommandContext, rest: string[]): Promise<number> {
  const row = commandRow('workset')
  const open = row?.subcommands?.find((s) => s.name === 'open')
  if (row === undefined || open === undefined) throw new Error("cospec workset: no 'open' row")
  if (storePathInOptionPosition([row, open], rest)) {
    // Upstream declares no `--store-path` here: commander's refusal precedes
    // any output, so it is text even under `--json`.
    const refusal = storePathRefusal(false)
    process[refusal.stream].write(refusal.text)
    return EXIT.failure
  }
  if (ctx.flags.json) return refuseOpenJson(ctx, rest)
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

/** `status[0].code` of a one-document answer, or undefined for any other stdout. */
function firstStatusCode(stdout: string): string | undefined {
  let doc: unknown
  try {
    doc = JSON.parse(stdout)
  } catch (err) {
    if (err instanceof SyntaxError) return undefined
    throw err
  }
  const status = (doc as { status?: unknown } | null)?.status
  const code = Array.isArray(status)
    ? (status[0] as { code?: unknown } | undefined)?.code
    : undefined
  return typeof code === 'string' ? code : undefined
}

/**
 * `workset open` under `--json` (design D2): the binary refuses the mode
 * before it reads a workset, so the call runs piped, never handed over, and
 * its one refusal document is relayed — or, first, commander's refusal of the
 * argv (`missing required argument 'name'`), as the binary gives it.
 */
async function refuseOpenJson(ctx: CommandContext, rest: string[]): Promise<number> {
  const result = await forwardCall(() =>
    passthroughOpenspec(
      { command: ['workset', 'open'], threaded: ['--json'], args: rest },
      {
        cwd: ctx.cwd,
        expect: {
          exitCodes: [1],
          postCondition: (res) =>
            isParseRejection(res) ||
            firstStatusCode(res.stdout) === 'workset_open_json_unsupported' ||
            'did not refuse --json with workset_open_json_unsupported',
        },
      },
    ),
  )
  return relayRespelled(result, true)
}

export async function run(ctx: CommandContext): Promise<number> {
  const { sub, rest, operand } = subcommandOf(ctx.args)
  if (sub === 'open' && !operand) return runWorksetOpen(ctx, rest)
  if (sub !== undefined && !operand && isPassthroughSub(sub))
    return runWorksetPassthrough(ctx, sub, rest)
  // No subcommand, an unknown one, an option, or a token after `--`: the
  // binary's own refusal (text, or its one document under `--json`).
  return relayGroupRefusal(ctx, 'workset', ctx.args)
}
