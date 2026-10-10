// The docs data loader (apps/docs/.vitepress/parity.data.ts) reads the same parity YAML files
// the reachability test reads. With parity-pending.yaml empty it must still load, and report
// no pending surface, so the how-it-relates page renders without its "still being implemented"
// section instead of failing the docs build.

import { describe, expect, test } from 'bun:test'

import loader from '../../../docs/.vitepress/parity.data.ts'

describe('the docs parity loader', () => {
  test('an empty parity-pending.yaml loads, with no pending surface', async () => {
    const data = await (loader as unknown as { load: () => unknown }).load()
    expect(data).toMatchObject({ pending: [] })
  })

  test('the other three lists are still read, so an empty pending list loses nothing', async () => {
    const data = (await (loader as unknown as { load: () => unknown }).load()) as {
      exceptions: unknown[]
      deprecated: unknown[]
      aliases: unknown[]
    }
    expect(data.exceptions.length).toBeGreaterThan(0)
    expect(data.aliases.length).toBeGreaterThan(0)
  })
})
