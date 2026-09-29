// `generate()` over fixture rows injected through `GenerateOptions.adapters`
// (the same seam as `RenderOptions.adapters`): a home-scoped file is refused
// before anything is written (verification 3.6), and a frontmatter-less TOML
// command is manifest-tracked like the codex rules file (design decision 9).

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { generate } from '../../../src/commands/update.ts'
import { readManifest } from '../../../src/core/managed-files.ts'
import type { HarnessAdapter, HarnessName } from '../../../src/harness/adapters.ts'
import { cleanup, makeRepo } from './helpers.ts'

const HOME_ROW: HarnessAdapter = {
  id: 'home-fixture',
  displayName: 'Fixture tool with a home skills root',
  globalSkillsDir: '.home-fixture',
  invocationPrefix: '/',
  bodyDialect: 'shared',
  requiresIdeRestart: false,
  detectionPaths: [],
}

const TOML_ROW: HarnessAdapter = {
  id: 'toml-fixture',
  displayName: 'Fixture tool with TOML commands',
  skillsDir: '.toml-fixture',
  commands: {
    dir: '.toml-fixture/commands',
    namespacing: 'namespaced',
    file: 'cospec/{command}',
    extension: '.toml',
    serializer: 'toml',
  },
  invocationPrefix: '/',
  bodyDialect: 'shared',
  requiresIdeRestart: false,
  detectionPaths: ['.toml-fixture'],
}

describe('generate() over injected rows', () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  test('a home-scoped rendered file throws an internal error naming its path and writes nothing', () => {
    const run = (): unknown =>
      generate(dir, { harnesses: [HOME_ROW.id as HarnessName], adapters: [HOME_ROW] })
    expect(run).toThrow(
      /^internal: home-fixture rendered home-scoped \.home-fixture\/skills\/cospec-[a-z-]+\/SKILL\.md, which no managed root covers$/,
    )
    expect(readdirSync(dir)).toEqual([])
    expect(existsSync(join(dir, 'openspec/.cospec-manifest.json'))).toBe(false)
  })

  test('a home-scoped row selected beside a real row still writes nothing', () => {
    const run = (): unknown =>
      generate(dir, {
        harnesses: ['claude', HOME_ROW.id as HarnessName],
        adapters: [
          {
            id: 'claude',
            displayName: 'Claude-shaped fixture',
            skillsDir: '.claude',
            invocationPrefix: '/',
            bodyDialect: 'canonical',
            requiresIdeRestart: false,
            detectionPaths: ['.claude'],
          },
          HOME_ROW,
        ],
      })
    expect(run).toThrow(/^internal: home-fixture rendered home-scoped /)
    expect(readdirSync(dir)).toEqual([])
  })

  test('a TOML command file carries no frontmatter, so the manifest tracks it', () => {
    const opts = { harnesses: [TOML_ROW.id as HarnessName], adapters: [TOML_ROW] }
    const first = generate(dir, opts)
    const tomlPath = '.toml-fixture/commands/cospec/propose.toml'
    expect(existsSync(join(dir, tomlPath))).toBe(true)
    expect(first.manifest.files[tomlPath]).toMatch(/^sha256:/)
    expect(readManifest(dir)?.files[tomlPath]).toBe(first.manifest.files[tomlPath])
    // A skill file is self-describing markdown and stays out of the manifest.
    expect(first.manifest.files['.toml-fixture/skills/cospec-propose/SKILL.md']).toBeUndefined()
    const second = generate(dir, opts)
    expect(second.results.every((r) => r.outcome === 'unchanged')).toBe(true)
  })
})
