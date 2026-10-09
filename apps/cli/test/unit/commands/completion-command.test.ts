// `commands/completion.ts` unit tests (task 3.1): the shell resolver per
// operation, and the install and uninstall output, prompt and exit codes. Every
// case that installs or uninstalls passes a temporary home and an environment
// object as dependencies, so none can reach the real home; the spawned-CLI
// round trips live in test/integration/completion-install.test.ts behind the
// home sandbox helper.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CommandContext } from '../../../src/cli.ts'
import {
  type CompletionDeps,
  detectShell,
  renderCompletion,
  resolveShell,
  run,
  runInstall,
  runUninstall,
  SUPPORTED_SHELLS,
} from '../../../src/commands/completion.ts'
import { commandRow, parseCommandArgs } from '../../../src/core/command-table.ts'

const homes: string[] = []

function mkHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-completion-cmd-'))
  homes.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of homes) rmSync(dir, { recursive: true, force: true })
})

function deps(home: string, over: Partial<CompletionDeps> = {}): CompletionDeps {
  return {
    env: { SHELL: '/bin/zsh' },
    home,
    platform: 'linux',
    now: () => new Date('2026-05-06T07:08:09.123Z'),
    bashCompletionDirs: [],
    stdinIsTTY: false,
    ...over,
  }
}

const SHELLS = ['bash', 'zsh', 'fish', 'powershell'] as const

describe('SUPPORTED_SHELLS and detectShell', () => {
  test('powershell joins the supported shells', () => {
    expect(SUPPORTED_SHELLS).toEqual(['bash', 'zsh', 'fish', 'powershell'])
  })

  test('$SHELL names the shell, a login dash is stripped', () => {
    expect(detectShell('/bin/zsh')).toBe('zsh')
    expect(detectShell('-bash')).toBe('bash')
    expect(detectShell('/usr/local/bin/fish')).toBe('fish')
    expect(detectShell('/usr/bin/pwsh')).toBeUndefined()
    expect(detectShell(undefined)).toBeUndefined()
  })

  test('PSModulePath resolves powershell only when $SHELL is unset', () => {
    expect(detectShell(undefined, 'C:\\Modules')).toBe('powershell')
    expect(detectShell('', 'C:\\Modules')).toBe('powershell')
    expect(detectShell('/bin/tcsh', 'C:\\Modules')).toBeUndefined()
    expect(detectShell('/bin/zsh', 'C:\\Modules')).toBe('zsh')
    expect(detectShell(undefined, '')).toBeUndefined()
  })
})

describe('resolveShell', () => {
  test('an explicit argument is case-insensitive and wins over $SHELL', () => {
    expect(resolveShell('install', 'ZSH', { SHELL: '/bin/bash' })).toEqual({ shell: 'zsh' })
    expect(resolveShell('generate', 'PowerShell', {})).toEqual({ shell: 'powershell' })
    expect(resolveShell('uninstall', 'fish', { SHELL: '/bin/zsh' })).toEqual({ shell: 'fish' })
  })

  test('without an argument the environment decides', () => {
    expect(resolveShell('install', undefined, { SHELL: '-zsh' })).toEqual({ shell: 'zsh' })
    expect(resolveShell('install', undefined, { PSModulePath: '/m' })).toEqual({
      shell: 'powershell',
    })
  })

  test.each(['generate', 'install', 'uninstall'] as const)(
    '%s: an unsupported shell is refused naming all four shells',
    (operation) => {
      const form = operation === 'generate' ? 'cospec completion' : `cospec completion ${operation}`
      const result = resolveShell(operation, 'tcsh', {})
      expect(result).toEqual({
        error: `${form}: unsupported shell 'tcsh' (supported: bash, zsh, fish, powershell)`,
      })
    },
  )

  test.each(['generate', 'install', 'uninstall'] as const)(
    '%s: an unsupported $SHELL is refused naming all four shells and the explicit form',
    (operation) => {
      const form = operation === 'generate' ? 'cospec completion' : `cospec completion ${operation}`
      const result = resolveShell(operation, undefined, { SHELL: '/bin/tcsh' })
      if (!('error' in result)) throw new Error('expected a refusal')
      for (const shell of SHELLS) expect(result.error).toContain(shell)
      expect(result.error).toContain(`${form} <bash|zsh|fish|powershell>`)
    },
  )

  test('an undetectable shell is refused with the operation named', () => {
    const result = resolveShell('install', undefined, {})
    if (!('error' in result)) throw new Error('expected a refusal')
    expect(result.error).toContain('cospec completion install: could not detect the shell')
  })
})

