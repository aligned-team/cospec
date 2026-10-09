// `core/completion-tip.ts` unit tests (task 4.1, ledger row 9.2). Every case
// passes its environment, home and stderr explicitly, so nothing reads process
// state and no case can reach the real home or the real machine-global config.

import { afterAll, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  type CompletionTipInput,
  ciSuppresses,
  globalConfigDir,
  offerCompletionTip,
} from '../../../src/core/completion-tip.ts'
import { resolveTarget } from '../../../src/core/completions/install.ts'

const TIP = "\nTip: Run 'cospec completion install' for shell completions\n"
const dirs: string[] = []

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

/** A fresh home with a terminal stderr, a zsh shell and an empty config dir. */
function sandbox(
  env: Record<string, string | undefined> = {},
  over: Partial<CompletionTipInput> = {},
) {
  const home = mkdtempSync(join(tmpdir(), 'cospec-tip-'))
  dirs.push(home)
  const configDir = join(home, '.config', 'openspec')
  const configPath = join(configDir, 'config.json')
  const stderr: string[] = []
  const input: CompletionTipInput = {
    command: 'list',
    hidden: false,
    json: false,
    env: { HOME: home, XDG_CONFIG_HOME: join(home, '.config'), SHELL: '/bin/zsh', ...env },
    home,
    platform: 'darwin',
    stderrIsTTY: true,
    stderr: (text) => {
      stderr.push(text)
    },
    detectShell: async () => 'zsh',
    ...over,
  }
  return { home, configDir, configPath, stderr, input }
}

function writeConfig(configPath: string, text: string): void {
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, text)
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

describe('globalConfigDir follows the binary getGlobalConfigDir', () => {
  test('XDG_CONFIG_HOME wins on every platform', () => {
    expect(globalConfigDir({ XDG_CONFIG_HOME: '/xdg', APPDATA: 'C:/app' }, '/h', 'win32')).toBe(
      join('/xdg', 'openspec'),
    )
    expect(globalConfigDir({ XDG_CONFIG_HOME: '/xdg' }, '/h', 'darwin')).toBe(
      join('/xdg', 'openspec'),
    )
  })

  test('an empty XDG_CONFIG_HOME is unset', () => {
    expect(globalConfigDir({ XDG_CONFIG_HOME: '' }, '/h', 'linux')).toBe(
      join('/h', '.config', 'openspec'),
    )
  })

  test('win32 reads APPDATA, then AppData/Roaming under the home', () => {
    expect(globalConfigDir({ APPDATA: 'C:/app' }, '/h', 'win32')).toBe(join('C:/app', 'openspec'))
    expect(globalConfigDir({}, '/h', 'win32')).toBe(join('/h', 'AppData', 'Roaming', 'openspec'))
  })

  test('other platforms default to ~/.config', () => {
    expect(globalConfigDir({ APPDATA: 'C:/app' }, '/h', 'darwin')).toBe(
      join('/h', '.config', 'openspec'),
    )
  })
})

describe('CI suppresses the tip unless the value is a falsy word', () => {
  test.each(['true', '1', 'yes', 'on', 'True', ' TRUE ', 'anything'])(
    'CI=%p suppresses',
    (value) => {
      expect(ciSuppresses({ CI: value })).toBe(true)
    },
  )

  test.each(['', ' ', 'false', 'FALSE', '0', 'no', 'Off'])('CI=%p does not suppress', (value) => {
    expect(ciSuppresses({ CI: value })).toBe(false)
  })

  test('an unset CI does not suppress', () => {
    expect(ciSuppresses({})).toBe(false)
  })
})

