// `cospec instructions [artifact] --change <id> [--schema <name>]` (DESIGN
// §2.7). The whole artifact-authoring loop under the cospec brand (MF1): every
// flag it handles is forwarded, and with no artifact or no `--change` the
// binary answers itself (its `Missing required …` list of the valid ones, one
// document under `--json`). `instructions apply --change <id>` is always
// `cospec apply <id>`, so the gate cannot be bypassed by choosing the other
// spelling. Every other answer comes from one spawn of the binary's own
// `--json` document. An artifact's is built from it
// (`core/instructions-render.ts`): its command-bearing fields are spelled
// through cospec structurally, the built-in schema's own lines only when that
// schema resolves from the package, and the text rendered from the result. A
// failure's document has only its `status[].message`/`status[].fix` spelled,
// each only when its whole value is one allowlisted remedy, and its text is
// rendered from that document — so no byte the user owns (a change name it
// lists, a path) is ever rewritten.

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { isCospecType } from '../core/change.ts'
import { commandRow, flagValue, hasFlag, parseCommandArgs } from '../core/command-table.ts'
import { isParseRejection, relayStorePathRefusal } from '../core/forward-relay.ts'
import {
  type InstructionsDocument,
  renderInstructionsText,
  respellBuiltInSchemaLines,
  respellInstructionsDocument,
} from '../core/instructions-render.ts'
import { type OpenspecResult, runOpenspec } from '../core/openspec.ts'
import {
  callPassthrough,
  type CommandField,
  renderJsonDocument,
  respellCommandFields,
} from '../core/passthrough-command.ts'
import { run as applyRun } from './apply.ts'

const APPLY_SCHEMA_REFUSAL =
  "'--schema' does not apply to 'apply' — the gate reads the change's own schema"

export async function run(ctx: CommandContext): Promise<number> {
  const parsed = ctx.parsed!
  const artifact = parsed.positionals[0]
  const changeId = flagValue(parsed, '--change')
  const schema = flagValue(parsed, '--schema')

  // `instructions apply --change <id>` is the apply gate under a different
  // spelling, whatever the id: apply's own refusals (no openspec/ directory,
  // an unknown change, an id outside the change grammar) answer for it, so no
  // cwd or id reaches the binary's ungated apply instructions. With no
  // `--change` there is no change to gate and the binary answers, as for any
  // artifact: its document lists the available changes. `archive` (OpenSpec
  // 1.7 parity) is deliberately NOT aliased to `cospec archive`: upstream's
  // `instructions archive` is read-only guidance, forwarded like every other
  // artifact id.
  if (artifact === 'apply' && changeId !== undefined) {
    // Upstream's `--schema` answers from another schema's apply requirements,
    // while the gate enforces the change's own: refused before the gate runs.
    if (schema !== undefined) {
      if (ctx.flags.json) {
        const status = [
          { severity: 'error', code: 'schema_not_applicable', message: APPLY_SCHEMA_REFUSAL },
        ]
        process.stdout.write(`${JSON.stringify({ status }, null, 2)}\n`)
      } else process.stderr.write(`cospec instructions: ${APPLY_SCHEMA_REFUSAL}\n`)
      return EXIT.failure
    }
    // apply.ts reads `ctx.parsed`, so re-parse against apply's own row rather
    // than spreading this command's `parsed` (its positional is `'apply'`, not
    // the change id, which apply.ts would otherwise resolve as the change name).
    const args = [changeId]
    if (hasFlag(parsed, '--allow-soft')) args.push('--allow-soft')
    const row = commandRow('apply')
    if (row?.parse !== 'table') throw new Error("cospec instructions: 'apply' has no table row")
    const result = parseCommandArgs(row, args)
    if (!result.ok) {
      process.stderr.write(result.refusal.message)
      return EXIT.failure
    }
    return applyRun({ ...ctx, args, parsed: result.parsed })
  }

  const command = ['instructions', ...(artifact !== undefined ? [artifact] : [])]
  const args = [
    ...(changeId !== undefined ? ['--change', changeId] : []),
    ...(schema !== undefined ? ['--schema', schema] : []),
  ]
  const { result, root, rerun } = await callPassthrough(ctx, { command, args, wrappedJson: true })
  if (result.exitCode !== 0) return relayFailure(ctx, result, spinnerLine(artifact))
  // `apply` with no change and `archive` answer from other documents (the
  // binary's `Missing required option` list; archive's context and operation
  // guidance, the user's own text): a success is relayed as the binary prints
  // it, the text form from the same argv again without `--json` (read-only).
  if (artifact === undefined || artifact === 'apply' || artifact === 'archive') {
    const answer = ctx.flags.json ? result : await rerun({ json: false })
    if (answer.stdout.length > 0) process.stdout.write(answer.stdout)
    if (answer.stderr.length > 0) process.stderr.write(answer.stderr)
    return EXIT.success
  }
  let doc = respellInstructionsDocument(JSON.parse(result.stdout) as InstructionsDocument)
  if (await resolvesFromPackage(doc.schemaName, root?.base ?? ctx.cwd))
    doc = respellBuiltInSchemaLines(doc)
  // The binary's text answer opens with its spinner's start line, which ora
  // prints on the wrapped call's stderr (a pipe, never a TTY) ahead of any
  // warning the call prints.
  const stderr = ctx.flags.json ? result.stderr : `${spinnerLine(artifact)}${result.stderr}`
  if (stderr.length > 0) process.stderr.write(stderr)
  process.stdout.write(ctx.flags.json ? renderJsonDocument(doc) : renderInstructionsText(doc))
  return EXIT.success
}

