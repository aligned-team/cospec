// `cospec instructions [artifact] --change <id> [--schema <name>]` (DESIGN
// §2.7). The whole artifact-authoring loop under the cospec brand (MF1): every
// flag it handles is forwarded, and with no artifact or no `--change` the
// binary answers itself (its `Missing required …` list of the valid ones, one
// document under `--json`). `instructions apply --change <id>` is always
// `cospec apply <id>`, so the gate cannot be bypassed by choosing the other
// spelling. An artifact's answer is built from the binary's own `--json`
// document (`core/instructions-render.ts`): its command-bearing fields are
// spelled through cospec structurally, the built-in schema's own lines only
// when that schema resolves from the package, and the text rendered from the
// result, so no byte the user owns is ever rewritten. A refusal relayed from
// the binary has its `openspec` remedies spelled through cospec.

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { isCospecType } from '../core/change.ts'
import { commandRow, flagValue, hasFlag, parseCommandArgs } from '../core/command-table.ts'
import { relayRespelled, relayStorePathRefusal } from '../core/forward-relay.ts'
import {
  type InstructionsDocument,
  renderInstructionsText,
  respellBuiltInSchemaLines,
  respellInstructionsDocument,
} from '../core/instructions-render.ts'
import { runOpenspec } from '../core/openspec.ts'
import {
  callPassthrough,
  type CommandField,
  renderJsonDocument,
  respellCommandFields,
} from '../core/passthrough-command.ts'
import { respellRemedies } from '../core/remedies.ts'
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
  // `apply` with no change and `archive` answer from other documents (the
  // binary's `Missing required option` list; archive's context and operation
  // guidance, the user's own text): relayed as the binary prints them.
  if (artifact === undefined || artifact === 'apply' || artifact === 'archive') {
    const { result } = await callPassthrough(ctx, { command, args })
    return relayRespelled(result, ctx.flags.json)
  }
  return documentBuilt(ctx, command, args)
}

/** The command-bearing fields of the binary's failure document. */
const FAILURE_FIELDS: readonly CommandField[] = [
  { path: ['status', '[]', 'message'], rule: 'remedy' },
  { path: ['status', '[]', 'fix'], rule: 'remedy' },
]

/**
 * An artifact's answer from one `--json` spawn: on success the document with
 * its command-bearing fields spelled through cospec, re-printed under
 * `--json` or rendered as the binary's text; on failure the binary's own
 * answer — its document with the failure fields spelled through cospec, or,
 * in text mode, the same argv again without `--json` (read-only) relayed with
 * its remedies spelled, so the failure text stays the binary's.
 */
async function documentBuilt(
  ctx: CommandContext,
  command: string[],
  args: string[],
): Promise<number> {
  const { result, root, rerun } = await callPassthrough(ctx, { command, args, wrappedJson: true })
  if (result.exitCode !== 0) {
    if (!ctx.flags.json) return relayRespelled(await rerun({ json: false }), false)
    const refused = relayStorePathRefusal(result, true)
    if (refused !== undefined) return refused
    if (result.stdout.trim() === '') return relayRespelled(result, true)
    const doc = JSON.parse(result.stdout) as unknown
    process.stdout.write(renderJsonDocument(respellCommandFields(doc, FAILURE_FIELDS)))
    if (result.stderr.length > 0) process.stderr.write(respellRemedies(result.stderr))
    return EXIT.failure
  }
  let doc = respellInstructionsDocument(JSON.parse(result.stdout) as InstructionsDocument)
  if (await resolvesFromPackage(doc.schemaName, root?.base ?? ctx.cwd))
    doc = respellBuiltInSchemaLines(doc)
  // The binary's text answer opens with its spinner's start line, which ora
  // prints on the wrapped call's stderr (a pipe, never a TTY) ahead of any
  // warning the call prints.
  const stderr = ctx.flags.json ? result.stderr : `${SPINNER_LINE}${result.stderr}`
  if (stderr.length > 0) process.stderr.write(stderr)
  process.stdout.write(ctx.flags.json ? renderJsonDocument(doc) : renderInstructionsText(doc))
  return EXIT.success
}

/** `ora('Generating instructions...').start()` with its stream not a TTY. */
const SPINNER_LINE = '- Generating instructions...\n'

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
