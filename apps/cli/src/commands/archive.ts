// `cospec archive <change>` — validate → tasks gate → `openspec archive` →
// filesystem verification → post-merge spot-check → blocker fan-out (DESIGN
// §5.2). The numbered steps below are the core product promise: an openspec
// below 1.7.0 can exit 0 while silently aborting an archive (probe §5.5) — and
// cospec accepts >=1.0.0 <2.0.0 — so cospec never trusts the exit code. It
// verifies the move on disk (date-agnostically, MF2), spot-checks the spec
// merge, relays the wrapped binary's non-blocking warnings, then fans blocker
// check-offs out across sibling changes and prints the flywheel summary.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

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
import {
  findScenarioDrops,
  parseDeltaSpec,
  parseLivingSpec,
  quoteScenarioNames,
  SCENARIO_DROP_HINT,
  SCENARIO_DROP_NOTE_RETIRED,
  type DeltaOp,
} from '../core/deltas.ts'
import { spawnOpenspec } from '../core/openspec.ts'
import { renderHuman, renderJson, type ItemReport } from '../core/report.ts'
import { resolveRoot } from '../core/root.ts'
import { enforcedApplyRequires, TYPE_ARTIFACTS, type CospecType } from '../core/rules/type-facts.ts'
import { capabilityForDeltaFile, isDeltaSpecFile } from '../core/spec-paths.ts'
import { parseTasks } from '../core/tasks.ts'
import { computeVerificationVerdict, parseVerification } from '../core/verification.ts'
import { archiveMap, atomicWrite, closest, computeGate } from './apply.ts'
import { buildValidateContext, validateChange } from './validate.ts'

const ABORTED_RE = /\bAborted\b/
const CANCELLED_RE = /\bArchive cancelled\b/

/** U+26A0 WARNING SIGN, optionally with the U+FE0F emoji variation selector. */
const WARN_GLYPH = '[\\u26A0\\uFE0F]'
/** `⚠️  Warning: <msg>` — spec-merge warnings (openspec `specs-apply.ts`). */
const WARNING_LINE_RE = new RegExp(`^\\s*(?:${WARN_GLYPH}\\s*)*Warning:\\s*(\\S.*?)\\s*$`)
/** `  ⚠ <msg>` — the bullets under "Proposal warnings in proposal.md". */
const WARNING_BULLET_RE = new RegExp(`^\\s*${WARN_GLYPH}+\\s*(\\S.*?)\\s*$`)
/** `Retiring openspec/specs/<cap>/spec.md: all requirements removed.` (1.8.0). */
const RETIRING_LINE_RE = /^\s*(Retiring\s+\S.*?)\s*$/

/**
 * Non-blocking warnings the wrapped `openspec archive` printed on its way to a
 * SUCCESSFUL archive.
 *
 * cospec only ever showed the wrapped output when the archive failed, so every
 * warning on the success path was swallowed: a delta Purpose silently ignored,
 * a REMOVED requirement that was already gone, authored prose that travelled
 * with a requirement it sat inside — and, since 1.8.0, `Retiring
 * openspec/specs/<cap>/spec.md`, i.e. cospec staying silent while a spec file
 * was deleted.
 *
 * Parsed from stdout rather than re-running with `--json`: the human-mode
 * `-y` invocation is the one the filesystem-verification design is built on,
 * and adding `--json` would change what step 9 verifies.
 */
export function collectArchiveWarnings(stdout: string): string[] {
  const warnings: string[] = []
  const seen = new Set<string>()
  let inProposalWarnings = false
  let retiringIndex = -1
  for (const raw of stdout.split('\n')) {
    if (/^\s*Proposal warnings in .*\(non-blocking\):\s*$/.test(raw)) {
      inProposalWarnings = true
      retiringIndex = -1
      continue
    }
    const direct = raw.match(WARNING_LINE_RE)
    const bullet = inProposalWarnings ? raw.match(WARNING_BULLET_RE) : null
    const retiring = raw.match(RETIRING_LINE_RE)
    const message = direct?.[1] ?? bullet?.[1] ?? retiring?.[1]
    if (message === undefined) {
      // A retirement's recovery hint is indented under its own line; it names
      // the git command that gets the deleted spec back, so it travels with it.
      if (retiringIndex !== -1 && /^\s+\S/.test(raw)) {
        warnings[retiringIndex] = `${warnings[retiringIndex]!} ${raw.trim()}`
        continue
      }
      // The proposal-warning block ends at the first line that is not one of
      // its bullets; a blank line inside it is just spacing.
      if (raw.trim() !== '') inProposalWarnings = false
      retiringIndex = -1
      continue
    }
    retiringIndex = -1
    if (seen.has(message)) continue
    seen.add(message)
    warnings.push(message)
    if (retiring !== null && direct === null && bullet === null) retiringIndex = warnings.length - 1
  }
  return warnings
}

