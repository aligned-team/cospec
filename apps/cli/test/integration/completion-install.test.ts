// `cospec completion install|uninstall` round trips under a temporary home
// (ledger rows 1.1–11.3, design §13). Every test runs the real CLI through
// `homeCospec` or `ptyRun`, under a `homeSandbox()` whose HOME is a fresh
// temporary directory, so no test can reach the real home. The pinned binary
// runs only in row 4 (coexistence), through `homeOpenspec`. Pty rows skip where
// `script` is absent; the PowerShell parse row skips where `pwsh` is absent.

import { afterEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { COMMAND_TABLE } from '../../src/core/command-table.ts'
import {
  cleanup,
  homeCospec,
  homeOpenspec,
  homeSandbox,
  type HomeSandbox,
  ptyAvailable,
  ptyRun,
} from '../fixtures/support.ts'

const sandboxes: HomeSandbox[] = []
const TIP = "Tip: Run 'cospec completion install' for shell completions"
const pty = ptyAvailable() ? test : test.skip

function sandbox(): HomeSandbox {
  const sb = homeSandbox()
  sandboxes.push(sb)
  return sb
}

afterEach(() => {
  for (const sb of sandboxes.splice(0)) {
    // A read-only completions dir (row 6.4) must be writable again to be removed.
    chmodTree(sb.home)
    cleanup(sb.root)
  }
})

function chmodTree(root: string): void {
  for (const rel of readdirSync(root, { recursive: true }) as string[]) {
    const full = join(root, rel)
    if (statSync(full).isDirectory()) chmodSync(full, 0o755)
  }
  chmodSync(root, 0o755)
}

const paths = (sb: HomeSandbox) => ({
  bashScript: join(sb.home, '.local', 'share', 'bash-completion', 'completions', 'cospec'),
  bashRc: join(sb.home, '.bashrc'),
  zshScript: join(sb.home, '.zsh', 'completions', '_cospec'),
  zshRc: join(sb.home, '.zshrc'),
  fishScript: join(sb.home, '.config', 'fish', 'completions', 'cospec.fish'),
  fishConfig: join(sb.home, '.config', 'fish', 'config.fish'),
  psProfile: sb.env.PROFILE as string,
  psScript: join(dirname(sb.env.PROFILE as string), 'CospecCompletion.ps1'),
  configFile: join(sb.env.XDG_CONFIG_HOME as string, 'openspec', 'config.json'),
})

function run(
  sb: HomeSandbox,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string>; unset?: readonly string[] } = {},
) {
  return homeCospec(sb, args, { cwd: opts.cwd ?? sb.root, ...opts })
}

function install(
  sb: HomeSandbox,
  shell: string,
  extra: string[] = [],
  env?: Record<string, string>,
) {
  return run(sb, ['completion', 'install', shell, ...extra], { env })
}

function uninstall(
  sb: HomeSandbox,
  shell: string,
  extra: string[] = [],
  env?: Record<string, string>,
) {
  return run(sb, ['completion', 'uninstall', shell, ...extra], { env })
}

/** Every file under `root` with its sha256 and mtime, for byte-and-mtime checks. */
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rel of readdirSync(root, { recursive: true }) as string[]) {
    const full = join(root, rel)
    const st = statSync(full)
    if (!st.isFile()) continue
    const hash = createHash('sha256').update(readFileSync(full)).digest('hex')
    out[rel] = `${hash} ${st.mtimeMs}`
  }
  return out
}

function filesUnder(root: string): string[] {
  return (readdirSync(root, { recursive: true }) as string[]).filter((rel) =>
    statSync(join(root, rel)).isFile(),
  )
}

function bytes(path: string): Buffer {
  return readFileSync(path)
}

// ---------------------------------------------------------------- section 1

