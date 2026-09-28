// deltas/* rules (DESIGN §4.3) — run before openspec delegation so cospec's
// sharper diagnostics win. Rule IDs are frozen public API.

import { parseAdvisoryDelta, parseDeltaSpec, SHALL_MUST_RE, type Delta } from '../deltas.ts'
import { findRequirementSplits, rebuildSpec } from '../rebuilt-spec.ts'
import type { Issue } from './issue.ts'
import type { LoadedChange } from './schema-info.ts'
import type { AdvisoryIssue } from './views.ts'

const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
/** `specs/<capability-path>/spec.md` — the path may nest (`<area>/<capability>`). */
const SPEC_PATH_RE = /^specs\/(.+)\/spec\.md$/
/** The one delta path openspec 1.7.0 blocks outright: a spec at the specs/ root. */
const ROOT_SPEC_PATH = 'specs/spec.md'
/**
 * Why a requirement with a visible `#### Scenario:` header still has none:
 * the header carries no body, and neither cospec nor the spec reader openspec
 * validates the rebuilt spec against counts it. Wording ported from openspec's
 * `emptyScenarioHint` (`src/core/validation/validator.ts`, 1.13.1) so an author
 * who hits it in both tools reads one instruction, not two.
 */
/**
 * Why a requirement whose header visibly says SHALL/MUST still has none: the
 * keyword counts only in the body. openspec 1.13.1 gives the same instruction
 * (`buildMissingShallOrMustMessage`, `src/core/validation/validator.ts`), which
 * cospec states as a hint while its ERROR keeps cospec's own severity.
 */
const HEADER_ONLY_SHALL_HINT =
  'move the SHALL/MUST statement to the line immediately after the "### Requirement: ..." header'

/** Why a requirement has no statement — and, when its block says SHALL elsewhere, why that is none. */
const MISSING_TEXT_HINT =
  'write the requirement statement on the line under its "### Requirement: ..." header'
const NOT_A_STATEMENT = 'a SHALL/MUST in a scenario step or a fenced example is not one'

/** Why a statement is not normative although its block says SHALL/MUST somewhere below it. */
const BODY_ONLY_SHALL_HINT =
  'SHALL/MUST counts only in the statement under the "### Requirement: ..." header, not in a scenario step or a fenced example'

const EMPTY_SCENARIO_HINT =
  'a scenario header with no body under it does not count; add its steps, e.g. "- **WHEN** ..." and "- **THEN** ..."'

/** A skipped header that is a requirement header with no name (upstream's own test). */
const NAMELESS_REQUIREMENT_RE = /^requirement:?$/i

/**
 * `deltas/skip-specs-conflict` — a change declaring `skip_specs:` in
 * `.openspec.yaml` claims it touches no specs, so any file under `specs/`
 * contradicts it. Not folded into `deltasRules`: that family runs only when
 * delta files parse as deltas, and the whole point here is that a headerless
 * or stray file under `specs/` is silently dropped at archive while the change
 * claims to carry nothing. Matches openspec's own CHANGE_SKIP_SPECS_CONFLICT.
 */
export function skipSpecsConflictIssues(change: LoadedChange): Issue[] {
  if (change.openspecYaml.skipSpecs !== true) return []
  const offenders = change.files.filter((f) => f.startsWith('specs/'))
  if (offenders.length === 0) return []
  return [
    {
      level: 'ERROR',
      rule: 'deltas/skip-specs-conflict',
      path: offenders[0] ?? 'specs/',
      message: `skip_specs is set in .openspec.yaml but ${offenders.length} file(s) exist under specs/`,
      hint: 'remove skip_specs, or delete the delta spec files',
    },
  ]
}

