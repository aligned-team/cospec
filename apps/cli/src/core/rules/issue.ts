// Mirrors the frozen cross-track Issue contract (DESIGN §4.5). Track B's
// core/report.ts defines the same shapes and owns rendering; these are kept here
// so the parser/rule layer typechecks and unit-tests independently of B. The two
// definitions are structurally identical, so an ItemReport built here is accepted
// by report.ts's renderer without conversion.

export type IssueLevel = 'ERROR' | 'WARNING' | 'INFO'

export interface Issue {
  level: IssueLevel
  /** e.g. 'blockers/dangling-ref'; delegated: 'openspec/<verbatim-or-mapped>'. */
  rule: string
  /** repo-relative path. */
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
