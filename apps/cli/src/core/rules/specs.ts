// specs/* rules for LIVING specs (openspec/specs/<cap>/spec.md), surfaced by
// `cospec validate --specs`. The bulk of living-spec validation is delegated to
// `openspec validate --specs` and merged by the validate command; this module
// adds the quality-leak diagnostic openspec itself does not flag (DESIGN §4.3
// specs/, PMF10). Rule IDs are frozen public API.

import { normalizeRequirementName, type LivingSpec } from '../deltas.ts'
import { parsedRequirements } from '../rebuilt-spec.ts'
import type { Issue } from './issue.ts'
import type { AdvisoryIssue } from './views.ts'

/** openspec's `MAX_REQUIREMENT_TEXT_LENGTH` (`validation/constants.js`). */
export const MAX_REQUIREMENT_TEXT_LENGTH = 500

/**
 * How to bring an over-long requirement under the limit without losing a
 * scenario — openspec's `REQUIREMENT_TOO_LONG` advice, with the scenario rule
 * spelled out for a MODIFIED block, which replaces the whole requirement.
 */
export const REQUIREMENT_TOO_LONG_HINT =
  'move examples and edge cases into scenarios, or split it into separate requirements that each state one behavior; keep every existing scenario under the requirement it tests (a MODIFIED block replaces the whole requirement)'

/** The `specs/requirement-too-long` message for a statement of `length` characters. */
export function requirementTooLongMessage(subject: string, length: number): string {
  return `${subject} requirement text is ${length} characters, over the ${MAX_REQUIREMENT_TEXT_LENGTH}-character limit`
}

/**
 * openspec's twins of cospec's specs/* findings in a delegated `validate`, for
 * the validate command's duplicate suppression: `[1]` of `delegated` is keyed
 * against `[1]` of `nativeKey` where one is given.
 */
export const SPECS_DELEGATED_TWINS = [
  // 1.14.1 living-spec REQUIREMENT_TOO_LONG: its path is an in-document locator
  // (`requirements[N]`), so it pairs on the spec alone — both sides measure the
  // same text, so they fire on the same requirements.
  {
    rule: 'specs/requirement-too-long',
    delegated: /^Requirement text is very long \(>500 characters\)/,
  },
  // 1.14.1 ADDED REQUIREMENT_TOO_LONG, keyed on the requirement both name.
  {
    rule: 'specs/requirement-too-long',
    delegated: /^ADDED "(.*)": Requirement text is very long \(>500 characters\)/,
    nativeKey: /^ADDED "(.*)" requirement text is \d+ characters/,
  },
] as const

/** The placeholder openspec writes into a spec created by archiving (probe §5.5). */
const TBD_PLACEHOLDER = /TBD - created by archiving/

/**
 * A `TBD`/`TODO` *opening* the Purpose — the marker left behind when someone is
 * told to leave "a brief TBD placeholder" and never comes back (openspec 1.11.0
 * `purpose-placeholder`, case (b); case rule from 1.14.x).
 *
 * `WORD_END` keeps it off a longer word that merely starts with those letters
 * ("TBDs", "TODOs"), rejecting any letter, digit or combining mark rather than
 * the ASCII set `\b` knows about: a Purpose is prose, and prose is not always
 * Latin script.
 *
 * Case separates the marker from the word. `TBD`/`TODO` in capitals is the
 * marker whatever follows it. Any other casing is a marker only when the end of
 * the Purpose, a line break or marker punctuation follows, because "Todo el
 * flujo…" (Spanish) and "Todo o fluxo…" (Portuguese) are ordinary openers while
 * `todo - write this` and `tbd.` are still placeholders.
 *
 * A marker *inside* a sentence is deliberately left alone — "the retry budget is
 * TBD pending benchmarks" is a real Purpose with an open question in it, and
 * reporting it would teach people to ignore the warning.
 */
const WORD_END = '(?![\\p{L}\\p{N}\\p{M}_])'
const MARKER_PUNCTUATION = '(?=[ \\t]*(?:$|\\n|[:\\-\u2013\u2014.,;()\\[\\]{}]))'
/** `TBD`/`TODO` in capitals: the marker, whatever follows it. */
const LEADING_MARKER_SHOUTED = new RegExp(`^(?:TBD|TODO)${WORD_END}`, 'u')
/** Any other case: a marker only when punctuation or the end of a line says so. */
const LEADING_MARKER_PUNCTUATED = new RegExp(`^(?:TBD|TODO)${WORD_END}${MARKER_PUNCTUATION}`, 'iu')

/** Whether `purpose` opens with a placeholder marker (the binary's two leading tests). */
export function opensWithPlaceholderMarker(purpose: string): boolean {
  return LEADING_MARKER_SHOUTED.test(purpose) || LEADING_MARKER_PUNCTUATED.test(purpose)
}

/**
 * Cospec-added checks over a single living spec. `path` is the repo-relative
 * spec path used in the report.
 */
export function specsRules(spec: LivingSpec, path: string): Issue[] {
  const issues: Issue[] = []

  // specs/purpose-tbd — the Purpose is a placeholder rather than one anyone
  // wrote. Two forms count and deliberately nothing else: the sentence archive
  // stamps into a newly created capability, and a leading TBD/TODO marker. They
  // overlap (the generated sentence opens with `TBD` too), and one rule emits
  // one finding per spec: the generated sentence wins the wording because it
  // names the exact text to replace. An empty Purpose matches neither and stays
  // untouched — openspec's own empty-Purpose rule owns that case, and two
  // findings on one line help nobody.
  // The advisory view (`rules/views.ts`): a lint that neither apply nor archive reads.
  const { purposeText } = spec.advisory
  const generated = TBD_PLACEHOLDER.test(purposeText)
  const leading = opensWithPlaceholderMarker(purposeText)
  if (generated || leading) {
    const tbd: AdvisoryIssue = {
      level: 'WARNING',
      rule: 'specs/purpose-tbd',
      path,
      message: generated
        ? '## Purpose still holds the archive-generated "TBD - created by archiving" placeholder'
        : '## Purpose opens with a TBD/TODO marker rather than a purpose anyone wrote',
      hint: 'write a real one-paragraph purpose for this capability',
    }
    issues.push(tbd)
  }

  // specs/requirement-too-long — a statement over 500 characters, measured on
  // the text openspec's spec reader measures (`extractRequirementText`: the
  // body up to the first scenario, else the header title), on the verbatim
  // view: an HTML comment is text to it.
  for (const req of parsedRequirements(spec.archive.text)) {
    if (req.text.length <= MAX_REQUIREMENT_TEXT_LENGTH) continue
    const name = normalizeRequirementName(req.title.replace(/^Requirement:\s*/i, ''))
    issues.push({
      level: 'WARNING',
      rule: 'specs/requirement-too-long',
      path,
      line: req.line,
      message: requirementTooLongMessage(`"${name}"`, req.text.length),
      hint: REQUIREMENT_TOO_LONG_HINT,
    })
  }

  return issues
}
