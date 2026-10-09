// The machine-global workflow settings, read once for every command that installs workflows
// (workflow-profiles design D2). A key is present in the result only when the global config file
// holds it: a profile applies only when the user set one, so upstream's built-in `core` default
// never counts. The file is found the way root selection finds it, through `openspec config path`.

import type { Delivery } from '../harness/delivery.ts'
import type { Profile } from '../harness/workflow-set.ts'
import { readGlobalConfigDocument } from './root.ts'

export interface GlobalProfile {
  /** Present iff the file holds a `profile` key, whatever its value: `custom`, else `core`. */
  profile?: Profile
  /** Present iff the file holds a `workflows` key, raw: `workflow-set.ts` reads it. */
  workflows?: unknown
  /** Present iff the file holds a `delivery` key; any value but `skills`/`commands` is `both`. */
  delivery?: Delivery
}

/**
 * Nothing is set when the file is missing, unreadable, not JSON or not an object. `warn` is
 * the invalid-JSON line the binary prints on `init` and `update`, through the same once-per-path
 * guard root selection uses, so a command that reads both prints it once; off by default.
 */
export async function readGlobalProfile(
  cwd: string,
  opts: { warn?: boolean } = {},
): Promise<GlobalProfile> {
  const raw = await readGlobalConfigDocument(cwd, { warn: opts.warn === true })
  const out: GlobalProfile = {}
  if (raw === undefined) return out
  if (raw.profile !== undefined) out.profile = raw.profile === 'custom' ? 'custom' : 'core'
  if (raw.workflows !== undefined) out.workflows = raw.workflows
  if (raw.delivery !== undefined) {
    out.delivery = raw.delivery === 'skills' || raw.delivery === 'commands' ? raw.delivery : 'both'
  }
  return out
}