interface CapabilityDeltas {
  capability: string
  ops: DeltaOp[]
}

/**
 * All change-side delta ops grouped by capability path
 * (`specs/<cap-path>/spec.md`).
 *
 * Only files literally named `spec.md` count, matching openspec's own change
 * parser and `discoverSpecFiles` on the living side. Companion markdown an
 * author keeps in a capability directory (`README.md`, `notes.md`, a
 * `spec-old.md` backup) is content `openspec archive` never merges, so parsing
 * it here would feed phantom ops to both hard gates below.
 *
 * The capability is the whole directory chain under `specs/`, so a nested
 * `specs/platform/session-layout/spec.md` groups under `platform/session-layout`
 * — the path openspec merges it to (`findSpecUpdates`, 1.6.0 #1353) and the path
 * every living-spec lookup below joins. Keying on the outermost directory
 * instead, as this did, pointed both hard archive gates at
 * `openspec/specs/platform/spec.md`, which does not exist, silently turning them
 * into no-ops for every nested spec.
 *
 * A `.md` sitting directly in `specs/` has no capability at all; openspec 1.7.0
 * blocks that layout outright, so it contributes no ops rather than inventing a
 * capability named after the file.
 */
function changeDeltaOps(changeDir: string): CapabilityDeltas[] {
  const root = join(changeDir, 'specs')
  if (!existsSync(root)) return []
  const byCap = new Map<string, DeltaOp[]>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) walk(child)
        continue
      }
      if (!entry.isFile() || !isDeltaSpecFile(entry.name)) continue
      const capability = capabilityForDeltaFile(relative(changeDir, child))
      if (capability === undefined) continue
      const parsed = parseDeltaSpec(readFileSync(child, 'utf8'), child, capability)
      const list = byCap.get(parsed.capability) ?? []
      list.push(...parsed.ops)
      byCap.set(parsed.capability, list)
    }
  }
  walk(root)
  return [...byCap.entries()].map(([capability, ops]) => ({ capability, ops }))
}

/**
 * Today's date in the process's local time zone, matching openspec's own
 * `formatLocalDate` (`src/utils/date.ts`). `toISOString()` is UTC, so from any
 * zone ahead of UTC the archive slot cospec computed and the one openspec
 * actually created disagreed for part of every day — the collision pre-check
 * looked at the wrong slot and step 9's verification failed a *successful*
 * archive, reporting a HALF-STATE that never existed.
 */
