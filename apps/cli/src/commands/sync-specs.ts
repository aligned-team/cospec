// `cospec sync-specs <change>` — merge a change's delta specs into the main
// specs without archiving it (design D11). It refuses what `cospec archive`
// refuses before any merge (the namespace folder, the archive-precondition
// revalidation, the scenario-preservation gate), then runs the pinned binary's
// own `archive -y` on a scratch copy of what that archive reads and copies
// back only the main-spec files the run changed, so the main specs come out
// byte-for-byte as archive would write them and a later `cospec archive` is
// the binary's early-sync no-op. The change stays active; the tasks gate and
// `archive/verification-incomplete` do not run, because nothing is archived.

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import {
  changeNameProblem,
  diagnostics,
  failureDocument,
  readArchiveSummary,
  type ArchiveDiagnostic,
  type ArchiveRefusalReason,
} from '../core/archive-output.ts'
import {
  changesDir,
  describeNestedChange,
  findNestedChangesIn,
  isCospecType,
  listChangeDirs,
  listChanges,
  resolveChange,
  resolveSchema,
} from '../core/change.ts'
import {
  enforceExpectation,
  spawnOpenspec,
  wrappedCallLabel,
  type OpenspecResult,
} from '../core/openspec.ts'
import { respellRemedies } from '../core/remedies.ts'
import { renderHuman, renderJson } from '../core/report.ts'
import { resolveRoot } from '../core/root.ts'
import { TYPE_ARTIFACTS } from '../core/rules/type-facts.ts'
import { changeDeltaOps, scenarioGate, scenarioRefusal } from '../core/scenario-gate.ts'
import { ScratchRefusal, syncThroughScratch, type ScratchRun } from '../core/scratch-root.ts'
import { rootOutput } from '../core/upstream-keys.ts'
import { closest } from './apply.ts'
import { collectArchiveWarnings } from './archive.ts'
import { readValidateContext, validateChange } from './validate.ts'

/**
 * The `--json` payload a root-selection failure prints ahead of `status`.
 */
export const jsonFailurePayload = { synced: false } as const

/** Why there is nothing to sync (`skipReason`). */
type NothingToSync = 'schema' | 'skip-specs' | 'no-deltas'

const SCRATCH_REASONS: Record<ScratchRefusal['kind'], ArchiveRefusalReason> = {
  'scratch-run': 'scratch-run',
  'specs-changed': 'specs-changed',
  'symlink-escape': 'symlink-escape',
}

/** The wrapped call: exit 0 (archived) or 1 (refused) are its answers; anything else is a violation. */
async function archiveInScratch(id: string, scratch: string): Promise<ScratchRun> {
  const args = ['archive', id, '-y']
  const res: OpenspecResult = await spawnOpenspec(args, scratch)
  enforceExpectation(wrappedCallLabel(args), res, { exitCodes: [0, 1] })
  return res
}

