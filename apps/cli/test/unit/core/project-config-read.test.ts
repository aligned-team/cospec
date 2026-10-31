// The `rules:` resilience warnings of `core/project-config-read.ts`, held to the pinned
// binary's `readProjectConfig` (1.14.x `describeRulesShapeError`): the same lines, in order.

import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openspecPackageDir } from '../../../src/core/openspec.ts'
import { readConfigContext } from '../../../src/core/project-config-read.ts'

const upstream = (await import(join(openspecPackageDir(), 'dist/core/project-config.js'))) as {
  readProjectConfig: (projectRoot: string) => unknown
}

const temps: string[] = []
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function project(yaml: string): { root: string; config: string } {
  const root = mkdtempSync(join(tmpdir(), 'cospec-config-read-'))
  temps.push(root)
  mkdirSync(join(root, 'openspec'))
  const config = join(root, 'openspec', 'config.yaml')
  writeFileSync(config, yaml)
  return { root, config }
}

function binaryWarnings(root: string): string[] {
  const lines: string[] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => lines.push(args.map(String).join(' '))
  try {
    upstream.readProjectConfig(root)
  } finally {
    console.warn = original
  }
  return lines
}

const CASES = [
  'rules:\n  proposal:\n    - Keep it short\n    - Use: tabs\n',
  'rules:\n  tasks:\n    - 42\n    - ok\n    - [a, b]\n    - null\n',
  'rules:\n  proposal: just a string\n',
  'rules:\n  proposal:\n    - ""\n    - fine\n',
  'rules:\n  proposal:\n    - true\n',
  'rules: [a]\n',
]

describe("rules warnings answer as the binary's readProjectConfig", () => {
  for (const yaml of CASES)
    test(JSON.stringify(yaml), () => {
      const { root, config } = project(yaml)
      const ours: string[] = []
      readConfigContext(config, (line) => ours.push(line))
      expect(ours).toEqual(binaryWarnings(root))
    })
})
