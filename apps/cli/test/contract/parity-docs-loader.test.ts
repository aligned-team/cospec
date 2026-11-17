// The docs data loader (apps/docs/.vitepress/parity.data.ts) reads the same parity YAML files
// the reachability test reads. It must load with the one pending entry (`install`, owned by
// `standalone-install`) and report it, so the how-it-relates page renders its "still being
// implemented" section instead of failing the docs build.

import { describe, expect, test } from 'bun:test'

import loader from '../../../docs/.vitepress/parity.data.ts'

describe('the docs parity loader', () => {
  test('parity-pending.yaml loads, with the one pending surface', async () => {
    const data = await (loader as unknown as { load: () => unknown }).load()
    expect(data).toMatchObject({
      pending: [{ surface: 'cospec install', owner: 'standalone-install' }],
    })
  })

  test('the other three lists are still read, so a short pending list loses nothing', async () => {
    const data = (await (loader as unknown as { load: () => unknown }).load()) as {
      exceptions: unknown[]
      deprecated: unknown[]
      aliases: unknown[]
    }
    expect(data.exceptions.length).toBeGreaterThan(0)
    expect(data.aliases.length).toBeGreaterThan(0)
  })
})
