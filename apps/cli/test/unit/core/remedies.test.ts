import { describe, expect, test } from 'bun:test'

import { REMEDIES, type Remedy, respellRemedies } from '../../../src/core/remedies.ts'

/** A bare `openspec` command a user could copy and run outside cospec. */
const BARE_OPENSPEC = /\bopenspec [a-z-]/

/** What each hole holds in the filled-in examples. */
const SAMPLE: Record<string, string> = {
  id: 'x-1',
  text: "/w/Bob's openspec init dir",
  store: ' --store st1',
  sgr: '\u001b[37m',
  cmd: 'openspec new change <name>',
}
const SAMPLE_SPELLED: Record<string, string> = { ...SAMPLE, cmd: 'cospec new <type> <name>' }

function fill(template: string, samples: Record<string, string>): string {
  return template.replace(/\{(id|text|store|sgr|cmd)\}/g, (_, hole: string) => samples[hole]!)
}

const cospecOf = (remedy: Remedy) =>
  remedy.cospec ?? remedy.upstream.replace(/\bopenspec (?=[a-z{])/g, 'cospec ')

describe('respellRemedies: every allowlisted sentence', () => {
  test('ids are unique', () => {
    const ids = REMEDIES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  for (const remedy of REMEDIES) {
    const upstream = fill(remedy.upstream, SAMPLE)
    const cospec = fill(cospecOf(remedy), SAMPLE_SPELLED)
    // A command stands as a whole field: a `Fix:` line, or a JSON string.
    const text = remedy.kind === 'command' ? (s: string) => `  Fix: ${s}\n` : (s: string) => s
    test(`${remedy.id}: as printed and inside a JSON string`, () => {
      expect(respellRemedies(text(upstream))).toBe(text(cospec))
      const json = JSON.stringify({ fix: upstream }, null, 2)
      expect(JSON.parse(respellRemedies(json))).toEqual({ fix: cospec })
      // Only the sample's own hole text names bare openspec afterwards.
      expect(BARE_OPENSPEC.test(cospec.replaceAll(SAMPLE.text!, ''))).toBe(false)
    })
  }
})

describe('respellRemedies: nothing but an allowlisted sentence', () => {
  test('a command remedy is spelled only where it stands as a whole field', () => {
    expect(respellRemedies('Next: openspec status --change c1\n')).toBe(
      'Next: cospec status --change c1\n',
    )
    for (const text of [
      'see openspec status --change c1 for more\n',
      "mkdir '/w/openspec store register /path/to/store'\n",
      'instruction: `openspec status --change x`\n',
    ])
      expect(respellRemedies(text)).toBe(text)
  })

  test('a sentence with a word on either side of it is not that sentence', () => {
    const text = 'xRun openspec init to create a root here.'
    expect(respellRemedies(text)).toBe(text)
  })

  test('each command in a joined {cmd} hole is spelled, the rest of it kept', () => {
    expect(
      respellRemedies(
        `Unregister or remove those stores first (openspec store unregister a, then openspec store unregister b), or run "openspec store unregister s" to forget 's' without deleting files.`,
      ),
    ).toBe(
      `Unregister or remove those stores first (cospec store unregister a, then cospec store unregister b), or run "cospec store unregister s" to forget 's' without deleting files.`,
    )
  })

  test("an archive rerun keeps upstream's flags and store after the command", () => {
    expect(respellRemedies('Fix: openspec archive c1 --yes --no-validate --store st1\n')).toBe(
      'Fix: cospec archive c1 --yes --no-validate --store st1\n',
    )
    expect(
      respellRemedies(
        'Complete the tasks or rerun with openspec archive "-x" --yes --store st1 -- "-x"',
      ),
    ).toBe('Complete the tasks or rerun with cospec archive "-x" --yes --store st1 -- "-x"')
  })

  test('upstream store lifecycle examples take cospec new <type>', () => {
    expect(respellRemedies('  openspec new change c1 --store <id>\n')).toBe(
      '  cospec new <type> c1 --store <id>\n',
    )
    expect(respellRemedies('  openspec list --store <id>\n')).toBe('  cospec list --store <id>\n')
  })
})
