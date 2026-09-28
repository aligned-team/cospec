// `cospec config <sub>` — the machine-global OpenSpec configuration surface
// (`~/.config/openspec/config.json`). cospec adds no gate and no config file of
// its own: it never reads or writes that file directly, and never re-implements
// upstream's key validation, value coercion, or its prototype-pollution guard —
// every such error relays from the wrapped binary, its remedies spelled through cospec.
//
// This command does NOT use `core/passthrough-command.ts`, for three verified
// reasons (the `workset.ts` precedent):
//   1. `openspec config` has no `--store` — it has `--scope`, and it is
//      machine-global, so `resolveRoot`/`root.storeArgs` never apply.
//   2. `--json` exists on `config list` only — upstream rejects it outright on
//      `config path`/`get`/`set`/`unset`/`reset` (verified against the pinned
//      1.11.0 binary: `openspec config path --json` -> `error: unknown option
//      '--json'`, exit 1). cospec still owes a `--json` caller exactly one JSON
//      document, so the other subcommands get a cospec-owned envelope built
//      from the text run.
//   3. `--no-color` is declared on the openspec *program*, not on the `config`
//      leaf. Commander does resolve it from the parent, so a trailing
//      `--no-color` is in fact ACCEPTED on 1.11.0's config leaves — it is
//      simply redundant, because `core/openspec.ts` already prefixes
//      `--no-color` before the subcommand on every wrapped spawn. This module
//      therefore never appends it: not to dodge an error, but so the built argv
//      carries nothing the wrapped call did not need.
//
// Two call classes:
//   A. piped + disciplined (`passthroughOpenspec`): path, list, get, set,
//      unset, `reset --all -y`, `profile <preset>`. Exit 1 is an ordinary
//      negative result here (unset key, invalid key, invalid config), not a
//      wrapped-call violation.
//   B. terminal handover (inherited stdio, exit code propagated verbatim,
//      version-asserted first — the `workset open` pattern): `edit` (spawns
//      $EDITOR), `profile` with no preset (inquirer menus behind an isTTY
//      check), and `reset --all` without `-y` (inquirer confirm). cospec's
//      piped spawn uses `stdin: 'ignore'`, so all three would hang or
//      mis-report. Class B propagates 130 (prompt cancellation) unchanged and
//      enforces no `RunExpectation` — the documented handover exception —
//      but first refuses what the binary would refuse (`runHandover`).
//      `profile` with no TTY on stdout runs piped instead.

