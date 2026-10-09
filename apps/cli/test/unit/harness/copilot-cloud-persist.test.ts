import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  persistCopilotCloudOptIn,
  readCopilotCloudOptIn,
  resolveConfigFilePath,
} from '../../../src/harness/copilot-cloud.ts'

let cwd: string
let warnings: string[]
const warn = (line: string): void => {
  warnings.push(line)
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'cospec-copilot-persist-'))
  mkdirSync(join(cwd, 'openspec'))
  warnings = []
})
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

const configPath = (name = 'config.yaml'): string => join(cwd, 'openspec', name)
const write = (text: string, name = 'config.yaml'): void => writeFileSync(configPath(name), text)
const read = (name = 'config.yaml'): string => readFileSync(configPath(name), 'utf8')

describe('persistCopilotCloudOptIn', () => {
  test('writes nothing when no config file exists', () => {
    expect(persistCopilotCloudOptIn(cwd, true, warn)).toBe(false)
    expect(warnings).toEqual([])
  })

  test('keeps a header, a trailing comment, key order and a context block', () => {
    const before = `# project header\nschema: spec-driven\n\ncontext: |\n  Line one\n  Line two\n\n# trailing comment\n`
    write(before)
    expect(persistCopilotCloudOptIn(cwd, true, warn)).toBe(true)
    const after = read()
    expect(after.startsWith('# project header\nschema: spec-driven\n')).toBe(true)
    expect(after).toContain('context: |\n  Line one\n  Line two\n')
    expect(after).toContain('# trailing comment')
    expect(after).toContain('githubCopilot:\n  cloudAgent: true')
    expect(after.indexOf('schema:')).toBeLessThan(after.indexOf('context:'))
    expect(after.indexOf('context:')).toBeLessThan(after.indexOf('githubCopilot:'))
    expect(warnings).toEqual([])
  })

  test('updates an existing value in place', () => {
    write('githubCopilot:\n  cloudAgent: true # chosen\n  other: 1\n')
    persistCopilotCloudOptIn(cwd, false, warn)
    expect(read()).toBe('githubCopilot:\n  cloudAgent: false # chosen\n  other: 1\n')
  })

  test('replaces a scalar githubCopilot with a map', () => {
    write('schema: spec-driven\ngithubCopilot: false\n')
    persistCopilotCloudOptIn(cwd, true, warn)
    expect(read()).toBe('schema: spec-driven\ngithubCopilot:\n  cloudAgent: true\n')
  })

  test('starts a fresh document when the root is not a map', () => {
    write('- a\n- b\n')
    persistCopilotCloudOptIn(cwd, true, warn)
    expect(read()).toBe('githubCopilot:\n  cloudAgent: true\n')
  })

  test('fills a comment-only file and keeps its comments', () => {
    write('# only a comment\n')
    persistCopilotCloudOptIn(cwd, false, warn)
    expect(read()).toContain('# only a comment')
    expect(read()).toContain('cloudAgent: false')
  })

  test('uses config.yml when config.yaml is absent, config.yaml first when both exist', () => {
    write('schema: a\n', 'config.yml')
    expect(resolveConfigFilePath(cwd)).toBe(configPath('config.yml'))
    write('schema: b\n')
    expect(resolveConfigFilePath(cwd)).toBe(configPath())
    persistCopilotCloudOptIn(cwd, true, warn)
    expect(read('config.yml')).toBe('schema: a\n')
    expect(read()).toContain('cloudAgent: true')
  })

  test('a config that does not parse is left byte-identical with a stderr warning', () => {
    const broken = 'schema: [unclosed\n\tcontext: x\n'
    write(broken)
    expect(persistCopilotCloudOptIn(cwd, true, warn)).toBe(false)
    expect(read()).toBe(broken)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(configPath())
    expect(warnings[0]).toMatch(/could not parse/)
  })

  test('the default warning goes to stderr, not stdout', () => {
    write('a: [\n')
    const err: string[] = []
    const out: string[] = []
    const origErr = process.stderr.write
    const origOut = process.stdout.write
    process.stderr.write = ((chunk: string) => (err.push(String(chunk)), true)) as never
    process.stdout.write = ((chunk: string) => (out.push(String(chunk)), true)) as never
    try {
      persistCopilotCloudOptIn(cwd, true)
    } finally {
      process.stderr.write = origErr
      process.stdout.write = origOut
    }
    expect(err.join('')).toContain(configPath())
    expect(out).toEqual([])
  })

  test.skipIf(process.getuid?.() === 0)('EACCES warns with the code and path', () => {
    write('schema: a\n')
    chmodSync(configPath(), 0o444)
    expect(persistCopilotCloudOptIn(cwd, true, warn)).toBe(false)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('EACCES')
    expect(warnings[0]).toContain(configPath())
    expect(read()).toBe('schema: a\n')
  })

  test('an unexpected error propagates', () => {
    mkdirSync(configPath())
    expect(() => persistCopilotCloudOptIn(cwd, true, warn)).toThrow()
  })
})

describe('readCopilotCloudOptIn', () => {
  test('reads true and false', () => {
    write('githubCopilot:\n  cloudAgent: true\n')
    expect(readCopilotCloudOptIn(cwd, warn)).toBe(true)
    write('githubCopilot:\n  cloudAgent: false\n')
    expect(readCopilotCloudOptIn(cwd, warn)).toBe(false)
    expect(warnings).toEqual([])
  })

  test('no config, no section and no key are undecided without a warning', () => {
    expect(readCopilotCloudOptIn(cwd, warn)).toBeUndefined()
    write('schema: spec-driven\n')
    expect(readCopilotCloudOptIn(cwd, warn)).toBeUndefined()
    write('githubCopilot: {}\n')
    expect(readCopilotCloudOptIn(cwd, warn)).toBeUndefined()
    expect(warnings).toEqual([])
  })

  test('a malformed cloudAgent reads as undecided with the binary warning', () => {
    write('githubCopilot:\n  cloudAgent: "yes"\n')
    expect(readCopilotCloudOptIn(cwd, warn)).toBeUndefined()
    expect(warnings).toEqual([
      `Invalid 'githubCopilot.cloudAgent' field in config (must be a boolean)`,
    ])
  })

  test('a non-object githubCopilot reads as undecided with the binary warning', () => {
    for (const bad of ['false', '[a]', 'null', 'text']) {
      warnings = []
      write(`githubCopilot: ${bad}\n`)
      expect(readCopilotCloudOptIn(cwd, warn)).toBeUndefined()
      expect(warnings).toEqual([`Invalid 'githubCopilot' field in config (must be an object)`])
    }
  })

  test('a config that does not parse reads as undecided with a warning', () => {
    write('a: [\n')
    expect(readCopilotCloudOptIn(cwd, warn)).toBeUndefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/could not parse/)
  })
})
