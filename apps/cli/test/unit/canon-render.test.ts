// The canon's shared fragments (canon-workflow-parity task 2.1, design D3): `{{ROOT_GUARD}}`
// is replaced by `_shared/root-guard.md` in every workflow body, ahead of the optional-workflow
// resolver, and a body that misuses a token fails the render naming its workflow.

import { afterAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { canonFile } from '../../src/canon/embedded.ts'
import { TYPE_TABLE } from '../../src/core/schema-compose.ts'
import {
  type RenderOptions,
  readWorkflowManifest,
  renderHarnessFiles,
} from '../../src/harness/render.ts'
import {
  ARCHIVE_INPUTS_LOOKUP,
  ASCII_DIAGRAMS,
  BULK_ARCHIVE_INPUTS_LOOKUP,
  COLLISION_RESOLUTION,
  INSPECT_BEFORE_DRAFTING,
  OPERATION_INPUTS_PRECEDENCE,
} from '../fixtures/ported-passages.ts'

const CANON = join(import.meta.dir, '../../src/canon/workflows')
const FRAGMENT_PATH = 'workflows/_shared/root-guard.md'
const TOKEN = '{{ROOT_GUARD}}'
const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

/** A copy of the canon workflows with `edit` applied to the named files (and the fragment). */
function canonWith(edit: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-canon-render-'))
  dirs.push(dir)
  cpSync(CANON, dir, { recursive: true })
  for (const [name, text] of Object.entries(edit)) writeFileSync(join(dir, name), text)
  return dir
}

const render = (extra: Partial<RenderOptions> = {}) =>
  renderHarnessFiles({
    harnesses: ['claude'],
    typeTable: TYPE_TABLE,
    version: 'cospec@test',
    ...extra,
  })

const fragment = () => readFileSync(canonFile(FRAGMENT_PATH), 'utf8').trim()

describe('the root-guard fragment', () => {
  test('is registered in the embedded canon and readable', () => {
    expect(fragment().length).toBeGreaterThan(0)
  })

  test('names no bare openspec command, no /cospec:<id> and no optional-workflow marker', () => {
    const text = fragment()
    // A path such as `openspec/config.yaml` is fine; `openspec <word>` is a command.
    expect(text.match(/\bopenspec\s+[a-z-]+/g)).toBeNull()
    expect(text).not.toContain('/cospec:')
    expect(text).not.toContain('[[opsx:')
  })

  test('carries the lead-in check, the carve-out, both branches and the picker', () => {
    const text = fragment()
    for (const needle of [
      'cospec list --json',
      '"root": null',
      '`Declared in`',
      '`Invalid store declaration in`',
      '**Auto-selected**',
      '**Explicit cospec request**',
      '`cospec init`',
      '`--store <id>`',
      'When a step asks you to choose among changes',
      '`lastModified`',
      '(Recommended)',
      '--sort name',
    ]) {
      expect(text).toContain(needle)
    }
  })
})

describe('fragment interpolation', () => {
  test('replaces the token with the fragment, once, in every workflow body', () => {
    const files = render().filter((f) => f.kind === 'skill')
    expect(files).toHaveLength(readWorkflowManifest().workflows.length)
    for (const f of files) {
      expect(f.body).not.toContain(TOKEN)
      expect(f.body.split(fragment()).length - 1).toBe(1)
    }
  })

  test('every canon body carries exactly one token', () => {
    for (const w of readWorkflowManifest().workflows) {
      const text = readFileSync(join(CANON, `${w.id}.md`), 'utf8')
      expect(text.split(TOKEN).length - 1).toBe(1)
    }
  })

  test('a body without the token fails the render, naming the workflow', () => {
    const apply = readFileSync(join(CANON, 'apply.md'), 'utf8').replace(TOKEN, '')
    expect(() => render({ canonDir: canonWith({ 'apply.md': apply }) })).toThrow(
      /'apply'.*ROOT_GUARD/,
    )
  })

  test('a body repeating the token fails the render, naming the workflow', () => {
    const apply = readFileSync(join(CANON, 'apply.md'), 'utf8')
    expect(() => render({ canonDir: canonWith({ 'apply.md': `${apply}\n${TOKEN}\n` }) })).toThrow(
      /'apply'.*ROOT_GUARD/,
    )
  })

  test('a body carrying an unregistered token fails the render, naming the workflow', () => {
    const verify = readFileSync(join(CANON, 'verify.md'), 'utf8')
    expect(() =>
      render({ canonDir: canonWith({ 'verify.md': `${verify}\n{{OTHER}}\n` }) }),
    ).toThrow(/'verify'.*\{\{OTHER\}\}/)
  })

  test('the type table token is not an unregistered token', () => {
    expect(() => render()).not.toThrow()
  })

  test('runs before the optional-workflow resolver', () => {
    const canonDir = canonWith({
      '_shared/root-guard.md': 'guard: [[opsx:if-workflow verify]]V[[opsx:else]]N[[opsx:end]]\n',
    })
    const apply = render({ canonDir, workflows: new Set(['apply']) }).find(
      (f) => f.workflow === 'apply' && f.kind === 'skill',
    )
    expect(apply?.body).toContain('guard: N')
    expect(apply?.body).not.toContain('[[opsx:')
  })
})

/** The rendered skill body of one workflow (the claude harness; every harness shares it). */
function skillBody(workflow: string): string {
  const body = render().find((f) => f.kind === 'skill' && f.workflow === workflow)?.body
  if (body === undefined) throw new Error(`no skill rendered for '${workflow}'`)
  return body
}

/** The body with every run of whitespace as one space, so a sentence wrapped at 80 columns still matches. */
const flat = (text: string): string => text.replace(/\s+/g, ' ')

describe('propose and ff inspect the project before drafting (design D5)', () => {
  for (const workflow of ['propose', 'ff']) {
    test(`${workflow} carries the inspection passage, verbatim from the pinned template`, () => {
      const body = flat(skillBody(workflow))
      for (const sentence of INSPECT_BEFORE_DRAFTING.sentences) expect(body).toContain(sentence)
    })

    test(`${workflow} inspects after re-reading dependencies and before writing`, () => {
      const body = flat(skillBody(workflow))
      const reread = body.indexOf('Re-read every completed dependency')
      const inspect = body.indexOf('Inspect the relevant project before drafting')
      const write = body.indexOf('Write the artifact at the path')
      expect(reread).toBeGreaterThan(-1)
      expect(inspect).toBeGreaterThan(reread)
      expect(write).toBeGreaterThan(inspect)
    })

    test(`${workflow} never tells the agent to open openspec/config.yaml or openspec/schemas/`, () => {
      // A paragraph naming either file may mention it; one that tells the agent to read or open
      // it must be a prohibition.
      const naming = skillBody(workflow)
        .split(/\n\s*\n/)
        .filter((p) => p.includes('openspec/config.yaml') || p.includes('openspec/schemas/'))
      expect(naming.length).toBeGreaterThan(0)
      const telling = naming.filter((p) => /\b(read|reads|open|opening|reading)\b/i.test(p))
      expect(telling.length).toBeGreaterThan(0)
      for (const paragraph of telling) expect(paragraph).toMatch(/\bNOT\b|\bnever\b/)
    })

    test(`${workflow} keeps the format rule: the template and format come from cospec instructions`, () => {
      const body = flat(skillBody(workflow))
      expect(body).toContain('cospec instructions <artifact> --change <slug> --json')
      expect(body).toContain('authoritative template')
    })
  }
})

describe('explore draws diagrams in plain ASCII only (design D6)', () => {
  test('explore states the ASCII rule with its reason, verbatim from the pinned template', () => {
    const body = flat(skillBody('explore'))
    for (const sentence of ASCII_DIAGRAMS.sentences) expect(body).toContain(sentence)
  })

  test('explore holds no box-drawing or arrow glyph (U+2190-U+21FF, U+2500-U+257F) in any rendered file', () => {
    const files = render().filter((f) => f.workflow === 'explore')
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) expect(f.content).not.toMatch(/[\u2190-\u21FF\u2500-\u257F]/)
  })
})

