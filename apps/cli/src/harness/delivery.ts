// Delivery (workflow-profiles design D5): which of a row's surfaces a `delivery` value
// generates. The four predicates restate the pinned binary's `core/command-surface.js` over
// cospec's rows, with each row's capability derived from its own data, so a row added later
// is classified with no edit here.

import {
  type BodyDialect,
  type HarnessAdapter,
  type InvocationPrefix,
  type SkillInvocationPrefix,
  skillSpelling,
} from './adapters.ts'

/** The binary's `delivery` enum (`core/config-schema.js`). */
export type Delivery = 'both' | 'skills' | 'commands'

export const DELIVERIES: readonly Delivery[] = ['both', 'skills', 'commands']

export function isDelivery(value: string): value is Delivery {
  return (DELIVERIES as readonly string[]).includes(value)
}

export type CommandSurfaceCapability = 'adapter-backed' | 'skills-invocable' | 'none'

// Upstream's one skills-invocable tool: it invokes skills by name and gets no command files.
const SKILLS_INVOCABLE: ReadonlySet<string> = new Set(['codex'])

export function commandSurfaceCapability(row: HarnessAdapter): CommandSurfaceCapability {
  if (row.commands !== undefined) return 'adapter-backed'
  if (SKILLS_INVOCABLE.has(row.id)) return 'skills-invocable'
  return 'none'
}

export function shouldGenerateSkills(row: HarnessAdapter, delivery: Delivery): boolean {
  return delivery !== 'commands' || commandSurfaceCapability(row) === 'skills-invocable'
}

export function shouldRemoveSkills(row: HarnessAdapter, delivery: Delivery): boolean {
  return delivery === 'commands' && commandSurfaceCapability(row) !== 'skills-invocable'
}

export function shouldGenerateCommands(row: HarnessAdapter, delivery: Delivery): boolean {
  return delivery !== 'skills' && commandSurfaceCapability(row) === 'adapter-backed'
}

export function shouldReconcileCommandFiles(row: HarnessAdapter, delivery: Delivery): boolean {
  return delivery === 'skills' && commandSurfaceCapability(row) === 'adapter-backed'
}

/**
 * A skills root that several selected rows share is generated when any of them generates
 * skills, and removed only when none does.
 */
export function skillsRootGenerated(
  rowsAtRoot: readonly HarnessAdapter[],
  delivery: Delivery,
): boolean {
  return rowsAtRoot.some((row) => shouldGenerateSkills(row, delivery))
}

/**
 * How a row's skill bodies name other workflows when the row has no command files to point
 * at (delivery `skills`): the port of upstream `getTransformerForTool`'s first branch. A row
 * whose skills already use skill references (the shared root's dual spelling, `/skill:`,
 * prose) keeps them; a natural-language tool names the skill; any other row gets upstream's
 * default `/<skill>`, whatever its command prefix.
 */
export function skillReferenceSpelling(row: HarnessAdapter): {
  dialect: BodyDialect
  prefix: InvocationPrefix | SkillInvocationPrefix
} {
  const own = skillSpelling(row)
  if (own.dialect === 'shared' || own.dialect === 'skill' || own.dialect === 'prose') return own
  if (row.skillsOnlyDialect !== undefined) return { dialect: row.skillsOnlyDialect, prefix: '/' }
  return { dialect: 'skill', prefix: '/' }
}

/**
 * The receipt line for selected rows that get no skills and no commands (upstream
 * `core/init.js`, spelled `cospec`), or undefined when every row gets something.
 */
export function zeroArtifactLine(
  rows: readonly HarnessAdapter[],
  delivery: Delivery,
): string | undefined {
  const empty = rows.filter(
    (row) => !shouldGenerateSkills(row, delivery) && !shouldGenerateCommands(row, delivery),
  )
  if (empty.length === 0) return undefined
  const names = empty.map((row) => row.displayName).join(', ')
  return (
    `No skills or commands were generated for ${names}: delivery is set to 'commands' but ` +
    `${empty.length === 1 ? 'it supports' : 'they support'} only skills. ` +
    `Run 'cospec config set delivery both' to generate skills.`
  )
}