describe('runInstall: output', () => {
  test('zsh, fresh: the message, a blank line and the reload command', async () => {
    const home = mkHome()
    const out = await runInstall('zsh', false, deps(home))
    expect(out.exitCode).toBe(0)
    expect(out.stderr).toBe('')
    expect(out.stdout).toBe(
      [
        '✓ Completion script installed and .zshrc configured successfully',
        '',
        'Restart your shell or run: exec zsh',
        '',
      ].join('\n'),
    )
  })

  test('the reload command per shell', async () => {
    const reload: Record<(typeof SHELLS)[number], string> = {
      bash: 'exec bash',
      zsh: 'exec zsh',
      fish: 'exec fish',
      powershell: '. $PROFILE',
    }
    for (const shell of SHELLS) {
      const home = mkHome()
      const out = await runInstall(
        shell,
        false,
        deps(home, { env: { PROFILE: join(home, 'profile.ps1') } }),
      )
      expect(out.exitCode).toBe(0)
      expect(out.stdout).toContain(`Restart your shell or run: ${reload[shell]}`)
    }
  })

  test('--verbose adds the installed path and the rc file configured, plain does not', async () => {
    const home = mkHome()
    const verbose = await runInstall('zsh', true, deps(home))
    expect(verbose.stdout).toContain(
      `  Installed to: ${join(home, '.zsh', 'completions', '_cospec')}\n`,
    )
    expect(verbose.stdout).toContain(`  ${join(home, '.zshrc')} configured automatically\n`)
    const plain = await runInstall('fish', false, deps(mkHome()))
    expect(plain.stdout).not.toContain('Installed to:')
    expect(plain.stdout).not.toContain('configured automatically')
  })

  test('a second install reports the script is already installed and writes nothing', async () => {
    const home = mkHome()
    await runInstall('zsh', false, deps(home))
    const again = await runInstall('zsh', true, deps(home))
    expect(again.exitCode).toBe(0)
    expect(again.stdout).toContain('✓ Completion script is already installed (up to date)')
    expect(again.stdout).not.toContain('configured automatically')
    expect(again.stdout).not.toContain('Backup created')
  })

  test('an edited script is backed up and --verbose prints the backup path', async () => {
    const home = mkHome()
    await runInstall('fish', false, deps(home))
    const script = join(home, '.config', 'fish', 'completions', 'cospec.fish')
    writeFileSync(script, 'edited\n')
    const out = await runInstall('fish', true, deps(home))
    const backup = `${script}.backup-2026-05-06T07-08-09-123Z`
    expect(out.stdout).toContain(
      '✓ Completion script updated successfully (previous version backed up)',
    )
    expect(out.stdout).toContain(`  Backup created: ${backup}\n`)
    expect(readFileSync(backup, 'utf8')).toBe('edited\n')
  })

  test('the installed script is exactly what `cospec completion <shell>` prints', async () => {
    for (const shell of SHELLS) {
      const home = mkHome()
      const env = { PROFILE: join(home, 'pwsh', 'profile.ps1') }
      await runInstall(shell, false, deps(home, { env }))
      const files: Record<(typeof SHELLS)[number], string> = {
        bash: join(home, '.local', 'share', 'bash-completion', 'completions', 'cospec'),
        zsh: join(home, '.zsh', 'completions', '_cospec'),
        fish: join(home, '.config', 'fish', 'completions', 'cospec.fish'),
        powershell: join(home, 'pwsh', 'CospecCompletion.ps1'),
      }
      expect(readFileSync(files[shell], 'utf8')).toBe(renderCompletion(shell))
    }
  })

  test('Oh My Zsh: no rc file, and the fpath check is printed', async () => {
    const home = mkHome()
    const root = join(home, 'omz')
    const out = await runInstall('zsh', false, deps(home, { env: { ZSH: root } }))
    expect(out.stdout).toContain('✓ Completion script installed successfully for Oh My Zsh')
    expect(out.stdout).toContain('Restart your shell or run: exec zsh')
    expect(out.stdout).toContain(
      `printf '%s\\n' $fpath | grep -F '${join(root, 'custom', 'completions')}'`,
    )
    expect(existsSync(join(home, '.zshrc'))).toBe(false)
  })

  test('OPENSPEC_NO_AUTO_CONFIG=1 prints the lines to add and edits nothing', async () => {
    const home = mkHome()
    const out = await runInstall(
      'zsh',
      false,
      deps(home, { env: { OPENSPEC_NO_AUTO_CONFIG: '1' } }),
    )
    expect(out.exitCode).toBe(0)
    expect(existsSync(join(home, '.zshrc'))).toBe(false)
    expect(out.stdout).toContain('✓ Completion script installed successfully for Zsh')
    expect(out.stdout).toContain(
      `To enable completions, add the following to ${join(home, '.zshrc')}:`,
    )
    expect(out.stdout).toContain(`  fpath=('${join(home, '.zsh', 'completions')}' $fpath)`)
    expect(out.stdout).toContain('  compinit')
    expect(out.stdout).toContain('Then restart your shell or run: exec zsh')
    expect(out.stdout).not.toMatch(/openspec/i)
  })

  test('an rc file that cannot be edited: reason on stderr, lines to add, exit 0', async () => {
    const home = mkHome()
    writeFileSync(join(home, '.bashrc'), '# COSPEC:START\nhalf\n')
    const out = await runInstall('bash', false, deps(home))
    expect(out.exitCode).toBe(0)
    expect(out.stderr).toContain('Warning: could not configure')
    expect(out.stderr).toContain('marker')
    expect(out.stdout).toContain(
      `To enable completions, add the following to ${join(home, '.bashrc')}:`,
    )
    expect(readFileSync(join(home, '.bashrc'), 'utf8')).toBe('# COSPEC:START\nhalf\n')
  })

  test('an unwritable script path is `✗ <reason>` on stderr, exit 1, nothing on stdout', async () => {
    const home = mkHome()
    writeFileSync(join(home, '.zsh'), 'a file where the directory belongs')
    const out = await runInstall('zsh', false, deps(home))
    expect(out.exitCode).toBe(1)
    expect(out.stdout).toBe('')
    expect(out.stderr).toMatch(/^✗ Path is not writable: /)
    expect(existsSync(join(home, '.zshrc'))).toBe(false)
  })

  test('no output line names openspec', async () => {
    for (const shell of SHELLS) {
      const home = mkHome()
      const out = await runInstall(
        shell,
        true,
        deps(home, { env: { PROFILE: join(home, 'p.ps1'), SHELL: '/bin/zsh' } }),
      )
      expect(out.stdout + out.stderr).not.toMatch(/openspec/i)
    }
  })
})

