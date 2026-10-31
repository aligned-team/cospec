// Pure formatting/parsing unit tests for `cospec feedback` (DESIGN §3.1,
// ledger row 3.1): grapheme-safe 72-char title truncation, the bug-form body
// shape (openspec-1-15-parity task 5.6) and its prefilled link, the
// never-a-shell argv, and argv parsing.

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parse as parseYaml } from 'yaml'

import {
  BUG_FORM_FIELDS,
  type BugFacts,
  COSPEC_REPO,
  formatBody,
  formatTitle,
  issueArgv,
  manualUrl,
  feedbackArgs,
  provenanceFooter,
  REPRO_MISSING,
  UPSTREAM_REPO,
  upstreamFeedbackArgv,
} from '../../../src/commands/feedback.ts'
import {
  commandRow,
  parseCommandArgs,
  type TableCommandRow,
} from '../../../src/core/command-table.ts'

describe('formatTitle', () => {
  test('short message: prefixed, whitespace collapsed, no truncation', () => {
    expect(formatTitle('  the   thing   broke  ')).toBe('Feedback: the thing broke')
  })

  test('title at or under 72 chars is never truncated', () => {
    const msg = 'x'.repeat(60) // "Feedback: " (10) + 60 = 70 <= 72
    const title = formatTitle(msg)
    expect(title).toBe(`Feedback: ${msg}`)
    expect([...title].length).toBeLessThanOrEqual(72)
  })

  test('long message is truncated to a 72-char budget with an ellipsis', () => {
    const msg = 'a'.repeat(200)
    const title = formatTitle(msg)
    expect([...title].length).toBeLessThanOrEqual(72)
    expect(title.endsWith('…')).toBe(true)
    expect(title.startsWith('Feedback: ')).toBe(true)
  })

  test('truncation backs off to a word boundary rather than chopping mid-word', () => {
    // available = 72 - 'Feedback: '.length - 1 = 61. Five 12-char words (incl.
    // trailing space) = 60 chars fit whole; the sixth would push past 61, so
    // the cut backs off to the space before it instead of splitting it.
    const words = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee']
    const msg = `${words.join(' ')} ffffffffffffffffffffffffffffff`
    const title = formatTitle(msg)
    expect(title).toBe(`Feedback: ${words.join(' ')}…`)
  })

  test('truncation is grapheme-aware: never splits a multi-codepoint emoji', () => {
    // Each 🚀 is a single grapheme but 2 UTF-16 code units; a naive
    // slice(0, n) on code units could bisect one.
    const msg = '🚀'.repeat(80)
    const title = formatTitle(msg)
    expect([...title].length).toBeLessThanOrEqual(72)
    // Every remaining rocket in the body is a complete grapheme (no lone
    // surrogate half), so re-segmenting recovers whole emoji only.
    const body = title.slice('Feedback: '.length, title.endsWith('…') ? -1 : undefined)
    const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(body)]
    for (const { segment } of segments)
      expect(['🚀'].includes(segment) || segment === '').toBe(true)
  })
})

const FACTS: BugFacts = {
  version: '0.12.0',
  openspec: 'embedded 1.15.0',
  environment: 'linux x64, standalone',
}

/** The bug form's fields as `.github/ISSUE_TEMPLATE/bug_report.yml` declares them, in order. */
function formFields(): { id: string; label: string }[] {
  const path = resolve(import.meta.dir, '../../../../../.github/ISSUE_TEMPLATE/bug_report.yml')
  const form = parseYaml(readFileSync(path, 'utf8')) as {
    body: { type: string; id?: string; attributes: { label?: string } }[]
  }
  return form.body
    .filter((field) => field.type !== 'markdown')
    .map((field) => ({ id: field.id!, label: field.attributes.label! }))
}

describe('formatBody', () => {
  test("BUG_FORM_FIELDS is the bug form's field list, ids and labels in order", () => {
    expect(
      BUG_FORM_FIELDS.map((f): { id: string; label: string } => ({ id: f.id, label: f.label })),
    ).toEqual(formFields())
  })

  test("its sections are the bug form's headings in order, repro steps said missing", () => {
    const footer = provenanceFooter(new Date('2026-09-01T00:00:00.000Z'), FACTS.openspec)
    const body = formatBody('short summary', undefined, FACTS, footer)
    const headings = body.split('\n').filter((line) => line.startsWith('### '))
    expect(headings).toEqual(formFields().map((f) => `### ${f.label}`))
    const after = (heading: string) => body.split(`### ${heading}\n\n`)[1]!.split('\n')[0]
    expect(after('What happened')).toBe('short summary')
    expect(after('Minimal steps to reproduce')).toBe(REPRO_MISSING)
    expect(after('cospec version')).toBe('0.12.0')
    expect(after('OpenSpec version')).toBe('embedded 1.15.0')
    expect(after('Environment')).toBe('linux x64, standalone')
    expect(body.endsWith(footer)).toBe(true)
  })

  test('--body is carried as details under What happened; an empty one is absent', () => {
    const footer = provenanceFooter(new Date(), FACTS.openspec)
    const body = formatBody('msg', 'more detail here', FACTS, footer)
    expect(body).toContain('### What happened\n\nmsg\n\nmore detail here\n\n### Minimal')
    expect(formatBody('msg', '', FACTS, footer)).toContain(
      '### What happened\n\nmsg\n\n### Minimal',
    )
  })
})

