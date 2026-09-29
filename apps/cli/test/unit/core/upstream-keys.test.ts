import { describe, expect, test } from 'bun:test'

import { mergeUpstream, rootOutput } from '../../../src/core/upstream-keys.ts'

describe('mergeUpstream (design D3)', () => {
  test('adds every upstream key cospec lacks and keeps every cospec key and value', () => {
    const { value, collisions } = mergeUpstream<unknown>(
      { change: 'a', type: 'feat', gate: 'clear' },
      { changeName: 'a', schemaName: 'feat', isComplete: false },
    )
    expect(value).toEqual({
      change: 'a',
      type: 'feat',
      gate: 'clear',
      changeName: 'a',
      schemaName: 'feat',
      isComplete: false,
    })
    expect(collisions).toEqual([])
  })

  test('a key both carry keeps cospec value and is listed as a collision when it differs', () => {
    const { value, collisions } = mergeUpstream<unknown>(
      { version: 1, root: { path: '/r', source: 'nearest' }, same: 'x' },
      { version: '1.0', root: { path: '/r', source: 'nearest' }, same: 'x' },
    )
    expect(value).toEqual({ version: 1, root: { path: '/r', source: 'nearest' }, same: 'x' })
    expect(collisions).toEqual(['version'])
  })

  test('nested objects merge key by key, and a nested collision names its path', () => {
    const { value, collisions } = mergeUpstream<unknown>(
      { summary: { errors: 1, totals: { items: 2 } } },
      { summary: { totals: { items: 3, passed: 1 }, byType: {} } },
    )
    expect(value).toEqual({ summary: { errors: 1, totals: { items: 2, passed: 1 }, byType: {} } })
    expect(collisions).toEqual(['summary.totals.items'])
  })

  test('arrays of objects merge by identity, whatever their order; unmatched upstream entries append', () => {
    const { value, collisions } = mergeUpstream<unknown>(
      {
        changes: [
          { change: 'b', artifacts: [{ id: 'proposal', done: true }] },
          { change: 'a', artifacts: [] },
        ],
      },
      {
        changes: [
          { changeName: 'a', schemaName: 'feat' },
          {
            changeName: 'b',
            artifacts: [
              { id: 'tasks', status: 'blocked' },
              { id: 'proposal', status: 'done' },
            ],
          },
          { changeName: 'c', status: [{ code: 'change_error' }] },
        ],
      },
      {
        'changes[]': { cospec: 'change', upstream: 'changeName' },
        'changes[].artifacts[]': { cospec: 'id', upstream: 'id' },
      },
    )
    expect(value).toEqual({
      changes: [
        {
          change: 'b',
          artifacts: [
            { id: 'proposal', done: true, status: 'done' },
            { id: 'tasks', status: 'blocked' },
          ],
          changeName: 'b',
        },
        { change: 'a', artifacts: [], changeName: 'a', schemaName: 'feat' },
        { changeName: 'c', status: [{ code: 'change_error' }] },
      ],
    })
    expect(collisions).toEqual([])
  })

  test('an array with no identity is a whole value: cospec keeps its own', () => {
    const { value, collisions } = mergeUpstream<unknown>({ list: [1, 2] }, { list: [2, 1] })
    expect(value).toEqual({ list: [1, 2] })
    expect(collisions).toEqual(['list'])
  })

  test('the inputs are left unchanged', () => {
    const cospec = { a: { b: 1 } }
    const upstream = { a: { c: 2 } }
    mergeUpstream<unknown>(cospec, upstream)
    expect(cospec).toEqual({ a: { b: 1 } })
    expect(upstream).toEqual({ a: { c: 2 } })
  })
})

describe('rootOutput', () => {
  test("is the binary's {path, source, store_id?} object", () => {
    const local = {
      base: '/r',
      cwd: '/r',
      storeArgs: [],
      store: undefined,
      source: 'nearest' as const,
    }
    expect(rootOutput(local)).toEqual({ path: '/r', source: 'nearest' })
    const store = {
      ...local,
      base: '/s',
      store: 's1',
      storeArgs: ['--store', 's1'],
      source: 'store' as const,
    }
    expect(rootOutput(store)).toEqual({ path: '/s', source: 'store', store_id: 's1' })
  })
})