describe('1. install then uninstall round trips', () => {
  test('1.1 bash writes the script and uninstall restores ~/.bashrc byte-for-byte', async () => {
    const sb = sandbox()
    const p = paths(sb)
    const original = '# my bashrc\nexport FOO=1\n'
    writeFileSync(p.bashRc, original)

    const installed = await install(sb, 'bash')
    expect(installed.exitCode).toBe(0)
    expect(existsSync(p.bashScript)).toBe(true)
    expect(readFileSync(p.bashRc, 'utf8')).toContain('# COSPEC:START')

    const removed = await uninstall(sb, 'bash', ['-y'])
    expect(removed.exitCode).toBe(0)
    expect(existsSync(p.bashScript)).toBe(false)
    expect(bytes(p.bashRc).equals(Buffer.from(original))).toBe(true)
  })

  test('1.2 zsh puts the block at the top, one blank line after, and restores ~/.zshrc', async () => {
    const sb = sandbox()
    const p = paths(sb)
    const original = 'export FOO=1\n'
    writeFileSync(p.zshRc, original)

    expect((await install(sb, 'zsh')).exitCode).toBe(0)
    expect(existsSync(p.zshScript)).toBe(true)
    const rc = readFileSync(p.zshRc, 'utf8')
    expect(rc.startsWith('# COSPEC:START\n')).toBe(true)
    expect(rc).toMatch(/# COSPEC:END\n\nexport FOO=1\n$/)

    expect((await uninstall(sb, 'zsh', ['-y'])).exitCode).toBe(0)
    expect(existsSync(p.zshScript)).toBe(false)
    expect(bytes(p.zshRc).equals(Buffer.from(original))).toBe(true)
  })

  test('1.3 fish writes the script and never creates config.fish', async () => {
    const sb = sandbox()
    const p = paths(sb)

    expect((await install(sb, 'fish')).exitCode).toBe(0)
    expect(existsSync(p.fishScript)).toBe(true)
    expect(existsSync(p.fishConfig)).toBe(false)

    expect((await uninstall(sb, 'fish', ['-y'])).exitCode).toBe(0)
    expect(existsSync(p.fishScript)).toBe(false)
    expect(existsSync(p.fishConfig)).toBe(false)
  })

  test('1.4 powershell writes CospecCompletion.ps1 beside PROFILE and restores the profile', async () => {
    const sb = sandbox()
    const p = paths(sb)
    const original = 'Set-Alias ll Get-ChildItem\r\n'
    mkdirSync(dirname(p.psProfile), { recursive: true })
    writeFileSync(p.psProfile, original)

    expect((await install(sb, 'powershell')).exitCode).toBe(0)
    expect(existsSync(p.psScript)).toBe(true)
    expect(readFileSync(p.psProfile, 'utf8')).toContain('# COSPEC:START')

    expect((await uninstall(sb, 'powershell', ['-y'])).exitCode).toBe(0)
    expect(existsSync(p.psScript)).toBe(false)
    expect(bytes(p.psProfile).equals(Buffer.from(original))).toBe(true)
  })

  test('1.5 zsh under Oh My Zsh (ZSH set) installs to custom/completions, creates no .zshrc, prints fpath guidance', async () => {
    const sb = sandbox()
    const p = paths(sb)
    const omz = join(sb.root, 'omz')
    mkdirSync(omz, { recursive: true })

    const result = await install(sb, 'zsh', [], { ZSH: omz })
    expect(result.exitCode).toBe(0)
    expect(existsSync(join(omz, 'custom', 'completions', '_cospec'))).toBe(true)
    expect(existsSync(p.zshRc)).toBe(false)
    expect(result.stdout).toContain('fpath')
  })

  test('1.5 zsh with ~/.oh-my-zsh a directory and ZSH unset behaves the same', async () => {
    const sb = sandbox()
    const p = paths(sb)
    mkdirSync(join(sb.home, '.oh-my-zsh'), { recursive: true })

    const result = await install(sb, 'zsh')
    expect(result.exitCode).toBe(0)
    expect(existsSync(join(sb.home, '.oh-my-zsh', 'custom', 'completions', '_cospec'))).toBe(true)
    expect(existsSync(p.zshRc)).toBe(false)
    expect(result.stdout).toContain('fpath')
  })

  test('1.6 each rc-editing shell with no rc file gets only the bare block, and no marker after uninstall', async () => {
    const sb = sandbox()
    const p = paths(sb)
    const cases: [string, string][] = [
      ['zsh', p.zshRc],
      ['bash', p.bashRc],
      ['powershell', p.psProfile],
    ]
    for (const [shell, rc] of cases) {
      expect((await install(sb, shell)).exitCode).toBe(0)
      const text = readFileSync(rc, 'utf8')
      expect(text).toContain('# COSPEC:START')
      expect(text.trimEnd().endsWith('# COSPEC:END')).toBe(true)
      expect((await uninstall(sb, shell, ['-y'])).exitCode).toBe(0)
      const after = existsSync(rc) ? readFileSync(rc, 'utf8') : ''
      expect(after).not.toContain('COSPEC')
    }
  })
})

// ---------------------------------------------------------------- section 2

describe('2. idempotence, backups and verbose output', () => {
  test('2.1 installing zsh twice changes no byte and no mtime, and prints up to date', async () => {
    const sb = sandbox()
    expect((await install(sb, 'zsh')).exitCode).toBe(0)
    const before = snapshot(sb.home)

    const again = await install(sb, 'zsh')
    expect(again.exitCode).toBe(0)
    expect(again.stdout).toContain('Completion script is already installed (up to date)')
    expect(snapshot(sb.home)).toEqual(before)
    expect(filesUnder(sb.home).some((rel) => rel.includes('.backup-'))).toBe(false)
  })

  test('2.2 an edited script is backed up on the next install, and the rc file is not', async () => {
    const sb = sandbox()
    const p = paths(sb)
    writeFileSync(p.zshRc, 'export FOO=1\n')
    expect((await install(sb, 'zsh')).exitCode).toBe(0)
    const rcBefore = bytes(p.zshRc)

    const edited = 'edited by hand\n'
    writeFileSync(p.zshScript, edited)
    const result = await install(sb, 'zsh', ['--verbose'])
    expect(result.exitCode).toBe(0)

    const backups = filesUnder(sb.home).filter((rel) => rel.includes('_cospec.backup-'))
    expect(backups.length).toBe(1)
    const backupPath = join(sb.home, backups[0] as string)
    expect(readFileSync(backupPath, 'utf8')).toBe(edited)
    expect(result.stdout).toContain(`Backup created: ${backupPath}`)
    expect(filesUnder(sb.home).some((rel) => rel.includes('.zshrc.backup-'))).toBe(false)
    expect(bytes(p.zshRc).equals(rcBefore)).toBe(true)
    expect(readFileSync(p.zshScript, 'utf8')).not.toBe(edited)
  })

  test('2.3 a first install of each shell creates no backup file under HOME', async () => {
    const sb = sandbox()
    for (const shell of ['bash', 'zsh', 'fish', 'powershell']) {
      expect((await install(sb, shell)).exitCode).toBe(0)
    }
    expect(filesUnder(sb.home).some((rel) => rel.includes('.backup-'))).toBe(false)
  })

  test('2.4 --verbose prints the installed path and the rc file; without it neither prints; both print the reload command', async () => {
    const quietSb = sandbox()
    const quiet = await install(quietSb, 'zsh')
    expect(quiet.stdout).not.toContain('Installed to:')
    expect(quiet.stdout).not.toContain('configured automatically')
    expect(quiet.stdout).toContain('exec zsh')

    const verboseSb = sandbox()
    const verbose = await install(verboseSb, 'zsh', ['--verbose'])
    expect(verbose.stdout).toContain(`Installed to: ${paths(verboseSb).zshScript}`)
    expect(verbose.stdout).toContain(`${paths(verboseSb).zshRc} configured automatically`)
    expect(verbose.stdout).toContain('exec zsh')

    const reloads: [string, string][] = [
      ['bash', 'exec bash'],
      ['powershell', '. $PROFILE'],
    ]
    for (const [shell, reload] of reloads) {
      const sb = sandbox()
      expect((await install(sb, shell)).stdout).toContain(reload)
    }
  })

  test('2.5 an up-to-date script whose rc block was removed is rewired and says so', async () => {
    const sb = sandbox()
    const p = paths(sb)
    expect((await install(sb, 'zsh')).exitCode).toBe(0)
    writeFileSync(p.zshRc, '')

    const again = await install(sb, 'zsh')
    expect(again.exitCode).toBe(0)
    expect(readFileSync(p.zshRc, 'utf8').startsWith('# COSPEC:START')).toBe(true)
    expect(again.stdout).not.toContain('already installed')
    expect(again.stdout).toContain('.zshrc configured successfully')
    expect(again.stdout).toContain(`${p.zshRc} configured automatically`)
    expect(again.stdout).toContain('exec zsh')

    const third = await install(sb, 'zsh')
    expect(third.stdout).toContain('already installed (up to date)')
    expect(third.stdout).not.toContain('configured automatically')
  })

  test('2.6 fish says completions are available at once, fresh and up to date', async () => {
    const sb = sandbox()
    const fresh = await install(sb, 'fish')
    const again = await install(sb, 'fish')
    for (const result of [fresh, again]) {
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Fish automatically loads completions')
      expect(result.stdout).not.toContain('exec fish')
      expect(result.stdout).not.toContain('Restart your shell')
    }
    expect(fresh.stdout).toContain('no shell restart needed')
    expect(again.stdout).toContain('they should be available immediately')
  })
})

// ---------------------------------------------------------------- section 3

/** Lines of `text` that mention `openspec`, case-insensitively. */
function openspecLines(text: string): string[] {
  return text.split('\n').filter((line) => /openspec/i.test(line))
}

describe('3. the installed files name cospec', () => {
  test('3.1 after four installs, every script names cospec and the rc blocks mention openspec nowhere', async () => {
    const sb = sandbox()
    const p = paths(sb)
    for (const shell of ['bash', 'zsh', 'fish', 'powershell']) {
      expect((await install(sb, shell)).exitCode).toBe(0)
    }
    const scripts = [p.bashScript, p.zshScript, p.fishScript, p.psScript]
    for (const script of scripts) {
      expect(readFileSync(script, 'utf8')).toContain('cospec')
    }
    for (const rc of [p.bashRc, p.zshRc, p.psProfile]) {
      expect(openspecLines(readFileSync(rc, 'utf8'))).toEqual([])
    }
    // Each script's remaining `openspec` mentions are `--help` descriptions
    // that name the wrapped tool; every one sits inside a quoted description.
    // Zero sit anywhere else. (Ruling pending, ledger row 3.1.)
    for (const script of scripts) {
      for (const line of openspecLines(readFileSync(script, 'utf8'))) {
        expect(line).toMatch(/['"][^'"]*openspec[^'"]*['"]/i)
      }
    }
  })

  test('3.2 each installed script is byte-identical to the completion stdout for its shell', async () => {
    const sb = sandbox()
    const p = paths(sb)
    const pairs: [string, string][] = [
      ['bash', p.bashScript],
      ['zsh', p.zshScript],
      ['fish', p.fishScript],
      ['powershell', p.psScript],
    ]
    for (const [shell, script] of pairs) {
      expect((await install(sb, shell)).exitCode).toBe(0)
      const printed = await run(sb, ['completion', shell])
      expect(printed.exitCode).toBe(0)
      expect(readFileSync(script, 'utf8')).toBe(printed.stdout)
    }
  })
})

// ---------------------------------------------------------------- section 4

describe('4. coexistence with the pinned openspec binary', () => {
  test('4.1 the binary installs zsh, cospec installs beside it, cospec uninstall leaves the binary intact', async () => {
    const sb = sandbox()
    const p = paths(sb)
    const openspecScript = join(sb.home, '.zsh', 'completions', '_openspec')
    const binOpts = { cwd: sb.root, env: { OPENSPEC_NO_COMPLETIONS: '1' } }
    expect((await homeOpenspec(sb, ['completion', 'install', 'zsh'], binOpts)).exitCode).toBe(0)
    expect(existsSync(openspecScript)).toBe(true)
    const binScript = readFileSync(openspecScript, 'utf8')
    const binRc = readFileSync(p.zshRc, 'utf8')
    expect(binRc).toContain('# OPENSPEC:START')

    expect((await install(sb, 'zsh')).exitCode).toBe(0)
    expect((await uninstall(sb, 'zsh', ['-y'])).exitCode).toBe(0)

    expect(existsSync(p.zshScript)).toBe(false)
    expect(readFileSync(openspecScript, 'utf8')).toBe(binScript)
    expect(readFileSync(p.zshRc, 'utf8')).toBe(binRc)
    expect(readFileSync(p.zshRc, 'utf8')).not.toContain('COSPEC')
  })

  test('4.2 the reverse order, then the binary uninstall leaves cospec untouched', async () => {
    const sb = sandbox()
    const p = paths(sb)
    const binOpts = { cwd: sb.root, env: { OPENSPEC_NO_COMPLETIONS: '1' } }
    expect((await install(sb, 'zsh')).exitCode).toBe(0)
    const cospecScript = readFileSync(p.zshScript, 'utf8')
    expect((await homeOpenspec(sb, ['completion', 'install', 'zsh'], binOpts)).exitCode).toBe(0)
    const withBoth = readFileSync(p.zshRc, 'utf8')
    expect(withBoth).toContain('# COSPEC:START')
    expect(withBoth).toContain('# OPENSPEC:START')

    expect(
      (await homeOpenspec(sb, ['completion', 'uninstall', 'zsh', '-y'], binOpts)).exitCode,
    ).toBe(0)

    expect(readFileSync(p.zshScript, 'utf8')).toBe(cospecScript)
    const rc = readFileSync(p.zshRc, 'utf8')
    expect(rc).toContain('# COSPEC:START')
    expect(rc).not.toContain('# OPENSPEC:START')
  })
})

// ---------------------------------------------------------------- section 5

describe('5. the uninstall confirmation', () => {
  test('5.1 without a terminal and without -y it refuses, naming -y, and removes nothing', async () => {
    const sb = sandbox()
    const p = paths(sb)
    expect((await install(sb, 'zsh')).exitCode).toBe(0)
    const result = await uninstall(sb, 'zsh')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('-y')
    expect(existsSync(p.zshScript)).toBe(true)
    expect(readFileSync(p.zshRc, 'utf8')).toContain('# COSPEC:START')
  })

  pty(
    '5.2 through a pty, answering n cancels and removes nothing; answering y removes both',
    async () => {
      const sb = sandbox()
      const p = paths(sb)
      expect((await install(sb, 'zsh')).exitCode).toBe(0)

      const cancelled = await ptyRun(
        sb,
        [process.execPath, cliEntry(), 'completion', 'uninstall', 'zsh'],
        {
          cwd: sb.root,
          answers: [['(y/N)', 'n\n']],
        },
      )
      expect(cancelled.output).toContain('Uninstall cancelled.')
      expect(cancelled.exitCode).toBe(0)
      expect(existsSync(p.zshScript)).toBe(true)
      expect(readFileSync(p.zshRc, 'utf8')).toContain('# COSPEC:START')

      const confirmed = await ptyRun(
        sb,
        [process.execPath, cliEntry(), 'completion', 'uninstall', 'zsh'],
        {
          cwd: sb.root,
          answers: [['(y/N)', 'y\n']],
        },
      )
      expect(confirmed.exitCode).toBe(0)
      expect(existsSync(p.zshScript)).toBe(false)
      expect(readFileSync(p.zshRc, 'utf8')).not.toContain('COSPEC')
    },
  )

  test('5.3 -y and --yes remove without a prompt', async () => {
    for (const flag of ['-y', '--yes']) {
      const sb = sandbox()
      const p = paths(sb)
      expect((await install(sb, 'zsh')).exitCode).toBe(0)
      const result = await uninstall(sb, 'zsh', [flag])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).not.toContain('(y/N)')
      expect(existsSync(p.zshScript)).toBe(false)
    }
  })

  test('5.4 uninstall under an empty home exits 1 and says the script is not installed', async () => {
    const sb = sandbox()
    const result = await uninstall(sb, 'zsh', ['-y'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Completion script is not installed')
  })

  test('5.5 an orphaned rc block (script deleted by hand) is removed by uninstall, for zsh, bash and powershell', async () => {
    const sb = sandbox()
    const p = paths(sb)
    const cases: [string, string, string][] = [
      ['zsh', p.zshScript, p.zshRc],
      ['bash', p.bashScript, p.bashRc],
      ['powershell', p.psScript, p.psProfile],
    ]
    for (const [shell, script, rc] of cases) {
      expect((await install(sb, shell)).exitCode).toBe(0)
      rmSyncFile(script)
      const result = await uninstall(sb, shell, ['-y'])
      expect(result.exitCode).toBe(0)
      expect(readFileSync(rc, 'utf8')).not.toContain('COSPEC')
    }
  })
})

function rmSyncFile(path: string): void {
  Bun.spawnSync(['rm', '-f', path])
}

// ---------------------------------------------------------------- section 6

describe('6. opt-outs, malformed markers, encodings and unwritable targets', () => {
  test('6.1 OPENSPEC_NO_AUTO_CONFIG=1 writes the script, leaves rc files alone, and prints the lines to add', async () => {
    const sb = sandbox()
    const p = paths(sb)
    const env = { OPENSPEC_NO_AUTO_CONFIG: '1' }
    for (const shell of ['zsh', 'bash', 'powershell']) {
      const result = await install(sb, shell, [], env)
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('To enable completions, add the following to')
    }
    expect(existsSync(p.zshScript)).toBe(true)
    expect(existsSync(p.bashScript)).toBe(true)
    expect(existsSync(p.psScript)).toBe(true)
    expect(existsSync(p.zshRc)).toBe(false)
    expect(existsSync(p.bashRc)).toBe(false)
    expect(existsSync(p.psProfile)).toBe(false)
  })

  test('6.2 a start marker with no end marker leaves the rc byte-identical, reports the error, and uninstall exits 1', async () => {
    const sb = sandbox()
    const p = paths(sb)
    const broken = '# COSPEC:START\nexport FOO=1\n'
    writeFileSync(p.zshRc, broken)

    const result = await install(sb, 'zsh')
    expect(result.exitCode).toBe(0)
    expect(existsSync(p.zshScript)).toBe(true)
    expect(bytes(p.zshRc).equals(Buffer.from(broken))).toBe(true)
    expect(result.stderr).toContain('Warning: could not configure')
    expect(result.stdout).toContain('To enable completions, add the following to')

    expect((await uninstall(sb, 'zsh', ['-y'])).exitCode).toBe(1)
  })

  test('6.3 UTF-16 LE with a BOM survives install and uninstall byte-identical; a UTF-8 BOM too; UTF-16 BE is left alone with a reason', async () => {
    const sb = sandbox()
    const p = paths(sb)
    const utf16le = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('Set-Alias ll Get-ChildItem\r\n', 'utf16le'),
    ])
    mkdirSync(dirname(p.psProfile), { recursive: true })
    writeFileSync(p.psProfile, utf16le)
    const installLe = await install(sb, 'powershell')
    expect(installLe.exitCode).toBe(0)
    expect(
      bytes(p.psProfile)
        .subarray(0, 2)
        .equals(Buffer.from([0xff, 0xfe])),
    ).toBe(true)
    expect(bytes(p.psProfile).toString('utf16le')).toContain('# COSPEC:START')
    expect((await uninstall(sb, 'powershell', ['-y'])).exitCode).toBe(0)
    expect(bytes(p.psProfile).equals(utf16le)).toBe(true)

    const utf8bom = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('Set-Alias ll Get-ChildItem\r\n'),
    ])
    writeFileSync(p.psProfile, utf8bom)
    expect((await install(sb, 'powershell')).exitCode).toBe(0)
    expect(
      bytes(p.psProfile)
        .subarray(0, 3)
        .equals(Buffer.from([0xef, 0xbb, 0xbf])),
    ).toBe(true)
    expect((await uninstall(sb, 'powershell', ['-y'])).exitCode).toBe(0)
    expect(bytes(p.psProfile).equals(utf8bom)).toBe(true)

    const utf16be = Buffer.concat([
      Buffer.from([0xfe, 0xff]),
      swapBytes(Buffer.from('Set-Alias ll Get-ChildItem\r\n', 'utf16le')),
    ])
    writeFileSync(p.psProfile, utf16be)
    const be = await install(sb, 'powershell')
    expect(be.exitCode).toBe(0)
    expect(bytes(p.psProfile).equals(utf16be)).toBe(true)
    expect(be.stderr).toMatch(/UTF-16 BE/)
  })

  test.skipIf(process.getuid?.() === 0)(
    '6.4 a read-only completions directory fails with a cross, exit 1, and leaves the rc file untouched',
    async () => {
      const sb = sandbox()
      const p = paths(sb)
      const original = 'export FOO=1\n'
      writeFileSync(p.zshRc, original)
      const dir = dirname(p.zshScript)
      mkdirSync(dir, { recursive: true })
      chmodSync(dir, 0o555)

      const result = await install(sb, 'zsh')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('✗')
      expect(bytes(p.zshRc).equals(Buffer.from(original))).toBe(true)
    },
  )
})