/**
 * `deltas/unread-file` — a markdown file under the change's `specs/` that
 * carries delta sections but is not a capability's `spec.md`
 * (`specs/user-auth.md`, `specs/user-auth/delta.md`). Mirrors openspec's
 * `findUnreadDeltaFiles` (`src/utils/spec-discovery.ts`, 1.13.1).
 *
 * Not folded into `deltasRules`: that family runs only when the change carries
 * real delta files, and the dangerous case is a change whose *only* delta-shaped
 * content sits at one of these paths. Nothing reads it — cospec's `deltaFiles`
 * filter and openspec's own change parser both take `spec.md` alone — so before
 * this rule the change validated clean and archived with nothing merged, while
 * `status`/`apply` counted the specs as written.
 *
 * A companion note with no delta section is NOT reported: that is the shape the
 * `spec.md`-only filter exists to protect, and openspec skips it identically.
 */
export function unreadDeltaFileIssues(change: LoadedChange): Issue[] {
  const issues: Issue[] = []
  for (const file of change.unreadSpecFiles) {
    if (!parseDeltaSpec(file.text, file.path, '').headerPresent) continue
    issues.push({
      level: 'ERROR',
      rule: 'deltas/unread-file',
      path: file.path,
      message: `delta spec found at ${file.path} — delta specs must be a capability's spec.md; this file is ignored when the change is applied or archived`,
      hint: `move its requirements into ${file.expected}`,
    })
  }
  return issues
}

export interface DeltasRuleOptions {
  /**
   * The archive-precondition family is skipped (`--fast`), so no
   * `archive/split-requirement` stands in for a splitting header's INFO.
   */
  fast: boolean
}

