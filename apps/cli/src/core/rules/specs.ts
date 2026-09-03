// specs/* rules for LIVING specs (openspec/specs/<cap>/spec.md), surfaced by
// `cospec validate --specs`. The bulk of living-spec validation is delegated to
// `openspec validate --specs` and merged by the validate command; this module
// adds the quality-leak diagnostic openspec itself does not flag (DESIGN §4.3
// specs/, PMF10). Rule IDs are frozen public API.

import type { LivingSpec } from '../deltas.ts'
import type { Issue } from './issue.ts'

/** The placeholder openspec writes into a spec created by archiving (probe §5.5). */
const TBD_PLACEHOLDER = /TBD - created by archiving/

/**
 * A `TBD`/`TODO` *opening* the Purpose — the marker left behind when someone is
 * told to leave "a brief TBD placeholder" and never comes back (openspec 1.11.0
 * `purpose-placeholder`, case (b)).
 *
 * The negative lookahead keeps it off a longer word that merely starts with
 * those letters ("TBDs", "TODOs") while still allowing the punctuation a marker
 * is normally written with (`TODO:`, `TBD -`). It rejects any letter, digit or
 * combining mark rather than the ASCII set `\b` knows about: a Purpose is prose,
 * and prose is not always Latin script.
 *
 * A marker *inside* a sentence is deliberately left alone — "the retry budget is
 * TBD pending benchmarks" is a real Purpose with an open question in it, and
 * reporting it would teach people to ignore the warning.
 */
const LEADING_MARKER = /^(?:TBD|TODO)(?![\p{L}\p{N}\p{M}_])/iu

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
  const generated = TBD_PLACEHOLDER.test(spec.purposeText)
  const leading = LEADING_MARKER.test(spec.purposeText)
  if (generated || leading) {
    issues.push({
      level: 'WARNING',
      rule: 'specs/purpose-tbd',
      path,
      message: generated
        ? '## Purpose still holds the archive-generated "TBD - created by archiving" placeholder'
        : '## Purpose opens with a TBD/TODO marker rather than a purpose anyone wrote',
      hint: 'write a real one-paragraph purpose for this capability',
    })
  }

  return issues
}
