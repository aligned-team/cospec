// `cospec apply <change>` — the deterministic implementation gate (DESIGN §5.1).
// Validates (fast), checks required artifacts are present, self-heals stale
// blocker checkboxes against the archive, then enforces the hard/soft blocker
// gate with exit codes an agent cannot rationalize past (2 = blocked, 3 =
// soft-blocked). On a clear gate it merges `openspec instructions apply --json`
// into a single machine-readable payload — routing every remedy the wrapped
// binary writes into that payload back through `cospec` first (relay guard).
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
import { hasFlag } from '../core/command-table.ts'
import {
  openspecApplyInstructions,
  OpenspecCallError,
  type ApplyInstructionsJson,
  type Root,
} from '../core/openspec.ts'
import { respellRemedies } from '../core/remedies.ts'
import { renderHuman, toJson, type ItemReport } from '../core/report.ts'
import { surfaceUnmetConsequences } from '../core/rules/meta.ts'
import {
  ARTIFACT_FILES,
  enforcedApplyRequires,
  type ArtifactId,
  type CospecType,
} from '../core/rules/type-facts.ts'
import { resolveRootOrDocument } from '../core/upstream-keys.ts'
import type { ArchiveWarning } from './status.ts'
import { readValidateContext, validateChange } from './validate.ts'

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

/**
 * apply.requires ids whose artifact file(s) do not yet exist.
 *
 * `skipSpecs`, when true, satisfies the `specs` requirement regardless of
 * `hasSpecFiles` — the durable (`skip_specs:` in `.openspec.yaml`) or one-shot
 * (`--skip-specs`) escape hatch for a spec-bearing type that legitimately has
 * no deltas (DESIGN §5, OpenSpec 1.7 parity). It never affects any other
 * artifact id.
 */