describe('apply reads the project inputs (design D7)', () => {
  test('apply carries the precedence paragraph, verbatim from the pinned template', () => {
    const body = flat(skillBody('apply'))
    for (const sentence of OPERATION_INPUTS_PRECEDENCE.sentences) expect(body).toContain(sentence)
  })

  test('apply reads the inputs from the nested `apply` object of the gate document', () => {
    const body = flat(skillBody('apply'))
    expect(body).toContain('apply.context')
    expect(body).toContain('apply.operationGuidance')
  })
})

describe('archive looks up the project inputs (design D8)', () => {
  const LOOKUP = 'cospec instructions archive --change "<slug>" --json'

  test('archive runs the lookup in step 1, before the archive command', () => {
    const body = flat(skillBody('archive'))
    const lookup = body.indexOf(LOOKUP)
    expect(lookup).toBeGreaterThan(-1)
    expect(lookup).toBeLessThan(body.indexOf('cospec archive <slug>'))
  })

  test('archive states the lookup is optional and never blocks, verbatim from upstream', () => {
    const body = flat(skillBody('archive'))
    for (const sentence of ARCHIVE_INPUTS_LOOKUP.sentences) expect(body).toContain(sentence)
  })

  test('archive threads the selected store onto the lookup, as the other commands do', () => {
    const body = flat(skillBody('archive'))
    const lookup = body.indexOf(LOOKUP)
    expect(lookup).toBeGreaterThan(-1)
    expect(body.slice(lookup, lookup + 300)).toContain('--store <id>')
  })
})

