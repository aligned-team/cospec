import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { splitFrontmatter } from '../core/managed-files.ts'
import { type HarnessAdapter, SKILL_FILE, skillsRoot } from './adapters.ts'
import { OPENSPEC_SKILL_DIRS } from './legacy-skills.ts'
import { readWorkflowManifest } from './render.ts'

/**
 * The home directory a home-relative skills root resolves against, by the pinned binary's
 * `resolveToolSkillsDir` rule: `USERPROFILE`, else `HOME`, else the OS home directory. An empty
 * value counts as unset, since `join('', '.x')` would land the files in the project; the result
 * is absolute. `env` is a test seam.
 */
export function resolveHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  const candidate = [env.USERPROFILE, env.HOME].find((v) => v !== undefined && v !== '')
  return resolve(candidate ?? homedir())
}

/** The absolute skills directory of a home-scoped row (`<home>/.minimax/skills`), else undefined. */
export function homeSkillsDir(row: HarnessAdapter): string | undefined {
  const { root, scope } = skillsRoot(row)
  return scope === 'home' ? join(resolveHomeDir(), root) : undefined
}

/**
 * Whether a home-scoped row's skills directory holds a skill one of `authors` wrote: one of
 * cospec's own skills or one of OpenSpec's, by its frontmatter `metadata.author`, never by name
 * alone. The pinned binary's `getAvailableTools` tests only that the skill file exists; a user's
 * skill that happens to share the name is not evidence here.
 */
export function hasHomeSkillEvidence(
  row: HarnessAdapter,
  authors: readonly ('cospec' | 'openspec')[],
): boolean {
  const dir = homeSkillsDir(row)
  if (dir === undefined) return false
  const names = [...readWorkflowManifest().workflows.map((w) => w.skill), ...OPENSPEC_SKILL_DIRS]
  return names.some((name) => {
    const file = join(dir, name, SKILL_FILE)
    if (!existsSync(file)) return false
    const author = (
      splitFrontmatter(readFileSync(file, 'utf8')).frontmatter?.metadata as
        | { author?: unknown }
        | null
        | undefined
    )?.author
    return typeof author === 'string' && (authors as readonly string[]).includes(author)
  })
}
