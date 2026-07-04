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
} from '../core/openspec.ts'
import { renderHuman, renderJson, type ItemReport } from '../core/report.ts'
import { ARTIFACT_FILES, TYPE_ARTIFACTS, type ArtifactId } from '../core/rules/type-facts.ts'
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
export function archiveMap(cwd: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const [slug, entry] of readArchiveIndex(cwd).bySlug) map.set(slug, entry.date)
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

function printReport(report: ItemReport, ctx: CommandContext): void {
  const out = ctx.flags.json
    ? renderJson([report])
    : renderHuman([report], { noColor: ctx.flags.noColor, title: 'cospec apply' })
  process.stdout.write(out)
}

/** Legacy schema: no cospec gate — delegate to openspec and exit per its state. */
async function applyLegacy(change: Change, ctx: CommandContext): Promise<number> {
  let instr: ApplyInstructionsJson
  try {
    instr = await openspecApplyInstructions(ctx.cwd, change.id)
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
  const { cwd, flags } = ctx
  const allowSoft = ctx.args.includes('--allow-soft')
  const name = ctx.args.find((a) => !a.startsWith('-'))

  if (name === undefined) {
    process.stderr.write('cospec apply: a change name is required (cospec apply <change>)\n')
    return EXIT.failure
  }

  if (!existsSync(openspecDir(cwd))) {
    process.stderr.write(`cospec: no openspec/ directory at ${cwd} — run 'cospec init' first\n`)
    return EXIT.failure
  }

  const change = resolveChange(cwd, name)
  if (change === undefined) {
    process.stderr.write(`cospec apply: unknown change '${name}'\n`)
    const suggestion = closest(
      name,
      listChanges(cwd).map((c) => c.id),
    )
    if (suggestion !== undefined) process.stderr.write(`Did you mean '${suggestion}'?\n`)
    return EXIT.failure
  }

  // Step 1: legacy schemas bypass the cospec gate entirely.
  const resolution = resolveSchema(cwd, change.schema)
  if (resolution.kind === 'legacy') return applyLegacy(change, ctx)

  // Step 2: fast validation. Errors block the gate outright.
  const vctx = buildValidateContext(cwd)
  const report = await validateChange(cwd, change, vctx, { strict: false, fast: true })
  if (!report.valid) {
    printReport(report, ctx)
    return EXIT.failure
  }

  // Step 3: required-artifact presence (done == file exists).
  const applyRequires = TYPE_ARTIFACTS[change.schema as keyof typeof TYPE_ARTIFACTS].applyRequires
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
  const archived = archiveMap(cwd)
  const active = new Set(listChanges(cwd).map((c) => c.id))
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
    instr = await openspecApplyInstructions(cwd, change.id)
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
