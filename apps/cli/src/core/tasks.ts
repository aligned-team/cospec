// tasks.md parser. The canonical cospec format is `## N. Group` headings with
// `- [ ] N.M task` checkboxes (DESIGN §3.1). Rules built on this cover tasks/*
// in DESIGN §4.3.

/** A conforming, trackable checkbox line. */
const TASK_VALID = /^- \[( |x|X)\] (.+)$/
/** A checkbox-like line (candidate for a grammar violation). */
const CHECKBOX_LIKE = /^\s*[-*]\s*\[[^\]]*\]/
/** A `## N. Title` group heading. */
const GROUP_RE = /^##\s+(\d+)\.\s+(.+?)\s*$/
/** Leading `N.M ` task numbering. */
const TASK_NUM_RE = /^(\d+)\.(\d+)\b/

export interface TaskItem {
  checked: boolean
  text: string
  line: number
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
  const afterBracket = raw.replace(/^\s*[-*]\s*\[[^\]]*\]\s*/, '')
  if (afterBracket.length === 0) return undefined
  return `- [${box}] ${afterBracket.trimEnd()}`
}

export function parseTasks(text: string): ParsedTasks {
  const lines = text.split('\n')
  const items: TaskItem[] = []
  const malformed: MalformedTask[] = []
  const groups: TaskGroup[] = []
  let inFence = false

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const lineNo = i + 1

    if (/^\s*```/.test(raw)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const group = raw.match(GROUP_RE)
    if (group !== null) {
      groups.push({ num: Number(group[1]), title: group[2]!, line: lineNo })
      continue
    }

    const valid = raw.match(TASK_VALID)
    if (valid !== null) {
      items.push({ checked: valid[1] === 'x' || valid[1] === 'X', text: valid[2]!, line: lineNo })
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
