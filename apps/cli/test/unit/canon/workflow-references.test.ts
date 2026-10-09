// Cross-workflow references in the canon (workflow-profiles task 4.1, design D7). Every
// `/cospec:<id>` in a workflow body sits in the if-branch of a conditional on that same id, and
// no fallback names `/cospec:`, so a narrowed install never prints a command for a workflow it
// does not carry. The scanner is exercised on fixtures first so a passing row
// cannot be a vacuous pass.

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { readWorkflowManifest } from '../../../src/harness/render.ts'

const CANON = join(import.meta.dir, '../../../src/canon/workflows')
const REPO_ROOT = join(import.meta.dir, '../../../../..')
const IDS = new Set(readWorkflowManifest().workflows.map((w) => w.id))

const TOKEN_SOURCE =
  '\\[\\[opsx:if-workflow ([a-z-]+)\\]\\]|(\\[\\[opsx:else\\]\\])|(\\[\\[opsx:end\\]\\])|\\/cospec:([a-z-]+)'

/** Every violation in one body, each as `file:line: reason`. */
function referenceViolations(file: string, text: string): string[] {
  const violations: string[] = []
  const re = new RegExp(TOKEN_SOURCE, 'g')
  let block: { id: string; branch: 'if' | 'else' } | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const at = `${file}:${text.slice(0, m.index).split('\n').length}`
    const [, openId, elseTag, endTag, refId] = m
    if (openId !== undefined) {
      if (block !== null) violations.push(`${at}: conditional opens inside '${block.id}'`)
      if (!IDS.has(openId)) violations.push(`${at}: marker id '${openId}' is not in the manifest`)
      block = { id: openId, branch: 'if' }
    } else if (elseTag !== undefined) {
      if (block === null || block.branch !== 'if') violations.push(`${at}: stray [[opsx:else]]`)
      else block.branch = 'else'
    } else if (endTag !== undefined) {
      if (block === null || block.branch !== 'else') violations.push(`${at}: stray [[opsx:end]]`)
      block = null
    } else if (refId !== undefined) {
      if (block === null) {
        violations.push(`${at}: /cospec:${refId} outside a conditional branch`)
      } else if (block.branch === 'else') {
        violations.push(`${at}: /cospec:${refId} named in the fallback of '${block.id}'`)
      } else if (block.id !== refId) {
        violations.push(`${at}: /cospec:${refId} inside the conditional for '${block.id}'`)
      }
    }
  }
  if (block !== null) violations.push(`${file}: conditional for '${block.id}' never closes`)
  return violations
}

describe('the reference scanner', () => {
  test('accepts a reference wrapped in its own if-branch, with a fallback that names no /cospec:', () => {
    const body =
      'run `[[opsx:if-workflow apply]]/cospec:apply[[opsx:else]]cospec apply <slug>[[opsx:end]]`.'
    expect(referenceViolations('fixture.md', body)).toEqual([])
  })

  test('flags a bare reference, a fallback naming /cospec:, and a mismatched id', () => {
    const bare = referenceViolations('fixture.md', 'run `/cospec:apply` next.')
    const named = referenceViolations(
      'fixture.md',
      'run `[[opsx:if-workflow apply]]/cospec:apply[[opsx:else]]/cospec:apply[[opsx:end]]`.',
    )
    const mismatched = referenceViolations(
      'fixture.md',
      'run `[[opsx:if-workflow archive]]/cospec:apply[[opsx:else]]cospec apply <slug>[[opsx:end]]`.',
    )
    expect(bare).toEqual(['fixture.md:1: /cospec:apply outside a conditional branch'])
    expect(named).toEqual(["fixture.md:1: /cospec:apply named in the fallback of 'apply'"])
    expect(mismatched).toEqual(["fixture.md:1: /cospec:apply inside the conditional for 'archive'"])
  })
})

const files = readdirSync(CANON)
  .filter((f) => f.endsWith('.md'))
  .toSorted()

describe('cross-workflow references in the canon', () => {
  test('every /cospec:<id> sits in its own if-branch, with no /cospec: in a fallback', () => {
    const violations = files.flatMap((f) =>
      referenceViolations(
        relative(REPO_ROOT, join(CANON, f)),
        readFileSync(join(CANON, f), 'utf8'),
      ),
    )
    expect(violations).toEqual([])
  })
})
