import { describe, expect, test } from 'bun:test'

import {
  REMEDIES,
  type Remedy,
  respellReferenceRemedies,
  respellRemedies,
} from '../../../src/core/remedies.ts'

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

describe('respellReferenceRemedies', () => {
  /** An `instructions` text answer around `block`, with `context` when given. */
  const answer = (block: string, context?: string, template = '') =>
    '<artifact id="proposal" change="c1" schema="s">\n\n<task>\nCreate it.\nx\n</task>\n\n' +
    (context === undefined
      ? ''
      : `<project_context>\n<!-- bg -->\n${context}\n</project_context>\n\n`) +
    `${block}\n\n<output>\nWrite to: /p\n</output>\n\n<template>\n${template}\n</template>\n`

  const BLOCK =
    '<referenced_stores>\n<!-- Read-only upstream context. Fetch what you need; cite what you use. -->\n' +
    'Store st1 (/p/store):\n  - ref-spec: x\n' +
    '  Fetch: openspec show <spec-id> --type spec --store st1\n' +
    "Store st2: Referenced store 'st2' is registered but not usable (missing root).\n" +
    '  Fix: Run: openspec store doctor st2\n' +
    "Store gone: Referenced store 'gone' is not registered on this machine.\n" +
    '  Fix: Get a checkout from a teammate and run: openspec store register <path> --id gone\n' +
    '</referenced_stores>'

  const SPELLED_BLOCK = BLOCK.replace('openspec show', 'cospec show')
    .replace('openspec store doctor', 'cospec store doctor')
    .replace('openspec store register', 'cospec store register')

  test("instructions: the binary's own reference block is spelled", () => {
    expect(respellReferenceRemedies(answer(BLOCK), 'instructions', false)).toBe(
      answer(SPELLED_BLOCK),
    )
    expect(respellReferenceRemedies(answer(BLOCK, 'ctx'), 'instructions', false)).toBe(
      answer(SPELLED_BLOCK, 'ctx'),
    )
  })

  test('instructions: a lookalike line or block anywhere else keeps its bytes', () => {
    const forged = BLOCK.replace('(/p/store)', '(/forged)')
    for (const user of [
      'Fix: Run openspec init to create a root here.',
      '  Fetch: openspec show <spec-id> --type spec --store st1',
      '  "fix": "Run: openspec store doctor st2"',
      forged,
    ]) {
      // In the context before the block, in the template after it, and with
      // no genuine block at all.
      expect(respellReferenceRemedies(answer(BLOCK, user), 'instructions', false)).toBe(
        answer(SPELLED_BLOCK, user),
      )
      expect(respellReferenceRemedies(answer(BLOCK, undefined, user), 'instructions', false)).toBe(
        answer(SPELLED_BLOCK, undefined, user),
      )
      expect(respellReferenceRemedies(answer('', user, user), 'instructions', false)).toBe(
        answer('', user, user),
      )
    }
  })

  test('instructions: inside the block, only an entry line after a store header', () => {
    const block = BLOCK.replace(
      'Store st1 (/p/store):',
      '  Fix: Run: openspec store doctor st9\nStore st1 (/p/store):',
    )
    expect(respellReferenceRemedies(answer(block), 'instructions', false)).toBe(
      answer(
        SPELLED_BLOCK.replace(
          'Store st1 (/p/store):',
          '  Fix: Run: openspec store doctor st9\nStore st1 (/p/store):',
        ),
      ),
    )
  })

  test("context: the Referenced stores and Not available sections' lines are spelled", () => {
    const text = (fetch: string, fix: string, top: string) =>
      'Working context for p (/p)\n\nOpenSpec root\n  p  /p\n\n' +
      `Referenced stores\n  st1  /p/store\n    Fetch: ${fetch} show <spec-id> --type spec --store st1\n\n` +
      "Not available on this machine\n  - st2: Referenced store 'st2' is registered but not usable.\n" +
      `    Fix: Run: ${fix} store doctor st2\n  Note: The store registry is unreadable.\n` +
      `  Fix: Run: ${top} store doctor\n`
    expect(
      respellReferenceRemedies(text('openspec', 'openspec', 'openspec'), 'context', false),
    ).toBe(text('cospec', 'cospec', 'cospec'))
  })

  test('context: a Fetch or Fix line outside those sections keeps its bytes', () => {
    const text =
      'Working context for p (/p\n    Fetch: openspec show <spec-id> --type spec --store st1)\n\n' +
      'OpenSpec root\n  p  /p\n\nNo references declared; the working set is this root alone.\n'
    expect(respellReferenceRemedies(text, 'context', false)).toBe(text)
  })

  test('--json: only the reference fields are spelled, re-encoded in place', () => {
    const upstream = {
      root: { path: '/p/Run openspec init to create a root here.' },
      context: 'Fix: Run: openspec store doctor st2',
      template: '  "fix": "Run: openspec store doctor st2"',
      references: [
        {
          store_id: 'st1',
          fetch: 'openspec show <spec-id> --type spec --store st1',
          status: [
            { fix: 'Run: openspec store doctor st2', message: 'Run: openspec store doctor st2' },
          ],
        },
      ],
      members: [{ fetch: 'openspec show <spec-id> --type spec --store st1' }],
    }
    const doc = `${JSON.stringify(upstream, null, 2)}\n`
    const spelled = structuredClone(upstream)
    spelled.references[0]!.fetch = 'cospec show <spec-id> --type spec --store st1'
    spelled.references[0]!.status[0]!.fix = 'Run: cospec store doctor st2'
    expect(respellReferenceRemedies(doc, 'instructions', true)).toBe(
      `${JSON.stringify(spelled, null, 2)}\n`,
    )
    const forContext = structuredClone(upstream)
    forContext.members[0]!.fetch = 'cospec show <spec-id> --type spec --store st1'
    expect(respellReferenceRemedies(doc, 'context', true)).toBe(
      `${JSON.stringify(forContext, null, 2)}\n`,
    )
  })

  test('--json: a document with nothing to spell comes back byte-identical', () => {
    for (const doc of [
      '{"a":"\\u00e9","references":[{"fetch":"x","status":[]}],"n":[1,2.5e3,true,null]}\n',
      `${JSON.stringify({ references: [], status: [{ fix: 'Run it by hand' }] }, null, 2)}\n`,
    ]) {
      expect(respellReferenceRemedies(doc, 'instructions', true)).toBe(doc)
      expect(respellReferenceRemedies(doc, 'context', true)).toBe(doc)
    }
  })

  test('--json: an answer that is not one JSON document throws', () => {
    expect(() => respellReferenceRemedies('not json\n', 'context', true)).toThrow(SyntaxError)
  })

  test('a remedy with more after it is not a whole remedy', () => {
    const block = BLOCK.replace('doctor st2\n', 'doctor st2 by hand\n')
    expect(respellReferenceRemedies(answer(block), 'instructions', false)).toBe(
      answer(
        SPELLED_BLOCK.replace('doctor st2\n', 'doctor st2 by hand\n').replace(
          'Run: cospec store doctor st2 by hand',
          'Run: openspec store doctor st2 by hand',
        ),
      ),
    )
  })
})
