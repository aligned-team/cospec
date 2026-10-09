// `verification.layers` in `openspec/config.yaml` extends the closed `@<layer>`
// vocabulary (verification-artifact spec, "Project-extended layer is accepted").
// The rule already honoured `ValidateContext.verificationLayers`; these rows pin
// the config-to-context path nothing exercised before (#68).

import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readValidateContext } from '../../../src/commands/validate.ts'
import { parseVerificationLayers, projectVerificationLayers } from '../../../src/core/change.ts'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function repo(config?: string, file = 'config.yaml'): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-vlayers-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'openspec', 'changes', 'archive'), { recursive: true })
  if (config !== undefined) writeFileSync(join(dir, 'openspec', file), config)
  return dir
}

const layersOf = (base: string): readonly string[] | undefined =>
  readValidateContext(base).ctx.verificationLayers

describe('readValidateContext reads verification.layers from the config', () => {
  test.each([
    ['block list', 'verification:\n  layers:\n    - uat\n'],
    ['flow list', 'verification:\n  layers: [uat]\n'],
    ['@-prefixed entry', 'verification:\n  layers:\n    - "@uat"\n'],
    ['flow list, @-prefixed', 'verification: { layers: ["@uat"] }\n'],
    ['beside other keys', 'schema: feat\nverification:\n  layers: [uat]\ncontext: hello\n'],
  ])('%s', (_name, config) => {
    expect(layersOf(repo(config))).toEqual(['uat'])
  })

  test('config.yml is read when config.yaml is absent', () => {
    expect(layersOf(repo('verification:\n  layers: [uat]\n', 'config.yml'))).toEqual(['uat'])
  })

  test('the archive_unreadable fallback context carries the layers too', () => {
    const dir = repo('verification:\n  layers: [uat]\n')
    // A file where the archive directory should be: readdir fails with ENOTDIR.
    rmSync(join(dir, 'openspec', 'changes', 'archive'), { recursive: true })
    writeFileSync(join(dir, 'openspec', 'changes', 'archive'), 'not a directory')
    const { ctx, warning } = readValidateContext(dir)
    expect(warning?.code).toBe('archive_unreadable')
    expect(ctx.verificationLayers).toEqual(['uat'])
  })

  test.each([
    ['missing config', undefined],
    ['unparseable YAML', 'verification: [unclosed\n  layers: {\n'],
    ['empty file', ''],
    ['a scalar document', 'just a string\n'],
    ['verification is a scalar', 'verification: uat\n'],
    ['verification is a list', 'verification:\n  - uat\n'],
    ['verification has no value', 'verification:\n'],
    ['layers is a scalar', 'verification:\n  layers: uat\n'],
    ['layers is a mapping', 'verification:\n  layers:\n    uat: true\n'],
    ['layers has no value', 'verification:\n  layers:\n'],
    ['only non-string entries', 'verification:\n  layers: [1, true, [uat], {a: b}, null]\n'],
    ['only unusable strings', 'verification:\n  layers: ["", "  ", "@", "two words"]\n'],
  ])('%s yields no extra layers and does not throw', (_name, config) => {
    expect(layersOf(repo(config))).toEqual([])
  })
})

describe('parseVerificationLayers', () => {
  test('keeps usable entries, strips one leading @, trims, dedupes, drops the rest', () => {
    const { layers, problems } = parseVerificationLayers({
      verification: { layers: ['uat', '@staging', ' smoke ', 'uat', '@@odd', 7, '', 'a b', null] },
    })
    expect(layers).toEqual(['uat', 'staging', 'smoke', '@odd'])
    // `@@odd` keeps one `@`: only a single leading `@` is stripped.
    expect(problems).toEqual(['7', '""', '"a b"', 'null'])
  })

  test('a layer that shadows a core layer is kept (harmless)', () => {
    expect(parseVerificationLayers({ verification: { layers: ['unit'] } }).layers).toEqual(['unit'])
  })

  test('absent and null declarations are well-formed with nothing declared', () => {
    for (const doc of [null, undefined, {}, { verification: null }, { verification: {} }]) {
      expect(parseVerificationLayers(doc)).toEqual({ layers: [], problems: [] })
    }
    expect(parseVerificationLayers({ verification: { layers: null } })).toEqual({
      layers: [],
      problems: [],
    })
  })

  test('a malformed block names what is wrong', () => {
    expect(parseVerificationLayers({ verification: 'uat' }).problems).toEqual([
      '`verification` is not a mapping',
    ])
    expect(parseVerificationLayers({ verification: { layers: 'uat' } }).problems).toEqual([
      '`verification.layers` is not a list',
    ])
  })
})

describe('projectVerificationLayers', () => {
  test('a config.yaml wins over config.yml, as projectConfigSchema reads them', () => {
    const dir = repo('verification:\n  layers: [from-yaml]\n')
    writeFileSync(join(dir, 'openspec', 'config.yml'), 'verification:\n  layers: [from-yml]\n')
    expect(projectVerificationLayers(dir)).toEqual(['from-yaml'])
  })
})
