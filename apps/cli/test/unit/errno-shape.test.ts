// `errnoShape` (test/fixtures/errno.ts) is what every errno-message row
// asserts through, so its parse is pinned here on fixed strings.

import { describe, expect, test } from 'bun:test'

import { errnoShape } from '../fixtures/errno.ts'

describe('errnoShape', () => {
  test('reads the code, the syscall and the quoted path', () => {
    expect(errnoShape("EACCES: permission denied, open '/x/it's here/store.yaml'")).toEqual({
      code: 'EACCES',
      syscall: 'open',
      hasPath: true,
      path: "/x/it's here/store.yaml",
    })
  })

  test('reads a `statx` syscall as `stat`, the name Node gives it', () => {
    const stat = "EACCES: permission denied, stat '/x/openspec/config.yaml'"
    expect(errnoShape(stat.replace(', stat ', ', statx '))).toEqual(errnoShape(stat))
  })

  test('a failure that names no path has no path', () => {
    expect(errnoShape('EISDIR: illegal operation on a directory, read')).toEqual({
      code: 'EISDIR',
      syscall: 'read',
      hasPath: false,
      path: null,
    })
  })

  test('the same errno with and without its path never compares equal', () => {
    const bare = errnoShape('EISDIR: illegal operation on a directory, read')
    const named = errnoShape("EISDIR: illegal operation on a directory, read '/x/store.yaml'")
    expect(named.hasPath).toBe(true)
    expect(named).not.toEqual(bare)
  })

  test('a quoted path the parse cannot read throws instead of reading as no path', () => {
    expect(() => errnoShape("EACCES: permission denied, open '/x, open")).toThrow(
      'quotes a path the parse did not read',
    )
  })

  test('a two-path failure keeps the first path', () => {
    expect(errnoShape("EXDEV: cross-device link not permitted, rename '/a' -> '/b'")).toEqual({
      code: 'EXDEV',
      syscall: 'rename',
      hasPath: true,
      path: '/a',
    })
  })

  test('anything but one errno message throws', () => {
    expect(() => errnoShape("cospec: EACCES: permission denied, open '/x'")).toThrow(
      'not an errno message',
    )
    expect(() => errnoShape('No OpenSpec root found')).toThrow('not an errno message')
    expect(() => errnoShape("EACCES: permission denied, open '/x'\n")).toThrow(
      'not an errno message',
    )
  })
})
