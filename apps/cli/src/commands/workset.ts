// `cospec workset <sub>` — disciplined passthrough of `openspec workset
// create|list|remove` plus a terminal-handover exec for `workset open` (WI-4).
// Worksets are purely local/personal working views (added in openspec 1.5.0) — unlike
// `store`/`context`, the wrapped `openspec workset` subcommands take no
// `--store` flag at all (verified against the pinned binary: `--store` is an
// "unknown option" here), so this command never threads `root.storeArgs` the
// way `passthrough-command.ts` does for root-scoped commands. `cospec` adds no
// gate of its own — every non-zero wrapped exit is relayed, its remedies
// spelled through cospec.

import { statSync } from 'node:fs'
import { join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { commandRow, parseSubcommandArgs } from '../core/command-table.ts'
import {
  firstStatusCode,
  forwardCall,
  isParseRejection,
  prevalidateHandover,
  relayGroupRefusal,
  relayRespelled,
  subcommandOf,
} from '../core/forward-relay.ts'
import { extractEmbeddedOpenspec } from '../core/openspec-embedded.ts'
import { passthroughOpenspec, resolveOpenspec, spawnOpenspec } from '../core/openspec.ts'
import { respellLines } from '../core/remedies.ts'

const SUBCOMMANDS = ['create', 'list', 'ls', 'remove'] as const
type PassthroughSub = (typeof SUBCOMMANDS)[number]

function isPassthroughSub(sub: string): sub is PassthroughSub {
  return (SUBCOMMANDS as readonly string[]).includes(sub)
}

/**
 * The binary's next-step lines on a successful `workset create` and an empty
 * `workset list`: its only guidance there, with no document to respell
 * structurally, so each is spelled through cospec as a whole line (design D5).
 */
const NEXT_STEP_LINES = ['workset/open-any-time', 'workset/none-saved'] as const

/**
 * Run `create`/`list`/`ls`/`remove` through `passthroughOpenspec`, threading
 * only `--json`/`--no-color` (never `--store` — see module header). A failed
 * answer is relayed with its remedies spelled through cospec; a successful
 * one as the binary wrote it, but for its whole next-step lines. Mirrors `passthrough-command.ts`'s `runPassthrough`
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
  if (result.exitCode !== 0) return relayRespelled(result, ctx.flags.json)
  if (result.stdout.length > 0)
    process.stdout.write(
      ctx.flags.json ? result.stdout : respellLines(result.stdout, NEXT_STEP_LINES),
    )
  if (result.stderr.length > 0) process.stderr.write(result.stderr)
  return EXIT.success
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

/** What `workset open` reads from the terminal it may hand over. */
export interface WorksetTerminal {
  /** Whether the binary would prompt: its own `isInteractive()`, ported. */
  readonly interactive: boolean
}

/**
 * The binary's `isInteractive()` (`utils/interactive.js`), as the handed-over
 * child would compute it: `OPEN_SPEC_INTERACTIVE=0` or a `CI` variable turns
 * it off, and otherwise stdin must be a TTY.
 */
export function isWorksetOpenInteractive(
  env: Readonly<Record<string, string | undefined>> = process.env,
  stdinIsTTY: boolean = process.stdin.isTTY === true,
): boolean {
  if (env.OPEN_SPEC_INTERACTIVE === '0') return false
  if ('CI' in env) return false
  return stdinIsTTY
}

interface WorksetList {
  worksets: { name: string; members: { name: string; path: string }[] }[]
}

/**
 * The read-only pre-flight (design D8): whether the binary would refuse to
 * open `name` before launching anything — it is not saved, or none of its
 * member folders exists on this machine — read from `workset list --json`.
 */
async function openIsRefused(ctx: CommandContext, name: string): Promise<boolean> {
  const result = await passthroughOpenspec(
    { command: ['workset', 'list'], threaded: ['--json'] },
    {
      cwd: ctx.cwd,
      expect: {
        exitCodes: [0],
        postCondition: (res) => {
          let doc: Partial<WorksetList> | null
          try {
            doc = JSON.parse(res.stdout) as Partial<WorksetList> | null
          } catch (err) {
            if (err instanceof SyntaxError) return 'did not emit parseable JSON'
            throw err
          }
          return Array.isArray(doc?.worksets) || 'did not list a worksets[] array'
        },
      },
    },
  )
  const workset = (JSON.parse(result.stdout) as WorksetList).worksets.find((w) => w.name === name)
  if (workset === undefined) return true
  return !workset.members.some((member) => isDirectory(member.path))
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    if ((err as NodeJS.ErrnoException).code === 'ENOTDIR') return false
    throw err
  }
}

/**
 * `workset open` run piped: with no terminal to prompt on, or for a workset
 * the binary refuses before launching anything. Its answer is relayed with
 * its remedies spelled through cospec; with a saved or `--tool`
 * workspace-file tool the binary opens it from the pipe and exits 0, the
 * command doing its job.
 */
async function openPiped(ctx: CommandContext, rest: string[]): Promise<number> {
  const result = await forwardCall(() =>
    passthroughOpenspec(
      { command: ['workset', 'open'], args: rest },
      {
        cwd: ctx.cwd,
        expect: {
          exitCodes: [0, 1],
          postCondition: (res) =>
            (res.exitCode === 0 ? res.stdout.length > 0 : res.stderr.length > 0) ||
            `exited ${res.exitCode} without saying what it did`,
        },
      },
    ),
  )
  return relayRespelled(result, false)
}

/**
 * `workset open` hands the terminal to the chosen tool (editor window / agent
 * session) — a handover exec, not a gated or JSON-checked call: inherit
 * stdio, `shell: false` (array argv, no shell interpolation), and propagate the
 * child's exact exit code. Nothing the child prints there can be relayed, so
 * it is reached only once nothing the binary would refuse is left (design
 * D8), in commander's order: the argv's parse refusal (the table parser's,
 * text on stderr even under `--json`, `--store-path`'s redirect included);
 * `--json`, which the binary refuses (`refuseOpenJson`); no terminal to
 * prompt on, where the call runs piped; and the read-only pre-flight, where a
 * workset the binary would refuse is answered piped too.
 */
export async function runWorksetOpen(
  ctx: CommandContext,
  rest: string[],
  terminal: WorksetTerminal = { interactive: isWorksetOpenInteractive() },
): Promise<number> {
  const row = commandRow('workset')
  const open = row?.subcommands?.find((s) => s.name === 'open')
  if (row === undefined || open === undefined) throw new Error("cospec workset: no 'open' row")
  const refusal = prevalidateHandover(row, 'open', rest)
  if (refusal !== undefined) {
    process.stderr.write(refusal.message)
    return EXIT.failure
  }
  if (ctx.flags.json) return refuseOpenJson(ctx, rest)
  if (!terminal.interactive) return openPiped(ctx, rest)
  const parsed = parseSubcommandArgs(row, open, rest)
  const name = parsed.ok ? parsed.parsed.positionals[0] : undefined
  if (name === undefined) throw new Error('cospec workset open: a parsed argv named no workset')
  if (await openIsRefused(ctx, name)) return openPiped(ctx, rest)
  const bin = await resolveWorksetOpenBin(ctx.cwd)
  const proc = Bun.spawn([process.execPath, bin, 'workset', 'open', ...rest], {
    cwd: ctx.cwd,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    env: {
      ...process.env,
      BUN_BE_BUN: '1',
      OPENSPEC_TELEMETRY: '0',
      OPENSPEC_NO_COMPLETIONS: '1',
    },
  })
  return await proc.exited
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
