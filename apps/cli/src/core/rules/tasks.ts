// tasks/* rules (DESIGN §4.3). Rule IDs are frozen public API.

import { groupsOutOfSequence, parseTasks } from '../tasks.ts'
import type { Issue } from './issue.ts'
import type { LoadedChange } from './schema-info.ts'

const FILE = 'tasks.md'

export function tasksRules(change: LoadedChange): Issue[] {
  if (change.tasksText === undefined) return []
  const issues: Issue[] = []
  const parsed = parseTasks(change.tasksText)

  // tasks/checkbox-grammar
  for (const mal of parsed.malformed) {
    issues.push({
      level: 'ERROR',
      rule: 'tasks/checkbox-grammar',
      path: FILE,
      line: mal.line,
      message: 'checkbox line will not be tracked (must be `- [ ] ` / `- [x] `)',
      hint: mal.corrected !== undefined ? `expected: ${mal.corrected}` : undefined,
    })
  }

  // tasks/has-tasks
  if (parsed.items.length === 0) {
    issues.push({
      level: 'ERROR',
      rule: 'tasks/has-tasks',
      path: FILE,
      message: 'no trackable `- [ ] ` / `- [x] ` task items found',
    })
  }

  // tasks/group-numbering
  if (parsed.groups.length > 0 && groupsOutOfSequence(parsed.groups)) {
    issues.push({
      level: 'WARNING',
      rule: 'tasks/group-numbering',
      path: FILE,
      message: '## N. group headings are not sequentially numbered from 1',
    })
  }

  return issues
}