describe('suppression is decided before the config is read', () => {
  test.each(['true', '1', 'yes', 'on', 'True'])(
    'CI=%p: no output, the unreadable config is not touched',
    async (value) => {
      const s = sandbox({ CI: value })
      writeConfig(s.configPath, '{not json')
      expect(await offerCompletionTip(s.input)).toBe('suppressed')
      expect(s.stderr).toEqual([])
      expect(readFileSync(s.configPath, 'utf8')).toBe('{not json')
    },
  )

  test('OPENSPEC_NO_COMPLETIONS=1 suppresses', async () => {
    const s = sandbox({ OPENSPEC_NO_COMPLETIONS: '1' })
    expect(await offerCompletionTip(s.input)).toBe('suppressed')
    expect(s.stderr).toEqual([])
    expect(existsSync(s.configPath)).toBe(false)
  })

  test.each(['0', 'true', 'yes', ' 1'])(
    'OPENSPEC_NO_COMPLETIONS=%p is not the exact 1 and does not suppress',
    async (value) => {
      const s = sandbox({ OPENSPEC_NO_COMPLETIONS: value })
      expect(await offerCompletionTip(s.input)).toBe('shown')
    },
  )

  test.each(['', 'false', '0', 'no', 'off'])('CI=%p leaves the tip on', async (value) => {
    const s = sandbox({ CI: value })
    expect(await offerCompletionTip(s.input)).toBe('shown')
  })
})

describe('deferred runs read the config and never write it', () => {
  const cases: [string, Partial<CompletionTipInput>][] = [
    ['--json', { json: true }],
    ['completion', { command: 'completion' }],
    ['__complete', { command: '__complete', hidden: true }],
    ['help', { command: 'help' }],
    ['a hidden row', { command: 'check-commit', hidden: true }],
    ['a non-terminal stderr', { stderrIsTTY: false }],
  ]

  test.each(cases)('%s: deferred, no output, no config created', async (_label, over) => {
    const s = sandbox({}, over)
    expect(await offerCompletionTip(s.input)).toBe('deferred')
    expect(s.stderr).toEqual([])
    expect(existsSync(s.configPath)).toBe(false)
  })

  test('a deferred run leaves an existing config byte-identical', async () => {
    const s = sandbox({}, { json: true })
    const text = '{\n  "telemetry": {\n    "anonymousId": "x"\n  }\n}\n'
    writeConfig(s.configPath, text)
    expect(await offerCompletionTip(s.input)).toBe('deferred')
    expect(readFileSync(s.configPath, 'utf8')).toBe(text)
  })

  test('a deferred run does not consume the tip', async () => {
    const s = sandbox({}, { json: true })
    expect(await offerCompletionTip(s.input)).toBe('deferred')
    expect(await offerCompletionTip({ ...s.input, json: false })).toBe('shown')
    expect(s.stderr).toEqual([TIP])
  })

  test('the shell is not detected for a deferred run', async () => {
    const s = sandbox(
      {},
      {
        json: true,
        detectShell: async () => {
          throw new Error('detect must not run for a deferred run')
        },
      },
    )
    expect(await offerCompletionTip(s.input)).toBe('deferred')
  })
})

describe('the tip shows once on a terminal', () => {
  test('the first run prints the tip and records the flag', async () => {
    const s = sandbox()
    expect(await offerCompletionTip(s.input)).toBe('shown')
    expect(s.stderr).toEqual([TIP])
    expect(readJson(s.configPath)).toEqual({ completionTipSeen: true })
  })

  test('the second run prints nothing', async () => {
    const s = sandbox()
    await offerCompletionTip(s.input)
    expect(await offerCompletionTip(s.input)).toBe('seen')
    expect(s.stderr).toEqual([TIP])
  })

  test('the flag is recorded before the message prints', async () => {
    const s = sandbox()
    let seenAtPrint: unknown
    const input: CompletionTipInput = {
      ...s.input,
      stderr: (text) => {
        seenAtPrint = readJson(s.configPath)
        s.stderr.push(text)
      },
    }
    expect(await offerCompletionTip(input)).toBe('shown')
    expect(seenAtPrint).toEqual({ completionTipSeen: true })
  })
})

