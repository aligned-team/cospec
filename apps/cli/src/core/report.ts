// The validation report model and renderers (DESIGN §4.4–4.5).
//
// `Issue` and `ItemReport` are a FROZEN cross-track contract (§4.5): other
// tracks build `Issue[]` and hand them here. Do not rename fields or change
// their meaning.

export type IssueLevel = 'ERROR' | 'WARNING' | 'INFO'

export interface Issue {
  level: IssueLevel
  /** Stable public rule id, e.g. `blockers/dangling-ref`; delegated openspec
   *  issues use `openspec/<verbatim-or-mapped>`. */
  rule: string
  /** Repo-relative path the issue anchors to. */
  path: string
  line?: number
  message: string
  hint?: string
  fixable?: boolean
}

export interface ItemReport {
  id: string
  kind: 'change' | 'spec'
  type?: string
  valid: boolean
  issues: Issue[]
}

export interface ReportSummary {
  errors: number
  warnings: number
  infos: number
  byRule: Record<string, number>
}

/** Count issues across every item by level and by rule id. */
export function summarize(items: ItemReport[]): ReportSummary {
  const summary: ReportSummary = { errors: 0, warnings: 0, infos: 0, byRule: {} }
  for (const item of items)
    for (const issue of item.issues) {
      if (issue.level === 'ERROR') summary.errors++
      else if (issue.level === 'WARNING') summary.warnings++
      else summary.infos++
      summary.byRule[issue.rule] = (summary.byRule[issue.rule] ?? 0) + 1
    }
  return summary
}

/**
 * The exit code for a validation run: `1` iff there are errors, or — under
 * `--strict` — any warnings; otherwise `0` (DESIGN §4.4).
 */
export function exitCode(items: ItemReport[], strict = false): number {
  const { errors, warnings } = summarize(items)
  if (errors > 0) return 1
  if (strict && warnings > 0) return 1
  return 0
}

export interface RenderOptions {
  strict?: boolean
  noColor?: boolean
  /** Human header prefix; defaults to `cospec validate`. */
  title?: string
}

const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
} as const

function colorsEnabled(noColor: boolean | undefined): boolean {
  if (noColor) return false
  return !(process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '')
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function pathLabel(issue: Issue): string {
  return issue.line !== undefined ? `${issue.path}:${issue.line}` : issue.path
}

/**
 * The human report (DESIGN §4.4): a per-change block with greppable rule ids and
 * an always-present hint line, changes listed individually, valid specs folded
 * into an aggregate count, and an errors/warnings footer.
 */
export function renderHuman(items: ItemReport[], opts: RenderOptions = {}): string {
  const useColor = colorsEnabled(opts.noColor)
  const paint = (code: string, text: string): string =>
    useColor ? `${code}${text}${COLORS.reset}` : text
  const levelColor = (level: IssueLevel): string =>
    level === 'ERROR' ? COLORS.red : level === 'WARNING' ? COLORS.yellow : COLORS.blue

  const changes = items.filter((item) => item.kind === 'change')
  const specs = items.filter((item) => item.kind === 'spec')
  const lines: string[] = []

  const title = opts.title ?? 'cospec validate'
  lines.push(`${title} — ${plural(changes.length, 'change')}, ${plural(specs.length, 'spec')}`)
  lines.push('')

  const renderItem = (item: ItemReport): void => {
    if (item.valid && item.issues.length === 0) {
      const suffix = item.type !== undefined ? `  (${item.type})` : ''
      lines.push(`${paint(COLORS.green, '✓')} ${item.id}${suffix}`)
      return
    }
    const mark = item.valid ? paint(COLORS.green, '✓') : paint(COLORS.red, '✗')
    const suffix = item.type !== undefined ? `  (${item.type})` : ''
    lines.push(`${mark} ${item.id}${suffix}`)
    const pathWidth = Math.max(...item.issues.map((issue) => pathLabel(issue).length), 0)
    const ruleWidth = Math.max(...item.issues.map((issue) => issue.rule.length), 0)
    for (const issue of item.issues) {
      const level = paint(levelColor(issue.level), issue.level.padEnd(7))
      const path = pathLabel(issue).padEnd(pathWidth)
      const rule = issue.rule.padEnd(ruleWidth)
      lines.push(`  ${level} ${path}  ${rule}  ${issue.message}`)
      if (issue.hint !== undefined)
        lines.push(`          ${paint(COLORS.dim, `hint: ${issue.hint}`)}`)
    }
  }

  for (const item of changes) renderItem(item)

  const invalidSpecs = specs.filter((item) => !item.valid || item.issues.length > 0)
  for (const item of invalidSpecs) renderItem(item)
  if (specs.length > 0) {
    const validSpecs = specs.length - invalidSpecs.length
    const allValid = validSpecs === specs.length
    const mark = allValid ? paint(COLORS.green, '✓') : ' '
    lines.push(`${mark} specs: ${validSpecs}/${specs.length} valid`)
  }

  const { errors, warnings } = summarize(items)
  const failed = exitCode(items, opts.strict) !== 0
  lines.push('')
  lines.push(
    `${plural(errors, 'error')}, ${plural(warnings, 'warning')} — validation ${failed ? 'failed' : 'passed'}`,
  )
  return `${lines.join('\n')}\n`
}

export interface ReportJson {
  version: 1
  items: ItemReport[]
  summary: { errors: number; warnings: number; byRule: Record<string, number> }
}

/** The machine report object (DESIGN §4.4 `--json`). */
export function toJson(items: ItemReport[]): ReportJson {
  const { errors, warnings, byRule } = summarize(items)
  return { version: 1, items, summary: { errors, warnings, byRule } }
}

/** Pretty-printed JSON string of `toJson`. */
export function renderJson(items: ItemReport[]): string {
  return `${JSON.stringify(toJson(items), null, 2)}\n`
}
