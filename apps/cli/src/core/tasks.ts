// tasks.md parser. The canonical cospec format is `## N. Group` headings with
// `- [ ] N.M task` checkboxes (DESIGN §3.1). Rules built on this cover tasks/*
// in DESIGN §4.3.

import { splitLines } from './lines.ts'

/** A conforming, trackable checkbox line. */
const TASK_VALID = /^- \[( |x|X)\] (.+)$/
/**
 * A checkbox-like line (candidate for a grammar violation).
 *
 * The list-marker set mirrors openspec 1.13.1's `TASK_LINE_PATTERN`
 * (`src/utils/task-progress.ts`): every CommonMark bullet (`-`, `*`, `+`) plus
 * the ordered markers `1.` / `1)` of up to nine digits. Reading only `-` and
 * `*` left a `+ [ ]` or `1. [ ]` line matching neither `TASK_VALID` nor this
 * detector, so it counted toward neither the numerator nor the denominator of
 * `cospec archive`'s tasks gate — the silent-drop class upstream closed.
 *
 * Where cospec deliberately differs from upstream: upstream widens its *only*
 * pattern, so a widened line silently becomes an ordinary not-done task. cospec
 * keeps `TASK_VALID` narrow — the canonical form stays `- [ ] N.M …` (DESIGN
 * §3.1), whose `N.M` numbering the verification ledger addresses rows by — and
 * widens only the detector, so such a line surfaces as a loud
 * `tasks/checkbox-grammar` ERROR carrying a `corrected:` hint. Strictly
 * stricter than upstream, and never a silent drop: an unrecognised marker
 * inside the brackets (`[~]`, `[]`, `[ x]`) is checkbox-like here, so it is
 * reported rather than ignored, and it can never read as done.
 *
 * The `(?![([])` guard is upstream's, for upstream's reason: `- [Some doc](./doc.md)`
 * and `- [1](./one)` are link bullets, not checkboxes, and flagging every link
 * list as malformed tasks would be noise. A whitespace-only box is upstream's
 * exception to that guard — `- [ ](./x)` can still hide open work — so it stays
 * checkbox-like.
 */
export const CHECKBOX_LIKE = /^\s*(?:[-*+]|\d{1,9}[.)])\s*\[(?:\s*\]|[^\]]*\](?![([]))/
/** The detector's marker + box span, stripped when building a `corrected:` hint. */
const CHECKBOX_PREFIX = /^\s*(?:[-*+]|\d{1,9}[.)])\s*\[[^\]]*\]\s*/
/** A `## N. Title` group heading. */
const GROUP_RE = /^##\s+(\d+)\.\s+(.+?)\s*$/
/**
 * A task id at the start of a task's text: `1.2`, `1.2.3`, `1.3a`, `01.1`.
 * openspec 1.13.1's `TASK_ID` (`src/core/validation/task-numbering.js`),
 * ported verbatim. `1.2.3` and `1.2.4` are two ids, not two copies of `1.2`.
 */
const TASK_NUM_RE = /^(\d+(?:\.\d+)+(?:[A-Za-z]+)?)(?=\s|$)/
/**
 * Any level-two heading — where a task's enclosing group changes. Upstream's
 * `LEVEL_TWO_HEADING`: an unnumbered `## Notes` ends group numbering too, so a
 * task under it belongs to no group.
 */
const LEVEL_TWO_HEADING_RE = /^ {0,3}##(?!#)(?:[ \t]+|[ \t]*$)/
/** Upstream's `NUMBERED_GROUP_HEADING`: the group number as written (`1`, `01`). */
const NUMBERED_GROUP_HEADING_RE = /^ {0,3}##[ \t]+(\d+)\.(?:[ \t]|$)/

export interface TaskItem {
  checked: boolean
  text: string
  line: number
  /**
   * The number of the `## N.` group the item sits under, as written (`'1'`,
   * `'01'`), or `undefined` above the first group or under an unnumbered one.
   */
  group?: string
}

export interface MalformedTask {
  raw: string
  line: number
  corrected?: string
}

export interface TaskGroup {
  num: number
  title: string
  line: number
}

export interface ParsedTasks {
  items: TaskItem[]
  malformed: MalformedTask[]
  groups: TaskGroup[]
}

function correctTask(raw: string): string | undefined {
  const box = /\[\s*[xX]/.test(raw) ? 'x' : ' '
  const afterBracket = raw.replace(CHECKBOX_PREFIX, '')
  if (afterBracket.length === 0) return undefined
  return `- [${box}] ${afterBracket.trimEnd()}`
}

export function parseTasks(text: string): ParsedTasks {
  const lines = splitLines(text)
  const items: TaskItem[] = []
  const malformed: MalformedTask[] = []
  const groups: TaskGroup[] = []
  let inFence = false
  let currentGroup: string | undefined

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const lineNo = i + 1

    if (/^\s*```/.test(raw)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    if (LEVEL_TWO_HEADING_RE.test(raw)) currentGroup = raw.match(NUMBERED_GROUP_HEADING_RE)?.[1]

    const group = raw.match(GROUP_RE)
    if (group !== null) {
      groups.push({ num: Number(group[1]), title: group[2]!, line: lineNo })
      continue
    }

    const valid = raw.match(TASK_VALID)
    if (valid !== null) {
      items.push({
        checked: valid[1] === 'x' || valid[1] === 'X',
        text: valid[2]!,
        line: lineNo,
        group: currentGroup,
      })
      continue
    }

    if (CHECKBOX_LIKE.test(raw)) {
      malformed.push({ raw, line: lineNo, corrected: correctTask(raw) })
    }
  }

  return { items, malformed, groups }
}

/** True when group numbers are not the sequence 1,2,3,… . */
export function groupsOutOfSequence(groups: TaskGroup[]): boolean {
  for (let i = 0; i < groups.length; i++) if (groups[i]!.num !== i + 1) return true
  return false
}

export { TASK_NUM_RE }
