// `cospec apply <change>` — the deterministic implementation gate (DESIGN §5.1).
// Validates (fast), checks required artifacts are present, self-heals stale
// blocker checkboxes against the archive, then enforces the hard/soft blocker
// gate with exit codes an agent cannot rationalize past (2 = blocked, 3 =
// soft-blocked). On a clear gate it merges `openspec instructions apply --json`
// into a single machine-readable payload.
//
// Also the home of the shared gate primitives (`computeGate`) and change-name
// suggestion (`closest`) used by status/list/archive/new — those command tracks
// are single-owner, so cross-importing here keeps one implementation.

import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { parseBlockers, syncBlockers, type ParsedBlockers } from '../core/blockers.ts'
import {
  listChanges,
  openspecDir,
  readArchiveIndex,
  resolveChange,
  resolveSchema,
  type Change,
} from '../core/change.ts'
import {
  openspecApplyInstructions,
  OpenspecCallError,
  type ApplyInstructionsJson,
  type Root,
} from '../core/openspec.ts'
import { renderHuman, renderJson, type ItemReport } from '../core/report.ts'
import { resolveRoot } from '../core/root.ts'
import { surfaceUnmetConsequences } from '../core/rules/meta.ts'
import {
  ARTIFACT_FILES,
  enforcedApplyRequires,
  type ArtifactId,
  type CospecType,
} from '../core/rules/type-facts.ts'
import { buildValidateContext, validateChange } from './validate.ts'

// --- shared primitives (exported for status/list/archive/new) --------------

/** Atomic write via a sibling temp file + rename. */
export function atomicWrite(path: string, content: string): void {
  const tmp = `${path}.cospec-tmp`
  writeFileSync(tmp, content)
  renameSync(tmp, path)
}

function levenshtein(a: string, b: string): number {
  const cols = b.length + 1
  const prev = Array.from({ length: cols }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!
    prev[0] = i
    for (let j = 1; j < cols; j++) {
      const tmp = prev[j]!
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + cost)
      diag = tmp
    }
  }
  return prev[cols - 1]!
}

/** The nearest candidate within an edit distance of 3, or undefined. */
export function closest(input: string, candidates: string[]): string | undefined {
  let best: string | undefined
  let bestDist = Infinity
  for (const c of candidates) {
    const d = levenshtein(input, c)
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  return best !== undefined && bestDist <= 3 ? best : undefined
}

/** slug → archived date map (latest date per slug). */
export function archiveMap(base: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const [slug, entry] of readArchiveIndex(base).bySlug) map.set(slug, entry.date)
  return map
}

export interface GateEntry {
  slug: string
  description?: string
  /** whether the blocker slug is itself an active change. */
  active: boolean
}

export interface Gate {
  state: 'clear' | 'soft-blocked' | 'blocked'
  /** unchecked Blocked-by entries whose target is not archived. */
  hard: GateEntry[]
  /** unchecked Soft-blocked-by entries whose target is not archived. */
  soft: GateEntry[]
}

/**
 * Deterministic gate over parsed blocking-changes (DESIGN §5.1 steps 4d/4e).
 * Read-only: entries whose slug is already archived are treated as satisfied
 * (self-heal handles the checkbox rewrite separately). `active` marks whether a
 * blocker names an active change so callers can suggest implementation order.
 */
export function computeGate(
  parsed: ParsedBlockers,
  archived: Map<string, string>,
  active: Set<string>,
): Gate {
  const collect = (entries: ParsedBlockers['blocked']['entries']): GateEntry[] =>
    entries
      .filter((e) => !e.checked && !archived.has(e.slug))
      .map((e) => ({ slug: e.slug, description: e.description, active: active.has(e.slug) }))
  const hard = collect(parsed.blocked.entries)
  const soft = collect(parsed.soft.entries)
  const state = hard.length > 0 ? 'blocked' : soft.length > 0 ? 'soft-blocked' : 'clear'
  return { state, hard, soft }
}

function specDirHasMd(dir: string): boolean {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (specDirHasMd(child)) return true
    } else if (entry.isFile() && entry.name.endsWith('.md')) return true
  }
  return false
}

/** Does the specs artifact exist for a change (any spec delta file under specs/)? */
export function hasSpecFiles(changeDir: string): boolean {
  const root = join(changeDir, 'specs')
  return existsSync(root) && specDirHasMd(root)
}

/** Whether an artifact's generated file exists (mirrors openspec detectCompleted). */
export function artifactDone(changeDir: string, id: string): boolean {
  if (id === 'specs') return hasSpecFiles(changeDir)
  const file = ARTIFACT_FILES[id as Exclude<ArtifactId, 'specs'>]
  return file !== undefined && existsSync(join(changeDir, file))
}