describe('provenanceFooter', () => {
  test('records the wrapped openspec resolution, platform, and an ISO timestamp', () => {
    const now = new Date('2026-09-01T12:00:00.000Z')
    const footer = provenanceFooter(now, 'project 1.11.0')
    expect(footer).toContain('- openspec: project 1.11.0')
    expect(footer).toContain('- Timestamp: 2026-09-01T12:00:00.000Z')
    expect(footer).toContain('- Platform:')
    expect(footer).toContain('- cospec:')
  })
})

describe('manualUrl', () => {
  test('opens the bug form with message, version and environment prefilled by field id', () => {
    const url = manualUrl(COSPEC_REPO, 'Feedback: it broke', 'it broke', 'details & more', FACTS)
    expect(
      url.startsWith(`https://github.com/${COSPEC_REPO}/issues/new?template=bug_report.yml&`),
    ).toBe(true)
    const params = new URL(url).searchParams
    expect(params.get('title')).toBe('Feedback: it broke')
    expect(params.get('what_happened')).toBe('it broke\n\ndetails & more')
    expect(params.get('version')).toBe('0.12.0')
    expect(params.get('openspec_version')).toBe('embedded 1.15.0')
    expect(params.get('environment')).toBe('linux x64, standalone')
    expect(params.has('labels')).toBe(false)
    expect(params.has('body')).toBe(false)
    const ids = new Set(formFields().map((f) => f.id))
    for (const key of params.keys())
      if (key !== 'template' && key !== 'title') expect(ids.has(key)).toBe(true)
  })
})

describe('issueArgv', () => {
  test('is a flat array carrying the raw message as one element (never a shell)', () => {
    const argv = issueArgv(COSPEC_REPO, 'Feedback: `rm -rf /` in a title', 'body; $(evil)')
    expect(argv).toEqual([
      'issue',
      'create',
      '--repo',
      COSPEC_REPO,
      '--title',
      'Feedback: `rm -rf /` in a title',
      '--body',
      'body; $(evil)',
    ])
    // The dangerous-looking substrings are intact, single array elements —
    // proof they were never concatenated into a shell string.
    expect(argv).toContain('body; $(evil)')
  })
})

function feedbackRow(): TableCommandRow {
  const row = commandRow('feedback')
  if (row?.parse !== 'table') throw new Error("'feedback' has no table row")
  return row
}

/** What `cli.ts` hands `feedback`'s run: the table parse, then feedback's own reading. */
function parseFeedbackArgv(args: string[]): ReturnType<typeof feedbackArgs> {
  const result = parseCommandArgs(feedbackRow(), args)
  if (!result.ok) throw new Error(`fixture argv refused: ${result.refusal.message}`)
  return feedbackArgs(result.parsed)
}

function refusal(args: string[]): string {
  const result = parseCommandArgs(feedbackRow(), args)
  if (result.ok) throw new Error(`expected a refusal for ${args.join(' ')}`)
  return result.refusal.message
}

describe('feedbackArgs', () => {
  test('a single positional message parses cleanly', () => {
    const parsed = parseFeedbackArgv(['something broke'])
    expect(parsed.error).toBeUndefined()
    expect(parsed.message).toBe('something broke')
    expect(parsed.body).toBeUndefined()
    expect(parsed.upstream).toBe(false)
  })

  test('--body <value> and --body=value both work', () => {
    expect(parseFeedbackArgv(['msg', '--body', 'more']).body).toBe('more')
    expect(parseFeedbackArgv(['msg', '--body=more']).body).toBe('more')
  })

  test('--upstream sets the flag regardless of position', () => {
    expect(parseFeedbackArgv(['--upstream', 'msg']).upstream).toBe(true)
    expect(parseFeedbackArgv(['msg', '--upstream']).upstream).toBe(true)
  })

  test("no message at all is commander's missing required argument, refused at parse", () => {
    expect(refusal([])).toBe(
      "cospec feedback: missing required argument 'message'\ncospec feedback: usage — cospec feedback <message>\n",
    )
  })

  test('a whitespace-only message is treated as missing', () => {
    expect(parseFeedbackArgv(['   ']).error).toContain('a message is required')
  })

  test('a second positional is refused by the table (only one message argument)', () => {
    expect(refusal(['first', 'second'])).toContain('too many arguments. Expected 1')
  })

  test('an unknown flag is refused by the table', () => {
    expect(refusal(['msg', '--bogus'])).toContain("unknown option '--bogus'")
  })

  test('--body with no value is refused by the table', () => {
    expect(refusal(['msg', '--body'])).toContain("option '--body <text>' argument missing")
  })
})

test('UPSTREAM_REPO and COSPEC_REPO are the two distinct, hardcoded destinations', () => {
  expect(COSPEC_REPO).toBe('aligned-team/cospec')
  expect(UPSTREAM_REPO).toBe('Fission-AI/OpenSpec')
})

describe('upstreamFeedbackArgv (the --upstream relay)', () => {
  test('the message sits behind --, so one that looks like an option stays the message', () => {
    expect(upstreamFeedbackArgv('--x', undefined)).toEqual(['feedback', '--', '--x'])
    expect(upstreamFeedbackArgv('msg', '--json')).toEqual([
      'feedback',
      '--body',
      '--json',
      '--',
      'msg',
    ])
  })

  test('cospec feedback --upstream -- --x parses --x as the message', () => {
    const row = commandRow('feedback') as TableCommandRow
    const parsed = parseCommandArgs(row, ['--upstream', '--', '--x'])
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.parsed.positionals).toEqual(['--x'])
  })
})