function swapBytes(buf: Buffer): Buffer {
  const out = Buffer.from(buf)
  for (let i = 0; i + 1 < out.length; i += 2) {
    const a = out[i] as number
    out[i] = out[i + 1] as number
    out[i + 1] = a
  }
  return out
}

// ---------------------------------------------------------------- section 7

describe('7. shell resolution from SHELL and PSModulePath', () => {
  test('7.1 an unsupported SHELL exits 1 for install, uninstall and the bare script, naming every shell, and writes nothing', async () => {
    const sb = sandbox()
    const env = { SHELL: '/bin/tcsh' }
    const cases: [string[], string][] = [
      [['completion', 'install'], 'cospec completion install <bash|zsh|fish|powershell>'],
      [['completion', 'uninstall', '-y'], 'cospec completion uninstall <bash|zsh|fish|powershell>'],
      [['completion'], 'cospec completion <bash|zsh|fish|powershell>'],
    ]
    for (const [args, explicit] of cases) {
      const result = await run(sb, args, { env })
      expect(result.exitCode).toBe(1)
      for (const name of ['bash', 'zsh', 'fish', 'powershell']) {
        expect(result.stderr).toContain(name)
      }
      expect(result.stderr).toContain(explicit)
    }
    expect(filesUnder(sb.home)).toEqual([])
  })

  test('7.2 with SHELL unset and PSModulePath set, install picks PowerShell and the bare command prints its script', async () => {
    const sb = sandbox()
    const p = paths(sb)
    const env = { PSModulePath: '/opt/microsoft/powershell/7/Modules' }
    const unset = ['SHELL']
    const result = await run(sb, ['completion', 'install'], { env, unset })
    expect(result.exitCode).toBe(0)
    expect(existsSync(p.psScript)).toBe(true)

    const printed = await run(sb, ['completion'], { env, unset })
    expect(printed.exitCode).toBe(0)
    expect(printed.stdout).toContain('Register-ArgumentCompleter')
  })

  test('7.3 the shell argument is case-insensitive, as upstream', async () => {
    const sb = sandbox()
    const p = paths(sb)
    expect((await install(sb, 'ZSH')).exitCode).toBe(0)
    expect(existsSync(p.zshScript)).toBe(true)
    const printed = await run(sb, ['completion', 'generate', 'POWERSHELL'])
    expect(printed.exitCode).toBe(0)
    expect(printed.stdout).toContain('Register-ArgumentCompleter')
  })
})

