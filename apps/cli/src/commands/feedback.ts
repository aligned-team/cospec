// `cospec feedback "<message>" [--body <text>] [--upstream]`.
//
// Native by default, filing at cospec's own tracker. Upstream's `openspec
// feedback` hardcodes `Fission-AI/OpenSpec` in both its `gh issue create` argv
// and its manual-submission URL; a cospec user hitting a bug generally cannot
// tell whether it is cospec's or OpenSpec's, and cospec maintainers can — so
// defaulting to upstream would route cospec bug reports to a project that
// cannot fix them. `--upstream` relays to the wrapped command for a genuine
// OpenSpec bug, naming the destination on stderr first.
//
// Deliberate differences from upstream's implementation:
//   - No `--label`. Upstream passes `--label feedback` and then carries a retry
//     branch for `/could not add label/i` when the repo does not define it;
//     dropping the label deletes that entire failure mode.
//   - The provenance footer records the wrapped OpenSpec resolution
//     (`project` vs `embedded`, plus version) — the single most useful field in
//     a cospec bug report.
// Kept from upstream (1.15.0): the grapheme-aware 72-char title, a body whose
// `###` headings are the bug form's labels (`.github/ISSUE_TEMPLATE/
// bug_report.yml`, `BUG_FORM_FIELDS`) so a CLI-filed issue reads like one filed
// through the form — `gh issue create --body` cannot fill a form, so the
// reproduction section says the steps are missing instead of being left
// silently empty — a manual link that opens that form prefilled by field id,
// an array argv (never a shell — the message is free text), and exit 0 for the
// manual-submission fallback, which is not a failure.

import { readFileSync } from 'node:fs'
import { arch, platform } from 'node:os'
import { join } from 'node:path'

import pkg from '../../package.json'
import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { flagValue, hasFlag, type ParsedArgs } from '../core/command-table.ts'
import { resolveOpenspec, spawnOpenspec, threadedArgv } from '../core/openspec.ts'
import { currentInstall } from './version.ts'

/** cospec's own tracker (`apps/cli/package.json` `bugs`). */
export const COSPEC_REPO = 'aligned-team/cospec'
/** Upstream's tracker, hardcoded in `openspec feedback` itself. */
export const UPSTREAM_REPO = 'Fission-AI/OpenSpec'

const TITLE_PREFIX = 'Feedback: '
const MAX_TITLE_LENGTH = 72

/**
 * `Feedback: <message>`, whitespace collapsed, truncated to 72 characters on a
 * grapheme boundary (never mid-emoji) and then back to a word boundary, with an
 * ellipsis. Mirrors upstream's `formatTitle` so a report filed either way reads
 * the same.
 */
export function formatTitle(message: string): string {
  const normalized = message.replaceAll(/\s+/g, ' ').trim()
  const title = `${TITLE_PREFIX}${normalized}`
  if ([...title].length <= MAX_TITLE_LENGTH) return title

  const available = MAX_TITLE_LENGTH - TITLE_PREFIX.length - 1
  let candidate = ''
  let length = 0
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
    normalized,
  )) {
    const size = [...segment].length
    if (length + size > available) break
    candidate += segment
    length += size
  }
  candidate = candidate.trimEnd()
  const lastSpace = candidate.lastIndexOf(' ')
  return `${TITLE_PREFIX}${lastSpace > 0 ? candidate.slice(0, lastSpace) : candidate}…`
}

/** Version of the resolved wrapped openspec package, or `unknown`. */
function wrappedOpenspecDescription(): string {
  const resolved = resolveOpenspec()
  if (resolved.source === 'embedded') return `embedded ${resolved.version}`
  try {
    const raw = readFileSync(join(resolved.packageDir, 'package.json'), 'utf8')
    const version = (JSON.parse(raw) as { version?: string }).version
    return `project ${version ?? 'unknown'}`
  } catch {
    return 'project unknown'
  }
}

/** The provenance footer appended to every report. */
export function provenanceFooter(now: Date, openspec: string): string {
  return [
    '---',
    'Submitted via cospec',
    `- cospec: ${pkg.version}`,
    `- openspec: ${openspec}`,
    `- Platform: ${platform()}`,
    `- Timestamp: ${now.toISOString()}`,
  ].join('\n')
}

/**
 * The bug form's fields, in its order: each `id` is the form's field id (how a
 * link prefills it) and each `label` its heading. Must match
 * `.github/ISSUE_TEMPLATE/bug_report.yml`; a unit test reads the form.
 */
