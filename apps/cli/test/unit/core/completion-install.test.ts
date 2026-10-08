// `core/completions/install.ts` unit tests (tasks 2.1, ledger rows for the
// installer). Every case takes a temporary home directory and an environment
// object explicitly; nothing here reads or writes process state, so no test can
// reach the real home.

import { afterAll, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  CompletionInstallError,
  insertBlock,
  installCompletion,
  type InstallContext,
  type InstallShell,
  isCompletionInstalled,
  removeBlock,
  resolveTarget,
  uninstallCompletion,
} from '../../../src/core/completions/install.ts'

const homes: string[] = []

function mkHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-install-home-'))
  homes.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of homes) rmSync(dir, { recursive: true, force: true })
})

const FIXED_NOW = new Date('2026-05-06T07:08:09.123Z')
const NO_BASH_COMPLETION: readonly string[] = []

function ctx(home: string, env: Record<string, string | undefined> = {}): InstallContext {
  return {
    env,
    home,
    platform: 'linux',
    now: () => FIXED_NOW,
    bashCompletionDirs: NO_BASH_COMPLETION,
  }
}

const SCRIPT = '#compdef cospec\n# generated script\n'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(path))
    else out.push(path)
  }
  return out
}

describe('resolveTarget: the five targets', () => {
  test('zsh installs under ~/.zsh/completions and wires ~/.zshrc', () => {
    const home = mkHome()
    const target = resolveTarget('zsh', ctx(home))
    expect(target.scriptPath).toBe(join(home, '.zsh', 'completions', '_cospec'))
    expect(target.rcFiles).toEqual([join(home, '.zshrc')])
    expect(target.ohMyZsh).toBe(false)
  })

  test('Oh My Zsh through $ZSH: custom/completions, no rc file', () => {
    const home = mkHome()
    const target = resolveTarget('zsh', ctx(home, { ZSH: '/opt/omz' }))
    expect(target.scriptPath).toBe(join('/opt/omz', 'custom', 'completions', '_cospec'))
    expect(target.rcFiles).toEqual([])
    expect(target.ohMyZsh).toBe(true)
  })

  test('Oh My Zsh through ~/.oh-my-zsh being a directory', () => {
    const home = mkHome()
    mkdirSync(join(home, '.oh-my-zsh'))
    const target = resolveTarget('zsh', ctx(home))
    expect(target.scriptPath).toBe(join(home, '.oh-my-zsh', 'custom', 'completions', '_cospec'))
    expect(target.rcFiles).toEqual([])
    expect(target.ohMyZsh).toBe(true)
  })

  test('a ~/.oh-my-zsh that is a file is not Oh My Zsh', () => {
    const home = mkHome()
    writeFileSync(join(home, '.oh-my-zsh'), 'x')
    expect(resolveTarget('zsh', ctx(home)).ohMyZsh).toBe(false)
  })

  test('$ZSH_CUSTOM relocates the completions directory', () => {
    const home = mkHome()
    const target = resolveTarget('zsh', ctx(home, { ZSH: '/opt/omz', ZSH_CUSTOM: '/srv/custom' }))
    expect(target.scriptPath).toBe(join('/srv/custom', 'completions', '_cospec'))
  })

  test('bash installs under the user bash-completion dir and wires ~/.bashrc', () => {
    const home = mkHome()
    const target = resolveTarget('bash', ctx(home))
    expect(target.scriptPath).toBe(
      join(home, '.local', 'share', 'bash-completion', 'completions', 'cospec'),
    )
    expect(target.rcFiles).toEqual([join(home, '.bashrc')])
  })

  test('fish installs under ~/.config/fish/completions and wires nothing', () => {
    const home = mkHome()
    const target = resolveTarget('fish', ctx(home))
    expect(target.scriptPath).toBe(join(home, '.config', 'fish', 'completions', 'cospec.fish'))
    expect(target.rcFiles).toEqual([])
  })

  test('home-derived: ZDOTDIR and XDG_CONFIG_HOME never move a target', () => {
    const home = mkHome()
    const env = { ZDOTDIR: '/elsewhere/z', XDG_CONFIG_HOME: '/elsewhere/x' }
    expect(resolveTarget('zsh', ctx(home, env)).rcFiles).toEqual([join(home, '.zshrc')])
    expect(resolveTarget('fish', ctx(home, env)).scriptPath).toBe(
      join(home, '.config', 'fish', 'completions', 'cospec.fish'),
    )
  })

  test('PowerShell through $PROFILE: the script sits beside it, only it is wired', () => {
    const home = mkHome()
    const profile = join(home, 'pwsh', 'profile.ps1')
    const target = resolveTarget('powershell', ctx(home, { PROFILE: profile }))
    expect(target.scriptPath).toBe(join(home, 'pwsh', 'CospecCompletion.ps1'))
    expect(target.rcFiles).toEqual([profile])
  })

  test('PowerShell defaults: ~/.config/powershell off Windows', () => {
    const home = mkHome()
    const target = resolveTarget('powershell', ctx(home))
    const dir = join(home, '.config', 'powershell')
    expect(target.scriptPath).toBe(join(dir, 'CospecCompletion.ps1'))
    expect(target.rcFiles).toEqual([join(dir, 'Microsoft.PowerShell_profile.ps1')])
  })

  test('PowerShell defaults on Windows wire both the Core and the 5.1 profile', () => {
    const home = mkHome()
    const target = resolveTarget('powershell', { ...ctx(home), platform: 'win32' })
    expect(target.scriptPath).toBe(join(home, 'Documents', 'PowerShell', 'CospecCompletion.ps1'))
    expect(target.rcFiles).toEqual([
      join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
      join(home, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
    ])
  })
})

describe('insertBlock and removeBlock: the pure rc edit', () => {
  const INNER = ['# cospec shell completions configuration', 'line one', 'line two']
  const BLOCK = `# COSPEC:START\n${INNER.join('\n')}\n# COSPEC:END`

  test('a missing file gets the bare block', () => {
    expect(insertBlock(undefined, INNER, 'top')).toBe(BLOCK)
    expect(insertBlock(undefined, INNER, 'append')).toBe(BLOCK)
  })

  test('top placement puts the block first, then one blank line', () => {
    expect(insertBlock('export A=1\n', INNER, 'top')).toBe(`${BLOCK}\n\nexport A=1\n`)
  })

  test('append placement adds the block after one blank line', () => {
    expect(insertBlock('Set-Alias a b\n', INNER, 'append')).toBe(`Set-Alias a b\n\n${BLOCK}\n`)
  })

  test('an existing block is replaced in place, the rest untouched', () => {
    const old = `before\n# COSPEC:START\nstale\n# COSPEC:END\nafter\n`
    expect(insertBlock(old, INNER, 'top')).toBe(`before\n${BLOCK}\nafter\n`)
  })

  test('replacing a block with the same block changes nothing', () => {
    const once = insertBlock('x\n', INNER, 'top')
    expect(insertBlock(once, INNER, 'top')).toBe(once)
  })

  test('a start marker without its end marker is refused, so is the reverse', () => {
    expect(() => insertBlock('# COSPEC:START\nx\n', INNER, 'top')).toThrow(CompletionInstallError)
    expect(() => insertBlock('x\n# COSPEC:END\n', INNER, 'top')).toThrow(CompletionInstallError)
    expect(() => removeBlock('# COSPEC:START\nx\n')).toThrow(CompletionInstallError)
    expect(() => removeBlock('# COSPEC:END\n# COSPEC:START\n')).toThrow(CompletionInstallError)
  })

  test('a marker mentioned mid-line is not a marker', () => {
    const text = 'echo "# COSPEC:START and # COSPEC:END"\n'
    expect(removeBlock(text)).toEqual({ content: text, removed: false })
    expect(insertBlock(text, INNER, 'top')).toBe(`${BLOCK}\n\n${text}`)
  })

  const ORIGINALS: Record<string, string> = {
    'empty file': '',
    'one line with a trailing newline': 'export A=1\n',
    'one line without a trailing newline': 'export A=1',
    'a trailing blank line': 'export A=1\n\n',
    'leading blank lines': '\n\nexport A=1\n',
    'CRLF line endings': 'export A=1\r\nexport B=2\r\n',
    'an OpenSpec block': '# OPENSPEC:START\nfpath=(x $fpath)\n# OPENSPEC:END\n\nexport A=1\n',
    'non-ASCII text': '# café\nexport A=1\n',
  }

  for (const [label, original] of Object.entries(ORIGINALS)) {
    for (const placement of ['top', 'append'] as const) {
      test(`remove is the exact inverse of ${placement} insert: ${label}`, () => {
        const inserted = insertBlock(original, INNER, placement)
        expect(inserted).toContain('# COSPEC:START')
        expect(removeBlock(inserted)).toEqual({ content: original, removed: true })
      })
    }
  }

  test('a created-bare file is left empty by remove', () => {
    expect(removeBlock(insertBlock(undefined, INNER, 'top'))).toEqual({
      content: '',
      removed: true,
    })
  })

  test('remove with no block reports nothing removed and returns the text as is', () => {
    expect(removeBlock('export A=1\n')).toEqual({ content: 'export A=1\n', removed: false })
  })

  test('a CRLF file receives a CRLF block', () => {
    const out = insertBlock('a\r\n', INNER, 'top')
    expect(out).not.toMatch(/[^\r]\n/)
  })
})

describe('installCompletion: scripts, rc files, backups', () => {
  const SHELLS: InstallShell[] = ['zsh', 'bash', 'fish', 'powershell']

  test('a fresh zsh install writes the script and a block at the top of a new ~/.zshrc', () => {
    const home = mkHome()
    const result = installCompletion('zsh', SCRIPT, ctx(home))
    expect(result.status).toBe('installed')
    expect(result.backupPath).toBeUndefined()
    expect(readFileSync(join(home, '.zsh', 'completions', '_cospec'), 'utf8')).toBe(SCRIPT)
    const rc = readFileSync(join(home, '.zshrc'), 'utf8')
    const dir = join(home, '.zsh', 'completions')
    expect(rc).toBe(
      [
        '# COSPEC:START',
        '# cospec shell completions configuration',
        `fpath=('${dir}' $fpath)`,
        'autoload -Uz compinit',
        'compinit',
        '# COSPEC:END',
      ].join('\n'),
    )
    expect(result.rc).toEqual([
      expect.objectContaining({ path: join(home, '.zshrc'), status: 'configured' }),
    ])
  })

  test('an apostrophe in the directory is single-quote escaped, never expanded', () => {
    const base = mkHome()
    const home = join(base, "it's $(x)")
    mkdirSync(home)
    installCompletion('zsh', SCRIPT, ctx(home))
    const rc = readFileSync(join(home, '.zshrc'), 'utf8')
    expect(rc).toContain(
      `fpath=('${join(home, '.zsh', 'completions').replace(/'/g, `'\\''`)}' $fpath)`,
    )
  })

  test('bash: the block sources every file in the completions directory, quoted', () => {
    const home = mkHome()
    writeFileSync(join(home, '.bashrc'), 'export A=1\n')
    installCompletion('bash', SCRIPT, ctx(home))
    const dir = join(home, '.local', 'share', 'bash-completion', 'completions')
    expect(readFileSync(join(home, '.bashrc'), 'utf8')).toBe(
      [
        '# COSPEC:START',
        '# cospec shell completions configuration',
        `if [ -d '${dir}' ]; then`,
        `  for f in '${dir}'/*; do`,
        '    [ -f "$f" ] && . "$f"',
        '  done',
        'fi',
        '# COSPEC:END',
        '',
        'export A=1',
        '',
      ].join('\n'),
    )
  })

  test('PowerShell: the block dot-sources the script, appended to an existing profile', () => {
    const home = mkHome()
    const profile = join(home, 'pwsh', 'profile.ps1')
    mkdirSync(join(home, 'pwsh'))
    writeFileSync(profile, 'Set-Alias a b\n')
    installCompletion('powershell', SCRIPT, ctx(home, { PROFILE: profile }))
    const script = join(home, 'pwsh', 'CospecCompletion.ps1')
    expect(readFileSync(profile, 'utf8')).toBe(
      [
        'Set-Alias a b',
        '',
        '# COSPEC:START',
        '# cospec shell completions configuration',
        `if (Test-Path '${script}') {`,
        `    . '${script}'`,
        '}',
        '# COSPEC:END',
        '',
      ].join('\n'),
    )
  })

  test('PowerShell: a path with an apostrophe is doubled inside the single-quoted string', () => {
    const base = mkHome()
    const dir = join(base, "o'neil")
    mkdirSync(dir)
    const profile = join(dir, 'profile.ps1')
    installCompletion('powershell', SCRIPT, ctx(base, { PROFILE: profile }))
    const script = join(dir, 'CospecCompletion.ps1')
    expect(readFileSync(profile, 'utf8')).toContain(`Test-Path '${script.replace(/'/g, "''")}'`)
  })

  test('fish and Oh My Zsh write the script only, never an rc file', () => {
    const home = mkHome()
    installCompletion('fish', SCRIPT, ctx(home))
    const omz = installCompletion('zsh', SCRIPT, ctx(home, { ZSH: join(home, 'omz') }))
    expect(omz.ohMyZsh).toBe(true)
    expect(omz.rc).toEqual([])
    expect(existsSync(join(home, '.zshrc'))).toBe(false)
    expect(existsSync(join(home, '.config', 'fish', 'config.fish'))).toBe(false)
    expect(existsSync(join(home, 'omz', 'custom', 'completions', '_cospec'))).toBe(true)
  })

  test('a second install changes no byte and no mtime', () => {
    for (const shell of SHELLS) {
      const home = mkHome()
      const env = { PROFILE: join(home, 'profile.ps1') }
      installCompletion(shell, SCRIPT, ctx(home, env))
      // Age every file so an accidental rewrite shows as a new mtime.
      const files = walk(home)
      const old = new Date('2020-01-01T00:00:00Z')
      for (const file of files) utimesSync(file, old, old)
      const before = new Map(files.map((f) => [f, readFileSync(f)]))
      const second = installCompletion(shell, SCRIPT, ctx(home, env))
      expect(second.status).toBe('unchanged')
      expect(second.backupPath).toBeUndefined()
      expect(walk(home).toSorted()).toEqual(files.toSorted())
      for (const file of files) {
        expect(readFileSync(file).equals(before.get(file)!)).toBe(true)
        expect(statSync(file).mtimeMs).toBe(old.getTime())
      }
    }
  })

  test('a changed script is backed up under the ISO-timestamp name, an identical one is not', () => {
    const home = mkHome()
    installCompletion('fish', SCRIPT, ctx(home))
    const script = join(home, '.config', 'fish', 'completions', 'cospec.fish')
    writeFileSync(script, 'edited by hand\n')
    const result = installCompletion('fish', SCRIPT, ctx(home))
    expect(result.status).toBe('updated')
    expect(result.backupPath).toBe(`${script}.backup-2026-05-06T07-08-09-123Z`)
    expect(readFileSync(result.backupPath!, 'utf8')).toBe('edited by hand\n')
    expect(readFileSync(script, 'utf8')).toBe(SCRIPT)
    const again = installCompletion('fish', SCRIPT, ctx(home))
    expect(again.status).toBe('unchanged')
    expect(readdirSync(join(home, '.config', 'fish', 'completions'))).toHaveLength(2)
  })

  test('an rc file is never backed up', () => {
    const home = mkHome()
    writeFileSync(join(home, '.zshrc'), 'export A=1\n')
    installCompletion('zsh', SCRIPT, ctx(home))
    expect(readdirSync(home).filter((name) => name.includes('backup'))).toEqual([])
  })

  test('OPENSPEC_NO_AUTO_CONFIG=1 writes the script and leaves the rc file alone', () => {
    for (const shell of ['zsh', 'bash', 'powershell'] as const) {
      const home = mkHome()
      const env = { OPENSPEC_NO_AUTO_CONFIG: '1', PROFILE: join(home, 'profile.ps1') }
      const target = resolveTarget(shell, ctx(home, env))
      const result = installCompletion(shell, SCRIPT, ctx(home, env))
      expect(existsSync(target.scriptPath)).toBe(true)
      expect(existsSync(target.rcFiles[0]!)).toBe(false)
      expect(result.rc).toEqual([
        expect.objectContaining({ path: target.rcFiles[0], status: 'disabled' }),
      ])
      expect(result.rc[0]!.block.length).toBeGreaterThan(0)
    }
  })

  test('an unwritable script directory fails with a CompletionInstallError, rc untouched', () => {
    const home = mkHome()
    // A file where the `.zsh` directory belongs: mkdir cannot succeed, on any
    // platform and for any user, root included.
    writeFileSync(join(home, '.zsh'), 'not a directory')
    writeFileSync(join(home, '.zshrc'), 'export A=1\n')
    expect(() => installCompletion('zsh', SCRIPT, ctx(home))).toThrow(CompletionInstallError)
    expect(readFileSync(join(home, '.zshrc'), 'utf8')).toBe('export A=1\n')
  })

  test('an rc file that cannot be written is reported, the script stays installed', () => {
    const home = mkHome()
    // A directory where ~/.zshrc belongs: reading it fails with EISDIR.
    mkdirSync(join(home, '.zshrc'))
    const result = installCompletion('zsh', SCRIPT, ctx(home))
    expect(existsSync(join(home, '.zsh', 'completions', '_cospec'))).toBe(true)
    expect(result.rc).toHaveLength(1)
    expect(result.rc[0]!.status).toBe('failed')
    expect(result.rc[0]!.reason).toContain('.zshrc')
  })

  test('a one-marker rc file is refused untouched and reported', () => {
    const home = mkHome()
    const broken = '# COSPEC:START\nhalf a block\n'
    writeFileSync(join(home, '.bashrc'), broken)
    const result = installCompletion('bash', SCRIPT, ctx(home))
    expect(readFileSync(join(home, '.bashrc'), 'utf8')).toBe(broken)
    expect(result.rc[0]!.status).toBe('failed')
    expect(result.rc[0]!.reason).toContain('marker')
  })

  test('the generated script is installed byte for byte', () => {
    const home = mkHome()
    const odd = '#compdef cospec\n  trailing spaces  \n\n\nno final newline'
    installCompletion('zsh', odd, ctx(home))
    expect(readFileSync(join(home, '.zsh', 'completions', '_cospec'), 'utf8')).toBe(odd)
  })

  test('bash warns when no bash-completion package is found, and not when one is', () => {
    const home = mkHome()
    const found = mkHome()
    const without = installCompletion('bash', SCRIPT, ctx(home))
    expect(without.warnings.join('\n')).toContain('bash-completion')
    const home2 = mkHome()
    const withPkg = installCompletion('bash', SCRIPT, {
      ...ctx(home2),
      bashCompletionDirs: [found],
    })
    expect(withPkg.warnings).toEqual([])
  })
})

describe('installCompletion: PowerShell profile encodings', () => {
  function profileCtx(home: string): { c: InstallContext; profile: string } {
    const profile = join(home, 'profile.ps1')
    return { c: ctx(home, { PROFILE: profile }), profile }
  }

  test('UTF-8 without a BOM round-trips', () => {
    const home = mkHome()
    const { c, profile } = profileCtx(home)
    const original = Buffer.from('Set-Alias café b\r\n', 'utf8')
    writeFileSync(profile, original)
    installCompletion('powershell', SCRIPT, c)
    uninstallCompletion('powershell', c)
    expect(readFileSync(profile).equals(original)).toBe(true)
  })

  test('UTF-8 with a BOM keeps the BOM and round-trips', () => {
    const home = mkHome()
    const { c, profile } = profileCtx(home)
    const original = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('Set-Alias a b\n'),
    ])
    writeFileSync(profile, original)
    installCompletion('powershell', SCRIPT, c)
    const written = readFileSync(profile)
    expect([...written.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(written.toString('utf8')).toContain('COSPEC:START')
    uninstallCompletion('powershell', c)
    expect(readFileSync(profile).equals(original)).toBe(true)
  })

  test('UTF-16 LE with a BOM stays UTF-16 LE and round-trips', () => {
    const home = mkHome()
    const { c, profile } = profileCtx(home)
    const original = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('Set-Alias a b\r\n', 'utf16le'),
    ])
    writeFileSync(profile, original)
    installCompletion('powershell', SCRIPT, c)
    const written = readFileSync(profile)
    expect([...written.subarray(0, 2)]).toEqual([0xff, 0xfe])
    expect(written.subarray(2).toString('utf16le')).toContain('# COSPEC:START')
    uninstallCompletion('powershell', c)
    expect(readFileSync(profile).equals(original)).toBe(true)
  })

  test('UTF-16 BE is refused: script installed, profile untouched, reason reported', () => {
    const home = mkHome()
    const { c, profile } = profileCtx(home)
    const original = Buffer.from([0xfe, 0xff, 0x00, 0x41])
    writeFileSync(profile, original)
    const result = installCompletion('powershell', SCRIPT, c)
    expect(readFileSync(profile).equals(original)).toBe(true)
    expect(existsSync(join(home, 'CospecCompletion.ps1'))).toBe(true)
    expect(result.rc[0]!.status).toBe('failed')
    expect(result.rc[0]!.reason).toContain('UTF-16 BE')
  })
})

describe('uninstallCompletion', () => {
  test('install then uninstall restores every rc file byte for byte', () => {
    const originals: Record<'zsh' | 'bash' | 'powershell', string> = {
      zsh: 'export A=1\n# my stuff\n',
      bash: 'alias ll="ls -l"',
      powershell: 'Set-Alias a b\r\n',
    }
    for (const shell of ['zsh', 'bash', 'powershell'] as const) {
      const home = mkHome()
      const env = { PROFILE: join(home, 'profile.ps1') }
      const target = resolveTarget(shell, ctx(home, env))
      writeFileSync(target.rcFiles[0]!, originals[shell])
      installCompletion(shell, SCRIPT, ctx(home, env))
      const result = uninstallCompletion(shell, ctx(home, env))
      expect(result.scriptRemoved).toBe(true)
      expect(result.rc).toEqual([
        expect.objectContaining({ path: target.rcFiles[0], status: 'removed' }),
      ])
      expect(readFileSync(target.rcFiles[0]!, 'utf8')).toBe(originals[shell])
      expect(existsSync(target.scriptPath)).toBe(false)
    }
  })

  test('a file created by install is left empty by uninstall, with no marker', () => {
    const home = mkHome()
    installCompletion('zsh', SCRIPT, ctx(home))
    uninstallCompletion('zsh', ctx(home))
    expect(readFileSync(join(home, '.zshrc'), 'utf8')).toBe('')
  })

  test('fish removes the script alone', () => {
    const home = mkHome()
    installCompletion('fish', SCRIPT, ctx(home))
    const result = uninstallCompletion('fish', ctx(home))
    expect(result.scriptRemoved).toBe(true)
    expect(result.rc).toEqual([])
  })

  test('an orphaned block is removed although the script is gone', () => {
    const home = mkHome()
    installCompletion('bash', SCRIPT, ctx(home))
    const target = resolveTarget('bash', ctx(home))
    rmSync(target.scriptPath)
    const result = uninstallCompletion('bash', ctx(home))
    expect(result.scriptRemoved).toBe(false)
    expect(result.rc[0]!.status).toBe('removed')
    expect(readFileSync(join(home, '.bashrc'), 'utf8')).not.toContain('COSPEC')
  })

  test('neither script nor block: nothing removed, every rc file absent or untouched', () => {
    const home = mkHome()
    writeFileSync(join(home, '.zshrc'), 'export A=1\n')
    const result = uninstallCompletion('zsh', ctx(home))
    expect(result.scriptRemoved).toBe(false)
    expect(result.rc).toEqual([
      expect.objectContaining({ path: join(home, '.zshrc'), status: 'absent' }),
    ])
    expect(readFileSync(join(home, '.zshrc'), 'utf8')).toBe('export A=1\n')
  })

  test('a one-marker rc file is a failure and is left untouched, the script is gone', () => {
    const home = mkHome()
    installCompletion('zsh', SCRIPT, ctx(home))
    const broken = '# COSPEC:START\nhalf\n'
    writeFileSync(join(home, '.zshrc'), broken)
    const result = uninstallCompletion('zsh', ctx(home))
    expect(result.scriptRemoved).toBe(true)
    expect(result.rc[0]!.status).toBe('failed')
    expect(readFileSync(join(home, '.zshrc'), 'utf8')).toBe(broken)
  })

  test('it never touches an OpenSpec install in the same home', () => {
    const home = mkHome()
    const zshrc = "# OPENSPEC:START\nfpath=('/x' $fpath)\n# OPENSPEC:END\n\nexport A=1\n"
    writeFileSync(join(home, '.zshrc'), zshrc)
    mkdirSync(join(home, '.zsh', 'completions'), { recursive: true })
    writeFileSync(join(home, '.zsh', 'completions', '_openspec'), 'theirs\n')
    installCompletion('zsh', SCRIPT, ctx(home))
    uninstallCompletion('zsh', ctx(home))
    expect(readFileSync(join(home, '.zshrc'), 'utf8')).toBe(zshrc)
    expect(readFileSync(join(home, '.zsh', 'completions', '_openspec'), 'utf8')).toBe('theirs\n')
  })
})

describe('isCompletionInstalled', () => {
  test('true for a script file, false for none or a directory', () => {
    const home = mkHome()
    expect(isCompletionInstalled('fish', {}, home, 'linux')).toBe(false)
    installCompletion('fish', SCRIPT, ctx(home))
    expect(isCompletionInstalled('fish', {}, home, 'linux')).toBe(true)
    const other = mkHome()
    mkdirSync(join(other, '.config', 'fish', 'completions', 'cospec.fish'), { recursive: true })
    expect(isCompletionInstalled('fish', {}, other, 'linux')).toBe(false)
  })

  test('reads the same target as install, Oh My Zsh included', () => {
    const home = mkHome()
    const env = { ZSH: join(home, 'omz') }
    installCompletion('zsh', SCRIPT, ctx(home, env))
    expect(isCompletionInstalled('zsh', env, home, 'linux')).toBe(true)
    expect(isCompletionInstalled('zsh', {}, home, 'linux')).toBe(false)
  })
})

describe('nothing written names openspec', () => {
  test('no installed file, block or instruction contains the token', () => {
    for (const shell of ['zsh', 'bash', 'fish', 'powershell'] as const) {
      const home = mkHome()
      const env = { OPENSPEC_NO_AUTO_CONFIG: undefined, PROFILE: join(home, 'profile.ps1') }
      const result = installCompletion(shell, SCRIPT, ctx(home, env))
      for (const file of walk(home)) expect(readFileSync(file, 'utf8')).not.toMatch(/openspec/i)
      expect(JSON.stringify(result.rc.map((r) => r.block))).not.toMatch(/openspec/i)
      expect(result.warnings.join('\n')).not.toMatch(/openspec/i)
    }
    const home = mkHome()
    const disabled = installCompletion('zsh', SCRIPT, ctx(home, { OPENSPEC_NO_AUTO_CONFIG: '1' }))
    expect(JSON.stringify(disabled.rc)).not.toMatch(/openspec/i)
  })
})
