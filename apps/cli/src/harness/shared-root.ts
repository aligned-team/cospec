import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { assertPathWithin } from '../core/glob.ts'
import {
  type HarnessAdapter,
  HARNESS_TABLE,
  legacySkillsRoots,
  SKILL_FILE,
  skillsRoot,
} from './adapters.ts'
import { readWorkflowManifest } from './render.ts'

// One skills root can hold one rendered variant of each skill. When several rows resolve to
// the same project skills root (`codex`, `agents`, `antigravity` and `zed` all use
// `.agents/skills`), exactly one of them writes it. This is a port of the pinned binary's
// `core/shared-skill-target.js`, with two deliberate differences: the marker is
// `.cospec-target` (upstream's `.openspec-target` names the owner of OpenSpec's own
// `openspec-*` skills, never cospec's), and content inference is replaced by cospec's
// pre-marker evidence, because cospec's shared bodies always spell both `$cospec-` and
// `/cospec-`, so a body cannot tell codex from agents.

/** The ownership marker's file name, inside the shared skills root. */
export const SHARED_TARGET_MARKER = '.cospec-target'

/** The vendor-neutral row an unmarked shared root keeps, as upstream's arbiter does. */
const NEUTRAL_ID = 'agents'
/** Upstream's preferred fresh owner: its skills spell both the Codex and the generic form. */
const DUAL_SPELLING_ID = 'codex'

function skillNames(): string[] {
  return readWorkflowManifest().workflows.map((w) => w.skill)
}

function errnoCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('code' in err)) return undefined
  const { code } = err as { code: unknown }
  return typeof code === 'string' ? code : undefined
}

/**
 * Whether `relpath` stays inside `cwd`, symlinks included. A path that leaves it is no
 * ownership signal (upstream's `assertProjectArtifactPath`); an errno failure while proving
 * it is not a containment answer and propagates.
 */
function isProjectPath(cwd: string, relpath: string): boolean {
  try {
    assertPathWithin(cwd, join(cwd, relpath))
    return true
  } catch (err) {
    if (errnoCode(err) !== undefined) throw err
    return false
  }
}

function projectFileExists(cwd: string, relpath: string): boolean {
  return isProjectPath(cwd, relpath) && existsSync(join(cwd, relpath))
}

/** The marker naming a shared root's writer, trimmed; a missing or blank one is no signal. */
export function readSharedSkillTarget(cwd: string, root: string): string | undefined {
  const relpath = `${root}/${SHARED_TARGET_MARKER}`
  if (!isProjectPath(cwd, relpath)) return undefined
  let text: string
  try {
    text = readFileSync(join(cwd, relpath), 'utf8')
  } catch (err) {
    const code = errnoCode(err)
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR') return undefined
    throw err
  }
  return text.trim() || undefined
}

/** Whether `root` already holds one of cospec's skills (upstream's `hasCurrentSkills`). */
function hasCurrentSkills(cwd: string, root: string): boolean {
  return skillNames().some((skill) => projectFileExists(cwd, `${root}/${skill}/${SKILL_FILE}`))
}

/** Whether the row still has a cospec skill under one of its legacy roots. */
function hasLegacySkills(cwd: string, row: HarnessAdapter): boolean {
  return legacySkillsRoots(row).some((root) => hasCurrentSkills(cwd, root))
}

/**
 * cospec's pre-marker evidence, standing where upstream infers the owner from skill bodies:
 * the Codex row's rules file, or a cospec skill left in its legacy `.codex/skills` tree,
 * means `codex`. Nothing on disk can mean `agents`.
 */
function preMarkerOwner(cwd: string, table: readonly HarnessAdapter[]): string | undefined {
  const codex = table.find((r) => r.id === DUAL_SPELLING_ID)
  if (codex === undefined) return undefined
  const rules = codex.rulesPath !== undefined && projectFileExists(cwd, codex.rulesPath)
  return rules || hasLegacySkills(cwd, codex) ? codex.id : undefined
}

function tableIndex(table: readonly HarnessAdapter[], id: string): number {
  const index = table.findIndex((r) => r.id === id)
  if (index === -1) throw new Error(`internal: no harness adapter row for '${id}'`)
  return index
}

/**
 * The given rows grouped by project skills root, each group in table order. A home-scoped
 * row has no project root to share and is returned alone under its own key.
 */
