// `cospec config <sub>` — the machine-global OpenSpec configuration surface
// (`~/.config/openspec/config.json`). cospec adds no gate and no config file of
// its own: it never reads or writes that file directly, and never re-implements
// upstream's key validation, value coercion, or its prototype-pollution guard —
// every such error relays from the wrapped binary verbatim.
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
//      enforces no `RunExpectation` — the documented handover exception.

import { join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { extractEmbeddedOpenspec } from '../core/openspec-embedded.ts'
import {
  passthroughOpenspec,
  resolveOpenspec,
  type RunExpectation,
  spawnOpenspec,
} from '../core/openspec.ts'

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
  /** Full argv for the wrapped binary, `config` first. */
  argv: string[]
  /** The subcommand's own args, with `--scope` already removed. */
  subArgs: string[]
}

export interface ConfigPlanError {
  kind: 'error'
  message: string
}

export type ConfigPlan = ConfigCall | ConfigPlanError

const SUBS = CONFIG_SUBCOMMANDS.join('|')

/** First non-flag token, i.e. the subcommand's first positional. */
function firstPositional(args: string[]): string | undefined {
  return args.find((a) => !a.startsWith('-'))
}

/**
 * Plan the wrapped call for `cospec config …` (pure, unit-testable).
 *
 * Rules: `--scope <v>` is a parent-command option, so it is lifted out of
 * wherever the caller typed it and re-emitted in its canonical position,
 * between `config` and the subcommand. (Commander resolves it from the leaf
 * too on 1.11.0, so this is normalization, not a workaround — it keeps one
 * argv shape for every input.) Any value but `global` is upstream's error to
 * print, not cospec's to second-guess. `--json` is appended only for `list`.
 * `--no-color` and `root.storeArgs` are never appended (module header).
 */
export function planConfigCall(args: string[], opts: { json: boolean }): ConfigPlan {
  let scope: string | undefined
  const rest: string[] = []
  for (let i = 0; i < args.length; i++) {
    const tok = args[i]!
    if (tok === '--scope') {
      const value = args[++i]
      if (value === undefined)
        return { kind: 'error', message: 'cospec config: --scope requires a value' }
      scope = value
      continue
    }
    if (tok.startsWith('--scope=')) {
      scope = tok.slice('--scope='.length)
      continue
    }
    rest.push(tok)
  }

  const sub = rest[0]
  if (sub === undefined)
    return { kind: 'error', message: `cospec config: a subcommand is required (${SUBS})` }
  if (!isConfigSub(sub))
    return { kind: 'error', message: `cospec config: unknown subcommand '${sub}' (${SUBS})` }

  const subArgs = rest.slice(1)
  const scopeArgs = scope === undefined ? [] : ['--scope', scope]
  const argv = ['config', ...scopeArgs, sub, ...subArgs]
  if (opts.json && sub === 'list') argv.push('--json')

  return { kind: isHandoverCall(sub, subArgs) ? 'handover' : 'pass', sub, argv, subArgs }
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
  const result = await passthroughOpenspec(call.argv, { cwd: ctx.cwd, expect: CONFIG_EXPECT })
  const ok = result.exitCode === 0
  const out = result.stdout.trim()

  if (!ctx.flags.json) {
    if (result.stdout.length > 0) process.stdout.write(result.stdout)
    if (result.stderr.length > 0) process.stderr.write(result.stderr)
  } else if (call.sub === 'list') {
    process.stdout.write(result.stdout)
    if (result.stderr.length > 0) process.stderr.write(result.stderr)
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
    const message = out.length > 0 ? out : result.stderr.trim()
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

/**
 * Class B: hand the terminal over (array argv, no shell, inherited stdio) and
 * propagate the child's exit code verbatim — including 130 on prompt
 * cancellation. The argv is exactly what the builder produced: no `--no-color`
 * (the `workset open` precedent — a handover renders an editor session or an
 * inquirer menu for a human, where color is wanted, and cospec's own
 * `--no-color` still reaches the child through the inherited `NO_COLOR=1` the
 * dispatcher sets). `OPENSPEC_NO_COMPLETIONS=1` is added over that precedent so
 * upstream's first-run completions tip can never surface from a cospec run.
 */
async function runHandover(ctx: CommandContext, call: ConfigCall): Promise<number> {
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
  const bin = await resolveHandoverBin(ctx.cwd)
  const proc = Bun.spawn([process.execPath, bin, ...call.argv], {
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
  return plan.kind === 'handover' ? runHandover(ctx, plan) : runPiped(ctx, plan)
}