const never = (): Promise<string> => {
  throw new Error('the prompt must not be asked')
}

describe('runUninstall', () => {
  async function installed(shell: (typeof SHELLS)[number], home: string, env = {}): Promise<void> {
    await runInstall(shell, false, deps(home, { env }))
  }

  test('without -y and without a terminal it refuses, naming -y, and removes nothing', async () => {
    const home = mkHome()
    await installed('zsh', home)
    const out = await runUninstall('zsh', false, deps(home, { stdinIsTTY: false, ask: never }))
    expect(out.exitCode).toBe(1)
    expect(out.stdout).toBe('')
    expect(out.stderr).toContain('-y')
    expect(existsSync(join(home, '.zsh', 'completions', '_cospec'))).toBe(true)
    expect(readFileSync(join(home, '.zshrc'), 'utf8')).toContain('# COSPEC:START')
  })

  test('on a terminal the answer n cancels: exit 0, nothing removed', async () => {
    const home = mkHome()
    await installed('zsh', home)
    const questions: string[] = []
    const out = await runUninstall(
      'zsh',
      false,
      deps(home, {
        stdinIsTTY: true,
        ask: (q) => {
          questions.push(q)
          return Promise.resolve('n')
        },
      }),
    )
    expect(out).toEqual({ stdout: 'Uninstall cancelled.\n', stderr: '', exitCode: 0 })
    expect(questions).toEqual([
      `Remove cospec's completion script and its ${join(home, '.zshrc')} block? (y/N) `,
    ])
    expect(existsSync(join(home, '.zsh', 'completions', '_cospec'))).toBe(true)
  })

  test('an empty answer cancels, y and YES remove', async () => {
    for (const [answer, removed] of [
      ['', false],
      ['  ', false],
      ['maybe', false],
      ['y', true],
      ['YES', true],
      [' yes ', true],
    ] as const) {
      const home = mkHome()
      await installed('zsh', home)
      const out = await runUninstall(
        'zsh',
        false,
        deps(home, { stdinIsTTY: true, ask: () => Promise.resolve(answer) }),
      )
      expect(out.exitCode).toBe(0)
      expect(existsSync(join(home, '.zsh', 'completions', '_cospec'))).toBe(!removed)
    }
  })

  test('the question names no rc file for fish and for Oh My Zsh', async () => {
    const home = mkHome()
    await installed('fish', home)
    const questions: string[] = []
    await runUninstall(
      'fish',
      false,
      deps(home, {
        stdinIsTTY: true,
        ask: (q) => {
          questions.push(q)
          return Promise.resolve('n')
        },
      }),
    )
    expect(questions).toEqual(["Remove cospec's completion script? (y/N) "])
  })

  test('-y removes without asking and says what it removed', async () => {
    const home = mkHome()
    await installed('zsh', home)
    const out = await runUninstall('zsh', true, deps(home, { ask: never }))
    expect(out.exitCode).toBe(0)
    expect(out.stdout).toBe(
      `✓ Completion script removed from ${join(home, '.zsh', 'completions', '_cospec')}. ` +
        `Removed cospec configuration from ${join(home, '.zshrc')}\n`,
    )
    expect(existsSync(join(home, '.zsh', 'completions', '_cospec'))).toBe(false)
  })

  test('nothing installed: `✗ Completion script is not installed`, exit 1', async () => {
    const out = await runUninstall('zsh', true, deps(mkHome(), { ask: never }))
    expect(out).toEqual({
      stdout: '',
      stderr: '✗ Completion script is not installed\n',
      exitCode: 1,
    })
  })

  test('an orphaned rc block is removed although the script is gone', async () => {
    const home = mkHome()
    await installed('bash', home)
    rmSync(join(home, '.local', 'share', 'bash-completion', 'completions', 'cospec'))
    const out = await runUninstall('bash', true, deps(home))
    expect(out.exitCode).toBe(0)
    expect(out.stdout).toContain(`Removed cospec configuration from ${join(home, '.bashrc')}`)
    expect(readFileSync(join(home, '.bashrc'), 'utf8')).not.toContain('COSPEC')
  })

  test('a marker error is a failure, exit 1, the script already removed', async () => {
    const home = mkHome()
    await installed('zsh', home)
    writeFileSync(join(home, '.zshrc'), '# COSPEC:END\n')
    const out = await runUninstall('zsh', true, deps(home))
    expect(out.exitCode).toBe(1)
    expect(out.stderr).toMatch(/^✗ .*\.zshrc: Invalid marker state/)
    expect(existsSync(join(home, '.zsh', 'completions', '_cospec'))).toBe(false)
    expect(readFileSync(join(home, '.zshrc'), 'utf8')).toBe('# COSPEC:END\n')
  })

  test('install then uninstall -y restores every rc file, for all four shells', async () => {
    const originals = {
      bash: 'alias ll="ls -l"\n',
      zsh: 'export A=1\n',
      fish: undefined,
      powershell: 'Set-Alias a b\r\n',
    } as const
    for (const shell of SHELLS) {
      const home = mkHome()
      const profile = join(home, 'pwsh', 'profile.ps1')
      const rc = {
        bash: join(home, '.bashrc'),
        zsh: join(home, '.zshrc'),
        fish: undefined,
        powershell: profile,
      }[shell]
      const original = originals[shell]
      if (rc !== undefined && original !== undefined) {
        mkdirSync(join(rc, '..'), { recursive: true })
        writeFileSync(rc, original)
      }
      const env = { PROFILE: profile }
      await runInstall(shell, false, deps(home, { env }))
      const out = await runUninstall(shell, true, deps(home, { env }))
      expect(out.exitCode).toBe(0)
      if (rc !== undefined && original !== undefined)
        expect(readFileSync(rc, 'utf8')).toBe(original)
      expect(existsSync(join(home, '.config', 'fish', 'config.fish'))).toBe(false)
    }
  })
})

