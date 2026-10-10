// The project's own inputs to `cospec apply`, printed in its human transcript (change
// `canon-workflow-parity`, design D7). Ports of the pinned binary's `printApplyInstructionsText`
// references section and its `printOperationInputsText` (`dist/commands/workflow/instructions.js`,
// `@fission-ai/openspec` 1.13.1), over the document cospec relays. The two sections are the
// binary's own words, with one deliberate difference: when nothing is configured the binary prints
// `No project context or operation guidance configured.` and cospec prints nothing, so a project
// that configures none sees the transcript it always saw.

import { renderReferencedStoresSection, sanitizeInline } from './instructions-render.ts'
import type { ApplyInstructionsJson } from './openspec.ts'

/**
 * What the printers read: the optional keys of the relayed apply document, or of the archive
 * document (`context` and `operationGuidance`).
 */
type Inputs = Pick<ApplyInstructionsJson, 'context' | 'operationGuidance' | 'references'>

/**
 * The `### Referenced Stores` section, a blank line after it, printed before the apply
 * instruction; `''` when the project declares no references.
 */
export function renderReferencesSection(instr: Inputs): string {
  if (instr.references === undefined || instr.references.length === 0) return ''
  return `${renderReferencedStoresSection(instr.references)}\n\n`
}

/**
 * The `### Project Context` and `### Operation Guidance` sections, each followed by a blank
 * line, printed after the apply instruction; `''` when neither is set. The context is printed
 * verbatim on purpose (the binary documents that escaping a leading `#` would also fire inside
 * fenced code); each guidance entry is one sanitized line.
 */
export function renderOperationInputs(
  instr: Pick<Inputs, 'context' | 'operationGuidance'>,
): string {
  let out = ''
  if (instr.context) {
    out += `### Project Context (required instruction input)\n${instr.context}\n\n`
  }
  if (instr.operationGuidance && instr.operationGuidance.length > 0) {
    out += '### Operation Guidance (advisory)\n'
    for (const guidance of instr.operationGuidance)
      out += `- ${sanitizeInline(guidance, Infinity)}\n`
    out += '\n'
  }
  return out
}