export function formatLocalDate(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** A change id that already carries an archive date prefix. */
const DATE_PREFIXED_RE = /^\d{4}-\d{2}-\d{2}-/

/**
 * Does `dirName` name the archive directory `openspec archive <changeId>` would
 * create? Date-agnostic on purpose (MF2): the archive can cross midnight
 * between the spawn and the check.
 *
 * Both accepted forms are real binary behaviour inside cospec's `>=1.0.0
 * <2.0.0` range: from 1.7.0 a change whose id already carries a date prefix
 * archives under that id verbatim (#1309), while older binaries re-prefix it.
 * cospec's own `CHANGE_ID_RE`/`meta/name-kebab` reject a date-prefixed id, so
 * the verbatim arm is defence for a change created outside cospec, not a path
 * `cospec archive` can reach on its own.
 */
export function isArchiveTargetFor(changeId: string, dirName: string): boolean {
  if (DATE_PREFIXED_RE.test(changeId) && dirName === changeId) return true
  return new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${escapeRegExp(changeId)}$`).test(dirName)
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
  const { flags } = ctx
  const root = await resolveRoot(ctx)
  const base = root.base
  const args = ctx.args
  const userSkipSpecs = args.includes('--skip-specs')
  const forceIncomplete = args.includes('--force-incomplete')
  const name = args.find((a) => !a.startsWith('-'))

  if (name === undefined) {
    process.stderr.write('cospec archive: a change name is required (cospec archive <change>)\n')
    return EXIT.failure
  }

  // Step 1: resolve change + schema (legacy still archives; step 2 delegates).
  const change = resolveChange(base, name)
  if (change === undefined) {
    process.stderr.write(`cospec archive: unknown change '${name}'\n`)
    const suggestion = closest(
      name,
      listChanges(base).map((c) => c.id),
    )
    if (suggestion !== undefined) process.stderr.write(`Did you mean '${suggestion}'?\n`)
    return EXIT.failure
  }
  const resolution = resolveSchema(base, change.schema)

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
  const vctx = buildValidateContext(base)
  const report = await validateChange(root, change, vctx, { strict: false, fast: skipSpecs })
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
      archiveMap(base),
      new Set(listChanges(base).map((c) => c.id)),
    )
    if (ownGate.hard.length > 0)
      process.stderr.write(
        `warning: archiving '${change.id}' with ${ownGate.hard.length} unchecked hard blocker(s) — it was never unblocked.\n`,
      )
  }

  // Step 5: collision pre-check for today's slot (openspec archives as
  // YYYY-MM-DD-<name>, stamped in the LOCAL zone — see formatLocalDate).
  const slot = DATE_PREFIXED_RE.test(change.id) ? change.id : `${formatLocalDate()}-${change.id}`
  if (existsSync(join(archiveDir(base), slot))) {
    process.stderr.write(
      `cospec archive: archive slot '${slot}' already exists — rename or remove it first.\n`,
    )
    return EXIT.failure
  }

  // Step 7: snapshot.
  const preArchiveDirs = new Set(basenames(archiveDir(base)))

  // Step 7b: scenario-preservation gate (DESIGN §3.5 step 2) — before delegating
  // to `openspec archive`, specs-bearing changes only. Below openspec 1.8.0 the
  // binary has no notion of scenario thinning and merges a MODIFIED delta that
  // drops scenarios at exit 0 (the atlas regression); 1.8.0+ refuses the merge
  // itself. cospec refuses first either way, with its own message.
  //
  // `livingCaps` doubles as step 10's record of which capabilities had a living
  // spec BEFORE the merge, so a spec that disappears can be told apart from one
  // that never existed.
  const livingCaps = new Set<string>()
  if (!skipSpecs && preOps.length > 0) {
    const livingSpecs = new Map(
      [...new Set(preOps.map((c) => c.capability))]
        .map((cap): [string, ReturnType<typeof parseLivingSpec>] | undefined => {
          const p = join(openspecDir(base), 'specs', cap, 'spec.md')
          if (!existsSync(p)) return undefined
          livingCaps.add(cap)
          return [cap, parseLivingSpec(readFileSync(p, 'utf8'))]
        })
        .filter((e): e is [string, ReturnType<typeof parseLivingSpec>] => e !== undefined),
    )
    const drops = findScenarioDrops(preOps, livingSpecs)
    if (drops.length > 0) {
      process.stderr.write(
        'cospec archive: scenario-preservation gate refused — a MODIFIED requirement drops scenarios:\n',
      )
      // The count clause keeps its shape even for a same-count name swap, where
      // it reads `2 -> 2`: the missing-name clause carries the finding there.
      for (const d of drops)
        process.stderr.write(
          `  ${d.capability}: "${d.name}" ${d.livingCount} -> ${d.deltaCount} scenario(s)${
            d.missingNames.length > 0 ? `; missing: ${quoteScenarioNames(d.missingNames)}` : ''
          }\n`,
        )
      if (drops.some((d) => d.noted)) process.stderr.write(`${SCENARIO_DROP_NOTE_RETIRED}.\n`)
      process.stderr.write(`${SCENARIO_DROP_HINT}.\n`)
      return EXIT.failure
    }
  }

  // Step 8: execute.
  const archiveArgs = ['archive', change.id, '-y']
  if (skipSpecs) archiveArgs.push('--skip-specs')
  const res = await spawnOpenspec([...archiveArgs, ...root.storeArgs], root.cwd)

  // Step 9: verify (date-agnostic — survives midnight rollover).
  const newDirs = basenames(archiveDir(base)).filter((d) => !preArchiveDirs.has(d))
  const targets = newDirs.filter((d) => isArchiveTargetFor(change.id, d))
  const target = targets.length === 1 ? targets[0] : undefined
  const moved = !existsSync(change.dir)
  const targetHasYaml =
    target !== undefined && existsSync(join(archiveDir(base), target, '.openspec.yaml'))
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
  //
  // A capability whose living spec is GONE was retired by the merge: since
  // 1.8.0 openspec deletes the file when a REMOVED takes the last requirement,
  // but only when the change declares `retire_capabilities: true`. Undeclared,
  // a spec that vanished is a real invariant breach, so the two cases are told
  // apart rather than both reading as an empty requirement set.
  const retired: string[] = []
  if (!skipSpecs && preOps.length > 0) {
    const misses: string[] = []
    for (const { capability, ops } of preOps) {
      const livingPath = join(openspecDir(base), 'specs', capability, 'spec.md')
      if (!existsSync(livingPath) && livingCaps.has(capability)) {
        if (change.retireCapabilities === true) {
          retired.push(capability)
          continue
        }
        misses.push(
          `${capability}: living spec was deleted by the merge, but the change does not declare \`retire_capabilities: true\``,
        )
        continue
      }
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
  const archivedAfter = archiveMap(base)
  const remaining = listChanges(base)
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

  const warnings = collectArchiveWarnings(res.stdout)

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          change: change.id,
          type: change.schema,
          archived: true,
          target,
          specs: skipSpecs ? 'skipped' : counts,
          retired,
          warnings,
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
  if (retired.length > 0) lines.push(`Retired:  ${retired.join(', ')} (spec files deleted)`)
  for (const w of warnings) lines.push(`Warning:  ${w}`)
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
