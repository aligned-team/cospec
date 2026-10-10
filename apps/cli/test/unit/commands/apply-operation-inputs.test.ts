// `cospec apply` relays and prints the project's own inputs (canon-workflow-parity 5.1,
// design D7): `context`, `operationGuidance` and `references` ride in the wrapped apply
// document. Only the references' command fields are spelled through cospec; the user's own
// `context` and `operationGuidance` pass byte for byte, even an entry that starts `openspec `.

import { describe, expect, test } from 'bun:test'

import { relayApplyInstructions } from '../../../src/commands/apply.ts'
import type { ApplyInstructionsJson } from '../../../src/core/openspec.ts'
import {
  renderOperationInputs,
  renderReferencesSection,
} from '../../../src/core/operation-inputs.ts'

/** The wrapped apply payload for a change, with `extra` keys over a minimal clear-gate one. */
function payload(extra: Record<string, unknown> = {}): ApplyInstructionsJson {
  return {
    changeName: 'my-fix',
    changeDir: '/p/openspec/changes/my-fix',
    schemaName: 'fix',
    contextFiles: {},
    progress: { total: 1, complete: 0, remaining: 1 },
    tasks: [],
    state: 'ready',
    instruction: 'Implement the tasks.',
    ...extra,
  }
}

const REFERENCE = {
  store_id: 'docs',
  root: '/stores/docs',
  specs: [
    { id: 'auth', summary: 'Sign-in rules' },
    { id: 'billing', summary: '' },
  ],
  fetch: 'openspec show <spec-id> --type spec --store docs',
  status: [{ message: 'The store is shallow.', fix: 'Run: openspec store doctor docs' }],
}

const GUIDANCE = [
  'openspec list --json is how the team lists changes',
  'Run the focused tests first',
]

describe('relayApplyInstructions carries the project inputs (5.1)', () => {
  test('context and operationGuidance pass through byte for byte, an `openspec ` entry included', () => {
    const relayed = relayApplyInstructions(
      payload({ context: 'We use `openspec` daily.\nSecond line.', operationGuidance: GUIDANCE }),
      'my-fix',
    ) as unknown as Record<string, unknown>
    expect(relayed.context).toBe('We use `openspec` daily.\nSecond line.')
    expect(relayed.operationGuidance).toEqual(GUIDANCE)
  })

  test.failing(
    'references[].fetch and .status[].fix are spelled through cospec, nothing else',
    () => {
      const relayed = relayApplyInstructions(
        payload({ references: [REFERENCE], context: 'openspec show x --type spec --store docs' }),
        'my-fix',
      ) as unknown as {
        context: string
        references: { fetch: string; status: { fix: string; message: string }[]; root: string }[]
      }
      const [reference] = relayed.references
      expect(reference?.fetch).toBe('cospec show <spec-id> --type spec --store docs')
      expect(reference?.status[0]?.fix).toBe('Run: cospec store doctor docs')
      expect(reference?.status[0]?.message).toBe('The store is shallow.')
      expect(reference?.root).toBe('/stores/docs')
      expect(relayed.context).toBe('openspec show x --type spec --store docs')
    },
  )

  test('a document with none of the three keeps none of them', () => {
    const relayed = relayApplyInstructions(payload(), 'my-fix')
    for (const key of ['context', 'operationGuidance', 'references'])
      expect(key in relayed).toBe(false)
  })
})

describe('renderReferencesSection and renderOperationInputs (5.1)', () => {
  test.failing("the references section is the binary's `### Referenced Stores` block", () => {
    expect(renderReferencesSection(payload({ references: [REFERENCE] }))).toBe(
      [
        '### Referenced Stores',
        '',
        'Read-only upstream context. Fetch what you need; cite what you use.',
        '',
        'Store docs (/stores/docs):',
        '  - auth: Sign-in rules',
        '  - billing',
        '  Fetch: openspec show <spec-id> --type spec --store docs',
        '  Note: The store is shallow.',
        '  Fix: Run: openspec store doctor docs',
        '',
        '',
      ].join('\n'),
    )
  })

  test.failing('an unresolved store prints one `Store <id>: <message>` line per diagnostic', () => {
    const entry = { store_id: 'gone', status: [{ message: 'Not registered.', fix: 'Run: x' }] }
    expect(renderReferencesSection(payload({ references: [entry] }))).toContain(
      'Store gone: Not registered.\n  Fix: Run: x\n',
    )
  })

  test.failing(
    'context prints verbatim under its heading, guidance one sanitized line each',
    () => {
      const out = renderOperationInputs(
        payload({
          context: '# not a heading guard\nline two',
          operationGuidance: ['first\nforged line', 'second'],
        }),
      )
      expect(out).toBe(
        [
          '### Project Context (required instruction input)',
          '# not a heading guard',
          'line two',
          '',
          '### Operation Guidance (advisory)',
          '- first forged line',
          '- second',
          '',
          '',
        ].join('\n'),
      )
    },
  )

  test.failing('guidance alone prints only its section', () => {
    const out = renderOperationInputs(payload({ operationGuidance: ['only'] }))
    expect(out).toBe('### Operation Guidance (advisory)\n- only\n\n')
  })

  test('nothing configured prints nothing, and not upstream\'s "No project context" line', () => {
    expect(renderReferencesSection(payload())).toBe('')
    expect(renderOperationInputs(payload())).toBe('')
  })
})
