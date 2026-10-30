// `cospec __complete` runs on every Tab press (change openspec-1-15-parity,
// task 7.1, design decision 11): it must load only the modules completion
// needs and record no telemetry. The functional guarantee is checked here over
// the static import graph — what Bun loads before `run` is called — from the
// entry point and from `commands/complete.ts`. Every other command module is
// reached only through `cli.ts`'s lazy `COMMAND_MODULES` imports, so none may
// appear in either closure. The startup budget itself is advisory and measured
// by the bench harness, never here.

import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve } from 'node:path'

const APP = resolve(import.meta.dir, '../../..')

/** A module's static value imports (`import type` is erased, dynamic `import()` is lazy). */
function staticImports(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const out: string[] = []
  for (const match of text.matchAll(/^import\s+(type\s+)?([\s\S]*?)\s+from\s+'([^']+)'/gm))
    if (match[1] === undefined) out.push(match[3]!)
  for (const match of text.matchAll(/^import\s+'([^']+)'/gm)) out.push(match[1]!)
  return out
}

/** Every app module and package the static graph from `entry` loads. */
function closure(entry: string): { modules: string[]; packages: string[] } {
  const seen = new Set<string>()
  const packages = new Set<string>()
  const stack = [join(APP, entry)]
  while (stack.length > 0) {
    const file = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    if (!file.endsWith('.ts')) continue
    for (const spec of staticImports(file)) {
      if (!spec.startsWith('.')) {
        packages.add(spec)
        continue
      }
      const target = normalize(join(dirname(file), spec))
      if (!existsSync(target)) throw new Error(`${relative(APP, file)}: unresolved import ${spec}`)
      stack.push(target)
    }
  }
  return {
    modules: [...seen].map((file) => relative(APP, file).split('\\').join('/')).toSorted(),
    packages: [...packages].toSorted(),
  }
}

const ALLOWED_PACKAGES = new Set(['yaml', 'tinyglobby', 'picomatch', 'brace-expansion'])

function heavy(modules: readonly string[], own: string): string[] {
  return modules.filter(
    (m) =>
      (m.startsWith('src/commands/') && m !== own) ||
      (m.startsWith('src/harness/') && m !== 'src/harness/adapters.ts') ||
      (m.startsWith('src/core/rules/') && m !== 'src/core/rules/type-facts.ts') ||
      /telemetry/i.test(m),
  )
}

describe('__complete loads only what completion needs', () => {
  test('the entry point loads no command module before dispatch', () => {
    const { modules } = closure('src/index.ts')
    expect(heavy(modules, '')).toEqual([])
  })

  test('complete.ts loads no other command, no renderer, no rule but type facts', () => {
    const { modules } = closure('src/commands/complete.ts')
    expect(modules).toContain('src/commands/complete.ts')
    expect(heavy(modules, 'src/commands/complete.ts')).toEqual([])
  })

  test('the packages it loads are the parsers it reads with, never a network or telemetry client', () => {
    const { packages } = closure('src/commands/complete.ts')
    const foreign = packages.filter((p) => !p.startsWith('node:') && !ALLOWED_PACKAGES.has(p))
    expect(foreign).toEqual([])
    expect(packages.filter((p) => ['node:http', 'node:https', 'node:net'].includes(p))).toEqual([])
  })

  test('the dispatcher reaches __complete through a lazy import', () => {
    const cli = readFileSync(join(APP, 'src/cli.ts'), 'utf8')
    expect(cli).toContain("__complete: () => import('./commands/complete.ts'),")
  })
})
