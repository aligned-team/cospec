// `cospec __complete types` unit test (ledger row 5.3, tasks.md 3.4). `types`
// is the one dynamic-completion source with no filesystem root and no wrapped
// call at all — it lists `COSPEC_TYPES` from `core/change.ts` directly. A
// `Bun.spawn`/`Bun.spawnSync` spy proves that stays true: a future change that
// accidentally routes `types` through `resolveRoot`/`openspecList` would spawn
// the wrapped binary and fail this test, not silently slow down every Tab
// press.

import { describe, expect, spyOn, test } from 'bun:test'

import type { CommandContext } from '../../../src/cli.ts'
import { run } from '../../../src/commands/complete.ts'
import { COSPEC_TYPES } from '../../../src/core/change.ts'

function ctx(args: string[]): CommandContext {
  return { args, flags: { json: false, noColor: false, cwd: '/tmp' }, cwd: '/tmp' }
}

describe('cospec __complete types — no wrapped spawn', () => {
  test('lists all eleven COSPEC_TYPES values, spawning nothing', async () => {
    const spawnSpy = spyOn(Bun, 'spawn')
    const spawnSyncSpy = spyOn(Bun, 'spawnSync')
    try {
      const captured: string[] = []
      const write = process.stdout.write.bind(process.stdout)
      process.stdout.write = ((chunk: string) => {
        captured.push(chunk)
        return true
      }) as typeof process.stdout.write
      let code: number
      try {
        code = await run(ctx(['types']))
      } finally {
        process.stdout.write = write
      }
      expect(code).toBe(0)
      const stdout = captured.join('')
      expect(COSPEC_TYPES.length).toBe(11)
      for (const type of COSPEC_TYPES) expect(stdout).toContain(type)
      expect(spawnSpy).not.toHaveBeenCalled()
      expect(spawnSyncSpy).not.toHaveBeenCalled()
    } finally {
      spawnSpy.mockRestore()
      spawnSyncSpy.mockRestore()
    }
  })
})