export async function run(ctx: CommandContext): Promise<number> {
  const { flags } = ctx
  const root = await resolveRoot(ctx)
  const base = root.base
  // Required in the table: the parser has refused a missing one.
  const name = ctx.parsed!.positionals[0]!

  let type: string | undefined
  const refuse = (
    reason: ArchiveRefusalReason,
    diagnostic: ArchiveDiagnostic,
    extra?: Readonly<Record<string, unknown>>,
  ): number => {
    if (flags.json)
      process.stdout.write(
        failureDocument({
          change: name,
          ...(type === undefined ? {} : { type }),
          reason,
          diagnostic,
          root,
          outcome: 'synced',
          ...(extra === undefined ? {} : { extra }),
        }),
      )
    return EXIT.failure
  }

  // Step 1: resolve the change as `cospec archive` does.
  const nameProblem = changeNameProblem(name)
  if (nameProblem !== undefined) {
    process.stderr.write(`cospec sync-specs: ${nameProblem}\n`)
    return refuse('invalid-name', diagnostics.invalidName(nameProblem))
  }
  const change = resolveChange(base, name)
  if (change === undefined) {
    process.stderr.write(`cospec sync-specs: unknown change '${name}'\n`)
    const suggestion = closest(
      name,
      listChanges(base).map((c) => c.id),
    )
    if (suggestion !== undefined) process.stderr.write(`Did you mean '${suggestion}'?\n`)
    return refuse(
      'unknown-change',
      diagnostics.notFound(
        name,
        listChangeDirs(base).map((c) => c.id),
      ),
    )
  }
  type = change.schema
  const nested = findNestedChangesIn(changesDir(base), change.id)
  if (nested !== undefined) {
    const diag = diagnostics.namespaceFolder(
      change.id,
      describeNestedChange(nested),
      nested.nested[0]!,
      'sync',
    )
    process.stderr.write(`cospec sync-specs: ${diag.message}\n${diag.fix!}\n`)
    return refuse('namespace-folder', diag)
  }

  // Nothing to sync: the same three reasons archive skips its spec sync for,
  // with `skip_specs: true` named on its own.
  const resolution = resolveSchema(base, change.schema)
  const declaresSpecs =
    resolution.kind === 'legacy'
      ? true
      : isCospecType(change.schema)
        ? TYPE_ARTIFACTS[change.schema as keyof typeof TYPE_ARTIFACTS].declared.includes('specs')
        : false
  const caps = changeDeltaOps(change.dir)
  const nothing: NothingToSync | undefined = !declaresSpecs
    ? 'schema'
    : change.skipSpecs === true
      ? 'skip-specs'
      : caps.length === 0
        ? 'no-deltas'
        : undefined
  if (nothing !== undefined) {
    const why = {
      schema: `the ${change.schema} schema has no specs artifact`,
      'skip-specs': `${change.id} declares skip_specs: true`,
      'no-deltas': `${change.id} has no delta specs`,
    }[nothing]
    if (!flags.json) process.stdout.write(`Nothing to sync: ${why}.\n`)
    else
      process.stdout.write(
        `${JSON.stringify(
          {
            change: change.id,
            type: change.schema,
            synced: false,
            skipReason: nothing,
            files: { written: [], deleted: [] },
            warnings: [],
            root: rootOutput(root),
          },
          null,
          2,
        )}\n`,
      )
    return EXIT.success
  }

  // Step 2: archive's pre-merge checks — its revalidation, then the
  // scenario-preservation gate.
  const { ctx: vctx, warning } = readValidateContext(base)
  if (warning !== undefined) process.stderr.write(`Warning: ${warning.message}\n`)
  const report = await validateChange(root, change, vctx, { strict: false, fast: false })
  if (!report.valid) {
    if (!flags.json)
      process.stdout.write(
        renderHuman([report], { noColor: flags.noColor, title: 'cospec sync-specs' }),
      )
    const reportDoc = flags.json
      ? (JSON.parse(renderJson([report])) as Record<string, unknown>)
      : undefined
    return refuse('validation', diagnostics.validationFailed(change.id, root), reportDoc)
  }
  const gate = scenarioGate(base, caps)
  if (gate.drops.length > 0) {
    process.stderr.write(scenarioRefusal('sync-specs', gate.drops))
    return refuse('archive/scenario-preservation', diagnostics.scenarioDropped(gate.drops))
  }

  // Steps 3–5: the binary's archive on a scratch copy, copied back and verified.
  let synced
  try {
    synced = await syncThroughScratch(base, change.id, (scratch) =>
      archiveInScratch(change.id, scratch),
    )
  } catch (error) {
    if (!(error instanceof ScratchRefusal)) throw error
    const reason = respellRemedies(error.message)
    if (error.kind === 'scratch-run' && error.run !== undefined) {
      process.stderr.write(`cospec sync-specs: the wrapped OpenSpec archive refused: ${reason}\n`)
      const captured = respellRemedies(`${error.run.stdout}${error.run.stderr}`)
        .split('\n')
        .map((l) => `    ${l}`)
        .join('\n')
      process.stderr.write(`${captured}\nNothing was written to the main specs.\n`)
    } else process.stderr.write(`cospec sync-specs: ${reason}\n`)
    return refuse(SCRATCH_REASONS[error.kind], diagnostics.error(error.message))
  }

  const summary = readArchiveSummary(
    synced.run.stdout,
    caps.map((c) => c.capability),
  )
  const warnings = collectArchiveWarnings(synced.run.stdout).map(respellRemedies)

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          change: change.id,
          type: change.schema,
          synced: true,
          ...(summary.totals === undefined ? {} : { totals: summary.totals }),
          files: { written: synced.written, deleted: synced.deleted },
          warnings,
          root: rootOutput(root),
        },
        null,
        2,
      )}\n`,
    )
    return EXIT.success
  }

  const lines: string[] = []
  if (synced.written.length === 0 && synced.deleted.length === 0)
    lines.push('Specs:    already in sync; no files changed')
  else {
    for (const file of synced.written) lines.push(`Synced:   ${file} (written)`)
    for (const file of synced.deleted) lines.push(`Synced:   ${file} (deleted)`)
    const t = summary.totals
    if (t !== undefined)
      lines.push(`Totals:   + ${t.added}, ~ ${t.modified}, - ${t.removed}, → ${t.renamed}`)
  }
  for (const w of warnings) lines.push(`Warning:  ${w}`)
  process.stdout.write(`${lines.join('\n')}\n`)
  return EXIT.success
}
