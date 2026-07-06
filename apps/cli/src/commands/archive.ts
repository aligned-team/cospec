// `cospec archive <change>` — validate → tasks gate → `openspec archive` →
// filesystem verification → post-merge spot-check → blocker fan-out (DESIGN
// §5.2). The numbered steps below are the core product promise: openspec
// 1.3.1 can exit 0 while silently aborting an archive (probe §5.5), so cospec
// never trusts the exit code — it verifies the move on disk (date-agnostically,
// MF2), spot-checks the spec merge, then fans blocker check-offs out across
// sibling changes and prints the flywheel summary.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { parseBlockers, syncBlockers } from '../core/blockers.ts'
import {
  archiveDir,
  isCospecType,
  listChanges,
  openspecDir,
  resolveChange,
  resolveSchema,
  type Change,
} from '../core/change.ts'
import { findScenarioDrops, parseDeltaSpec, parseLivingSpec, type DeltaOp } from '../core/deltas.ts'
import { spawnOpenspec } from '../core/openspec.ts'
import { renderHuman, renderJson, type ItemReport } from '../core/report.ts'
import { enforcedApplyRequires, TYPE_ARTIFACTS, type CospecType } from '../core/rules/type-facts.ts'
import { parseTasks } from '../core/tasks.ts'
import { computeVerificationVerdict, parseVerification } from '../core/verification.ts'
import { archiveMap, atomicWrite, closest, computeGate } from './apply.ts'
import { buildValidateContext, validateChange } from './validate.ts'

const ABORTED_RE = /\bAborted\b/
const CANCELLED_RE = /\bArchive cancelled\b/

interface CapabilityDeltas {
  capability: string
  ops: DeltaOp[]
}

/** All change-side delta ops grouped by capability (`specs/<cap>/**.md`). */
function changeDeltaOps(changeDir: string): CapabilityDeltas[] {
  const root = join(changeDir, 'specs')
  if (!existsSync(root)) return []
  const byCap = new Map<string, DeltaOp[]>()
  const walk = (dir: string, capability: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = join(dir, entry.name)
      if (entry.isDirectory()) walk(child, capability || entry.name)
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        const parsed = parseDeltaSpec(readFileSync(child, 'utf8'), child, capability || entry.name)
        const list = byCap.get(parsed.capability) ?? []
        list.push(...parsed.ops)
        byCap.set(parsed.capability, list)
      }
    }
  }
  walk(root, '')
  return [...byCap.entries()].map(([capability, ops]) => ({ capability, ops }))
}

