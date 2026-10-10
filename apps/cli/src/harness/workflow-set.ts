// The workflow set a profile selects (workflow-profiles design D3). `core` is the manifest's
// `core: true` entries; `custom` is the user's own list, spelled as upstream spells it, read the
// way the pinned binary's `getProfileWorkflows` reads it plus the filtering `update` applies.

import type { GlobalProfile } from '../core/global-profile.ts'
import type { Delivery } from './delivery.ts'
import { readWorkflowManifest, type WorkflowManifest } from './render.ts'

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

/** How the effective profile and delivery were chosen, for the receipt and `--json`. */
export interface WorkflowSelection {
  /** The profile in force, or undefined when no flag or global key set one. */
  profile?: { name: Profile; source: 'flag' | 'config'; workflows: string[] }
  /** Whether the global file set `delivery`. */
  deliverySet: boolean
  delivery: Delivery
  /** The installed workflow ids; undefined installs every workflow. */
  installed?: ReadonlySet<string>
}

/**
 * The profile a `--profile` flag, else the global file's `profile` key, selects; nothing when
 * neither is set (upstream's built-in `core` default is not a choice the user made). The
 * workflow list is the global file's even when the flag picks the profile.
 */
export function selectWorkflows(
  flagProfile: Profile | undefined,
  global: GlobalProfile,
): WorkflowSelection {
  const name = flagProfile ?? global.profile
  const delivery = global.delivery ?? 'both'
  const base = { deliverySet: global.delivery !== undefined, delivery }
  if (name === undefined) return base
  const workflows = profileWorkflows(name, global.workflows, readWorkflowManifest())
  return {
    ...base,
    profile: { name, source: flagProfile !== undefined ? 'flag' : 'config', workflows },
    installed: new Set(workflows),
  }
}

/** The receipt's one line naming the explicit profile and delivery, or none when neither is set. */
export function workflowsLine(selection: WorkflowSelection): string | undefined {
  const { profile } = selection
  if (profile === undefined && !selection.deliverySet) return undefined
  const total = readWorkflowManifest().workflows.length
  const count = profile?.workflows.length ?? total
  const parts: string[] = []
  if (profile !== undefined) {
    const by = profile.source === 'flag' ? '--profile' : 'the global config'
    parts.push(`profile ${profile.name}, set by ${by}`)
  }
  if (selection.deliverySet) parts.push(`delivery ${selection.delivery}, set by the global config`)
  const none = count === 0 ? '; no workflows selected' : ''
  return `Workflows: ${count} of ${total} (${parts.join('; ')}${none})`
}
