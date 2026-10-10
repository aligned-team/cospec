// The project's own inputs to `cospec apply`, printed in its human transcript (change
// `canon-workflow-parity`, design D7): ports of the pinned binary's
// `renderReferencedStoresSection` and `printOperationInputsText`.

import type { ApplyInstructionsJson } from './openspec.ts'

/** The `### Referenced Stores` section the binary prints before the apply instruction. */
export function renderReferencesSection(_instr: ApplyInstructionsJson): string {
  return ''
}

/** The `### Project Context` and `### Operation Guidance` sections printed after it. */
export function renderOperationInputs(_instr: ApplyInstructionsJson): string {
  return ''
}
