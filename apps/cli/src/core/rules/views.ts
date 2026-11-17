// Which view of a spec document each rule reads (see `ReadView` in
// `core/deltas.ts`). Gates read what openspec's archive reads — fences masked,
// HTML comments kept; the comment-masked view survives only for the findings
// listed here. `test/unit/rules/views.test.ts` enumerates every `archive/*`,
// `deltas/*` and `specs/*` rule in this directory and proves each one reads the
// view it is registered under. Every rule not listed below is a verbatim one —
// `specs/requirement-too-long` among them (1.14.1: an HTML comment is
// requirement text to the binary, so it is measured).

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
 *   requirement is `archive/split-requirement`'s, on the verbatim view. Proven
 *   by `test/contract/validation-parity.test.ts` row 36.1 ("commented mis-depth
 *   scenario: the binary archives it and cospec raises no deltas/scenario-depth").
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

/**
 * Findings that read the verbatim document but apply the binary's own comment
 * rule, ported with it: `deltas/dropped-text` is openspec 1.14.2's
 * `findUnappliedContent`, where a commented line holds no text yet a `## `
 * inside a comment is still the section boundary the merge reads. It reads
 * neither view's parse — only the raw text — and it is a WARNING the binary
 * raises on exactly the same lines (`test/unit/parsers/deltas.test.ts` runs
 * both over one fixture set), so it can never refuse what the binary accepts.
 */
export const BINARY_COMMENT_RULES = ['deltas/dropped-text'] as const
