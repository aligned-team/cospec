// cospec's task parser (`core/tasks.ts`) held to the pinned binary's task
// counter (`utils/task-progress.js`, `countTasksFromContent`) over the same
// canonical `tasks.md`: the apply gate, archive's task gate, `status` and
// `list` must count exactly what the delegated archive counts.
//
// 1.15.0 keeps post-archive steps out of task progress by convention, not by a
// parser rule: its tasks instruction puts them in an optional
// `## Workflow follow-up` section as PLAIN bullets, which no checkbox pattern
// matches. A checkbox written under that heading is still tracked by the
// binary, so it is tracked here too.

import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { openspecPackageDir } from '../../src/core/openspec.ts'
import { parseTasks } from '../../src/core/tasks.ts'

interface UpstreamTaskProgress {
  countTasksFromContent: (content: string) => { total: number; completed: number }
}

const upstream = (await import(
  join(openspecPackageDir(), 'dist/utils/task-progress.js')
)) as UpstreamTaskProgress

function cospecCount(content: string): { total: number; completed: number } {
  const { items } = parseTasks(content)
  return { total: items.length, completed: items.filter((t) => t.checked).length }
}

const FOLLOW_UP = `## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result.
`

const FIXTURES: Record<string, string> = {
  'every task checked, follow-up bullets after': `# Tasks

## 1. Setup

- [x] 1.1 Create the module and verify the files exist
- [x] 1.2 Add the dependency and verify install succeeds

## 2. Core

- [x] 2.1 Implement export and verify the export test passes

${FOLLOW_UP}`,
  'open tasks, follow-up bullets after': `## 1. Core

- [x] 1.1 Implement export and verify the export test passes
- [ ] 1.2 Document the API and verify the documented command runs

${FOLLOW_UP}`,
  'follow-up between two groups': `## 1. Core

- [x] 1.1 Implement export

${FOLLOW_UP}
## 2. Later

- [ ] 2.1 Ship the follow-on
`,
  'a checkbox under the follow-up heading': `## 1. Core

- [x] 1.1 Implement export

## Workflow follow-up

- [ ] Archive the change
`,
  'no tasks, only follow-up': FOLLOW_UP,
  'CRLF line endings': `## 1. Core\r\n\r\n- [x] 1.1 Implement export\r\n- [ ] 1.2 Test it\r\n\r\n## Workflow follow-up\r\n\r\n- Archive it\r\n`,
}

describe('task counts match the pinned binary', () => {
  test.each(Object.entries(FIXTURES))('%s', (_name, content) => {
    expect(cospecCount(content)).toEqual(upstream.countTasksFromContent(content))
  })

  test('follow-up bullets never count as open work', () => {
    const counted = cospecCount(FIXTURES['every task checked, follow-up bullets after']!)
    expect(counted).toEqual({ total: 3, completed: 3 })
  })
})
