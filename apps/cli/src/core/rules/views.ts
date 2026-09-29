// Which view of a spec document each rule reads (see `ReadView` in
// `core/deltas.ts`). Gates read what openspec's archive reads — fences masked,
// HTML comments kept; the comment-masked view survives only for the findings
// listed here. `test/unit/rules/views.test.ts` enumerates every `archive/*` and
// `deltas/*` rule in this directory and proves each one reads the view it is
// registered under.

import type { Issue } from './issue.ts'

/**
 * The only findings computed on the comment-masked view. None of them can be
 * triggered by a commented line — on the masked view such a line is blank — so
 * none can refuse what the binary accepts because of a comment, and the
 * verbatim `archive/*` family is the net under each for what the binary
 * refuses:
 *
 * - `deltas/skipped-header` is an INFO and never changes an outcome.
 * - `deltas/scenario-depth` refuses a visible `### Scenario:` only: the binary
 *   merely INFOs a commented one and archives it, so reading it verbatim would
 *   refuse what the binary archives, and a commented one that does split a
 *   requirement is `archive/split-requirement`'s, on the verbatim view.
 * - `specs/purpose-tbd` lints a living spec's Purpose and is read by neither
 *   `apply` nor `archive`.
 */
export const ADVISORY_RULES = [
  'deltas/skipped-header',
  'deltas/scenario-depth',
  'specs/purpose-tbd',
] as const

export type AdvisoryRule = (typeof ADVISORY_RULES)[number]

/** A finding computed on the masked view: its rule can only be an advisory one. */
export interface AdvisoryIssue extends Issue {
  rule: AdvisoryRule
}