import { join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { commandHelpText, EXIT } from '../cli.ts'
import { commandRow } from '../core/command-table.ts'
import {
  forwardCall,
  isOptionToken,
  isParseRejection,
  prevalidateHandover,
  relayCommandLevel,
  relayRespelled,
  relayStorePathRefusal,
  subcommandOf,
} from '../core/forward-relay.ts'
import { preloadedArgv } from '../core/handover-preload.ts'
import { extractEmbeddedOpenspec } from '../core/openspec-embedded.ts'
import {
  type OpenspecResult,
  passthroughOpenspec,
  resolveOpenspec,
  type RunExpectation,
  spawnOpenspec,
  threadedArgv,
  type WrappedCall,
} from '../core/openspec.ts'
import { REMEDIES, respellLines, respellRemedies } from '../core/remedies.ts'

/** The eight subcommands upstream's `config` command defines. */
export const CONFIG_SUBCOMMANDS = [
  'path',
  'list',
  'get',
  'set',
  'unset',
  'reset',
  'edit',
  'profile',
] as const

export type ConfigSub = (typeof CONFIG_SUBCOMMANDS)[number]

function isConfigSub(name: string): name is ConfigSub {
  return (CONFIG_SUBCOMMANDS as readonly string[]).includes(name)
}

/** A planned wrapped call: piped+disciplined (A) or terminal handover (B). */
export interface ConfigCall {
  kind: 'pass' | 'handover'
  sub: ConfigSub
  /** The wrapped call: `config [--scope <s>] <sub>`, threaded `--json`, `subArgs`. */
  wrapped: WrappedCall
  /** Full argv for the wrapped binary, `config` first (`threadedArgv` of `wrapped`). */
  argv: string[]
  /** The subcommand's own args, with `--scope` already removed. */
  subArgs: string[]
}

export interface ConfigPlanError {
  kind: 'error'
  message: string
}

/**
 * An option where the subcommand belongs (`config --bogus path`): the binary
 * refuses it at the `config` level, so the call is relayed as-is.
 */
export interface ConfigCommandLevel {
  kind: 'command-level'
  /** `config` plus the lifted `--scope <s>`. */
  command: string[]
  args: string[]
}

/**
 * No subcommand and no `--json`: the binary prints its own `config` help on
 * stderr and exits 1, and that help names bare `openspec`, so cospec prints
 * its own (design D7).
 */
export interface ConfigHelp {
  kind: 'help'
}

export type ConfigPlan = ConfigCall | ConfigCommandLevel | ConfigHelp | ConfigPlanError

const SUBS = CONFIG_SUBCOMMANDS.join('|')

/** First non-flag token, i.e. the subcommand's first positional. */
function firstPositional(args: string[]): string | undefined {
  return args.find((a) => !a.startsWith('-'))
}

/**
 * Plan the wrapped call for `cospec config …` (pure, unit-testable).
 *
 * Rules: `--scope <v>` is a parent-command option, so it is lifted out of
 * wherever the caller typed it before any `--` and re-emitted in its canonical position,
 * between `config` and the subcommand. (Commander resolves it from the leaf
 * too on 1.11.0, so this is normalization, not a workaround — it keeps one
 * argv shape for every input.) Any value but `global` is upstream's error to
 * print, not cospec's to second-guess. `--json` is threaded only for `list`,
 * right after the subcommand and ahead of the user's argv. `--no-color` and
 * `root.storeArgs` are never threaded (module header).
 */
export function planConfigCall(args: string[], opts: { json: boolean }): ConfigPlan {
  let scope: string | undefined
  const rest: string[] = []
  for (let i = 0; i < args.length; i++) {
    const tok = args[i]!
    // Past a `--` every token is an operand, `--scope` included.
    if (tok === '--') {
      rest.push(...args.slice(i))
      break
    }
    if (tok === '--scope') {
      const value = args[++i]
      if (value === undefined)
        return {
          kind: 'error',
          message: "cospec config: option '--scope <scope>' argument missing",
        }
      scope = value
      continue
    }
    if (tok.startsWith('--scope=')) {
      scope = tok.slice('--scope='.length)
      continue
    }
    rest.push(tok)
  }

  const { sub, rest: subArgs, operand } = subcommandOf(rest)
  const scopeArgs = scope === undefined ? [] : ['--scope', scope]
  // Upstream's `config` level declares no `--json`, so under `--json` the
  // binary's own refusal of it is relayed.
  if (sub === undefined)
    return opts.json
      ? { kind: 'command-level', command: ['config', ...scopeArgs], args: ['--json'] }
      : { kind: 'help' }
  if (!operand && isOptionToken(sub))
    return { kind: 'command-level', command: ['config', ...scopeArgs], args: rest }
  if (!isConfigSub(sub))
    return { kind: 'error', message: `cospec config: unknown subcommand '${sub}' (${SUBS})` }

  const threaded = opts.json && sub === 'list' ? ['--json'] : []
  const wrapped: WrappedCall = { command: ['config', ...scopeArgs, sub], threaded, args: subArgs }
  const argv = threadedArgv(wrapped.command, threaded, subArgs)
  return { kind: isHandoverCall(sub, subArgs) ? 'handover' : 'pass', sub, wrapped, argv, subArgs }
}

/**
 * True when the subcommand takes the terminal over upstream: `edit` execs
 * $EDITOR with inherited stdio; `profile` with no preset runs inquirer menus;
 * `reset --all` without `-y`/`--yes` runs an inquirer confirm. (`reset` with no
 * `--all` is an upstream usage error and stays piped.)
 */
export function isHandoverCall(sub: ConfigSub, subArgs: string[]): boolean {
  if (sub === 'edit') return true
  if (sub === 'profile') return firstPositional(subArgs) === undefined
  if (sub === 'reset')
    return subArgs.includes('--all') && !subArgs.includes('-y') && !subArgs.includes('--yes')
  return false
}

/** cospec-owned `--json` envelope for the subcommands upstream has no `--json` for. */
function jsonEnvelope(body: Record<string, unknown>): string {
  return `${JSON.stringify(body)}\n`
}

/**
 * The two precedence notes (stderr, so a `--json` stdout stays exactly one
 * document). Printed only after a successful mutation.
 */
export function precedenceNotes(sub: ConfigSub, subArgs: string[]): string[] {
  const notes: string[] = []
  const key = sub === 'set' ? firstPositional(subArgs) : undefined
  if (key === 'telemetry.enabled')
    notes.push(
      'note: cospec forces OPENSPEC_TELEMETRY=0 on every wrapped call — this setting affects ' +
        "bare 'openspec' runs only.",
    )
  if (sub === 'profile' || key === 'profile' || key === 'workflows' || key === 'delivery')
    notes.push(
      "note: cospec's harness files are generated from cospec canon — run 'cospec update', not " +
        "'openspec update'.",
    )
  return notes
}

/**
 * The declared expectation for every Class A call. `exitCodes` is stated
 * explicitly rather than inherited from `passthroughOpenspec`'s default so the
 * discipline is visible at the call site: upstream exits 1 for an ordinary
 * negative result (unset key, unknown key, invalid stored config), which is a
 * result to relay, not a wrapped-call violation — anything else is.
 *
 * The deny-list guards the two first-run notices openspec can print to STDOUT
 * ahead of real output. `WRAPPED_ENV` suppresses both (`OPENSPEC_TELEMETRY=0`,
 * `OPENSPEC_NO_COMPLETIONS=1`); this makes a regression in that suppression a
 * loud failure instead of a corrupted `config path` or `config get` value.
 */
const CONFIG_EXPECT: RunExpectation = {
  exitCodes: [0, 1],
  denyStdout: [/collects anonymous usage/i, /completion install/i],
}

/** `config profile <preset>`'s one next step: the binary's line, spelled whole. */
const PROFILE_NEXT_STEP = ['config/profile-applied'] as const

/**
 * Class A: piped, disciplined. `exitCodes` is the passthrough default `[0, 1]`;
 * a `--json` caller gets exactly one document either way — upstream's own for
 * `list` (one-doc-enforced by `passthroughOpenspec`), a cospec-owned
 * `version: 1` envelope for the rest, whose `value`/`message` is the raw text
 * upstream printed (upstream renders objects as compact JSON and scalars via
 * `String`, so cospec cannot recover the type without duplicating its merge
 * logic — read `config list --json` for typed values).
 */
async function runPiped(ctx: CommandContext, call: ConfigCall): Promise<number> {
  const result = await forwardCall(() =>
    passthroughOpenspec(call.wrapped, { cwd: ctx.cwd, expect: CONFIG_EXPECT }),
  )
  // Ahead of the cospec-owned envelopes: the binary's `--store-path` refusal
  // is answered with cospec's redirect, and commander's parse rejection
  // relayed as the binary printed it (text, before any output, as commander
  // refuses), never rendered as a `path`, `value` or `message`.
  const refused = relayStorePathRefusal(result, ctx.flags.json)
  if (refused !== undefined) return refused
  if (isParseRejection(result)) {
    process.stderr.write(result.stderr)
    return EXIT.failure
  }
  const ok = result.exitCode === 0
  // A failed answer's remedies are spelled through cospec; a successful one is
  // the binary's (a value the user stored, a path), but for `profile
  // <preset>`'s whole next-step line (design D5).
  const stdout = ok
    ? call.sub === 'profile'
      ? respellLines(result.stdout, PROFILE_NEXT_STEP)
      : result.stdout
    : respellRemedies(result.stdout)
  const stderr = ok ? result.stderr : respellRemedies(result.stderr)
  const out = stdout.trim()

  if (!ctx.flags.json) {
    if (stdout.length > 0) process.stdout.write(stdout)
    if (stderr.length > 0) process.stderr.write(stderr)
  } else if (call.sub === 'list') {
    process.stdout.write(stdout)
    if (stderr.length > 0) process.stderr.write(stderr)
  } else if (call.sub === 'path') {
    process.stdout.write(jsonEnvelope({ version: 1, command: 'config path', path: out }))
  } else if (call.sub === 'get') {
    process.stdout.write(
      jsonEnvelope({
        version: 1,
        command: 'config get',
        key: firstPositional(call.subArgs) ?? null,
        value: ok ? out : null,
        found: ok,
      }),
    )
  } else {
    const message = out.length > 0 ? out : stderr.trim()
    process.stdout.write(
      jsonEnvelope({
        version: 1,
        command: `config ${call.sub}`,
        ok,
        message: message.length > 0 ? message : null,
      }),
    )
  }

  if (ok)
    for (const note of precedenceNotes(call.sub, call.subArgs)) process.stderr.write(`${note}\n`)
  return ok ? EXIT.success : EXIT.failure
}

/**
 * Resolve the wrapped binary the way `core/openspec.ts`'s private
 * `openspecBin()` does, reusing only its exported primitives. The
 * `spawnOpenspec(['--version'])` call triggers (and memoizes) the version
 * assertion every wrapped call owes before the handover child takes the
 * terminal — same as `workset open`.
 */
async function resolveHandoverBin(cwd: string): Promise<string> {
  await spawnOpenspec(['--version'], cwd)
  const resolved = resolveOpenspec()
  return resolved.source === 'project'
    ? join(resolved.packageDir, 'bin', 'openspec.js')
    : extractEmbeddedOpenspec(resolved.version)
}

/** What a `config` handover leaf reads from the terminal it may hand over. */
export interface ConfigTerminal {
  /** `config profile`'s own interactivity test: its stdout is a TTY. */
  readonly stdoutIsTTY: boolean
}

/** The binary's text for an allowlist entry, as it prints it (no holes). */
function upstreamSentence(id: string): string {
  const remedy = REMEDIES.find((r) => r.id === id)
  if (remedy === undefined) throw new Error(`cospec config: no allowlist entry '${id}'`)
  return remedy.upstream
}

/**
 * What a piped `config profile` answered: the binary's refusal for an
 * unreadable global config (`config/invalid-file`), or, with a readable one,
 * its interactive-mode-required refusal (stdout is a pipe) — or neither,
 * which is not an answer that call gives.
 */
function profileAnswer(result: OpenspecResult): 'unreadable' | 'interactive' | undefined {
  if (result.exitCode !== 1 || result.stdout.length > 0) return undefined
  const lines = result.stderr.split('\n')
  if (lines.includes(upstreamSentence('config/invalid-file'))) return 'unreadable'
  if (lines.includes(upstreamSentence('config/profile-interactive-required'))) return 'interactive'
  return undefined
}

/**
 * `config profile` with no preset run piped, read-only: with no preset the
 * binary refuses an unreadable config first and, its stdout not a TTY, then
 * refuses to prompt — it writes nothing either way.
 */
function profilePiped(ctx: CommandContext, call: ConfigCall): Promise<OpenspecResult> {
  return passthroughOpenspec(call.wrapped, {
    cwd: ctx.cwd,
    expect: {
      exitCodes: [1],
      denyStdout: CONFIG_EXPECT.denyStdout,
      postCondition: (res) =>
        profileAnswer(res) !== undefined ||
        'answered neither an unreadable config nor the interactive-mode refusal',
    },
  })
}

/**
 * Class B: hand the terminal over (array argv, no shell, inherited stdio) and
 * propagate the child's exit code verbatim — including 130 on prompt
 * cancellation. The argv is exactly what the builder produced: no `--no-color`
 * (the `workset open` precedent — a handover renders an editor session or an
 * inquirer menu for a human, where color is wanted, and cospec's own
 * `--no-color` still reaches the child through the inherited `NO_COLOR=1` the
 * dispatcher sets). `OPENSPEC_NO_COMPLETIONS=1` is added over that precedent so
 * upstream's first-run completions tip can never surface from a cospec run.
 *
 * Nothing the child prints on the terminal can be relayed, so the leaf first
 * answers everything the binary would refuse (design D8), in commander's
 * order: the argv's parse refusal (the table parser's, text on stderr ahead
 * of any `--json` envelope, `--store-path`'s redirect included); `--json`
 * (cospec's envelope — the leaf is interactive); and for `config profile`,
 * whose own test is a TTY on stdout, the piped call when there is none, or
 * else its read-only pre-flight, which relays an unreadable config's refusal
 * and hands over only once the binary would prompt. `config edit` and
 * `config reset --all` have no non-interactive branch and always hand over.
 * Every handover runs under the handover preload (`core/handover-preload.ts`).
 */
export async function runHandover(
  ctx: CommandContext,
  call: ConfigCall,
  terminal: ConfigTerminal = { stdoutIsTTY: process.stdout.isTTY === true },
): Promise<number> {
  const row = commandRow('config')
  if (row === undefined) throw new Error("cospec config: no 'config' row")
  const refusal = prevalidateHandover(row, call.sub, call.subArgs)
  if (refusal !== undefined) {
    process.stderr.write(refusal.message)
    return EXIT.failure
  }
  if (ctx.flags.json) {
    process.stdout.write(
      jsonEnvelope({
        version: 1,
        command: `config ${call.sub}`,
        ok: false,
        message: `cospec config ${call.sub} is interactive and cannot emit JSON`,
      }),
    )
    return EXIT.failure
  }
  if (call.sub === 'profile') {
    const result = await profilePiped(ctx, call)
    if (!terminal.stdoutIsTTY || profileAnswer(result) === 'unreadable')
      return relayRespelled(result, false)
  }
  const bin = await resolveHandoverBin(ctx.cwd)
  const proc = Bun.spawn(preloadedArgv(bin, call.argv), {
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
  const code = await proc.exited
  if (code === 0)
    for (const note of precedenceNotes(call.sub, call.subArgs)) process.stderr.write(`${note}\n`)
  return code
}

export async function run(ctx: CommandContext): Promise<number> {
  // `--store` is absorbed as a global flag anywhere after the command name, so
  // silently ignoring it here would be misleading: OpenSpec config is
  // machine-global and has no store dimension at all.
  if (ctx.flags.store !== undefined) {
    process.stderr.write(
      'cospec config: --store does not apply — OpenSpec config is machine-global ' +
        '(use --scope global)\n',
    )
    return EXIT.failure
  }
  const plan = planConfigCall(ctx.args, { json: ctx.flags.json })
  if (plan.kind === 'error') {
    process.stderr.write(`${plan.message}\n`)
    return EXIT.failure
  }
  if (plan.kind === 'help') {
    const row = commandRow('config')
    if (row === undefined) throw new Error("cospec config: no 'config' row")
    process.stderr.write(commandHelpText(row))
    return EXIT.failure
  }
  if (plan.kind === 'command-level') return relayCommandLevel(ctx, plan.command, plan.args)
  return plan.kind === 'handover' ? runHandover(ctx, plan) : runPiped(ctx, plan)
}