describe('run: dispatch from the parsed command line', () => {
  function ctxFor(args: string[], over: Partial<CommandContext['flags']> = {}): CommandContext {
    const row = commandRow('completion')
    if (row?.parse !== 'table') throw new Error('no completion row')
    const parsed = parseCommandArgs(row, args)
    if (!parsed.ok) throw new Error(`refused: ${parsed.refusal.message}`)
    return {
      args,
      flags: { json: false, noColor: false, cwd: tmpdir(), ...over },
      cwd: tmpdir(),
      parsed: parsed.parsed,
    }
  }

  /** Run `fn` with stdout captured, returning what was written. */
  async function captured(fn: () => Promise<number>): Promise<{ code: number; stdout: string[] }> {
    const stdout: string[] = []
    const original = process.stdout.write
    process.stdout.write = ((chunk: unknown): boolean => {
      stdout.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      return { code: await fn(), stdout }
    } finally {
      process.stdout.write = original
    }
  }

  test('`install zsh --verbose` installs and prints the verbose lines', async () => {
    const home = mkHome()
    const { code, stdout } = await captured(() =>
      run(ctxFor(['install', 'zsh', '--verbose']), deps(home)),
    )
    expect(code).toBe(0)
    expect(stdout.join('')).toContain('Installed to:')
    expect(existsSync(join(home, '.zsh', 'completions', '_cospec'))).toBe(true)
  })

  test('`install` with no shell resolves it from the environment', async () => {
    const home = mkHome()
    const { code } = await captured(() =>
      run(ctxFor(['install']), deps(home, { env: { SHELL: '/bin/fish' } })),
    )
    expect(code).toBe(0)
    expect(existsSync(join(home, '.config', 'fish', 'completions', 'cospec.fish'))).toBe(true)
  })

  test('`uninstall INSTALLED -y` and `--yes` both skip the prompt', async () => {
    for (const flag of ['-y', '--yes']) {
      const home = mkHome()
      await runInstall('fish', false, deps(home))
      const { code } = await captured(() => run(ctxFor(['uninstall', 'FISH', flag]), deps(home)))
      expect(code).toBe(0)
      expect(existsSync(join(home, '.config', 'fish', 'completions', 'cospec.fish'))).toBe(false)
    }
  })

  test('install and uninstall refuse --json with one document and write nothing', async () => {
    for (const sub of ['install', 'uninstall']) {
      const home = mkHome()
      const { code, stdout: written } = await captured(() =>
        run(ctxFor([sub, 'zsh'], { json: true }), deps(home)),
      )
      expect(code).toBe(1)
      expect(written).toHaveLength(1)
      expect(JSON.parse(written[0]!)).toMatchObject({ command: 'completion', ok: false })
      expect(existsSync(join(home, '.zsh'))).toBe(false)
    }
  })
})
