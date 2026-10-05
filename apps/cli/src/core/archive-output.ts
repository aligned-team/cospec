// What `cospec archive` and `cospec sync-specs` answer (design D5, D6): the
// failure document every refusal prints under `--json`, each diagnostic in the
// binary's own code and message (`dist/core/archive.js`, 1.13.1) wherever the
// binary refuses the same input, and the reader of the binary's fixed
// human-mode lines a successful wrapped archive printed.

import type { ScenarioDrop } from './deltas.ts'
import { respellRemedies } from './remedies.ts'
import type { ResolvedRoot } from './root.ts'
import { rootOutput } from './upstream-keys.ts'

/** One `status[]` entry, as the binary's `ArchiveBlockedError` carries it. */
export interface ArchiveDiagnostic {
  severity: 'error'
  code: string
  message: string
  fix?: string
}

/**
 * Why cospec refused, in its own vocabulary (the document's `reason`). The
 * first two predate the binary's keys; every other value names one refusal.
 */
export const ARCHIVE_REFUSAL_REASONS = [
  'aborted',
  'half-state',
  'spec-verification-failed',
  'unknown-change',
  'invalid-name',
  'namespace-folder',
  'validation',
  'tasks-incomplete',
  'archive/verification-incomplete',
  'slot-exists',
  'archive/scenario-preservation',
  'archive-unreadable',
  'scratch-run',
  'specs-changed',
  'symlink-escape',
] as const

export type ArchiveRefusalReason = (typeof ARCHIVE_REFUSAL_REASONS)[number]

function diagnostic(code: string, message: string, fix?: string): ArchiveDiagnostic {
  return { severity: 'error', code, message, ...(fix === undefined ? {} : { fix }) }
}

/** upstream's `withStoreFlag`: ` --store <id>` for a store-selected root. */
function storeFlag(root: ResolvedRoot | undefined): string {
  return root?.store === undefined ? '' : ` --store ${root.store}`
}

/**
 * upstream's `folderStyleNameProblem(name, 'Change name')`: the names archive
 * refuses before it looks for the change.
 */
export function changeNameProblem(name: string): string | undefined {
  if (name.length === 0) return 'Change name must not be empty'
  if (name === '.' || name === '..') return `Change name must not be '${name}'`
  if (/[\\/]/u.test(name)) return 'Change name must not contain path separators'
  return undefined
}

export const diagnostics = {
  invalidName: (problem: string): ArchiveDiagnostic =>
    diagnostic('archive_change_name_invalid', problem),
  notFound: (name: string, available: readonly string[]): ArchiveDiagnostic =>
    diagnostic(
      'archive_change_not_found',
      available.length > 0
        ? `Change '${name}' not found. Available changes: ${available.join(', ')}`
        : `Change '${name}' not found. No active changes exist in this root.`,
    ),
  /** `verb` is `archive` or `sync`; the binary's is `archive`. */
  namespaceFolder: (
    name: string,
    explanation: string,
    firstNested: string,
    verb: 'archive' | 'sync',
  ): ArchiveDiagnostic =>
    diagnostic(
      'archive_change_is_namespace_folder',
      `Cannot ${verb} '${name}': ${explanation}`,
      `Rename openspec/changes/${firstNested}/ to a flat change directory, then ${verb} it.`,
    ),
  validationFailed: (name: string, root: ResolvedRoot | undefined): ArchiveDiagnostic =>
    diagnostic(
      'archive_validation_failed',
      `Validation failed for change '${name}'.`,
      `Run openspec validate ${name}${storeFlag(root)} for details, fix the errors, or rerun with --no-validate.`,
    ),
  /** cospec's own fix: `--yes` does not lift cospec's stricter gate. */
  tasksIncomplete: (name: string, count: number): ArchiveDiagnostic =>
    diagnostic(
      'archive_tasks_incomplete',
      `${count} incomplete task(s) found for change '${name}'.`,
      'Complete the tasks or rerun with --force-incomplete.',
    ),
  /** cospec-only: the binary archives such a change. */
  verificationIncomplete: (name: string): ArchiveDiagnostic =>
    diagnostic(
      'archive_verification_incomplete',
      `verification.md is not fully resolved for change '${name}'.`,
      'Resolve each row as `[x] … -> <evidence>`, or defer it as `[~] … -> defer: <reason>`.',
    ),
  targetExists: (slot: string): ArchiveDiagnostic =>
    diagnostic('archive_target_exists', `Archive '${slot}' already exists.`),
  /**
   * The binary's merge refusal for the first drop it would abort on: its merge
   * visits capabilities in path order and a delta's MODIFIED blocks in order.
   */
  scenarioDropped: (drops: readonly ScenarioDrop[]): ArchiveDiagnostic => {
    const first = drops.toSorted((a, b) => (a.capability < b.capability ? -1 : 1))[0]!
    const names = first.missingNames.map((n) => `"${n}"`).join(', ')
    return diagnostic(
      'archive_spec_update_failed',
      `${first.capability} MODIFIED failed for header "### Requirement: ${first.name}" - current spec contains scenario(s) not present in the modified block: ${names}. Refresh the change spec before archiving to avoid dropping scenarios.`,
      'Fix the change delta specs and rerun. No files were changed.',
    )
  },
  pathOutsideRoot: (dir: string): ArchiveDiagnostic =>
    diagnostic(
      'archive_path_outside_root',
      `Refusing to archive through a path outside the OpenSpec root: ${dir}`,
    ),
  /** The binary's code for a failure it does not classify. */
  error: (message: string): ArchiveDiagnostic => diagnostic('archive_error', message),
}