function groupByRoot(
  ids: readonly string[],
  table: readonly HarnessAdapter[],
): Map<string, HarnessAdapter[]> {
  const rows = [...new Set(ids)]
    .toSorted((a, b) => tableIndex(table, a) - tableIndex(table, b))
    .map((id) => table[tableIndex(table, id)]!)
  const groups = new Map<string, HarnessAdapter[]>()
  for (const r of rows) {
    const { root, scope } = skillsRoot(r)
    const key = scope === 'project' ? root : `home:${r.id}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  return groups
}

/**
 * The one selected row that renders each skills root (upstream's `resolveSharedSkillWriters`).
 * A row alone on its root is its own writer. Otherwise the preferred pool is the selected
 * rows with no command surface when any is selected, else all of them, and the writer is
 * the first of: the marker's row, the pre-marker evidence's row, `agents` when the root
 * already holds a cospec skill, `codex`, the pool's first row in table order.
 */
export function resolveSharedSkillWriters(
  cwd: string,
  ids: readonly string[],
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): Set<string> {
  const writers = new Set<string>()
  for (const [root, group] of groupByRoot(ids, table)) {
    if (group.length === 1) {
      writers.add(group[0]!.id)
      continue
    }
    const skillsNative = group.filter((r) => r.commands === undefined)
    const pool = skillsNative.length > 0 ? skillsNative : group
    const pick = (id: string | undefined) => pool.find((r) => r.id === id)
    const owner =
      pick(readSharedSkillTarget(cwd, root)) ??
      pick(preMarkerOwner(cwd, table)) ??
      (hasCurrentSkills(cwd, root) ? pick(NEUTRAL_ID) : undefined) ??
      pick(DUAL_SPELLING_ID) ??
      pool[0]!
    writers.add(owner.id)
  }
  return writers
}

/**
 * The row each group of `ids` that shares a skills root was last written for (upstream's
 * `reconcileSharedSkillTargets`), in table order: the marker's row, the pre-marker
 * evidence's row, `agents` when the root holds a cospec skill, a row whose legacy root still
 * holds one, else `agents`. With `agents` absent from the group, its first row stands in.
 */
export function reconcileSharedSkillTargets(
  cwd: string,
  ids: readonly string[],
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): string[] {
  const reconciled: string[] = []
  for (const [root, group] of groupByRoot(ids, table)) {
    if (group.length === 1) {
      reconciled.push(group[0]!.id)
      continue
    }
    const pick = (id: string | undefined) => group.find((r) => r.id === id)
    const neutral = pick(NEUTRAL_ID) ?? group[0]!
    const owner =
      pick(readSharedSkillTarget(cwd, root)) ??
      pick(preMarkerOwner(cwd, table)) ??
      (hasCurrentSkills(cwd, root) ? neutral : undefined) ??
      group.find((r) => hasLegacySkills(cwd, r)) ??
      neutral
    reconciled.push(owner.id)
  }
  return reconciled.toSorted((a, b) => tableIndex(table, a) - tableIndex(table, b))
}

/** The table's rows on `row`'s project skills root, `row` included. */
function rowsSharingRoot(row: HarnessAdapter, table: readonly HarnessAdapter[]): HarnessAdapter[] {
  if (row.skillsDir === undefined) return [row]
  return table.filter((r) => r.skillsDir === row.skillsDir)
}

/**
 * Whether `id` is the writer of its skills root here (upstream's `isSharedSkillTargetActive`):
 * always, for a root no other table row shares; otherwise when reconciling every row of the
 * table on that root resolves to it. `update` and `doctor` ask this before reading a shared
 * root's skills as evidence for a row.
 */
export function isSharedSkillTargetActive(
  cwd: string,
  id: string,
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): boolean {
  const row = table[tableIndex(table, id)]!
  const sharing = rowsSharingRoot(row, table)
  if (sharing.length < 2) return true
  return reconcileSharedSkillTargets(
    cwd,
    sharing.map((r) => r.id),
    table,
  ).includes(id)
}

export interface SharedTargetMarker {
  relpath: string
  content: string
}

/**
 * The marker each writer stamps on its root: whenever a writer's project skills root is one
 * the table shares, even when it was selected alone (as upstream's `writeSharedSkillTarget`),
 * so a later run's arbiter and detection read the same answer.
 */
export function sharedTargetMarkers(
  writers: ReadonlySet<string>,
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): SharedTargetMarker[] {
  const markers: SharedTargetMarker[] = []
  for (const r of table) {
    if (!writers.has(r.id) || rowsSharingRoot(r, table).length < 2) continue
    markers.push({ relpath: `${skillsRoot(r).root}/${SHARED_TARGET_MARKER}`, content: `${r.id}\n` })
  }
  return markers
}