export function deltasRules(
  change: LoadedChange,
  opts: DeltasRuleOptions = { fast: false },
): Issue[] {
  const issues: Issue[] = []

  for (const file of change.deltaFiles) {
    // deltas/spec-at-specs-root — a spec.md directly at the specs/ root has no
    // capability folder, so both cospec's merge spot-check and openspec's own
    // archive drop it: the change would validate clean and archive while its
    // requirements never reach openspec/specs/. Reported alone — every other
    // rule below needs a capability this file does not have.
    if (file.path === ROOT_SPEC_PATH) {
      issues.push({
        level: 'ERROR',
        rule: 'deltas/spec-at-specs-root',
        path: file.path,
        message:
          'delta spec found at specs/spec.md — delta specs must live under a capability path (specs/<capability-path>/spec.md); a file at the specs/ root is ignored when the change is applied or archived',
        hint: 'move it to specs/<capability-path>/spec.md',
      })
      continue
    }

    // What openspec reads (see `ReadView`): every finding below that can
    // change an outcome reads this parse. The masked one feeds only the
    // advisory findings `rules/views.ts` lists.
    const parsed = parseDeltaSpec(file.text, file.path, file.capability)
    const advisory = parseAdvisoryDelta(file.text, file.path, file.capability)

    const depth = scenarioDepthIssues(file)
    issues.push(...depth)

    // deltas/capability-kebab — every segment of the capability path is
    // checked, so the nested `specs/<area>/<capability>/spec.md` layout
    // openspec grew in 1.6.0 passes while a malformed segment still fails.
    const pathMatch = SPEC_PATH_RE.exec(file.path)
    const segments = pathMatch?.[1]?.split('/') ?? []
    if (segments.length === 0 || !segments.every((seg) => KEBAB_RE.test(seg))) {
      issues.push({
        level: 'ERROR',
        rule: 'deltas/capability-kebab',
        path: file.path,
        message:
          'every capability-path segment must be kebab-case and the delta file must be specs/<capability-path>/spec.md',
      })
    }

    // deltas/header-present
    if (!parsed.headerPresent) {
      issues.push({
        level: 'ERROR',
        rule: 'deltas/header-present',
        path: file.path,
        message:
          'no recognized delta header (## ADDED|MODIFIED|REMOVED|RENAMED Requirements) found',
      })
      continue
    }

    // deltas/unpaired-rename — a FROM:/TO: line that formed no pair. openspec
    // 1.13.1 reports the same shape as an ERROR (`validation/validator.ts`),
    // and below that pin the line is silently dropped or, worse, cross-paired
    // with a neighbouring rename. Either way the requested rename does not
    // happen while archive still reports success, so cospec refuses it rather
    // than guessing which FROM: belonged to which TO:.
    for (const unpaired of parsed.unpairedRenames) {
      const missing = unpaired.side === 'FROM' ? 'TO' : 'FROM'
      issues.push({
        level: 'ERROR',
        rule: 'deltas/unpaired-rename',
        path: file.path,
        line: unpaired.line,
        message: `RENAMED ${unpaired.side}: "${unpaired.name}" has no matching ${missing}: line`,
        hint: 'write each rename as a FROM: line followed immediately by its TO: line',
      })
    }

    // deltas/orphaned-requirement — a `### Requirement:` block outside every
    // delta section. WARNING, not ERROR, for openspec's own reason (1.13.1
    // `validation/validator.ts`): a handful of pre-format archived changes
    // carry this shape, and the fix is to move the block, not to reject the
    // change. Reported after `header-present` so a file with no delta section
    // at all reports the header error first and stops there.
    for (const orphan of parsed.orphanedRequirements) {
      const where =
        orphan.section === undefined
          ? 'above the first "## " section'
          : `under "## ${orphan.section}"`
      issues.push({
        level: 'WARNING',
        rule: 'deltas/orphaned-requirement',
        path: file.path,
        line: orphan.line,
        message: `requirement "${orphan.name}" is ${where}, which is not a delta section, so it is ignored`,
        hint: 'move it under "## ADDED Requirements", "## MODIFIED Requirements", "## REMOVED Requirements", or "## RENAMED Requirements"',
      })
    }

    // deltas/skipped-header — a `###` header inside an ADDED/MODIFIED section
    // that is not a named requirement header. Neither reader validates what
    // sits under it as a requirement of its own, so a divider like
    // `### Documentation Requirements` passes `validate` while the author may
    // believe it holds requirements. INFO, as upstream reports it (1.13.1
    // `validation/validator.ts`), in upstream's words split into message and
    // hint. A `### Scenario:` line is `deltas/scenario-depth`'s alone: its
    // remedy is `#### Scenario:`, not the `### Requirement:` this one suggests.
    //
    // A header the archive refuses — one that splits its requirement into a
    // piece with no scenario — is `archive/split-requirement`'s ERROR instead
    // (see `findRequirementSplits`), so a line never carries both. Only when
    // that family runs: under `--fast` nothing else reports the header, so it
    // keeps its INFO — and a change cospec never delegates would otherwise
    // lose the only report it had.
    const depthLines = new Set(depth.map((d) => d.line))
    const splitLines = new Set(opts.fast ? [] : splitsOf(change, file).map((s) => s.part.line))
    for (const skipped of advisory.skippedHeaders) {
      if (depthLines.has(skipped.line) || splitLines.has(skipped.line)) continue
      const nameless = NAMELESS_REQUIREMENT_RE.test(skipped.header)
      const info: AdvisoryIssue = {
        level: 'INFO',
        rule: 'deltas/skipped-header',
        path: file.path,
        line: skipped.line,
        message: nameless
          ? `header "### ${skipped.header}" in ${skipped.section} is missing a requirement name and is ignored by validation`
          : `header "### ${skipped.header}" in ${skipped.section} is not a "### Requirement:" header and is ignored by validation`,
        hint: nameless
          ? 'add a name, e.g. "### Requirement: <name>"'
          : `use "### Requirement: ${skipped.header}" if it should be validated as a requirement`,
      }
      issues.push(info)
    }

    issues.push(...requirementShapeIssues(parsed, file.path))
  }

  return issues
}

/**
 * `deltas/scenario-depth` for one delta file: a `### Scenario:` heading one
 * level too shallow. Read on the masked view — an advisory finding (see
 * `rules/views.ts`): the binary only INFOs a commented one and archives it, so
 * a commented line never refuses here, while a visible one does. Exported so
 * the archive family leaves each of these lines to this rule.
 */