/** apply.requires ids whose artifact file(s) do not yet exist. */
export function missingArtifacts(changeDir: string, applyRequires: readonly string[]): string[] {
  return applyRequires.filter((id) => !artifactDone(changeDir, id))
}

// --- command ----------------------------------------------------------------

const BLOCKERS_FILE = 'blocking-changes.md'

// Surface-driven soft rules the fast validation surfaces as WARNINGs and that
// apply folds into `gate.soft` (DESIGN §3.4). These own the present-file gaps:
// `design/*` the missing design sections, `verification/*` the missing per-row
// layers on feat/fix/perf/refactor. The absent-verification.md case on an
// O(trig) type is owned separately by `meta/surface-unmet` (aggregated below via
// `surfaceUnmetConsequences`), so these two paths never double-report a row.
const SURFACE_SOFT_RULES = new Set<string>([
  'design/operational-surface',
  'design/integration-contract',
  'design/seam-ownership',
  'verification/interactive-required',
  'verification/eval-check',
  'verification/integration-check',
  'verification/deploy-real-layer',
])

function printReport(report: ItemReport, ctx: CommandContext): void {
  const out = ctx.flags.json
    ? renderJson([report])
    : renderHuman([report], { noColor: ctx.flags.noColor, title: 'cospec apply' })
  process.stdout.write(out)
}

/** Legacy schema: no cospec gate — delegate to openspec and exit per its state. */
async function applyLegacy(change: Change, ctx: CommandContext, root: Root): Promise<number> {
  let instr: ApplyInstructionsJson
  try {
    instr = await openspecApplyInstructions(root, change.id)
  } catch (err) {
    process.stderr.write(`cospec apply: ${(err as Error).message}\n`)
    return EXIT.failure
  }
  if (ctx.flags.json) {
    process.stdout.write(
      `${JSON.stringify({ change: change.id, type: change.schema, legacy: true, apply: instr }, null, 2)}\n`,
    )
  } else {
    process.stdout.write(
      `note: '${change.schema}' is a legacy schema — cospec's blocker gate is not enforced; delegating to openspec.\n`,
    )
    process.stdout.write(`${instr.instruction}\n`)
  }
  return instr.state === 'blocked' ? EXIT.blocked : EXIT.success
}

