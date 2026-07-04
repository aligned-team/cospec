// deltas/* rules (DESIGN §4.3) — run before openspec delegation so cospec's
// sharper diagnostics win. Rule IDs are frozen public API.

import { parseDeltaSpec } from '../deltas.ts'
import type { Issue } from './issue.ts'
import type { LoadedChange } from './schema-info.ts'

const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const SPEC_PATH_RE = /^specs\/([^/]+)\/spec\.md$/

export function deltasRules(change: LoadedChange): Issue[] {
  const issues: Issue[] = []

  for (const file of change.deltaFiles) {
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

    // deltas/capability-kebab
    const pathMatch = file.path.match(SPEC_PATH_RE)
    if (!KEBAB_RE.test(file.capability) || pathMatch === null) {
      issues.push({
        level: 'ERROR',
        rule: 'deltas/capability-kebab',
        path: file.path,
        message: `capability must be kebab-case and the delta file must be specs/<cap>/spec.md`,
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