export const BUG_FORM_FIELDS = [
  { id: 'what_happened', label: 'What happened' },
  { id: 'steps', label: 'Minimal steps to reproduce' },
  { id: 'expected', label: 'Expected behavior' },
  { id: 'actual', label: 'Actual behavior' },
  { id: 'version', label: 'cospec version' },
  { id: 'openspec_version', label: 'OpenSpec version' },
  { id: 'environment', label: 'Environment' },
] as const

export const BUG_FORM_TEMPLATE = 'bug_report.yml'

/** The reproduction section of a CLI-filed report, which only the reporter can fill. */
export const REPRO_MISSING =
  '_Not provided — filed with `cospec feedback`. If this is a bug, please add the shortest steps that reproduce it from a fresh project._'
const NOT_PROVIDED = '_Not provided._'

/** What the form asks that cospec knows: its version, the wrapped OpenSpec, and the environment. */
export interface BugFacts {
  version: string
  openspec: string
  environment: string
}

/** The facts of this process: cospec's version, the wrapped OpenSpec, OS, arch and install type. */
export function currentFacts(): BugFacts {
  return {
    version: pkg.version,
    openspec: wrappedOpenspecDescription(),
    environment: `${platform()} ${arch()}, ${currentInstall().type}`,
  }
}

/** The message, then `--body` as its details: the form's `what_happened` field. */
function whatHappened(message: string, details: string | undefined): string {
  return details !== undefined && details.length > 0 ? `${message}\n\n${details}` : message
}

/**
 * The issue body: one `###` section per bug-form field, in the form's order —
 * the message (and `--body`) under What happened, the missing reproduction
 * steps said so, the facts cospec knows filled in — then the provenance footer.
 */
export function formatBody(
  message: string,
  details: string | undefined,
  facts: BugFacts,
  footer: string,
): string {
  const values: Record<(typeof BUG_FORM_FIELDS)[number]['id'], string> = {
    what_happened: whatHappened(message, details),
    steps: REPRO_MISSING,
    expected: NOT_PROVIDED,
    actual: NOT_PROVIDED,
    version: facts.version,
    openspec_version: facts.openspec,
    environment: facts.environment,
  }
  const parts = BUG_FORM_FIELDS.flatMap((field) => [`### ${field.label}`, '', values[field.id], ''])
  parts.push(footer)
  return parts.join('\n')
}

/**
 * The link used whenever `gh` cannot submit: the bug form, its message,
 * version and environment fields prefilled by field id. No `labels` (the form
 * sets its own).
 */
export function manualUrl(
  repo: string,
  title: string,
  message: string,
  details: string | undefined,
  facts: BugFacts,
): string {
  const params = new URLSearchParams({
    template: BUG_FORM_TEMPLATE,
    title,
    what_happened: whatHappened(message, details),
    version: facts.version,
    openspec_version: facts.openspec,
    environment: facts.environment,
  })
  return `https://github.com/${repo}/issues/new?${params.toString()}`
}

/**
 * The `gh issue create` argv. Exported so a test can assert the raw message is
 * carried as one array element — free text must never reach a shell.
 */
export function issueArgv(repo: string, title: string, body: string): string[] {
  return ['issue', 'create', '--repo', repo, '--title', title, '--body', body]
}

export interface ParsedFeedbackArgs {
  message?: string
  body?: string
  upstream: boolean
  error?: string
}

/**
 * Read `cospec feedback`'s table-parsed argv (pure). Unknown options, a second
 * message and a valueless `--body` are already refused by the command table;
 * what is left is feedback's own rule that the message is non-blank.
 */
export function feedbackArgs(parsed: ParsedArgs): ParsedFeedbackArgs {
  const upstream = hasFlag(parsed, '--upstream')
  // Required in the table: the parser has refused a missing one, as
  // commander's `missing required argument`. A blank one is feedback's own rule.
  const message = parsed.positionals[0]!
  const body = flagValue(parsed, '--body')
  if (message.trim().length === 0)
    return {
      upstream,
      error: 'cospec feedback: a message is required (cospec feedback "<message>")',
    }
  return { message, body, upstream }
}

function printManualBlock(title: string, body: string, url: string): void {
  process.stdout.write(
    `\n--- FORMATTED FEEDBACK ---\nTitle: ${title}\n\nBody:\n${body}\n--- END FEEDBACK ---\n\n`,
  )
  process.stdout.write(`Please submit your feedback manually:\n${url}\n`)
}

function jsonEnvelope(body: Record<string, unknown>): string {
  return `${JSON.stringify(body)}\n`
}

/**
 * The wrapped `feedback` argv for `--upstream`: `--body <text>` first, then
 * the message behind a `--`, so a message that looks like an option (from
 * `cospec feedback --upstream -- --x`) stays the message, as upstream reads
 * `openspec feedback -- --x`.
 */
