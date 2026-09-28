// tasks/* rules (DESIGN §4.3). Rule IDs are frozen public API.

import { groupsOutOfSequence, parseTasks, TASK_NUM_RE } from '../tasks.ts'
import type { Issue } from './issue.ts'
import type { LoadedChange } from './schema-info.ts'

const FILE = 'tasks.md'

/** `01` and `1` name one group, as upstream compares them. */
function groupNumber(written: string): string {
  return written.replace(/^0+(?=\d)/, '')
}

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

  // tasks/id-mismatch, tasks/id-duplicate — the verification ledger and
  // `apply`'s task list address a task by its id, so an id filed under the
  // wrong group, or two tasks sharing one, point a reader at the wrong row.
  // Upstream's `findTaskNumberingIssues` (1.13.1) reads ids only inside
  // `## N.` groups, so an item under no numbered group is skipped — and with it
  // every item of a file that has none.
  const firstLine = new Map<string, number>()
  for (const item of parsed.items) {
    if (item.group === undefined) continue
    const id = TASK_NUM_RE.exec(item.text.trimStart())?.[1]
    if (id === undefined) continue
    const idGroup = id.split('.')[0]!
    if (groupNumber(idGroup) !== groupNumber(item.group)) {
      issues.push({
        level: 'WARNING',
        rule: 'tasks/id-mismatch',
        path: FILE,
        line: item.line,
        message: `task "${id}" is under group ${item.group}, but its leading number points to group ${idGroup}`,
        hint: `move it to group ${idGroup} or renumber it`,
      })
    }
    const first = firstLine.get(id)
    if (first !== undefined) {
      issues.push({
        level: 'WARNING',
        rule: 'tasks/id-duplicate',
        path: FILE,
        line: item.line,
        message: `task id "${id}" is duplicated; it was first declared on line ${first}`,
      })
    } else firstLine.set(id, item.line)
  }

  return issues
}