/** `diag` with each allowlisted upstream remedy in it spelled through cospec. */
export function respellDiagnostic(diag: ArchiveDiagnostic): ArchiveDiagnostic {
  return {
    ...diag,
    message: respellRemedies(diag.message),
    ...(diag.fix === undefined ? {} : { fix: respellRemedies(diag.fix) }),
  }
}

export interface FailureDocument {
  /** The change as named on the command line. */
  change: string
  /** The change's schema, once the change resolved. */
  type?: string
  reason: ArchiveRefusalReason
  diagnostic: ArchiveDiagnostic
  /** The resolved root; absent only when none resolved, as in the binary. */
  root?: ResolvedRoot
  /** `archive` (the default) reports `archived: false`; `sync-specs` reports `synced: false`. */
  outcome?: 'archived' | 'synced'
  /** Keys a refusal carries beyond these (the revalidation report's). */
  extra?: Readonly<Record<string, unknown>>
  /** `archived: true` for a refusal after the change already moved. */
  moved?: boolean
}

/**
 * The one `--json` document of a refusal: cospec's `change`/`type`/`archived`
 * (or `synced`)/`reason`, then the binary's `archive: null`, `root` and
 * `status`, the diagnostic respelled.
 */
export function failureDocument(doc: FailureDocument): string {
  const outcome = doc.outcome ?? 'archived'
  const body: Record<string, unknown> = {
    ...doc.extra,
    change: doc.change,
    ...(doc.type === undefined ? {} : { type: doc.type }),
    [outcome]: doc.moved === true,
    reason: doc.reason,
    ...(outcome === 'archived' ? { archive: null } : {}),
    ...(doc.root === undefined ? {} : { root: rootOutput(doc.root) }),
    status: [respellDiagnostic(doc.diagnostic)],
  }
  return `${JSON.stringify(body, null, 2)}\n`
}

/** The binary's own closing line of an aborted merge (`dist/core/archive.js`). */
const ABORTED_LINE = 'Aborted. No files were changed.'

/** `failWithError`'s line for an error it was thrown (`✖ Error: <message>`). */
const ERROR_LINE_RE = /^(?:✖ )?Error: (.+)$/

/**
 * The reason a failed wrapped archive gave: its last non-blank line, skipping
 * its fixed `Aborted. No files were changed.` closer; when that line is the
 * CLI's `Error: <message>`, the message, as the binary's `--json` document
 * carries it.
 */
export function relayedReason(output: string): string {
  const lines = output
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && l !== ABORTED_LINE)
  const last = lines.at(-1)
  if (last === undefined) return 'the wrapped OpenSpec archive gave no reason'
  return ERROR_LINE_RE.exec(last)?.[1] ?? last
}
