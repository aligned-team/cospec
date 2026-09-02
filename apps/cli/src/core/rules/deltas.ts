// deltas/* rules (DESIGN §4.3) — run before openspec delegation so cospec's
// sharper diagnostics win. Rule IDs are frozen public API.

import { parseDeltaSpec } from '../deltas.ts'
import type { Issue } from './issue.ts'
import type { LoadedChange } from './schema-info.ts'

const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
/** `specs/<capability-path>/spec.md` — the path may nest (`<area>/<capability>`). */
const SPEC_PATH_RE = /^specs\/(.+)\/spec\.md$/
/** The one delta path openspec 1.7.0 blocks outright: a spec at the specs/ root. */
const ROOT_SPEC_PATH = 'specs/spec.md'

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

export function deltasRules(change: LoadedChange): Issue[] {
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

    const parsed = parseDeltaSpec(file.text, file.path, file.capability)

    // deltas/scenario-depth
    for (const s of parsed.scenarioDepthIssues) {
      issues.push({
        level: 'ERROR',
        rule: 'deltas/scenario-depth',
        path: file.path,
        line: s.line,
        message: 'scenario heading uses 3 hashtags; must be `#### Scenario:`',
      })
    }

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

    // deltas/requirement-shape
    for (const op of parsed.ops) {
      if (op.operation !== 'ADDED' && op.operation !== 'MODIFIED') continue
      if (!op.hasShallMust) {
        issues.push({
          level: 'ERROR',
          rule: 'deltas/requirement-shape',
          path: file.path,
          line: op.line,
          message: `${op.operation} "${op.name}" must use SHALL/MUST normative language`,
        })
      }
      if (op.scenarioCount < 1) {
        issues.push({
          level: 'ERROR',
          rule: 'deltas/requirement-shape',
          path: file.path,
          line: op.line,
          message: `${op.operation} "${op.name}" must include at least one #### Scenario:`,
        })
      }
    }
  }

  return issues
}