export function scenarioDepthIssues(file: {
  path: string
  text: string
  capability: string
}): AdvisoryIssue[] {
  return parseAdvisoryDelta(file.text, file.path, file.capability).scenarioDepthIssues.map((s) => ({
    level: 'ERROR',
    rule: 'deltas/scenario-depth',
    path: file.path,
    line: s.line,
    // Quotes the header so the binary's skipped-header INFO for the same
    // line pairs with this finding by its text, not by the file alone.
    message: `scenario heading "### ${s.header}" uses 3 hashtags; must be \`#### Scenario:\``,
  }))
}

/**
 * The splits `archive/split-requirement` reports for one delta file — read off
 * the same rebuilt spec it reads, so the INFO this family drops for a split is
 * exactly the one that rule stands in for.
 */
function splitsOf(
  change: LoadedChange,
  file: { path: string; text: string; capability: string },
): ReturnType<typeof findRequirementSplits> {
  const verbatim = parseDeltaSpec(file.text, file.path, file.capability)
  const rebuilt = rebuildSpec({
    capability: file.capability,
    changeName: change.id,
    living: change.livingSpecs.get(file.capability)?.archive.text,
    deltaText: file.text,
    delta: verbatim,
  })
  return findRequirementSplits(verbatim, rebuilt?.lines)
}

/**
 * `deltas/requirement-shape` for one delta file, on the parse openspec's own
 * validator reads (`Delta`): a requirement written inside an HTML comment is
 * one the binary validates and the archive merges, so it is checked here too,
 * and a statement or scenario written inside one counts. Named as the header is
 * written, so a finding the binary shares names the same requirement and its
 * delegated twin is recognised. Exported so `archive/rebuilt-spec-invalid`
 * leaves a delta line to this rule only where this rule reported it.
 */
export function requirementShapeIssues(parsed: Delta, path: string): Issue[] {
  const issues: Issue[] = []
  for (const op of parsed.ops) {
    if (op.operation !== 'ADDED' && op.operation !== 'MODIFIED') continue
    const name = op.verbatimName ?? op.name
    const headerShall = op.name !== undefined && SHALL_MUST_RE.test(op.name)
    // A keyword somewhere under the header that is not in the statement — a
    // scenario step, a fenced example — which the author may think counts.
    const shallBelow = SHALL_MUST_RE.test(op.raw.split('\n').slice(1).join('\n'))
    // Graded in openspec's order (`validateChangeDeltaSpecs`, 1.13.1): an empty
    // statement first, then one with no SHALL/MUST — both read off the body
    // `extractRequirementBody` returns, where a comment is text and a scenario
    // step or a fenced example is not.
    if (op.parts?.[0]?.hasText === false) {
      issues.push({
        level: 'ERROR',
        rule: 'deltas/requirement-shape',
        path,
        line: op.line,
        message: headerShall
          ? `${op.operation} "${name}" must use SHALL/MUST normative language`
          : `${op.operation} "${name}" is missing requirement text`,
        hint: headerShall
          ? HEADER_ONLY_SHALL_HINT
          : shallBelow
            ? `${MISSING_TEXT_HINT}; ${NOT_A_STATEMENT}`
            : MISSING_TEXT_HINT,
      })
    } else if (!op.hasShallMust) {
      issues.push({
        level: 'ERROR',
        rule: 'deltas/requirement-shape',
        path,
        line: op.line,
        message: `${op.operation} "${name}" must use SHALL/MUST normative language`,
        hint: headerShall ? HEADER_ONLY_SHALL_HINT : shallBelow ? BODY_ONLY_SHALL_HINT : undefined,
      })
    }
    if (op.scenarioCount < 1) {
      issues.push({
        level: 'ERROR',
        rule: 'deltas/requirement-shape',
        path,
        line: op.line,
        message: `${op.operation} "${name}" must include at least one #### Scenario:`,
        // Only when the block *has* a header that did not count — otherwise the
        // hint answers a question the author never asked. Same condition and
        // wording as openspec's `emptyScenarioHint`
        // (`src/core/validation/validator.ts`, 1.13.1).
        hint: op.emptyScenarioCount > 0 ? EMPTY_SCENARIO_HINT : undefined,
      })
    }
  }
  return issues
}
