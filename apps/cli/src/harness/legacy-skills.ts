// Non-destructive migration of cospec's Codex skills out of the legacy
// `.codex/skills/` root and into the vendor-neutral `.agents/skills/` root that
// OpenSpec 1.11.0 and every AGENTS.md-aware assistant read.
//
// This is a separate step, not something `removeOrphanMarkdown` can do: that
// scan only visits skill bases derived from the CURRENT render, so `.codex/skills`
// dropped out of its scope the moment the codex path template changed.
//
// Safety rules, in order of importance:
//   - only files at exactly `<legacy root>/cospec-*/SKILL.md` are ever deleted;
//     the roots are compile-time constants, never manifest keys;
//   - a file is deleted only when it still hashes to its own stamped
//     `contentHash` (i.e. the user never edited it) or `--force` was passed;
//   - a file cospec did not author is left alone and not even reported;
//   - a legacy skill with no freshly rendered replacement is never deleted;
//   - directories go away via `rmdir`-if-empty, never a recursive remove, so a
//     stray user file in `.codex/skills/` keeps the whole tree alive.

import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import {
  computeContentHash,
  MANAGED_AUTHOR,
  splitFrontmatter,
  type WriteResult,
} from '../core/managed-files.ts'

/** Where cospec's Codex skills used to be written (cospec <= 0.6.0). */
export const LEGACY_CODEX_SKILL_ROOT = '.codex/skills'

/** Where they live now — shared with the `agents` target, byte for byte. */
export const SHARED_SKILL_ROOT = '.agents/skills'

export interface MigrateOptions {
  dryRun: boolean
  force: boolean
}

/**
 * Move cospec's legacy `.codex/skills/cospec-*` install to `.agents/skills`.
 * Runs AFTER generation, and only when this run actually rendered shared-root
 * skills — a fresh canonical copy always exists before anything legacy is
 * touched, so the "move" is a delete of a now-redundant duplicate.
 *
 * `emitted` is the set of repo-relative markdown paths this run rendered.
 */
export function migrateLegacySkills(
  cwd: string,
  emitted: ReadonlySet<string>,
  opts: MigrateOptions,
): WriteResult[] {
  const legacyRoot = join(cwd, LEGACY_CODEX_SKILL_ROOT)
  if (!existsSync(legacyRoot)) return []
  if (!renderedSharedSkills(emitted)) return []

  const out: WriteResult[] = []
  const entries = readdirSync(legacyRoot, { withFileTypes: true }).toSorted((a, b) =>
    a.name.localeCompare(b.name),
  )
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('cospec-')) continue
    const relpath = `${LEGACY_CODEX_SKILL_ROOT}/${entry.name}/SKILL.md`
    const abspath = join(cwd, relpath)
    if (!existsSync(abspath)) continue

    const text = readFileSync(abspath, 'utf8')
    const meta = readManagedMeta(text)
    // Foreign: not ours to move, not ours to report.
    if (meta.author !== MANAGED_AUTHOR || meta.contentHash === undefined) continue

    // No replacement was rendered for this skill (a workflow this version
    // dropped). Never delete without a replacement; report it so the user is
    // told the file is still sitting in a legacy location.
    if (!emitted.has(`${SHARED_SKILL_ROOT}/${entry.name}/SKILL.md`)) {
      out.push({ path: relpath, outcome: 'preserved-modified' })
      continue
    }

    const { body } = splitFrontmatter(text)
    if (opts.force || computeContentHash(body) === meta.contentHash) {
      if (!opts.dryRun) {
        rmSync(abspath)
        rmdirIfEmpty(join(legacyRoot, entry.name))
      }
      out.push({ path: relpath, outcome: 'removed' })
      continue
    }
    out.push({ path: relpath, outcome: 'preserved-modified' })
  }

  // `.codex/skills` only — never `.codex/` itself, which still holds
  // `.codex/rules/cospec.rules`.
  if (!opts.dryRun) rmdirIfEmpty(legacyRoot)
  return out
}

function renderedSharedSkills(emitted: ReadonlySet<string>): boolean {
  for (const path of emitted) {
    if (path.startsWith(`${SHARED_SKILL_ROOT}/cospec-`)) return true
  }
  return false
}

function rmdirIfEmpty(abspath: string): void {
  if (!existsSync(abspath)) return
  if (readdirSync(abspath).length > 0) return
  rmdirSync(abspath)
}

interface ManagedMeta {
  author?: string
  contentHash?: string
}

function readManagedMeta(text: string): ManagedMeta {
  const { frontmatter } = splitFrontmatter(text)
  const meta = frontmatter?.metadata
  if (meta === null || typeof meta !== 'object') return {}
  const record = meta as Record<string, unknown>
  return {
    author: typeof record.author === 'string' ? record.author : undefined,
    contentHash: typeof record.contentHash === 'string' ? record.contentHash : undefined,
  }
}
