// The spawn guard (test/fixtures/test-scope.ts) reads which command module a CLI argv loads from
// the argv alone. These rows hold it to the real dispatcher: `run` with every registry loader
// replaced by a recorder must never load a module `dispatchedCommand` did not name.

import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { resolve } from 'node:path'

import { COMMAND_MODULES, run } from '../../src/cli.ts'
import { commandModules, dispatchedCommand } from '../fixtures/test-scope.ts'

describe('the command registry the guard reads', () => {
  test('names every command src/cli.ts registers, each with its own literal import', () => {
    const modules = commandModules()
    expect([...modules.keys()].toSorted()).toEqual(Object.keys(COMMAND_MODULES).toSorted())
    for (const [name, module] of modules) {
      const loader = COMMAND_MODULES[name]!.toString()
      expect(
        resolve(import.meta.dir, '../../src', loader.match(/\.\/commands\/[\w-]+\.ts/)![0]),
      ).toBe(module)
    }
  })
})

describe('dispatchedCommand', () => {
  test.each([
    [['validate', '--strict'], 'validate'],
    [['--no-color', '--json', 'list'], 'list'],
    [['--cwd', 'x', 'status'], 'status'],
    [['--cwd=x', 'status'], 'status'],
    [['--store', '--help', 'show'], 'show'],
    [['--', 'list'], 'list'],
    [['list', '--', '--version'], 'list'],
    [['--version'], undefined],
    [['-V'], undefined],
    [['list', '--version'], undefined],
    [['--help', 'list'], undefined],
    [['--bogus', 'list'], undefined],
    [['--cwd'], undefined],
    [[], undefined],
  ] as const)('%j dispatches %s', (args, command) => {
    expect(dispatchedCommand(args)).toBe(command)
  })

  const loaded: string[] = []
  let loads = 0
  const originals = { ...COMMAND_MODULES }
  afterEach(() => {
    Object.assign(COMMAND_MODULES, originals)
    loaded.length = 0
  })

  test.each([
    ['validate', '--strict'],
    ['--no-color', '--json', 'list'],
    ['--cwd', '.', 'status', '--json'],
    ['--cwd=.', 'show', 'x'],
    ['--store', 'nope', 'list'],
    ['--', 'list'],
    ['list', '--', '--version'],
    ['--version'],
    ['--help', 'list'],
    ['list', '--help'],
    ['--bogus', 'list'],
    ['list', '--bogus'],
    ['--cwd'],
    ['--cwd=', 'list'],
    ['nope'],
    [],
    ['config', 'get', 'x'],
    ['store', 'list'],
    ['__complete', 'li'],
    ['help', 'list'],
  ])('%j loads no module the guard misses', async (...args) => {
    for (const name of Object.keys(COMMAND_MODULES)) {
      COMMAND_MODULES[name] = async () => {
        loaded.push(name)
        return {}
      }
    }
    const out = spyOn(process.stdout, 'write').mockImplementation(() => true)
    const err = spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      await run(args)
    } finally {
      out.mockRestore()
      err.mockRestore()
    }
    loads += loaded.length
    for (const name of loaded) expect(dispatchedCommand(args)).toBe(name)
  })

  test('the rows above reach a loader, so they compare something', () => {
    expect(loads).toBeGreaterThanOrEqual(8)
  })
})
