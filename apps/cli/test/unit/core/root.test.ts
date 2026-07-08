import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { configStorePointer, localRoot, resolveRoot } from '../../../src/core/root.ts'

function repoWithConfig(body: string | undefined): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-root-'))
  if (body !== undefined) {
    mkdirSync(join(dir, 'openspec'), { recursive: true })
    writeFileSync(join(dir, 'openspec', 'config.yaml'), body)
  }
  return dir
}

describe('localRoot', () => {
  test('base and cwd are the invocation cwd, with no store args', () => {
    const root = localRoot('/some/repo')
    expect(root).toEqual({ base: '/some/repo', cwd: '/some/repo', storeArgs: [], store: undefined })
  })
})

describe('configStorePointer', () => {
  test('undefined when there is no openspec/config.yaml', () => {
    const dir = repoWithConfig(undefined)
    try {
      expect(configStorePointer(dir)).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('reads a non-empty string store: pointer', () => {
    const dir = repoWithConfig('schema: feat\nstore: team-plans\n')
    try {
      expect(configStorePointer(dir)).toBe('team-plans')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('ignores an absent, empty, or non-string store: value', () => {
    for (const body of [
      'schema: feat\n',
      'store: ""\n',
      'store:\n  nested: true\n',
      'store: 42\n',
    ]) {
      const dir = repoWithConfig(body)
      try {
        expect(configStorePointer(dir)).toBeUndefined()
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  test('a references: list is not a store pointer (read-only context)', () => {
    const dir = repoWithConfig('schema: feat\nreferences:\n  - platform-reqs\n')
    try {
      expect(configStorePointer(dir)).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('resolveRoot', () => {
  test('resolves the local repo when there is no flag and no config pointer', async () => {
    const dir = repoWithConfig('schema: feat\n')
    try {
      const root = await resolveRoot({ cwd: dir, flags: {} })
      expect(root).toEqual({ base: dir, cwd: dir, storeArgs: [], store: undefined })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