describe('bulk-archive looks up the inputs once and resolves collisions (design D8, D9)', () => {
  const LOOKUP = 'cospec instructions archive --change "<slug>" --json'

  test('runs the same lookup line as archive, once for the batch, with the store threaded', () => {
    const body = flat(skillBody('bulk-archive'))
    const lookup = body.indexOf(LOOKUP)
    expect(lookup).toBeGreaterThan(-1)
    expect(body.indexOf(LOOKUP, lookup + 1)).toBe(-1)
    expect(body.slice(lookup, lookup + 300)).toContain('--store <id>')
    expect(lookup).toBeLessThan(body.indexOf('cospec archive <slug>'))
  })

  test('carries the batch lookup paragraph and the collision passage, verbatim from upstream', () => {
    const body = flat(skillBody('bulk-archive'))
    for (const sentence of BULK_ARCHIVE_INPUTS_LOOKUP.sentences) expect(body).toContain(sentence)
    for (const sentence of COLLISION_RESOLUTION.sentences) expect(body).toContain(sentence)
  })

  test('detects a conflict per capability path from the status document', () => {
    const body = flat(skillBody('bulk-archive'))
    expect(body).toContain('cospec status --change "<slug>" --json')
    expect(body).toContain('artifactPaths.specs')
    expect(body).toContain('`<capability-path>`')
  })

  test('orders an included pair chronologically by `created:`, ties by slug', () => {
    const body = flat(skillBody('bulk-archive'))
    expect(body).toContain('`created:`')
    expect(body).toContain('ties by slug')
  })

  test("edits only the conflicting change's delta files: the MODIFIED retarget and the exclusion", () => {
    const body = flat(skillBody('bulk-archive'))
    expect(body).toContain("only the conflicting change's delta files")
    expect(body).toContain('`## MODIFIED Requirements`')
    expect(body).toContain('full updated requirement')
    expect(body).toContain('every scenario')
    expect(body).toContain('remove its colliding `### Requirement:` blocks')
  })

  test('one confirmation covers the batch and the edits; declined edits and archives nothing', () => {
    const body = flat(skillBody('bulk-archive'))
    expect(body).toContain('one confirmation covers the batch and the edits')
    expect(body).toContain('If the user declines, edit nothing and archive nothing')
  })

  test('forbids main-spec writes, hand mv and every --force* flag', () => {
    const body = flat(skillBody('bulk-archive'))
    expect(body).toContain('Never write a main spec under `openspec/specs/`')
    expect(body).toContain('never hand-`mv`')
    expect(body).toContain('never pass a `--force*` flag')
  })

  test('validates each edited change strictly, then archives each change through cospec archive', () => {
    const body = flat(skillBody('bulk-archive'))
    const validate = body.indexOf('cospec validate <slug> --strict')
    expect(validate).toBeGreaterThan(-1)
    expect(validate).toBeLessThan(body.lastIndexOf('cospec archive <slug>'))
    expect(body).toContain('archive/verification-incomplete')
    expect(body).toContain('archive/scenario-preservation')
  })

  test('names no bare openspec command', () => {
    const body = skillBody('bulk-archive')
    expect(body.match(/`openspec\s+[a-z-]+/g)).toBeNull()
  })
})

const WORKFLOW_IDS = readWorkflowManifest().workflows.map((w) => w.id)
/** Every workflow whose step 1 selects a change, so points at the fragment's picker. */
const SELECTING = ['apply', 'archive', 'continue', 'ff', 'sync-specs', 'update', 'verify']

describe('the fragment replaces each body’s own grounding (design D3, task 8.2)', () => {
  test('one copy of the fragment and no leftover token or marker in all twelve bodies', () => {
    expect(WORKFLOW_IDS).toHaveLength(12)
    for (const id of WORKFLOW_IDS) {
      const body = skillBody(id)
      expect(body.split(fragment()).length - 1).toBe(1)
      expect(body).not.toMatch(/\{\{[A-Z_]+\}\}/)
      expect(body).not.toContain('[[opsx:')
    }
  })

  test('the fragment follows the opening paragraph and precedes the first step', () => {
    for (const id of WORKFLOW_IDS) {
      const body = skillBody(id)
      const at = body.indexOf(fragment())
      expect(at).toBeGreaterThan(0)
      expect(body.slice(0, at)).not.toMatch(/^## /m)
    }
  })

  test('no body carries a bare openspec command', () => {
    for (const id of WORKFLOW_IDS) {
      const body = skillBody(id)
      expect(body.match(/`openspec\s+[a-z-]+/g)).toBeNull()
      expect(body.match(/^\s*openspec\s+[a-z-]+/gm)).toBeNull()
    }
  })

  test('no body keeps its own change-picker prose', () => {
    for (const id of WORKFLOW_IDS) {
      expect(flat(skillBody(id))).not.toMatch(/more than one is plausible/)
    }
  })

  test('every selecting body keeps sole-change auto-select and points to the picker', () => {
    for (const id of SELECTING) {
      // The body's own step, before the fragment is interpolated, names the fragment's picker.
      const step = flat(readFileSync(join(CANON, `${id}.md`), 'utf8'))
      expect(step).toContain('Using change: <slug>')
      expect(step).toContain('Choosing a change')
    }
  })

  test('propose delegates its stop-on-no-root text to the fragment', () => {
    const body = flat(skillBody('propose'))
    expect(body).toContain('cospec context --json')
    expect(body).toContain('root.path')
    expect(body).not.toContain('ask the user how they want to proceed')
    expect(body).not.toContain('If it does not resolve a root, stop there')
  })

  test('propose and explore still read cospec context --json', () => {
    for (const id of ['propose', 'explore']) {
      expect(skillBody(id)).toContain('cospec context --json')
    }
  })
})