export function upstreamFeedbackArgv(message: string, body: string | undefined): string[] {
  return threadedArgv(
    ['feedback'],
    [],
    [...(body !== undefined ? ['--body', body] : []), '--', message],
  )
}

/** `--upstream`: version-asserted verbatim relay, exit code included. */
async function runUpstream(ctx: CommandContext, parsed: ParsedFeedbackArgs): Promise<number> {
  if (ctx.flags.json) {
    process.stdout.write(
      jsonEnvelope({
        version: 1,
        command: 'feedback',
        submitted: false,
        url: null,
        title: null,
        repo: UPSTREAM_REPO,
        message: "--upstream relays OpenSpec's own text output and cannot emit JSON",
      }),
    )
    return EXIT.failure
  }
  process.stderr.write(
    `note: filing at ${UPSTREAM_REPO} (OpenSpec's tracker), not ${COSPEC_REPO}.\n`,
  )
  const args = upstreamFeedbackArgv(parsed.message!, parsed.body)
  // Not `passthroughOpenspec`: upstream's feedback command exits with gh's own
  // arbitrary status, which no `exitCodes` allow-list can honestly enumerate.
  // So this is a version-asserted verbatim relay (the `workset open` rule),
  // piped because upstream's feedback path has no prompts.
  const result = await spawnOpenspec(args, ctx.cwd)
  if (result.stdout.length > 0) process.stdout.write(result.stdout)
  if (result.stderr.length > 0) process.stderr.write(result.stderr)
  return result.exitCode
}

export async function run(ctx: CommandContext): Promise<number> {
  const parsed = feedbackArgs(ctx.parsed!)
  if (parsed.error !== undefined) {
    if (ctx.flags.json)
      process.stdout.write(
        jsonEnvelope({
          version: 1,
          command: 'feedback',
          submitted: false,
          url: null,
          title: null,
          repo: parsed.upstream ? UPSTREAM_REPO : COSPEC_REPO,
          message: parsed.error,
        }),
      )
    else process.stderr.write(`${parsed.error}\n`)
    return EXIT.failure
  }
  if (parsed.upstream) return runUpstream(ctx, parsed)

  const message = parsed.message!
  const title = formatTitle(message)
  const facts = currentFacts()
  const body = formatBody(message, parsed.body, facts, provenanceFooter(new Date(), facts.openspec))
  const url = manualUrl(COSPEC_REPO, title, message, parsed.body, facts)

  const gh = Bun.which('gh')
  const authenticated =
    gh !== null &&
    Bun.spawnSync([gh, 'auth', 'status'], { stdout: 'pipe', stderr: 'pipe' }).exitCode === 0

  if (gh === null || !authenticated) {
    // Manual submission is the documented fallback, not a failure: exit 0.
    if (ctx.flags.json) {
      process.stdout.write(
        jsonEnvelope({
          version: 1,
          command: 'feedback',
          submitted: false,
          url,
          title,
          repo: COSPEC_REPO,
        }),
      )
      return EXIT.success
    }
    process.stdout.write(
      gh === null
        ? 'GitHub CLI not found. Manual submission required.\n'
        : 'GitHub authentication required. Manual submission required.\n',
    )
    printManualBlock(title, body, url)
    if (gh !== null) process.stdout.write('\nTo auto-submit in the future: gh auth login\n')
    return EXIT.success
  }

  const created = Bun.spawnSync([gh, ...issueArgv(COSPEC_REPO, title, body)], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (created.exitCode !== 0) {
    // gh failed after the user already typed their feedback (issues disabled,
    // network, rate limit, …): relay gh's own stderr and its exit code, but
    // still show the manual path rather than discarding the text.
    if (ctx.flags.json) {
      process.stdout.write(
        jsonEnvelope({
          version: 1,
          command: 'feedback',
          submitted: false,
          url,
          title,
          repo: COSPEC_REPO,
        }),
      )
      return created.exitCode === 0 ? EXIT.failure : created.exitCode
    }
    process.stderr.write(created.stderr.toString())
    printManualBlock(title, body, url)
    return created.exitCode
  }

  const issueUrl = created.stdout.toString().trim()
  if (ctx.flags.json) {
    process.stdout.write(
      jsonEnvelope({
        version: 1,
        command: 'feedback',
        submitted: true,
        url: issueUrl.length > 0 ? issueUrl : null,
        title,
        repo: COSPEC_REPO,
      }),
    )
    return EXIT.success
  }
  process.stdout.write(`\nFeedback submitted.\nIssue URL: ${issueUrl}\n`)
  return EXIT.success
}