export async function run(ctx: CommandContext): Promise<number> {
  const { flags } = ctx
  const root = await resolveRoot(ctx)
  const base = root.base
  const allowSoft = ctx.args.includes('--allow-soft')
  const name = ctx.args.find((a) => !a.startsWith('-'))

  if (name === undefined) {
    process.stderr.write('cospec apply: a change name is required (cospec apply <change>)\n')
    return EXIT.failure
  }

  if (!existsSync(openspecDir(base))) {
    process.stderr.write(`cospec: no openspec/ directory at ${base} — run 'cospec init' first\n`)
    return EXIT.failure
  }

  const change = resolveChange(base, name)
  if (change === undefined) {
    process.stderr.write(`cospec apply: unknown change '${name}'\n`)
    const suggestion = closest(
      name,
      listChanges(base).map((c) => c.id),
    )
    if (suggestion !== undefined) process.stderr.write(`Did you mean '${suggestion}'?\n`)
    return EXIT.failure
  }

  // Step 1: legacy schemas bypass the cospec gate entirely.
  const resolution = resolveSchema(base, change.schema)
  if (resolution.kind === 'legacy') return applyLegacy(change, ctx, root)

  // Step 2: fast validation. Errors block the gate outright.
  const vctx = buildValidateContext(base)
  const report = await validateChange(root, change, vctx, { strict: false, fast: true })
  if (!report.valid) {
    printReport(report, ctx)
    return EXIT.failure
  }

  // Step 3: required-artifact presence (done == file exists). `applyRequires`
  // is the schemaVersion-filtered set (DESIGN §5): a change stamped/defaulted
  // to v1 is grandfathered out of the v2-introduced artifacts (verification for
  // feat/fix/perf/refactor) rather than hard-blocked by the retrofit.
  const applyRequires = enforcedApplyRequires(
    change.schema as CospecType,
    change.schemaVersion ?? 1,
  )
  const missing = missingArtifacts(change.dir, applyRequires)
  if (missing.length > 0) {
    if (flags.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            change: change.id,
            type: change.schema,
            gate: { state: 'blocked', reason: 'missing-artifacts', missingArtifacts: missing },
          },
          null,
          2,
        )}\n`,
      )
    } else {
      process.stdout.write(`blocked: missing artifacts: ${missing.join(', ')}\n`)
      const first = missing[0]!
      process.stdout.write(`next: cospec instructions ${first} --change ${change.id}\n`)
    }
    return EXIT.blocked
  }

  // Step 4: blocker gate. Self-heal against the archive first (§5.1 step 4c).
  const blockersPath = join(change.dir, BLOCKERS_FILE)
  const archived = archiveMap(base)
  const active = new Set(listChanges(base).map((c) => c.id))
  const original = readFileSync(blockersPath, 'utf8')
  const heal = syncBlockers(original, archived, active, { fix: true })
  if (heal.changed) atomicWrite(blockersPath, heal.output)
  const parsed = parseBlockers(heal.output)
  const gate = computeGate(parsed, archived, active)

  if (gate.hard.length > 0) {
    if (flags.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            change: change.id,
            type: change.schema,
            gate: {
              state: 'blocked',
              reason: 'hard-blockers',
              hardBlockers: gate.hard,
              synced: heal.synced,
            },
          },
          null,
          2,
        )}\n`,
      )
    } else {
      process.stdout.write(`blocked: ${gate.hard.length} unchecked hard blocker(s):\n`)
      for (const b of gate.hard) {
        const where = b.active
          ? 'active change — implement and archive it first'
          : 'not an active change'
        process.stdout.write(
          `  \`${b.slug}\`${b.description !== undefined ? ` — ${b.description}` : ''} (${where})\n`,
        )
      }
    }
    return EXIT.blocked
  }

  // Step 4b: surface soft-blockers (DESIGN §3.3 step 2, §3.4). Every
  // surface-driven consequence is folded into the same `gate.soft` list the
  // blocking-changes gate already uses — one exit-3 mechanism, one
  // `--allow-soft` acknowledgment, no new exit-code contract. Two sources,
  // covering all types uniformly:
  //   1. `meta/surface-unmet` — an O(trig) type (revert/build/ci) whose
  //      verification.md is absent, so there is no row to inspect.
  //   2. the `design/*` section gaps and `verification/*` per-row gaps the fast
  //      validation (step 2) already reported as WARNINGs against a present
  //      file — the case that previously only warned and never blocked apply.
  const proposalPath = join(change.dir, 'proposal.md')
  const proposalText = existsSync(proposalPath) ? readFileSync(proposalPath, 'utf8') : undefined
  const verificationExists = artifactDone(change.dir, 'verification')
  for (const c of surfaceUnmetConsequences(
    change.schema as CospecType,
    proposalText,
    verificationExists,
  )) {
    gate.soft.push({
      slug: `surface:${c.flag}`,
      description: `the '${c.flag}' surface flag is checked but verification.md does not exist yet`,
      active: false,
    })
  }
  for (const issue of report.issues) {
    if (!SURFACE_SOFT_RULES.has(issue.rule)) continue
    gate.soft.push({ slug: `surface:${issue.rule}`, description: issue.message, active: false })
  }

  if (gate.soft.length > 0 && !allowSoft) {
    if (flags.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            change: change.id,
            type: change.schema,
            gate: { state: 'soft-blocked', softBlockers: gate.soft, synced: heal.synced },
          },
          null,
          2,
        )}\n`,
      )
    } else {
      process.stdout.write(`soft-blocked: ${gate.soft.length} unconfirmed soft blocker(s):\n`)
      for (const b of gate.soft)
        process.stdout.write(
          `  \`${b.slug}\`${b.description !== undefined ? ` — ${b.description}` : ''}\n`,
        )
      process.stdout.write('re-run with --allow-soft after confirming with the user.\n')
    }
    return EXIT.softBlocked
  }

  const softAcknowledged = allowSoft ? gate.soft.map((s) => s.slug) : []

  // Step 5: fetch the apply payload from openspec.
  let instr: ApplyInstructionsJson
  try {
    instr = await openspecApplyInstructions(root, change.id)
  } catch (err) {
    const msg = err instanceof OpenspecCallError ? err.message : (err as Error).message
    process.stderr.write(`cospec apply: ${msg}\n`)
    return EXIT.failure
  }

  // Step 6: merged clear-gate output.
  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          change: change.id,
          type: change.schema,
          gate: { state: 'clear', hardBlockers: [], softAcknowledged, synced: heal.synced },
          apply: instr,
        },
        null,
        2,
      )}\n`,
    )
  } else {
    process.stdout.write(`apply gate: clear — ${change.id} (${change.schema})\n`)
    if (heal.synced.length > 0)
      process.stdout.write(
        `auto-checked blocker(s): ${heal.synced.map((s) => `\`${s}\``).join(', ')}\n`,
      )
    if (softAcknowledged.length > 0)
      process.stdout.write(
        `soft blocker(s) acknowledged: ${softAcknowledged.map((s) => `\`${s}\``).join(', ')}\n`,
      )
    process.stdout.write(
      `${instr.progress.remaining} of ${instr.progress.total} task(s) remaining.\n`,
    )
    process.stdout.write(`\n${instr.instruction}\n`)
  }
  return EXIT.success
}