describe('the config is read raw and written atomically', () => {
  test('a missing config is created with the flag alone, no defaults stamped', async () => {
    const s = sandbox()
    await offerCompletionTip(s.input)
    expect(readFileSync(s.configPath, 'utf8')).toBe('{\n  "completionTipSeen": true\n}\n')
  })

  test('the other keys of an existing config are kept', async () => {
    const s = sandbox()
    writeConfig(s.configPath, '{"telemetry":{"anonymousId":"x"}}')
    await offerCompletionTip(s.input)
    expect(readFileSync(s.configPath, 'utf8')).toBe(
      `${JSON.stringify({ telemetry: { anonymousId: 'x' }, completionTipSeen: true }, null, 2)}\n`,
    )
  })

  test('the file is owner-only and no temporary file is left behind', async () => {
    const s = sandbox()
    await offerCompletionTip(s.input)
    expect(statSync(s.configPath).mode & 0o777).toBe(0o600)
    expect(readdirSync(s.configDir)).toEqual(['config.json'])
  })

  test.each([
    ['an array root', '[1, 2]'],
    ['a scalar root', '"text"'],
    ['invalid JSON', '{"telemetry": '],
  ])('%s is left byte-identical and no tip prints', async (_label, text) => {
    const s = sandbox()
    writeConfig(s.configPath, text)
    expect(await offerCompletionTip(s.input)).toBe('unreadable')
    expect(s.stderr).toEqual([])
    expect(readFileSync(s.configPath, 'utf8')).toBe(text)
  })

  test('a failed write leaves the tip unprinted', async () => {
    // A regular file where the config directory belongs: the read sees no
    // config, and the write fails with ENOTDIR before anything is printed.
    const s = sandbox()
    const blocker = join(s.home, 'blocker')
    writeFileSync(blocker, '')
    const input: CompletionTipInput = {
      ...s.input,
      env: { ...s.input.env, XDG_CONFIG_HOME: blocker },
    }
    expect(await offerCompletionTip(input)).toBe('unrecorded')
    expect(s.stderr).toEqual([])
  })
})

describe('a config that cannot be read is left alone', () => {
  // A directory where the file belongs fails the read with EISDIR for every user,
  // root included, so the case holds wherever the suite runs.
  test.each([false, true])('json=%p: unreadable, no output, nothing written', async (json) => {
    const s = sandbox({}, { json })
    mkdirSync(s.configPath, { recursive: true })
    expect(await offerCompletionTip(s.input)).toBe('unreadable')
    expect(s.stderr).toEqual([])
    expect(statSync(s.configPath).isDirectory()).toBe(true)
  })
})

describe('the tip retires silently', () => {
  test('an undetected shell records the flag and prints nothing', async () => {
    const s = sandbox({}, { detectShell: async () => undefined })
    expect(await offerCompletionTip(s.input)).toBe('retired')
    expect(s.stderr).toEqual([])
    expect(readJson(s.configPath)).toEqual({ completionTipSeen: true })
  })

  test('an installed script records the flag and prints nothing', async () => {
    const s = sandbox()
    const target = resolveTarget('zsh', { env: s.input.env, home: s.home, platform: 'darwin' })
    mkdirSync(dirname(target.scriptPath), { recursive: true })
    writeFileSync(target.scriptPath, '#compdef cospec\n')
    expect(await offerCompletionTip(s.input)).toBe('retired')
    expect(s.stderr).toEqual([])
    expect(readJson(s.configPath)).toEqual({ completionTipSeen: true })
  })

  test.each(['bash', 'fish', 'powershell'] as const)(
    'a supported, uninstalled %s shows the tip',
    async (shell) => {
      const s = sandbox({}, { detectShell: async () => shell })
      expect(await offerCompletionTip(s.input)).toBe('shown')
      expect(s.stderr).toEqual([TIP])
    },
  )
})
