// `cospec install [version]` — cospec's counterpart of upstream's `openspec
// install` (1.15.0): install the standalone binary, which needs no Node.js, by
// running the same release installer the docs give users (`install.sh`, or
// `install.ps1` on Windows, published as release assets from
// `scripts/install/`). The installer downloads the archive for this platform and
// verifies it against the release's `SHA256SUMS` before writing anything.
//
// Like upstream, it never removes a package-manager copy itself; it says how.
// A standalone cospec reinstalls itself in the directory it runs from. The
// installer is fetched with the tools the documented one-liners use (curl or
// wget; PowerShell's irm), and saved to a file first on macOS and Linux, so a
// failed download can never look like a successful run. The installer URL
// reaches the shell as an argument (or an environment variable), never as part
// of the command text. Stdio is inherited: the installer's progress is the
// user's to watch, so this command has no `--json`.

import { spawn } from 'node:child_process'
import { dirname } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { currentInstall, type InstallInfo, PACKAGE_NAME } from './version.ts'

/** Where the installers are published: the latest release's assets. */
export const DEFAULT_INSTALLER_BASE =
  'https://github.com/aligned-team/cospec/releases/latest/download'
const RELEASE_VERSION = /^v?\d{1,10}\.\d{1,10}\.\d{1,10}(?:-[0-9A-Za-z.-]{1,64})?$/

/**
 * A download source given through the environment: https, or http to this
 * machine only (the installer and the archives it verifies come from one
 * place, so a cleartext remote could swap both). The host is parsed, never
 * prefix-matched, and a user part is refused.
 */
export function checkSource(label: string, value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} is not a URL: ${value}`)
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    url.username !== '' ||
    url.password !== '' ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
  )
    throw new Error(`${label} must use https (or http to localhost): ${value}`)
  return url.href.replace(/\/+$/, '')
}

/** The installer script's URL for `platform`: `COSPEC_INSTALLER_BASE` when set, else the release. */
export function installerUrl(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const override = env.COSPEC_INSTALLER_BASE
  const base =
    override !== undefined && override !== ''
      ? checkSource('COSPEC_INSTALLER_BASE', override)
      : DEFAULT_INSTALLER_BASE
  return `${base}/${platform === 'win32' ? 'install.ps1' : 'install.sh'}`
}

/**
 * The installer's environment: the requested version, and the install
 * directory — the user's `COSPEC_INSTALL_DIR`, else, for a standalone cospec,
 * the directory it runs from (so it replaces itself), else the installer's
 * own default.
 */
export function installerEnv(
  version: string | undefined,
  install: InstallInfo,
  execPath: string,
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...env }
  if (version !== undefined && version !== 'latest') out.COSPEC_VERSION = version.replace(/^v/, '')
  const dir = env.COSPEC_INSTALL_DIR
  if ((dir === undefined || dir === '') && install.type === 'standalone')
    out.COSPEC_INSTALL_DIR = dirname(execPath)
  return out
}

/** The command that removes a package-manager copy, or null when there is none to remove. */
export function removeCommandFor(install: InstallInfo): string | null {
  switch (install.type) {
    case 'npm-global':
      return `npm uninstall -g ${PACKAGE_NAME}`
    case 'mise':
      return 'mise uninstall cospec'
    default:
      return null
  }
}

// Fixed scripts: the installer URL is data (`$1`, or an environment variable), never command text.
const POSIX_RUNNER =
  'f=$(mktemp) || exit 1; { curl -fsSL "$1" -o "$f" 2>/dev/null || wget -q -O "$f" "$1"; } && sh "$f"; s=$?; rm -f "$f"; exit $s'
const WINDOWS_RUNNER = 'irm $env:COSPEC_INSTALLER_URL | iex'

function runInstaller(scriptUrl: string, env: NodeJS.ProcessEnv): Promise<number> {
  const windows = process.platform === 'win32'
  const command = windows ? 'powershell.exe' : 'sh'
  const args = windows
    ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_RUNNER]
    : ['-c', POSIX_RUNNER, 'cospec-install', scriptUrl]
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: windows ? { ...env, COSPEC_INSTALLER_URL: scriptUrl } : env,
    })
    child.on('error', reject)
    child.on('close', (code) => resolvePromise(code ?? 1))
  })
}

export async function run(ctx: CommandContext): Promise<number> {
  const version = ctx.parsed!.positionals[0]
  if (version !== undefined && version !== 'latest' && !RELEASE_VERSION.test(version)) {
    process.stderr.write(
      `cospec install: not a release version: ${version}. Use one like 1.2.3, or leave it out for the latest.\n`,
    )
    return EXIT.failure
  }
  let scriptUrl: string
  try {
    scriptUrl = installerUrl()
  } catch (error) {
    process.stderr.write(`cospec install: ${(error as Error).message}\n`)
    return EXIT.failure
  }
  const install = currentInstall()
  const exitCode = await runInstaller(scriptUrl, installerEnv(version, install, process.execPath))
  if (exitCode !== 0) {
    process.stderr.write(
      `cospec install: the standalone install did not finish (installer: ${scriptUrl}).\n`,
    )
    return exitCode
  }
  const remove = removeCommandFor(install)
  process.stdout.write('\n')
  if (remove !== null) {
    process.stdout.write(`To switch, remove your package-manager copy:\n  ${remove}\n`)
  }
  process.stdout.write("Check with 'cospec version'; it shows (standalone).\n")
  return EXIT.success
}
