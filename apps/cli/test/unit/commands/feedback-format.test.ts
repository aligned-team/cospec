// Pure formatting/parsing unit tests for `cospec feedback` (DESIGN §3.1,
// ledger row 3.1): grapheme-safe 72-char title truncation, the
// Summary/Details/provenance body shape, the never-a-shell argv, and argv
// parsing.

import { describe, expect, test } from 'bun:test'

import {
  COSPEC_REPO,
  formatBody,
  formatTitle,
  issueArgv,
  manualUrl,
  parseFeedbackArgs,
  provenanceFooter,
  UPSTREAM_REPO,
} from '../../../src/commands/feedback.ts'

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

describe('formatBody', () => {
  test('carries Summary, optional Details, and the footer', () => {
    const footer = provenanceFooter(new Date('2026-09-01T00:00:00.000Z'), 'project 1.11.0')
    const withDetails = formatBody('short summary', 'more detail here', footer)
    expect(withDetails).toContain('## Summary')
    expect(withDetails).toContain('short summary')
    expect(withDetails).toContain('## Details')
    expect(withDetails).toContain('more detail here')
    expect(withDetails).toContain(footer)

    const withoutDetails = formatBody('short summary', undefined, footer)
    expect(withoutDetails).not.toContain('## Details')
  })

  test('an empty-string details is treated as absent', () => {
    const footer = provenanceFooter(new Date(), 'embedded 1.11.0')
    expect(formatBody('msg', '', footer)).not.toContain('## Details')
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
  test('URL-encodes title and body onto the given repo, no labels param', () => {
    const url = manualUrl(COSPEC_REPO, 'Feedback: it broke', '## Summary\n\nit broke')
    expect(url.startsWith(`https://github.com/${COSPEC_REPO}/issues/new?`)).toBe(true)
    expect(url).toContain(encodeURIComponent('Feedback: it broke'))
    expect(url).not.toContain('labels=')
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

describe('parseFeedbackArgs', () => {
  test('a single positional message parses cleanly', () => {
    const parsed = parseFeedbackArgs(['something broke'])
    expect(parsed.error).toBeUndefined()
    expect(parsed.message).toBe('something broke')
    expect(parsed.body).toBeUndefined()
    expect(parsed.upstream).toBe(false)
  })

  test('--body <value> and --body=value both work', () => {
    expect(parseFeedbackArgs(['msg', '--body', 'more']).body).toBe('more')
    expect(parseFeedbackArgs(['msg', '--body=more']).body).toBe('more')
  })

  test('--upstream sets the flag regardless of position', () => {
    expect(parseFeedbackArgs(['--upstream', 'msg']).upstream).toBe(true)
    expect(parseFeedbackArgs(['msg', '--upstream']).upstream).toBe(true)
  })

  test('no message at all is an error naming the usage', () => {
    const parsed = parseFeedbackArgs([])
    expect(parsed.error).toContain('a message is required')
  })

  test('a whitespace-only message is treated as missing', () => {
    expect(parseFeedbackArgs(['   ']).error).toContain('a message is required')
  })

  test('a second positional is an error (only one message argument)', () => {
    expect(parseFeedbackArgs(['first', 'second']).error).toContain('only one message argument')
  })

  test('an unknown flag is an error', () => {
    expect(parseFeedbackArgs(['msg', '--bogus']).error).toContain("unknown option '--bogus'")
  })

  test('--body with no value is an error', () => {
    expect(parseFeedbackArgs(['msg', '--body']).error).toContain('--body requires a value')
  })
})

test('UPSTREAM_REPO and COSPEC_REPO are the two distinct, hardcoded destinations', () => {
  expect(COSPEC_REPO).toBe('aligned-team/cospec')
  expect(UPSTREAM_REPO).toBe('Fission-AI/OpenSpec')
})
