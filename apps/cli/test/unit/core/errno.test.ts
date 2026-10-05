// An errno failure a command lets escape (verification 16.10).

import { afterAll, afterEach, describe, expect, spyOn, test } from 'bun:test'

import { answeringErrno, errnoMessage } from '../../../src/core/errno.ts'

const eacces = (): Error =>
  Object.assign(new Error("EACCES: permission denied, scandir '/r/openspec/changes'"), {
    code: 'EACCES',
    syscall: 'scandir',
    path: '/r/openspec/changes',
  })

let written = ''
const spy = spyOn(process.stdout, 'write').mockImplementation((chunk) => {
  written += String(chunk)
  return true
})
afterEach(() => {
  written = ''
})
afterAll(() => {
  spy.mockRestore()
})

describe('answeringErrno', () => {
  test("under --json an errno failure is the binary's one document, exit 1", async () => {
    const code = await answeringErrno(
      true,
      { code: 'change_error', payload: { changes: [], root: null } },
      () => Promise.reject(eacces()),
    )
    expect(code).toBe(1)
    expect(JSON.parse(written)).toEqual({
      changes: [],
      root: null,
      status: [
        {
          severity: 'error',
          code: 'change_error',
          message: "EACCES: permission denied, scandir '/r/openspec/changes'",
        },
      ],
    })
  })

  test('in text mode, and for any other error, the failure propagates untouched', async () => {
    const errno = eacces()
    await expect(
      answeringErrno(false, { code: 'validate_error' }, () => Promise.reject(errno)),
    ).rejects.toBe(errno)
    const other = Object.assign(new Error('no syscall'), { code: 'EACCES' })
    await expect(
      answeringErrno(true, { code: 'validate_error' }, () => Promise.reject(other)),
    ).rejects.toBe(other)
    expect(written).toBe('')
  })

  test('a command that answers keeps its own exit code', async () => {
    expect(await answeringErrno(true, { code: 'validate_error' }, () => Promise.resolve(3))).toBe(3)
  })
})

describe('errnoMessage', () => {
  test('names an errno failure and nothing else', () => {
    expect(errnoMessage(eacces())).toBe("EACCES: permission denied, scandir '/r/openspec/changes'")
    expect(errnoMessage(new Error('plain'))).toBeUndefined()
    expect(errnoMessage({ code: 'EACCES', syscall: 'open' })).toBeUndefined()
    expect(errnoMessage(undefined)).toBeUndefined()
  })
})