describe('ported provenance in harness.yaml (design D10, task 8.3)', () => {
  const PINNED = '1.13.1'
  const entry = (passage: string, file: string) => ({
    passage,
    file: `dist/core/templates/workflows/${file}`,
    pin: PINNED,
  })
  const OWN: Record<string, string[][]> = {
    propose: [['inspect-before-drafting', 'propose.js']],
    ff: [['inspect-before-drafting', 'ff-change.js']],
    explore: [['ascii-diagrams', 'explore.js']],
    apply: [['operation-inputs-precedence', 'apply-change.js']],
    archive: [['archive-inputs-lookup', 'archive-change.js']],
    'bulk-archive': [
      ['archive-inputs-lookup', 'bulk-archive-change.js'],
      ['collision-resolution', 'bulk-archive-change.js'],
    ],
  }

  test('every workflow records the root-guard and change-picker passages', () => {
    for (const w of readWorkflowManifest().workflows) {
      expect(w.ported ?? []).toContainEqual(entry('root-guard', 'project-root.js'))
      expect(w.ported ?? []).toContainEqual(entry('change-picker', 'continue-change.js'))
    }
  })

  test('each passage of this change is recorded on the workflow that carries it', () => {
    const byId = new Map(readWorkflowManifest().workflows.map((w) => [w.id, w.ported ?? []]))
    for (const [id, own] of Object.entries(OWN)) {
      for (const [passage = '', file = ''] of own) {
        expect(byId.get(id)).toContainEqual(entry(passage, file))
      }
    }
  })

  test('no other workflow records a passage this change ports into a different body', () => {
    const own = new Set(['root-guard', 'change-picker'])
    for (const w of readWorkflowManifest().workflows) {
      const expected = new Set<string | undefined>([...own, ...(OWN[w.id] ?? []).map(([p]) => p)])
      for (const p of w.ported ?? []) expect(expected.has(p.passage)).toBe(true)
    }
  })

  test('ported never reaches a generated file', () => {
    for (const f of render()) {
      expect(f.content).not.toMatch(/^ported:/m)
      expect(f.content).not.toContain('project-root.js')
      expect(f.content).not.toContain('dist/core/templates')
    }
  })

  test('a ported value that is not a list fails the read, naming the workflow', () => {
    // `ported:` is already declared on propose; replace that whole block instead.
    const yaml = readFileSync(join(CANON, 'harness.yaml'), 'utf8').replace(
      /    ported:\n(?:      .*\n)+/,
      '    ported: nope\n',
    )
    const dir = canonWith({ 'harness.yaml': yaml })
    expect(() => readWorkflowManifest(dir)).toThrow(/'propose'.*ported/)
  })

  test('an entry missing its file or pin fails the read, naming the workflow', () => {
    const yaml = readFileSync(join(CANON, 'harness.yaml'), 'utf8').replace(
      /        pin: 1\.13\.1\n/,
      '',
    )
    const dir = canonWith({ 'harness.yaml': yaml })
    expect(() => readWorkflowManifest(dir)).toThrow(/'propose'.*pin/)
  })
})
