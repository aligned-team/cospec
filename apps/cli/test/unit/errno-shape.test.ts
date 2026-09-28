// `errnoShape` (test/fixtures/errno.ts) is what every errno-message row
// asserts through, so its parse is pinned here on fixed strings.

import { describe, expect, test } from 'bun:test'

import { errnoShape } from '../fixtures/errno.ts'

describe('errnoShape', () => {
  test('reads the code, the syscall and the quoted path', () => {
    expect(errnoShape("EACCES: permission denied, open '/x/it's here/store.yaml'")).toEqual({
      code: 'EACCES',
      syscall: 'open',
      path: "/x/it's here/store.yaml",
    })
  })

  test('reads a `statx` syscall as `stat`, the name Node gives it', () => {
    const stat = "EACCES: permission denied, stat '/x/openspec/config.yaml'"
    expect(errnoShape(stat.replace(', stat ', ', statx '))).toEqual(errnoShape(stat))
  })

  test('a failure that names no path has a null path', () => {
    expect(errnoShape('EISDIR: illegal operation on a directory, read')).toEqual({
      code: 'EISDIR',
      syscall: 'read',
      path: null,
    })
  })

  test('a two-path failure keeps the first path', () => {
    expect(errnoShape("EXDEV: cross-device link not permitted, rename '/a' -> '/b'")).toEqual({
      code: 'EXDEV',
      syscall: 'rename',
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
