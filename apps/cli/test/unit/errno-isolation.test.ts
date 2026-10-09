// `isolatedWriteFailure` decides which errnos a generated file's write may fail with without
// ending the run (tool-matrix design decision 10); every other error must reach the caller.

import { describe, expect, test } from 'bun:test'

import { isolatedWriteFailure } from '../../src/core/errno.ts'

function errno(code: string, message: string, syscall = 'open'): Error {
  return Object.assign(new Error(`${code}: ${message}, ${syscall} '/p/x.md'`), { code, syscall })
}

describe('isolatedWriteFailure', () => {
  test.each([
    ['EACCES', 'permission denied'],
    ['EPERM', 'operation not permitted'],
    ['EROFS', 'read-only file system'],
    ['ENOTDIR', 'not a directory'],
    ['EISDIR', 'illegal operation on a directory'],
  ])('%s is isolated, message verbatim', (code, message) => {
    const error = errno(code, message)
    expect(isolatedWriteFailure(error)).toBe(error.message)
  })

  test.each(['ENOSPC', 'EMFILE', 'ENOENT', 'ELOOP', 'EBUSY'])('%s is not isolated', (code) => {
    expect(isolatedWriteFailure(errno(code, 'no good'))).toBeUndefined()
  })

  test('a plain error and a non-error are not isolated', () => {
    expect(isolatedWriteFailure(new Error('EACCES: not really'))).toBeUndefined()
    expect(isolatedWriteFailure('EACCES')).toBeUndefined()
    expect(isolatedWriteFailure(undefined)).toBeUndefined()
  })

  test("the staging file's per-run suffix is dropped so the message names the target", () => {
    const error = Object.assign(
      new Error("EACCES: permission denied, open '/p/SKILL.md.cospec-tmp-123-1791508471960'"),
      { code: 'EACCES', syscall: 'open' },
    )
    expect(isolatedWriteFailure(error)).toBe("EACCES: permission denied, open '/p/SKILL.md'")
  })
})
