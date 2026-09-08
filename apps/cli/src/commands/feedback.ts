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
// Kept from upstream: the grapheme-aware 72-char title, the Summary/Details
// body, an array argv (never a shell — the message is free text), and exit 0
// for the manual-submission fallback, which is not a failure.

import { readFileSync } from 'node:fs'
import { platform } from 'node:os'
import { join } from 'node:path'

import pkg from '../../package.json'
import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { resolveOpenspec, spawnOpenspec } from '../core/openspec.ts'

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

export function formatBody(message: string, details: string | undefined, footer: string): string {
  const parts = ['## Summary', '', message]
  if (details !== undefined && details.length > 0) parts.push('', '## Details', '', details)
  parts.push('', footer)
  return parts.join('\n')
}

/** The prefilled issue URL used whenever `gh` cannot submit. No `labels`. */
export function manualUrl(repo: string, title: string, body: string): string {
  return `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
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

/** Parse `cospec feedback` argv (pure). */
export function parseFeedbackArgs(args: string[]): ParsedFeedbackArgs {
  let message: string | undefined
  let body: string | undefined
  let upstream = false
  for (let i = 0; i < args.length; i++) {
    const tok = args[i]!
    if (tok === '--upstream') upstream = true
    else if (tok === '--body') {
      const value = args[++i]
      if (value === undefined)
        return { upstream, error: 'cospec feedback: --body requires a value' }
      body = value
    } else if (tok.startsWith('--body=')) body = tok.slice('--body='.length)
    else if (tok.startsWith('-'))
      return { upstream, error: `cospec feedback: unknown option '${tok}'` }
    else if (message === undefined) message = tok
    else return { upstream, error: 'cospec feedback: only one message argument is accepted' }
  }
  if (message === undefined || message.trim().length === 0)
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
  const args = ['feedback', parsed.message!]
  if (parsed.body !== undefined) args.push('--body', parsed.body)
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
  const parsed = parseFeedbackArgs(ctx.args)
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
  const body = formatBody(
    message,
    parsed.body,
    provenanceFooter(new Date(), wrappedOpenspecDescription()),
  )
  const url = manualUrl(COSPEC_REPO, title, body)

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