function basenames(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface OpCounts {
  added: number
  modified: number
  removed: number
  renamed: number
}

function countOps(caps: CapabilityDeltas[]): OpCounts {
  const c: OpCounts = { added: 0, modified: 0, removed: 0, renamed: 0 }
  for (const { ops } of caps)
    for (const op of ops) {
      if (op.operation === 'ADDED') c.added++
      else if (op.operation === 'MODIFIED') c.modified++
      else if (op.operation === 'REMOVED') c.removed++
      else c.renamed++
    }
  return c
}

function printReport(report: ItemReport, ctx: CommandContext): void {
  const out = ctx.flags.json
    ? renderJson([report])
    : renderHuman([report], { noColor: ctx.flags.noColor, title: 'cospec archive' })
  process.stdout.write(out)
}

/** Verify a single delta op landed in the (post-merge) living spec. */
function spotCheckMiss(op: DeltaOp, requirementNames: Set<string>): string | undefined {
  if (op.operation === 'ADDED' && op.name !== undefined && !requirementNames.has(op.name))
    return `ADDED '${op.name}' missing from living spec`
  if (op.operation === 'MODIFIED' && op.name !== undefined && !requirementNames.has(op.name))
    return `MODIFIED '${op.name}' missing from living spec`
  if (op.operation === 'REMOVED' && op.name !== undefined && requirementNames.has(op.name))
    return `REMOVED '${op.name}' still present in living spec`
  if (op.operation === 'RENAMED') {
    if (op.toName !== undefined && !requirementNames.has(op.toName))
      return `RENAMED to '${op.toName}' missing from living spec`
    if (op.fromName !== undefined && requirementNames.has(op.fromName))
      return `RENAMED from '${op.fromName}' still present in living spec`
  }
  return undefined
}

export async function run(ctx: CommandContext): Promise<number> {
  const { cwd, flags } = ctx
  const args = ctx.args
  const userSkipSpecs = args.includes('--skip-specs')
  const forceIncomplete = args.includes('--force-incomplete')
  const name = args.find((a) => !a.startsWith('-'))

  if (name === undefined) {
    process.stderr.write('cospec archive: a change name is required (cospec archive <change>)\n')
    return EXIT.failure
  }

  // Step 1: resolve change + schema (legacy still archives; step 2 delegates).
  const change = resolveChange(cwd, name)
  if (change === undefined) {
    process.stderr.write(`cospec archive: unknown change '${name}'\n`)
    const suggestion = closest(
      name,
      listChanges(cwd).map((c) => c.id),
    )
    if (suggestion !== undefined) process.stderr.write(`Did you mean '${suggestion}'?\n`)
    return EXIT.failure
  }
  const resolution = resolveSchema(cwd, change.schema)

  // Step 6 (decided early — needed for validation scope + snapshot): skip specs
  // when the user asked, the schema declares no specs, or no delta files exist.
  const declaresSpecs =
    resolution.kind === 'legacy'
      ? true
      : isCospecType(change.schema)
        ? TYPE_ARTIFACTS[change.schema as keyof typeof TYPE_ARTIFACTS].declared.includes('specs')
        : false
  const preOps = changeDeltaOps(change.dir)
  const skipSpecs = userSkipSpecs || !declaresSpecs || preOps.length === 0

  // Step 2: full validation (archive-precondition family unless skipping specs).
  const vctx = buildValidateContext(cwd)
  const report = await validateChange(cwd, change, vctx, { strict: false, fast: skipSpecs })
  if (!report.valid) {
    printReport(report, ctx)
    return EXIT.failure
  }

  // Step 3: tasks gate (stricter than openspec — -y alone does not waive).
  const tasksPath = join(change.dir, 'tasks.md')
  const parsedTasks = existsSync(tasksPath)
    ? parseTasks(readFileSync(tasksPath, 'utf8'))
    : { items: [], malformed: [], groups: [] }
  const incomplete = parsedTasks.items.filter((t) => !t.checked)
  if (incomplete.length > 0 && !forceIncomplete) {
    process.stderr.write(
      `cospec archive: ${incomplete.length} incomplete task(s) — refusing to archive:\n`,
    )
    for (const t of incomplete) process.stderr.write(`  - [ ] ${t.text}\n`)
    process.stderr.write('re-run with --force-incomplete to archive anyway.\n')
    return EXIT.failure
  }

  // Step 3b: verification-incomplete gate (DESIGN §3.5 step 1). Runs whenever
  // verification is enforced for this change's type/schemaVersion — independent
  // of specs, so it fires for a specs-less fix too. There is no --force: a bare
  // `[ ]` row must be resolved as `[x] … -> <evidence>` or deferred as
  // `[~] … -> defer: <reason>` before archive proceeds.
  if (
    resolution.kind === 'cospec' &&
    isCospecType(change.schema) &&
    enforcedApplyRequires(change.schema as CospecType, change.schemaVersion ?? 1).includes(
      'verification',
    )
  ) {
    const verificationPath = join(change.dir, 'verification.md')
    const verificationText = existsSync(verificationPath)
      ? readFileSync(verificationPath, 'utf8')
      : undefined
    // Shares its pass/fail computation with `status --json`'s read-only verdict
    // (DESIGN §3.6) — the row-level listing below is archive's own presentation.
    const verdict = computeVerificationVerdict(true, verificationText)
    if (verdict.blockedReasons.length > 0) {
      process.stderr.write(
        `cospec archive: verification.md is not fully resolved — refusing to archive:\n`,
      )
      if (verificationText === undefined) {
        process.stderr.write('  verification.md does not exist yet\n')
      } else {
        const unresolved = parseVerification(verificationText).rows.filter(
          (r) => r.state === 'planned',
        )
        for (const row of unresolved) process.stderr.write(`  ${row.raw}\n`)
      }
      process.stderr.write(
        'resolve each row as `[x] … -> <evidence>`, or defer it as `[~] … -> defer: <reason>`.\n',
      )
      return EXIT.failure
    }
  }

  // Step 4: self-blocker sanity (warning only — aborted/superseded work archives too).
  const ownBlockersPath = join(change.dir, 'blocking-changes.md')
  if (existsSync(ownBlockersPath)) {
    const ownGate = computeGate(
      parseBlockers(readFileSync(ownBlockersPath, 'utf8')),
      archiveMap(cwd),
      new Set(listChanges(cwd).map((c) => c.id)),
    )
    if (ownGate.hard.length > 0)
      process.stderr.write(
        `warning: archiving '${change.id}' with ${ownGate.hard.length} unchecked hard blocker(s) — it was never unblocked.\n`,
      )
  }

  // Step 5: collision pre-check for today's slot (openspec archives as YYYY-MM-DD-<name>).
  const today = new Date().toISOString().slice(0, 10)
  if (existsSync(join(archiveDir(cwd), `${today}-${change.id}`))) {
    process.stderr.write(
      `cospec archive: archive slot '${today}-${change.id}' already exists — rename or remove it first.\n`,
    )
    return EXIT.failure
  }

  // Step 7: snapshot.
  const preArchiveDirs = new Set(basenames(archiveDir(cwd)))

  // Step 7b: scenario-preservation gate (DESIGN §3.5 step 2) — before delegating
  // to `openspec archive`, specs-bearing changes only. openspec 1.3.1 has no
  // notion of scenario thinning and merges a MODIFIED delta that drops scenarios
  // at exit 0 (the atlas regression); cospec refuses first.
  if (!skipSpecs && preOps.length > 0) {
    const livingSpecs = new Map(
      [...new Set(preOps.map((c) => c.capability))]
        .map((cap): [string, ReturnType<typeof parseLivingSpec>] | undefined => {
          const p = join(openspecDir(cwd), 'specs', cap, 'spec.md')
          return existsSync(p) ? [cap, parseLivingSpec(readFileSync(p, 'utf8'))] : undefined
        })
        .filter((e): e is [string, ReturnType<typeof parseLivingSpec>] => e !== undefined),
    )
    const drops = findScenarioDrops(preOps, livingSpecs)
    if (drops.length > 0) {
      process.stderr.write(
        'cospec archive: scenario-preservation gate refused — scenario count dropped without a matching removal note:\n',
      )
      for (const d of drops)
        process.stderr.write(
          `  ${d.capability}: "${d.name}" ${d.livingCount} -> ${d.deltaCount} scenario(s)\n`,
        )
      process.stderr.write(
        'add a `- Scenario removed: <reason>` line under the requirement, or restore the scenario.\n',
      )
      return EXIT.failure
    }
  }

  // Step 8: execute.
  const archiveArgs = ['archive', change.id, '-y']
  if (skipSpecs) archiveArgs.push('--skip-specs')
  const res = await spawnOpenspec(archiveArgs, cwd)

  // Step 9: verify (date-agnostic — survives midnight rollover).
  const newDirs = basenames(archiveDir(cwd)).filter((d) => !preArchiveDirs.has(d))
  const targetRe = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${escapeRegExp(change.id)}$`)
  const targets = newDirs.filter((d) => targetRe.test(d))
  const target = targets.length === 1 ? targets[0] : undefined
  const moved = !existsSync(change.dir)
  const targetHasYaml =
    target !== undefined && existsSync(join(archiveDir(cwd), target, '.openspec.yaml'))
  const abortedOutput = ABORTED_RE.test(res.stdout) || CANCELLED_RE.test(res.stdout)
  const success = res.exitCode === 0 && !abortedOutput && moved && targetHasYaml

  if (!success) {
    return reportArchiveFailure(ctx, change, res, {
      moved,
      newDirs,
      target,
      targetHasYaml,
      abortedOutput,
    })
  }

  // Step 10: post-merge spot-check (skipped when no specs merged).
  if (!skipSpecs && preOps.length > 0) {
    const misses: string[] = []
    for (const { capability, ops } of preOps) {
      const livingPath = join(openspecDir(cwd), 'specs', capability, 'spec.md')
      const names = existsSync(livingPath)
        ? parseLivingSpec(readFileSync(livingPath, 'utf8')).requirementNames
        : new Set<string>()
      for (const op of ops) {
        const miss = spotCheckMiss(op, names)
        if (miss !== undefined) misses.push(`${capability}: ${miss}`)
      }
    }
    if (misses.length > 0) {
      process.stderr.write(
        `cospec archive: change was archived but spec merge verification failed for: ${misses.join('; ')} — this is a cospec/openspec invariant breach; please file a bug.\n`,
      )
      return EXIT.failure
    }
  }

  // Step 11: blocker fan-out across the remaining active changes.
  const archivedAfter = archiveMap(cwd)
  const remaining = listChanges(cwd)
  const activeAfter = new Set(remaining.map((c) => c.id))
  const checkedOff: string[] = []
  const nowUnblocked: string[] = []
  for (const other of remaining) {
    const p = join(other.dir, 'blocking-changes.md')
    if (!existsSync(p)) continue
    const sync = syncBlockers(readFileSync(p, 'utf8'), archivedAfter, activeAfter, { fix: true })
    if (sync.changed) atomicWrite(p, sync.output)
    if (sync.synced.length > 0) {
      checkedOff.push(other.id)
      if (sync.fullyUnblocked) nowUnblocked.push(other.id)
    }
  }

  // Step 12: flywheel summary.
  const counts = countOps(preOps)
  const specsLine = skipSpecs
    ? 'skipped'
    : preOps.length === 0
      ? 'none'
      : `+${counts.added} ~${counts.modified} -${counts.removed} →${counts.renamed} applied and verified`

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          change: change.id,
          type: change.schema,
          archived: true,
          target,
          specs: skipSpecs ? 'skipped' : counts,
          blockers: { checkedOff, nowUnblocked },
        },
        null,
        2,
      )}\n`,
    )
    return EXIT.success
  }

  const lines = [
    `Archived: ${change.id} (${change.schema}) → openspec/changes/archive/${target}/`,
    `Specs:    ${specsLine}`,
  ]
  if (checkedOff.length > 0)
    lines.push(
      `Blockers: checked off in ${checkedOff.length} change(s): ${checkedOff.map((s) => `\`${s}\``).join(', ')}`,
    )
  for (const slug of nowUnblocked) lines.push(`Now unblocked: ${slug} → next: cospec apply ${slug}`)
  process.stdout.write(`${lines.join('\n')}\n`)
  return EXIT.success
}

interface VerifyState {
  moved: boolean
  newDirs: string[]
  target: string | undefined
  targetHasYaml: boolean
  abortedOutput: boolean
}

/** Step 9 failure branch: clean abort vs. loud half-state. */
function reportArchiveFailure(
  ctx: CommandContext,
  change: Change,
  res: { stdout: string; stderr: string; exitCode: number },
  state: VerifyState,
): number {
  const captured = `${res.stdout}${res.stderr}`
    .split('\n')
    .map((l) => `    ${l}`)
    .join('\n')

  if (!state.moved && state.newDirs.length === 0) {
    process.stderr.write('openspec archive did not archive the change (it exited 0 but aborted).\n')
    process.stderr.write(`${captured}\n`)
    process.stderr.write(
      'Fix the errors above, or re-run with --skip-specs if this change should not touch specs.\n',
    )
  } else {
    process.stderr.write(`cospec archive: HALF-STATE detected archiving '${change.id}':\n`)
    process.stderr.write(`  openspec exit code:      ${res.exitCode}\n`)
    process.stderr.write(`  stdout aborted/cancelled: ${state.abortedOutput}\n`)
    process.stderr.write(`  change dir moved:        ${state.moved}\n`)
    process.stderr.write(
      `  archive target present:  ${state.target !== undefined} (with .openspec.yaml: ${state.targetHasYaml})\n`,
    )
    process.stderr.write(`  new archive dirs:        ${state.newDirs.join(', ') || '(none)'}\n`)
    process.stderr.write(`${captured}\n`)
    process.stderr.write('Manual inspection required — the archive is in an inconsistent state.\n')
  }

  if (ctx.flags.json)
    process.stdout.write(
      `${JSON.stringify(
        {
          change: change.id,
          type: change.schema,
          archived: false,
          reason: !state.moved && state.newDirs.length === 0 ? 'aborted' : 'half-state',
          openspecExit: res.exitCode,
        },
        null,
        2,
      )}\n`,
    )
  return EXIT.failure
}
