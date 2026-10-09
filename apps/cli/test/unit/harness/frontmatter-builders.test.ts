// Each shared command-frontmatter builder against the head of the pinned binary's own
// command file for a tool that uses that key set (`test/fixtures/upstream-init/<id>.json`),
// with `opsx`/`OPSX` respelled `cospec`/`COSPEC`. A builder is keyed by key set, never by
// tool, so one fixture stands for every row that shares it.

import { describe, expect, test } from 'bun:test'

import { parse } from 'yaml'

import {
  buildArgumentHintCommandFrontmatter,
  buildClaudeCommandFrontmatter,
  buildCursorCommandFrontmatter,
  buildInvokableCommandFrontmatter,
  buildNameDescriptionCommandFrontmatter,
  buildNameDescriptionHintCommandFrontmatter,
  buildOpencodeCommandFrontmatter,
  type CommandFrontmatterBuilder,
  serializeFrontmatter,
  type WorkflowDef,
} from '../../../src/harness/adapters.ts'
import { readWorkflowManifest } from '../../../src/harness/render.ts'
import { readFixture } from '../../contract/support/upstream-init-capture.ts'

const EXPLORE: WorkflowDef = readWorkflowManifest().workflows.find((w) => w.id === 'explore')!

/** Values whose text is cospec's own canon, not a layout fact. */
const CANON_VALUES = new Set(['description', 'tags'])

function upstreamHead(id: string): Record<string, unknown> {
  const file = readFixture(id).files.find(
    (f) => f.scope === 'project' && /explore/.test(f.path) && !f.path.endsWith('/SKILL.md'),
  )!
  expect(file.headRule).toBe('yaml-frontmatter')
  const respelled = file.head.replaceAll('opsx', 'cospec').replaceAll('OPSX', 'COSPEC')
  return parse(respelled.replace(/^---\n/, '').replace(/\n---\n$/, '\n')) as Record<string, unknown>
}

const BUILDERS: [string, CommandFrontmatterBuilder, string[]][] = [
  ['description', buildOpencodeCommandFrontmatter, ['junie', 'amazon-q', 'kiro', 'pi']],
  ['description + argument-hint', buildArgumentHintCommandFrontmatter, ['auggie', 'bob']],
  ['name + description', buildNameDescriptionCommandFrontmatter, ['trae']],
  ['name + description + argument-hint', buildNameDescriptionHintCommandFrontmatter, ['codebuddy']],
  [
    'name + description + category + tags',
    buildClaudeCommandFrontmatter,
    ['crush', 'lingma', 'qoder', 'zcode', 'devin'],
  ],
  ["cursor's name, id, category, description", buildCursorCommandFrontmatter, ['cursor', 'iflow']],
  ["continue's name, description, invokable", buildInvokableCommandFrontmatter, ['continue']],
]

describe('shared command frontmatter builders', () => {
  for (const [keys, build, tools] of BUILDERS) {
    for (const tool of tools) {
      test(`${keys}: matches ${tool}'s command head, plus cospec's provenance`, () => {
        const want = upstreamHead(tool)
        const got = build(EXPLORE, 'cospec@test', 'sha256:x')
        const { metadata, ...rest } = got
        expect(Object.keys(rest).toSorted()).toEqual(Object.keys(want).toSorted())
        for (const [key, value] of Object.entries(want)) {
          if (CANON_VALUES.has(key)) continue
          expect([key, rest[key]]).toEqual([key, value])
        }
        expect(metadata).toEqual({
          author: 'cospec',
          generatedBy: 'cospec@test',
          contentHash: 'sha256:x',
        })
        // The block cospec writes is valid YAML that parses back to the same object.
        expect(parse(serializeFrontmatter(got))).toEqual(got)
      })
    }
  }
})