// ---------------------------------------------------------------- section 8

describe('8. the PowerShell script', () => {
  test('8.1 completion powershell and completion generate powershell print one ASCII script that registers every visible command', async () => {
    const sb = sandbox()
    const first = await run(sb, ['completion', 'powershell'])
    const second = await run(sb, ['completion', 'generate', 'powershell'])
    expect(first.exitCode).toBe(0)
    expect(second.stdout).toBe(first.stdout)
    expect(first.stdout).toContain('Register-ArgumentCompleter -Native -CommandName cospec')
    for (const row of COMMAND_TABLE.filter((r) => !r.hidden)) {
      expect(first.stdout).toContain(row.name)
    }
    expect([...first.stdout].every((c) => c.charCodeAt(0) < 128)).toBe(true)
    // Same rule as 3.1: every `openspec` mention sits inside a quoted description.
    for (const line of openspecLines(first.stdout)) {
      expect(line).toMatch(/['"][^'"]*openspec[^'"]*['"]/i)
    }
  })

  const pwsh = Bun.which('pwsh') !== null ? test : test.skip

  /** Run a script under `pwsh -NoProfile` with every home-like path in the sandbox. */
  function pwshFile(sb: HomeSandbox, file: string, args: string[]) {
    return Bun.spawnSync(['pwsh', '-NoProfile', '-File', file, ...args], {
      cwd: sb.root,
      env: {
        ...process.env,
        ...sb.env,
        DOTNET_CLI_HOME: sb.home,
        POWERSHELL_TELEMETRY_OPTOUT: '1',
        POWERSHELL_UPDATECHECK: 'Off',
      },
    })
  }

  pwsh(
    '8.3 pwsh parses the script and TabExpansion2 completes a command, a flag and completion <Tab>',
    async () => {
      const sb = sandbox()
      const script = join(sb.root, 'cospec.ps1')
      const printed = await run(sb, ['completion', 'powershell'])
      writeFileSync(script, printed.stdout)
      const probe = join(sb.root, 'probe.ps1')
      writeFileSync(
        probe,
        [
          '$errors = $null',
          '[System.Management.Automation.Language.Parser]::ParseFile($args[0], [ref]$null, [ref]$errors) | Out-Null',
          'if ($errors.Count -gt 0) { exit 2 }',
          '. $args[0]',
          "$cmd = (TabExpansion2 'cospec comp' 11).CompletionMatches.CompletionText",
          "$flag = (TabExpansion2 'cospec --' 9).CompletionMatches.CompletionText",
          // The cursor sits after the trailing space (offset 18), so the next word is a subcommand.
          "$sub = (TabExpansion2 'cospec completion ' 18).CompletionMatches.CompletionText",
          'Write-Output ("CMD=" + ($cmd -join ","))',
          'Write-Output ("FLAG=" + ($flag -join ","))',
          'Write-Output ("SUB=" + ($sub -join ","))',
        ].join('\n'),
      )
      const result = pwshFile(sb, probe, [script])
      expect(result.exitCode).toBe(0)
      const lines = result.stdout.toString().split('\n')
      const field = (name: string) =>
        (lines.find((line) => line.startsWith(`${name}=`)) ?? '').slice(name.length + 1).trim()
      expect(field('CMD').split(',')).toContain('completion')
      expect(field('FLAG').split(',')).toContain('--json')
      expect(field('SUB').split(',')).toEqual(
        expect.arrayContaining(['install', 'uninstall', 'bash', 'zsh', 'fish', 'powershell']),
      )
    },
  )

  pwsh(
    '8.4 pwsh parses the installed script and the profile block, and a profile path with an apostrophe loads',
    async () => {
      const sb = sandbox()
      const profile = join(sb.home, '.config', "it's here", 'profile.ps1')
      mkdirSync(dirname(profile), { recursive: true })
      writeFileSync(profile, '# existing\n')
      expect((await install(sb, 'powershell', [], { PROFILE: profile })).exitCode).toBe(0)
      const script = join(dirname(profile), 'CospecCompletion.ps1')

      const probe = join(sb.root, 'probe-profile.ps1')
      writeFileSync(
        probe,
        [
          'foreach ($file in $args) {',
          '  $errors = $null',
          '  [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$null, [ref]$errors) | Out-Null',
          '  if ($errors.Count -gt 0) { Write-Output ("PARSE-ERROR " + $file + ": " + $errors[0].Message); exit 2 }',
          '}',
          '. $args[1]',
          "$cmd = (TabExpansion2 'cospec comp' 11).CompletionMatches.CompletionText",
          'Write-Output ("CMD=" + ($cmd -join ","))',
        ].join('\n'),
      )
      const result = pwshFile(sb, probe, [script, profile])
      expect(result.stdout.toString()).not.toContain('PARSE-ERROR')
      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).toContain('CMD=completion')
    },
  )
})

// ---------------------------------------------------------------- section 9

describe('9. the one-shot tip on a terminal', () => {
  pty(
    '9.1 a pty run prints the tip after the command output and records the flag; the second run prints nothing',
    async () => {
      const sb = sandbox()
      const p = paths(sb)
      const cmd = [process.execPath, cliEntry(), 'schemas']
      const first = await ptyRun(sb, cmd, { cwd: sb.root, env: { SHELL: '/bin/zsh' } })
      expect(first.exitCode).toBe(0)
      expect(first.output.trimEnd().endsWith(TIP)).toBe(true)
      expect(first.output).toContain(`\n\n${TIP}`)
      expect(JSON.parse(readFileSync(p.configFile, 'utf8')).completionTipSeen).toBe(true)

      const second = await ptyRun(sb, cmd, { cwd: sb.root, env: { SHELL: '/bin/zsh' } })
      expect(second.output).not.toContain('Tip: Run')
    },
  )

  pty(
    '9.3 the tip stays quiet and the flag is recorded when the script is installed, or the shell is tcsh',
    async () => {
      const installed = sandbox()
      expect((await install(installed, 'zsh')).exitCode).toBe(0)
      const ran = await ptyRun(installed, [process.execPath, cliEntry(), 'schemas'], {
        cwd: installed.root,
        env: { SHELL: '/bin/zsh' },
      })
      expect(ran.output).not.toContain('Tip: Run')
      expect(JSON.parse(readFileSync(paths(installed).configFile, 'utf8')).completionTipSeen).toBe(
        true,
      )

      const tcsh = sandbox()
      const other = await ptyRun(tcsh, [process.execPath, cliEntry(), 'schemas'], {
        cwd: tcsh.root,
        env: { SHELL: '/bin/tcsh' },
      })
      expect(other.output).not.toContain('Tip: Run')
      expect(JSON.parse(readFileSync(paths(tcsh).configFile, 'utf8')).completionTipSeen).toBe(true)
    },
  )
})

// ---------------------------------------------------------------- section 10

describe('10. when the tip stays quiet', () => {
  pty(
    '10.1 no tip on a pty for --json, CI=true, OPENSPEC_NO_COMPLETIONS=1, completion zsh, __complete and help',
    async () => {
      const cases: [string[], Record<string, string>][] = [
        [['schemas', '--json'], {}],
        [['schemas'], { CI: 'true' }],
        [['schemas'], { OPENSPEC_NO_COMPLETIONS: '1' }],
        [['completion', 'zsh'], {}],
        [['__complete', 'changes'], {}],
        [['help'], {}],
      ]
      for (const [args, env] of cases) {
        const sb = sandbox()
        const result = await ptyRun(sb, [process.execPath, cliEntry(), ...args], {
          cwd: sb.root,
          env: { SHELL: '/bin/zsh', ...env },
        })
        expect(result.output).not.toContain('Tip: Run')
      }
    },
    // Six sequential pty spawns of the CLI: well past the default 5s on a busy host.
    60_000,
  )

  test('10.2 a plain run with stderr piped prints no tip and creates no config file', async () => {
    const sb = sandbox()
    const p = paths(sb)
    const result = await run(sb, ['schemas'])
    expect(result.stderr).not.toContain('Tip: Run')
    expect(existsSync(p.configFile)).toBe(false)
  })

  pty(
    '10.3 a deferred run (--json, then piped stderr) does not consume the tip for a later pty run',
    async () => {
      const sb = sandbox()
      const p = paths(sb)
      const deferred = await run(sb, ['schemas', '--json'])
      expect(deferred.exitCode).toBe(0)
      expect(existsSync(p.configFile)).toBe(false)

      const later = await ptyRun(sb, [process.execPath, cliEntry(), 'schemas'], {
        cwd: sb.root,
        env: { SHELL: '/bin/zsh' },
      })
      expect(later.output).toContain(TIP)
    },
  )

  pty(
    '10.5 --help, an unknown command and a parse refusal print no tip and leave the config untouched',
    async () => {
      const sb = sandbox()
      const p = paths(sb)
      // A table-parsed refusal (`completion --bogus`), which the design names.
      // A forwarded command's own refusal is a separate case; see the PR's
      // judgment calls.
      const cases = [['--help'], ['no-such-command'], ['completion', 'zsh', '--bogus']]
      for (const args of cases) {
        const result = await ptyRun(sb, [process.execPath, cliEntry(), ...args], {
          cwd: sb.root,
          env: { SHELL: '/bin/zsh' },
        })
        expect(result.output).not.toContain('Tip: Run')
      }
      expect(existsSync(p.configFile)).toBe(false)
    },
  )

  pty(
    '10.6 wrapped calls spawn the binary with OPENSPEC_NO_COMPLETIONS=1, so its own tip never prints through cospec',
    async () => {
      const sb = sandbox()
      const result = await ptyRun(sb, [process.execPath, cliEntry(), 'schemas'], {
        cwd: sb.root,
        env: { SHELL: '/bin/zsh' },
      })
      expect(result.output).not.toContain("Tip: Run 'openspec completion install'")
    },
  )
})

// ---------------------------------------------------------------- section 11

describe('11. the config file the tip writes', () => {
  pty(
    '11.1 an existing config keeps its keys, gains completionTipSeen, is 2-space JSON with a newline at mode 0600, and leaves no temp file',
    async () => {
      const sb = sandbox()
      const p = paths(sb)
      mkdirSync(dirname(p.configFile), { recursive: true })
      writeFileSync(p.configFile, '{"telemetry":{"anonymousId":"x"}}')

      expect(
        (
          await ptyRun(sb, [process.execPath, cliEntry(), 'schemas'], {
            cwd: sb.root,
            env: { SHELL: '/bin/zsh' },
          })
        ).exitCode,
      ).toBe(0)
      const text = readFileSync(p.configFile, 'utf8')
      expect(text).toBe(
        `${JSON.stringify({ telemetry: { anonymousId: 'x' }, completionTipSeen: true }, null, 2)}\n`,
      )
      expect(statSync(p.configFile).mode & 0o777).toBe(0o600)
      expect(readdirSync(dirname(p.configFile))).toEqual(['config.json'])
    },
  )

  pty(
    '11.2 a config whose root is an array, and one that is invalid JSON, stay byte-identical and print no tip',
    async () => {
      for (const content of ['[1,2,3]\n', '{"telemetry": ']) {
        const sb = sandbox()
        const p = paths(sb)
        mkdirSync(dirname(p.configFile), { recursive: true })
        writeFileSync(p.configFile, content)
        const result = await ptyRun(sb, [process.execPath, cliEntry(), 'schemas'], {
          cwd: sb.root,
          env: { SHELL: '/bin/zsh' },
        })
        expect(readFileSync(p.configFile, 'utf8')).toBe(content)
        expect(result.output).not.toContain('Tip: Run')
      }
    },
  )

  test('11.3 XDG_CONFIG_HOME moves the file to <XDG_CONFIG_HOME>/openspec/config.json, the path cospec config path reports', async () => {
    const sb = sandbox()
    const xdg = join(sb.root, 'xdg-config')
    const env = { XDG_CONFIG_HOME: xdg }
    const reported = await run(sb, ['config', 'path'], { env })
    expect(reported.exitCode).toBe(0)
    expect(reported.stdout.trim()).toBe(join(xdg, 'openspec', 'config.json'))
  })
})

/** The cospec CLI entrypoint, for a pty command line (the pty driver runs argv directly). */
function cliEntry(): string {
  return join(import.meta.dir, '..', '..', 'src', 'index.ts')
}
