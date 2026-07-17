// Held-out hidden test suite for the `chore` scenario — see
// `packages/bench/scenarios/hidden/README.md` for the copy/import convention.
// Discriminating: the unmodified fixture's package.json has no `engines`
// field and `.gitignore` has no `dist` entry, so both structural checks fail
// until the task is done. The preserved-fields check is a regression guard
// (already true before the task; must stay true after — "purely maintenance").

import { expect, test } from 'bun:test'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

interface PackageJsonShape {
  name?: string
  version?: string
  private?: boolean
  type?: string
  engines?: { bun?: string }
}

/**
 * Minimal `>=X.Y.Z` range check against a single dotted version — enough to
 * confirm the declared range actually PERMITS 1.3.0+ rather than just
 * containing the substring "1.3" (e.g. a typo'd "<1.3.0" would still match a
 * naive substring test). Self-contained on purpose — no semver dependency.
 */
function satisfiesAtLeast(range: string, version: string): boolean {
  const m = /^>=\s*(\d+)\.(\d+)\.(\d+)/.exec(range.trim())
  if (m === null) return false
  const [, maj, min, patch] = m
  const floor = [Number(maj), Number(min), Number(patch)]
  const parts = version.split('.').map(Number)
  for (let i = 0; i < 3; i += 1) {
    const p = parts[i] ?? 0
    const f = floor[i] ?? 0
    if (p > f) return true
    if (p < f) return false
  }
  return true
}

test('package.json declares an engines.bun range that permits 1.3.0 and rejects 1.2.9', async () => {
  const pkgText = await Bun.file(join(ROOT, 'package.json')).text()
  const pkg = JSON.parse(pkgText) as PackageJsonShape
  const range = pkg.engines?.bun ?? ''
  expect(satisfiesAtLeast(range, '1.3.0')).toBe(true)
  expect(satisfiesAtLeast(range, '1.4.0')).toBe(true)
  expect(satisfiesAtLeast(range, '1.2.9')).toBe(false)
})

test('.gitignore ignores the dist/ build-output directory', async () => {
  const gitignore = await Bun.file(join(ROOT, '.gitignore')).text()
  expect(/^dist\/?\s*$/m.test(gitignore)).toBe(true)
})

test('.gitignore still ignores node_modules/ and *.log (pre-existing entries preserved)', async () => {
  const gitignore = await Bun.file(join(ROOT, '.gitignore')).text()
  expect(/^node_modules\/?\s*$/m.test(gitignore)).toBe(true)
  expect(/^\*\.log\s*$/m.test(gitignore)).toBe(true)
})

test('package.json name/version/private/type are unchanged (no incidental behavior change)', async () => {
  const pkgText = await Bun.file(join(ROOT, 'package.json')).text()
  const pkg = JSON.parse(pkgText) as PackageJsonShape
  expect(pkg.name).toBe('chore-sample')
  expect(pkg.version).toBe('1.0.0')
  expect(pkg.private).toBe(true)
  expect(pkg.type).toBe('module')
})
