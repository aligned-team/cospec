// generate() under a profile: the set a row renders is the profile's plus what it already has,
// delivery drops a surface without dropping the workflow, and detection no longer needs one
// particular skill (workflow-profiles design D4, D5).

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { detectHarnesses, generate, installedWorkflowIds } from '../../../src/commands/update.ts'
import { adapterFor, commandPath, skillPath } from '../../../src/harness/adapters.ts'
import { readWorkflowManifest } from '../../../src/harness/render.ts'
import { cleanup, makeRepo } from './helpers.ts'

const MANIFEST = readWorkflowManifest().workflows
const CLAUDE = adapterFor('claude')
const ALL = MANIFEST.map((w) => w.id)
const CORE = new Set(MANIFEST.filter((w) => w.core === true).map((w) => w.id))

let dir: string
beforeEach(() => {
  dir = makeRepo()
})
afterEach(() => cleanup(dir))

const has = (relpath: string): boolean => existsSync(join(dir, relpath))
const skillsOnDisk = (): string[] =>
  MANIFEST.filter((w) => has(skillPath(CLAUDE, w.skill))).map((w) => w.id)
const commandsOnDisk = (): string[] =>
  MANIFEST.filter((w) => has(commandPath(CLAUDE, w.command)!)).map((w) => w.id)

describe('generate(): a profile never removes an installed workflow', () => {
  test('a core profile over twelve installed workflows rewrites and removes nothing', () => {
    generate(dir, { harnesses: ['claude'] })
    const again = generate(dir, { harnesses: ['claude'], workflows: CORE })
    expect(again.results.filter((r) => r.outcome !== 'unchanged')).toEqual([])
    expect(skillsOnDisk()).toEqual(ALL)
    expect(commandsOnDisk()).toEqual(ALL)
  })

  test('a fresh row gets exactly the profile set', () => {
    generate(dir, { harnesses: ['claude'], workflows: CORE })
    expect(skillsOnDisk().toSorted()).toEqual([...CORE].toSorted())
    expect(commandsOnDisk().toSorted()).toEqual([...CORE].toSorted())
  })

  test('the profile adds a workflow and keeps the one it no longer lists', () => {
    generate(dir, { harnesses: ['claude'], workflows: new Set(['explore']) })
    const next = generate(dir, { harnesses: ['claude'], workflows: new Set(['verify']) })
    expect(skillsOnDisk().toSorted()).toEqual(['explore', 'verify'])
    expect(
      next.results
        .filter((r) => r.outcome === 'created')
        .map((r) => r.path)
        .toSorted(),
    ).toEqual([commandPath(CLAUDE, 'verify')!, skillPath(CLAUDE, 'cospec-verify-change')])
  })

  test('each row keeps its own set: a later row gets the profile, an older one its twelve', () => {
    generate(dir, { harnesses: ['claude'] })
    generate(dir, { harnesses: ['claude', 'cursor'], workflows: new Set(['explore']) })
    expect(skillsOnDisk()).toEqual(ALL)
    const cursor = adapterFor('cursor')
    expect(MANIFEST.filter((w) => has(commandPath(cursor, w.command)!)).map((w) => w.id)).toEqual([
      'explore',
    ])
  })

  test('installedWorkflowIds reads both surfaces', () => {
    generate(dir, { harnesses: ['claude'], workflows: new Set(['explore', 'verify']) })
    rmSync(join(dir, skillPath(CLAUDE, 'cospec-verify-change')))
    rmSync(join(dir, commandPath(CLAUDE, 'explore')!))
    expect([...installedWorkflowIds(dir, CLAUDE, {})].toSorted()).toEqual(['explore', 'verify'])
  })
})

describe('generate(): delivery drops a surface and keeps the workflow', () => {
  test('skills, then commands, then both', () => {
    generate(dir, { harnesses: ['claude'], workflows: CORE })
    const toSkills = generate(dir, { harnesses: ['claude'], workflows: CORE, delivery: 'skills' })
    expect(toSkills.results.filter((r) => r.outcome === 'removed')).toHaveLength(CORE.size)
    expect(commandsOnDisk()).toEqual([])
    generate(dir, { harnesses: ['claude'], workflows: CORE, delivery: 'commands' })
    expect(skillsOnDisk()).toEqual([])
    expect(commandsOnDisk().toSorted()).toEqual([...CORE].toSorted())
    generate(dir, { harnesses: ['claude'], workflows: CORE, delivery: 'both' })
    expect(skillsOnDisk().toSorted()).toEqual([...CORE].toSorted())
  })
})

describe('detectHarnesses(): any installed workflow is evidence', () => {
  test('with no propose skill', () => {
    generate(dir, { harnesses: ['claude'], workflows: new Set(['verify']) })
    expect(has(skillPath(CLAUDE, 'cospec-propose'))).toBe(false)
    expect(detectHarnesses(dir)).toEqual(['claude'])
  })

  test('with commands only', () => {
    generate(dir, { harnesses: ['claude'], delivery: 'commands' })
    expect(skillsOnDisk()).toEqual([])
    expect(detectHarnesses(dir)).toEqual(['claude'])
  })

  test('an empty repo detects nothing', () => {
    expect(detectHarnesses(dir)).toEqual([])
  })
})
