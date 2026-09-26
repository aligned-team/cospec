import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'

import { storePathRefusal } from '../../../src/core/command-table.ts'
import {
  forwardCall,
  isParseRejection,
  relayStorePathRefusal,
} from '../../../src/core/forward-relay.ts'
import { OpenspecCallError, type OpenspecResult } from '../../../src/core/openspec.ts'

const UPSTREAM_REDIRECT =
  '✖ Error: --store-path is not supported. Register the path with openspec store register <path>, then select it with --store <id>.\n' +
  'Fix: openspec store register <path>, then rerun with --store <id>.\n'

function result(partial: Partial<OpenspecResult>): OpenspecResult {
  return { stdout: '', stderr: '', exitCode: 1, ...partial }
}

describe('isParseRejection', () => {
  test("commander's rejections and the redirect, with nothing on stdout", () => {
    expect(isParseRejection(result({ stderr: "error: unknown option '--bogus'\n" }))).toBe(true)
    expect(
      isParseRejection(
        result({ stderr: "error: option '--store-path <path>' argument missing\n" }),
      ),
    ).toBe(true)
    expect(isParseRejection(result({ stderr: "error: too many arguments for 'show'.\n" }))).toBe(
      true,
    )
    expect(isParseRejection(result({ stderr: UPSTREAM_REDIRECT }))).toBe(true)
  })

  test('anything the command itself printed is not one', () => {
    expect(isParseRejection(result({ stderr: "Unknown item 'c1'.\n" }))).toBe(false)
    expect(isParseRejection(result({ stdout: '{}', stderr: "error: unknown option '--x'" }))).toBe(
      false,
    )
  })
})

describe('forwardCall', () => {
  test('returns a parse rejection the call threw as an ordinary result', async () => {
    const rejected = result({ stderr: "error: unknown option '--store-path'\n" })
    const got = await forwardCall(() => Promise.reject(new OpenspecCallError('x', rejected)))
    expect(got).toBe(rejected)
  })

  test('still throws every other wrapped-call violation', async () => {
    const bad = new OpenspecCallError('exited 2', result({ exitCode: 2, stderr: 'boom\n' }))
    await expect(forwardCall(() => Promise.reject(bad))).rejects.toBe(bad)
  })
})

describe('relayStorePathRefusal', () => {
  let written: { stream: string; text: string }[] = []
  let restore: (() => void)[] = []
  beforeEach(() => {
    written = []
    restore = (['stdout', 'stderr'] as const).map((stream) => {
      const spy = spyOn(process[stream], 'write').mockImplementation((chunk) => {
        written.push({ stream, text: String(chunk) })
        return true
      })
      return () => spy.mockRestore()
    })
  })
  afterEach(() => {
    for (const undo of restore) undo()
  })

  test("answers every dialect of the binary's refusal with cospec's redirect", () => {
    const envelope = JSON.stringify({
      schemas: [],
      root: null,
      status: [{ severity: 'error', code: 'store_path_not_supported', message: 'openspec' }],
    })
    for (const [run, json] of [
      [result({ stderr: UPSTREAM_REDIRECT }), false],
      [result({ stderr: "error: unknown option '--store-path'\n" }), false],
      [result({ stderr: "error: option '--store-path <path>' argument missing\n" }), false],
      [result({ stdout: envelope }), true],
      [result({ stderr: "error: unknown option '--store-path'\n" }), true],
    ] as const) {
      written = []
      expect(relayStorePathRefusal(run, json)).toBe(1)
      const refusal = storePathRefusal(json)
      expect(written).toEqual([{ stream: refusal.stream, text: refusal.text }])
    }
  })

  test('never reclassifies a run that exited 0, or any other failure', () => {
    expect(relayStorePathRefusal(result({ exitCode: 0, stdout: 'created\n' }), false)).toBe(
      undefined,
    )
    expect(relayStorePathRefusal(result({ stderr: "Unknown item 'c1'.\n" }), false)).toBe(undefined)
    expect(written).toEqual([])
  })
})
