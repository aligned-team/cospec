import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { run as initRun } from '../../../src/commands/init.ts'
import { run as updateRun } from '../../../src/commands/update.ts'
import { computeContentHash } from '../../../src/core/managed-files.ts'
import { capture, cleanup, ctx, makeRepo } from './helpers.ts'

function seed(dir: string): void {
  capture(() => initRun(ctx(dir, ['--harness', 'claude', '--yes'])) as number)
}

describe('cospec update (DESIGN §2.2)', () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  test('errors when there is no openspec/ directory', () => {
    const { code, err } = capture(() => updateRun(ctx(dir, [])) as number)
    expect(code).toBe(1)
    expect(err).toContain('no openspec/ directory')
  })

  test('--check exits 0 with no drift on a freshly initialized repo', () => {
    seed(dir)
    const { code, out } = capture(() => updateRun(ctx(dir, ['--check'])) as number)
    expect(code).toBe(0)
    expect(out).toContain('no drift')
  })

  test('--check exits 1 when a managed schema drifts from canon', () => {
    seed(dir)
    const schema = join(dir, 'openspec/schemas/ci/schema.yaml')
    // Diverge the tracked file from canon → dry run reports drift.
    writeFileSync(schema, 'name: ci\n')
    const { code } = capture(() => updateRun(ctx(dir, ['--check'])) as number)
    expect(code).toBe(1)
  })

  test('plain update preserves a hand-edited managed file and writes a sidecar (exit 0)', () => {
    seed(dir)
    const schema = join(dir, 'openspec/schemas/feat/schema.yaml')
    writeFileSync(schema, `${readFileSync(schema, 'utf8')}\n# edit\n`)
    const { code, out } = capture(() => updateRun(ctx(dir, [])) as number)
    expect(code).toBe(0)
    expect(out).toContain('preserved')
    expect(existsSync(`${schema}.cospec-new`)).toBe(true)
  })

  test('update only regenerates detected harnesses', () => {
    seed(dir) // claude only
    const { out } = capture(() => updateRun(ctx(dir, ['--check'], true)) as number)
    const json = JSON.parse(out) as { harnesses: string[] }
    expect(json.harnesses).toEqual(['claude'])
  })

  // A committed manifest is attacker-controllable: cloning/pulling a poisoned
  // openspec repo must never let a routine `update` delete files outside the
  // dirs cospec owns. Regression for the path-containment guard.
  test('--force ignores poisoned manifest keys that escape the owned tree', () => {
    seed(dir)
    const manifestFile = join(dir, 'openspec/.cospec-manifest.json')
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
      files: Record<string, string>
    }

    // (a) A `..` traversal to a file outside the repo entirely.
    const escapeVictim = join(dir, '..', 'cospec-escape-victim.txt')
    writeFileSync(escapeVictim, 'do not delete me\n')
    // (b) An in-repo but unmanaged file (e.g. a lockfile) with a *matching* hash.
    const inRepoVictim = join(dir, 'package.json')
    const inRepoContent = '{"name":"victim"}\n'
    writeFileSync(inRepoVictim, inRepoContent)

    manifest.files['../cospec-escape-victim.txt'] = computeContentHash('do not delete me\n')
    manifest.files['package.json'] = computeContentHash(inRepoContent)
    writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)

    try {
      const { out } = capture(() => updateRun(ctx(dir, ['--force'], true)) as number)
      const json = JSON.parse(out) as { files: { path: string; outcome: string }[] }
      const removedPaths = json.files.filter((f) => f.outcome === 'removed').map((f) => f.path)
      expect(removedPaths).not.toContain('../cospec-escape-victim.txt')
      expect(removedPaths).not.toContain('package.json')
      expect(existsSync(escapeVictim)).toBe(true)
      expect(existsSync(inRepoVictim)).toBe(true)
    } finally {
      rmSync(escapeVictim, { force: true })
    }
  })
})
