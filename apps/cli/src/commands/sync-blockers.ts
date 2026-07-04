// `cospec sync-blockers` (DESIGN §5.3). Reconciles each active change's
// blocking-changes.md against the archive/active indexes. `fix` (the default)
// rewrites STALE checkboxes and normalizes separators; `--check` writes nothing
// and fails on drift. Also invoked as archive's fan-out step (§5.2 step 11) and
// wired into hk pre-commit. Rule classes: STALE / DANGLING / MANUAL-CHECK /
// FORMAT (blockers.ts). Never touches DANGLING/FORMAT lines (agent must fix).

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { syncBlockers, type SyncFinding } from '../core/blockers.ts'
import { listChanges, readArchiveIndex, resolveChange } from '../core/change.ts'

const BLOCKERS_FILE = 'blocking-changes.md'

interface ChangeResult {
  id: string
  findings: SyncFinding[]
  synced: string[]
  changed: boolean
  fullyUnblocked: boolean
}

/** Atomic write via a sibling temp file + rename. */
function atomicWrite(path: string, content: string): void {
  const tmp = `${path}.cospec-tmp`
  writeFileSync(tmp, content)
  renameSync(tmp, path)
}

function hasClass(findings: SyncFinding[], classes: SyncFinding['class'][]): boolean {
  return findings.some((f) => classes.includes(f.class))
}

export function run(ctx: CommandContext): number {
  const { cwd, flags } = ctx
  const check = ctx.args.includes('--check')
  const changeArg = argValue(ctx.args, '--change')

  const archive = readArchiveIndex(cwd)
  const archiveMap = new Map<string, string>()
  for (const [slug, entry] of archive.bySlug) archiveMap.set(slug, entry.date)

  const active = listChanges(cwd)
  const activeSet = new Set(active.map((c) => c.id))

  const targets =
    changeArg !== undefined
      ? [resolveChange(cwd, changeArg)].filter((c): c is NonNullable<typeof c> => c !== undefined)
      : active

  const results: ChangeResult[] = []
  for (const change of targets) {
    const path = join(change.dir, BLOCKERS_FILE)
    if (!existsSync(path)) continue
    const text = readFileSync(path, 'utf8')
    const result = syncBlockers(text, archiveMap, activeSet, { fix: !check })
    if (!check && result.changed) atomicWrite(path, result.output)
    results.push({
      id: change.id,
      findings: result.findings,
      synced: result.synced,
      changed: result.changed,
      fullyUnblocked: result.fullyUnblocked,
    })
  }

  // Exit: --check fails on any STALE/DANGLING/FORMAT; fix fails only on the
  // classes it cannot auto-resolve (DANGLING/FORMAT).
  const failClasses: SyncFinding['class'][] = check
    ? ['STALE', 'DANGLING', 'FORMAT']
    : ['DANGLING', 'FORMAT']
  const failed = results.some((r) => hasClass(r.findings, failClasses))

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          version: 1,
          mode: check ? 'check' : 'fix',
          changes: results,
          fullyUnblocked: results.filter((r) => r.fullyUnblocked).map((r) => r.id),
        },
        null,
        2,
      )}\n`,
    )
    return failed ? 1 : 0
  }

  renderHuman(results, check)
  return failed ? 1 : 0
}

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1]
  const eq = args.find((a) => a.startsWith(`${flag}=`))
  return eq?.slice(flag.length + 1)
}

function renderHuman(results: ChangeResult[], check: boolean): void {
  const lines: string[] = []
  for (const r of results) {
    if (r.findings.length === 0 && r.synced.length === 0) continue
    lines.push(`${r.id}:`)
    for (const f of r.findings) {
      const where = f.slug !== undefined ? `\`${f.slug}\`` : `line ${f.line}`
      lines.push(`  ${f.class.padEnd(12)} ${where}  ${f.message}`)
    }
    if (!check && r.synced.length > 0)
      lines.push(`  checked off: ${r.synced.map((s) => `\`${s}\``).join(', ')}`)
  }

  const unblocked = results.filter((r) => r.fullyUnblocked).map((r) => r.id)
  if (unblocked.length > 0)
    lines.push(`Now fully unblocked: ${unblocked.map((s) => `\`${s}\``).join(', ')}`)

  if (lines.length === 0) {
    process.stdout.write('sync-blockers: nothing to do\n')
    return
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}
