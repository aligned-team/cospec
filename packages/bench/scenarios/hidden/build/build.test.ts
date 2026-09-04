// Held-out hidden test suite for the `build` scenario — see
// `packages/bench/scenarios/hidden/README.md` for the copy/import convention.
// `build` is a behavior-changing type: every case below fails against the
// unmodified fixture (no `build` script in package.json, no dist/) and passes
// once a correct build step is added (`REFERENCE_FIXES.build` in
// `test/unit/hidden.test.ts` adds `pkg.scripts.build = 'bun build ./src/index.ts
// --outdir dist --target node'`).

import { expect, test } from 'bun:test'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

async function runBuild(): Promise<{ exitCode: number }> {
  const proc = Bun.spawn(['bun', 'run', 'build'], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const exitCode = await proc.exited
  return { exitCode }
}

test('package.json declares a non-empty build script', async () => {
  const pkg = JSON.parse(await Bun.file(join(ROOT, 'package.json')).text()) as {
    scripts?: Record<string, string>
  }
  expect(typeof pkg.scripts?.build).toBe('string')
  expect(pkg.scripts?.build?.length).toBeGreaterThan(0)
})

test('bun run build exits 0', async () => {
  const { exitCode } = await runBuild()
  expect(exitCode).toBe(0)
})

test('bun run build produces dist/index.js', async () => {
  await runBuild()
  expect(await Bun.file(join(ROOT, 'dist/index.js')).exists()).toBe(true)
})

test('the built bundle exports a working formatGreeting', async () => {
  await runBuild()
  const mod = (await import(join(ROOT, 'dist/index.js'))) as {
    formatGreeting?: (name: string) => string
  }
  expect(mod.formatGreeting?.('world')).toBe('Hello, world!')
})