export function missingArtifacts(
  changeDir: string,
  applyRequires: readonly string[],
  skipSpecs = false,
): string[] {
  return applyRequires.filter((id) => {
    if (id === 'specs' && skipSpecs) return false
    return !artifactDone(changeDir, id)
  })
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

// --- bare-`openspec` relay guard -------------------------------------------

// Every agent-facing OpenSpec access routes through `cospec` (CLAUDE.md), but
// the wrapped binary writes its own remedies into the `instruction` and
// `warnings` strings cospec relays: `describeArtifactRemedy`'s
// `Create it with \`openspec instructions …\` (\`openspec status …\` shows what
// is left).` and `collectApplyWarnings`' `openspec validate`/`instructions`
// sentences. Each is one of upstream's exact sentences in the remedy allowlist
// (`core/remedies.ts`), respelled only where it stands verbatim, so the
// change's own names and paths (the no-delta-specs warning's absolute
// `…/.openspec.yaml`) and a schema's own instruction text pass through as
// written.

/** `text` with each of upstream's own remedy sentences spelled through cospec. */
export function relayThroughCospec(text: string): string {
  return respellRemedies(text)
}

// The canon gate prose (`canon/apply-instruction.yaml`) is schema text, served
// before any change exists, so it names the change as a placeholder (#48).
const APPLY_PLACEHOLDER = 'cospec apply "<change>"'

/**
 * The wrapped apply payload with every relayed remedy routed through cospec,
 * and the canon gate prose's `cospec apply "<change>"` naming `changeId`, the
 * change this run already resolved — never a placeholder for a named change.
 *
 * Applied once, at the call site, so both the human transcript and the `--json`
 * spread carry the same guarded strings — the JSON path is the one agents read.
 * Absent `warnings` stays absent (a change cospec correctly skips must not gain
 * an empty array that reads as "checked, none found").
 */
export function relayApplyInstructions(
  instr: ApplyInstructionsJson,
  changeId: string,
): ApplyInstructionsJson {
  return {
    ...instr,
    instruction: relayThroughCospec(instr.instruction).replaceAll(
      APPLY_PLACEHOLDER,
      `cospec apply "${changeId}"`,
    ),
    ...(instr.warnings !== undefined ? { warnings: instr.warnings.map(relayThroughCospec) } : {}),
  }
}

/** One `Warning:` line per relayed upstream warning, for the human transcript. */
function printWarnings(instr: ApplyInstructionsJson): void {
  for (const w of instr.warnings ?? []) process.stdout.write(`Warning: ${w}\n`)
}

/** The document's `warnings`, when there are any to carry. */
function warningsKey(warnings: readonly ArchiveWarning[]): { warnings?: ArchiveWarning[] } {
  return warnings.length === 0 ? {} : { warnings: [...warnings] }
}

function printReport(
  report: ItemReport,
  ctx: CommandContext,
  warnings: readonly ArchiveWarning[],
): void {
  const out = ctx.flags.json
    ? `${JSON.stringify({ ...toJson([report]), ...warningsKey(warnings) }, null, 2)}\n`
    : renderHuman([report], { noColor: ctx.flags.noColor, title: 'cospec apply' })
  process.stdout.write(out)
}

/**
 * An early exit (design D10): `prose` on stderr, or under `--json` one
 * `{status: [{severity, code: "change_error", message, fix?}]}` document on
 * stdout — the code the binary's `instructions apply` reports for the same
 * lookups — so a `--json` caller always gets one document. Exit 1.
 */
function earlyExit(
  ctx: CommandContext,
  prose: string,
  message: string,
  fix?: string,
  warnings: readonly ArchiveWarning[] = [],
): number {
  if (ctx.flags.json) {
    const status = [
      { severity: 'error', code: 'change_error', message, ...(fix === undefined ? {} : { fix }) },
    ]
    process.stdout.write(`${JSON.stringify({ status, ...warningsKey(warnings) }, null, 2)}\n`)
  } else process.stderr.write(prose)
  return EXIT.failure
}

/** Legacy schema: no cospec gate — delegate to openspec and exit per its state. */
async function applyLegacy(change: Change, ctx: CommandContext, root: Root): Promise<number> {
  let instr: ApplyInstructionsJson
  try {
    instr = relayApplyInstructions(await openspecApplyInstructions(root, change.id), change.id)
  } catch (err) {
    const message = (err as Error).message
    return earlyExit(ctx, `cospec apply: ${message}\n`, message)
  }
  if (ctx.flags.json) {
    process.stdout.write(
      `${JSON.stringify({ change: change.id, type: change.schema, legacy: true, apply: instr }, null, 2)}\n`,
    )
  } else {
    process.stdout.write(
      `note: '${change.schema}' is a legacy schema — cospec's blocker gate is not enforced; delegating to openspec.\n`,
    )
    printWarnings(instr)
    process.stdout.write(`${instr.instruction}\n`)
  }
  return instr.state === 'blocked' ? EXIT.blocked : EXIT.success
}

export async function run(ctx: CommandContext): Promise<number> {
  const { flags } = ctx
  const parsedArgs = ctx.parsed!
  const root = await resolveRootOrDocument(ctx, 'change_error')
  if (root === undefined) return EXIT.failure
  const base = root.base
  const allowSoft = hasFlag(parsedArgs, '--allow-soft')
  // `skip_specs` precedence (DESIGN §5, OpenSpec 1.7 parity): the one-shot CLI
  // flag overrides a persisted `.openspec.yaml` marker, which overrides the
  // structural default (spec-bearing types must show deltas). The conflict
  // case — a marker declared alongside actual files under `specs/` — is a
  // validate-time ERROR owned by the validate rule family; Step 2 below runs
  // fast validation first, so that ERROR blocks the gate before this flag
  // ever gets a chance to paper over it.
  const cliSkipSpecs = hasFlag(parsedArgs, '--skip-specs')
  // Required in the table: the parser has refused a missing one.
  const name = parsedArgs.positionals[0]!

  if (!existsSync(openspecDir(base))) {
    const message = `no openspec/ directory at ${base} — run 'cospec init' first`
    return earlyExit(ctx, `cospec: ${message}\n`, message)
  }

  const change = resolveChange(base, name)
  if (change === undefined) {
    const suggestion = closest(
      name,
      listChanges(base).map((c) => c.id),
    )
    const didYouMean = suggestion === undefined ? '' : `Did you mean '${suggestion}'?`
    return earlyExit(
      ctx,
      `cospec apply: unknown change '${name}'\n${didYouMean === '' ? '' : `${didYouMean}\n`}`,
      `unknown change '${name}'${didYouMean === '' ? '' : `. ${didYouMean}`}`,
    )
  }

  // Step 1: legacy schemas bypass the cospec gate entirely.
  const resolution = resolveSchema(base, change.schema)
  if (resolution.kind === 'legacy') return applyLegacy(change, ctx, root)

  // Step 2: fast validation. Errors block the gate outright.
  // An unreadable archive is read as empty (`readValidateContext`): the gate
  // can only err toward blocked, and the warning says why.
  const { ctx: vctx, warning } = readValidateContext(base)
  const warnings = warning === undefined ? [] : [warning]
  if (!flags.json) for (const w of warnings) process.stderr.write(`Warning: ${w.message}\n`)
  const report = await validateChange(root, change, vctx, { strict: false, fast: true })
  if (!report.valid) {
    printReport(report, ctx, warnings)
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
  const skipSpecs = cliSkipSpecs || change.skipSpecs === true
  const missing = missingArtifacts(change.dir, applyRequires, skipSpecs)
  if (missing.length > 0) {
    if (flags.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            change: change.id,
            type: change.schema,
            ...warningsKey(warnings),
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
  const archived = warning === undefined ? archiveMap(base) : new Map<string, string>()
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
            ...warningsKey(warnings),
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
            ...warningsKey(warnings),
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
    instr = relayApplyInstructions(await openspecApplyInstructions(root, change.id), change.id)
  } catch (err) {
    const msg = err instanceof OpenspecCallError ? err.message : (err as Error).message
    return earlyExit(ctx, `cospec apply: ${msg}\n`, msg, undefined, warnings)
  }

  // Step 6: merged clear-gate output.
  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          change: change.id,
          type: change.schema,
          ...warningsKey(warnings),
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
    printWarnings(instr)
    process.stdout.write(`\n${instr.instruction}\n`)
  }
  return EXIT.success
}