/** The command-bearing fields of the binary's failure document. */
const FAILURE_FIELDS: readonly CommandField[] = [
  { path: ['status', '[]', 'message'], rule: 'remedy' },
  { path: ['status', '[]', 'fix'], rule: 'remedy' },
]

/**
 * `ora(<text>).start()` with its stream not a TTY, as each branch of the
 * binary's `instructions` action starts it once its root is selected.
 */
function spinnerLine(artifact: string | undefined): string {
  if (artifact === 'apply') return '- Generating apply instructions...\n'
  if (artifact === 'archive') return '- Loading archive inputs...\n'
  return '- Generating instructions...\n'
}

interface FailureStatus {
  message: string
  fix?: unknown
}

/**
 * A failed call's answer, from the binary's own failure document: the
 * `--store-path` refusal and commander's parse refusal (both before any
 * document, the same in either mode) are relayed as cospec relays them;
 * otherwise the document has `FAILURE_FIELDS` spelled through cospec and is
 * re-printed under `--json`, or rendered as the binary's `failWithError`
 * renders it in text — `✖ Error: <message>` and, when the status carries
 * one, `Fix: <fix>`, after the spinner line and whatever the call printed on
 * stderr. cospec selects the root before the spawn (the same resolver, with
 * the same `--store`), so the binary's own selection never fails and every
 * document failure comes after its spinner started.
 */
function relayFailure(ctx: CommandContext, result: OpenspecResult, spinner: string): number {
  const refused = relayStorePathRefusal(result, ctx.flags.json)
  if (refused !== undefined) return refused
  if (isParseRejection(result)) {
    process.stderr.write(result.stderr)
    return EXIT.failure
  }
  const doc = respellCommandFields(JSON.parse(result.stdout) as unknown, FAILURE_FIELDS)
  if (ctx.flags.json) {
    process.stdout.write(renderJsonDocument(doc))
    if (result.stderr.length > 0) process.stderr.write(result.stderr)
    return EXIT.failure
  }
  const status = failureStatus(doc)
  const fix = typeof status.fix === 'string' && status.fix.length > 0 ? `Fix: ${status.fix}\n` : ''
  process.stderr.write(`${spinner}${result.stderr}✖ Error: ${status.message}\n${fix}`)
  return EXIT.failure
}

/** The one status of the binary's failure document, which `failWithError` prints. */
function failureStatus(doc: unknown): FailureStatus {
  const status = (doc as { status?: unknown } | null)?.status
  const first: unknown = Array.isArray(status) && status.length === 1 ? status[0] : undefined
  if (
    first === null ||
    typeof first !== 'object' ||
    typeof (first as { message?: unknown }).message !== 'string'
  )
    throw new Error(
      'cospec instructions: the wrapped failure document carries no single status with a message',
    )
  return first as FailureStatus
}

/**
 * Whether `schemaName` resolves from the pinned package's own schemas — the
 * built-in schema, whose lines name bare `openspec` commands — as the
 * binary's `schema which --json` reports from `cwd` (the root, as every
 * `schema` passthrough runs). cospec's typed schemas never ship in the
 * package, so they are never asked about.
 */
async function resolvesFromPackage(schemaName: string, cwd: string): Promise<boolean> {
  if (isCospecType(schemaName)) return false
  const which = await runOpenspec(['schema', 'which', schemaName, '--json'], {
    cwd,
    expect: {
      exitCodes: [0],
      // The binary's experimental-command note belongs on stderr.
      denyStdout: [/Schema commands are experimental/],
      postCondition: (r) => {
        try {
          const body = JSON.parse(r.stdout) as { source?: unknown }
          return typeof body.source === 'string' || 'schema which --json named no source'
        } catch {
          return 'schema which --json did not emit a single parseable JSON document'
        }
      },
    },
  })
  return (JSON.parse(which.stdout) as { source: string }).source === 'package'
}
