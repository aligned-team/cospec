// A line-for-line port of the pinned binary's `core/templates/optional-workflow.js`
// (workflow-profiles design D6). The patterns and the three failure messages are upstream's,
// byte for byte, and `test/contract/optional-workflow-differential.test.ts` compares this
// module against the pinned one over a matrix of texts and installed sets. The messages name
// `getSkillTemplates()`/`getCommandTemplates()`, which cospec does not have; they stay verbatim
// because the differential compares against them.

const OPEN = '[[opsx:if-workflow '
const OPEN_END = ']]'
const ELSE = '[[opsx:else]]'
const END = '[[opsx:end]]'

// Matched before the inline pattern so a branch that resolves to empty takes its whole line
// with it: a blank line left behind would end a markdown table or list.
const WHOLE_LINE_PATTERN =
  /^([ \t]*)\[\[opsx:if-workflow ([a-z-]+)\]\]([^\n]*?)\[\[opsx:else\]\]([^\n]*?)\[\[opsx:end\]\][ \t]*\r?\n/gm
const CONDITIONAL_PATTERN =
  /\[\[opsx:if-workflow ([a-z-]+)\]\]([\s\S]*?)\[\[opsx:else\]\]([\s\S]*?)\[\[opsx:end\]\]/g
const RESIDUAL_MARKER_PATTERN = /\[\[opsx:(if-workflow|else|end)/
const MARKER_PATTERN = /\[\[opsx:(?:if-workflow [a-z-]+|else|end)\]\]/g
const MARKER_LIKE_PATTERN = /\[\[opsx:/

/**
 * Rejects a malformed conditional before any branch is chosen, so a truncated block in the
 * branch that would be discarded fails for every installed set, not only some.
 */
function assertConditionalsWellFormed(text: string): void {
  const kinds: string[] = []
  const withoutMarkers = text.replace(MARKER_PATTERN, (marker) => {
    kinds.push(marker.startsWith(OPEN) ? 'if' : marker === ELSE ? 'else' : 'end')
    return ''
  })
  const unrecognized = MARKER_LIKE_PATTERN.exec(withoutMarkers)
  if (unrecognized) {
    throw new Error(
      `Malformed optional-workflow conditional: unrecognized marker at '${
        withoutMarkers.slice(unrecognized.index, unrecognized.index + 40).split('\n')[0]
      }'. Markers are [[opsx:if-workflow <id>]], [[opsx:else]] and [[opsx:end]].`,
    )
  }
  for (let i = 0; i < kinds.length; i += 3) {
    if (kinds[i] !== 'if' || kinds[i + 1] !== 'else' || kinds[i + 2] !== 'end') {
      throw new Error(
        'Malformed optional-workflow conditional: markers are out of order or a ' +
          'block is incomplete. Each block needs the full [[opsx:if-workflow <id>]] ' +
          '... [[opsx:else]] ... [[opsx:end]] form, and blocks cannot nest.',
      )
    }
  }
}

/** A passage whose wording depends on whether `workflowId` is installed. */
export function optionalWorkflow(
  workflowId: string,
  whenInstalled: string,
  whenMissing: string,
): string {
  return `${OPEN}${workflowId}${OPEN_END}${whenInstalled}${ELSE}${whenMissing}${END}`
}

/** A passage dropped entirely (its line with it, when it is the whole line) when not installed. */
export function onlyWithWorkflow(workflowId: string, whenInstalled: string): string {
  return optionalWorkflow(workflowId, whenInstalled, '')
}

/**
 * Keeps one branch of every conditional in `text`, against the workflows that will be
 * installed. Runs on the raw canon body, before the type table and any reference respelling.
 */
export function resolveOptionalWorkflows(
  text: string,
  installedWorkflows: ReadonlySet<string>,
): string {
  assertConditionalsWellFormed(text)
  const wholeLinesResolved = text.replace(
    WHOLE_LINE_PATTERN,
    (_match, indent: string, workflowId: string, whenInstalled: string, whenMissing: string) => {
      const chosen = installedWorkflows.has(workflowId) ? whenInstalled : whenMissing
      return chosen === '' ? '' : `${indent}${chosen}\n`
    },
  )
  const resolved = wholeLinesResolved.replace(
    CONDITIONAL_PATTERN,
    (_match, workflowId: string, whenInstalled: string, whenMissing: string) =>
      installedWorkflows.has(workflowId) ? whenInstalled : whenMissing,
  )
  assertWorkflowConditionalsResolved(resolved, 'Malformed optional-workflow conditional')
  return resolved
}

/**
 * The first optional-workflow marker still standing in `text`, whole (`[[opsx:if-workflow
 * verify]]`) when it is closed on its line, or undefined: what `cospec doctor` reports in a
 * file cospec wrote, where a marker means resolution was skipped.
 */
export function residualWorkflowMarker(text: string): string | undefined {
  return /\[\[opsx:(?:if-workflow|else|end)[^\]\n]*(?:\]\])?/.exec(text)?.[0]
}

/**
 * Throws if `text` still carries a marker: at the end of resolution, and again at each write
 * point, so a body that skipped resolution never ships literal markers.
 */
export function assertWorkflowConditionalsResolved(text: string, reason: string): void {
  const residual = RESIDUAL_MARKER_PATTERN.exec(text)
  if (residual) {
    throw new Error(
      `${reason}: '${residual[0]}' is unresolved. Optional-workflow blocks are ` +
        'resolved by getSkillTemplates()/getCommandTemplates() against the installed ' +
        'workflow set, and each needs the full [[opsx:if-workflow <id>]] ... ' +
        '[[opsx:else]] ... [[opsx:end]] form.',
    )
  }
}

/** The write-point reason for a skill body (upstream `skill-generation.js`). */
export function skillWriteReason(name: string): string {
  return `Skill '${name}' was generated without resolving its optional-workflow blocks`
}

/** The write-point reason for a command body (upstream `command-generation/generator.js`). */
export function commandWriteReason(id: string): string {
  return `Command '${id}' was generated without resolving its optional-workflow blocks`
}
