// The workflow set a profile selects (workflow-profiles design D3). `core` is the manifest's
// `core: true` entries; `custom` is the user's own list, spelled as upstream spells it, read the
// way the pinned binary's `getProfileWorkflows` reads it plus the filtering `update` applies.

import type { WorkflowManifest } from './render.ts'

export type Profile = 'core' | 'custom'

export const PROFILES: readonly Profile[] = ['core', 'custom']

export function isProfile(value: string): value is Profile {
  return (PROFILES as readonly string[]).includes(value)
}

/** Upstream's id for the workflow cospec calls `sync-specs` (`canon/parity/aliases.yaml`). */
const UPSTREAM_SYNC = 'sync'
const SYNC = 'sync-specs'

/** The workflows whose archive step needs the sync workflow installed beside it. */
const SYNC_DEPENDENTS: ReadonlySet<string> = new Set(['archive', 'bulk-archive'])

/**
 * The workflow ids `profile` installs, from `workflows` (the global config's raw `workflows`
 * value, used only by `custom`).
 *
 * - `core`: the manifest's `core: true` entries, in manifest order.
 * - `custom`: the list as given, with upstream's `sync` read as `sync-specs`, ids the manifest
 *   does not know dropped, and `sync-specs` spliced in before the first `archive` or
 *   `bulk-archive` when it is absent. A value that is not an array is an empty list, and an
 *   explicit `custom` with no list installs nothing, as the binary's does.
 */
export function profileWorkflows(
  profile: Profile,
  workflows: unknown,
  manifest: WorkflowManifest,
): string[] {
  if (profile === 'core') return manifest.workflows.filter((w) => w.core === true).map((w) => w.id)
  if (!Array.isArray(workflows)) return []
  const known = new Set(manifest.workflows.map((w) => w.id))
  const listed = workflows
    .map((id: unknown) => (id === UPSTREAM_SYNC ? SYNC : id))
    .filter((id): id is string => typeof id === 'string' && known.has(id))
  const dependent = listed.findIndex((id) => SYNC_DEPENDENTS.has(id))
  if (dependent === -1 || listed.includes(SYNC)) return listed
  return [...listed.slice(0, dependent), SYNC, ...listed.slice(dependent)]
}
