// `cospec version` (change openspec-1-15-parity, task 5.1): install-type
// detection, the registry endpoint rules, version comparison, and the document
// shape — all pure, no network, no spawn.

import { describe, expect, test } from 'bun:test'

import {
  buildDocument,
  compareVersions,
  DEFAULT_REGISTRY_URL,
  describeWrapped,
  detectInstall,
  type InstallInfo,
  type InstallProbe,
  isCompiledModulePath,
  latestFromRegistry,
  registryUrl,
  renderText,
  upgradeCommand,
} from '../../../src/commands/version.ts'

const COMPILED: InstallProbe = {
  compiled: true,
  execPath: '/usr/local/bin/cospec',
  sourceDir: '/src/apps/cli',
}

describe('detectInstall', () => {
  test('a source run is source, located at the package directory', () => {
    expect(detectInstall({ ...COMPILED, compiled: false })).toEqual({
      location: '/src/apps/cli',
      packageManager: null,
      scope: 'source',
      type: 'source',
    })
  })

  test('the compiled binary with no launcher marker is standalone', () => {
    expect(detectInstall(COMPILED)).toEqual({
      location: '/usr/local/bin',
      packageManager: null,
      scope: 'standalone',
      type: 'standalone',
    })
  })

  test('a binary under a mise install dir is mise', () => {
    const probe = {
      ...COMPILED,
      execPath: '/home/u/.local/share/mise/installs/cospec/1.0.0/cospec',
    }
    expect(detectInstall(probe).type).toBe('mise')
  })

  const launched: [string, string, InstallInfo['type'], InstallInfo['scope']][] = [
    ['/usr/lib/node_modules/@aligned-team/cospec/bin/cospec.js', 'npm', 'npm-global', 'global'],
    [
      '/home/u/.npm/_npx/ab12/node_modules/@aligned-team/cospec/bin/cospec.js',
      'npm',
      'npx',
      'temporary',
    ],
    [
      '/tmp/bunx-501-@aligned-team/cospec@latest/node_modules/@aligned-team/cospec/bin/cospec.js',
      'bun',
      'bunx',
      'temporary',
    ],
    [
      'C:\\Users\\u\\AppData\\Local\\npm-cache\\_npx\\ab\\node_modules\\@aligned-team\\cospec\\bin\\cospec.js',
      'npm',
      'npx',
      'temporary',
    ],
  ]
  for (const [launcher, pm, type, scope] of launched) {
    test(`a launcher at ${launcher} is ${type}`, () => {
      const info = detectInstall({ ...COMPILED, launcher })
      expect(info.type).toBe(type)
      expect(info.packageManager).toBe(pm as InstallInfo['packageManager'])
      expect(info.scope).toBe(scope)
    })
  }

  test('a launcher inside a mise install is mise, not npm-global', () => {
    const launcher =
      '/home/u/.local/share/mise/installs/npm-aligned-team-cospec/1.0.0/node_modules/@aligned-team/cospec/bin/cospec.js'
    expect(detectInstall({ ...COMPILED, launcher }).type).toBe('mise')
  })
})

test('isCompiledModulePath recognises Bun’s virtual filesystem on POSIX and Windows', () => {
  expect(isCompiledModulePath('/$bunfs/root/cospec')).toBe(true)
  expect(isCompiledModulePath('B:\\~BUN\\root\\cospec.exe')).toBe(true)
  expect(isCompiledModulePath('/repo/apps/cli/src/commands/version.ts')).toBe(false)
})

describe('registryUrl', () => {
  test('defaults to the npm registry entry', () => {
    expect(registryUrl({})).toBe(DEFAULT_REGISTRY_URL)
  })
  test('COSPEC_NO_UPDATE_CHECK disables it', () => {
    expect(registryUrl({ COSPEC_NO_UPDATE_CHECK: '1' })).toBeNull()
    expect(registryUrl({ COSPEC_NO_UPDATE_CHECK: '0' })).toBe(DEFAULT_REGISTRY_URL)
  })
  test('an override must be https, or http to this machine, with no user part', () => {
    expect(registryUrl({ COSPEC_REGISTRY_URL: 'https://mirror.example/x' })).toBe(
      'https://mirror.example/x',
    )
    expect(registryUrl({ COSPEC_REGISTRY_URL: 'http://127.0.0.1:4873/latest' })).toBe(
      'http://127.0.0.1:4873/latest',
    )
    expect(registryUrl({ COSPEC_REGISTRY_URL: 'http://mirror.example/x' })).toBeNull()
    expect(registryUrl({ COSPEC_REGISTRY_URL: 'http://localhost:80@evil.example/' })).toBeNull()
    expect(registryUrl({ COSPEC_REGISTRY_URL: 'not a url' })).toBeNull()
  })
})

describe('compareVersions and latestFromRegistry', () => {
  test('orders by semver precedence, a prerelease below its release', () => {
    expect(compareVersions('1.2.10', '1.2.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('0.9.0', '1.0.0')).toBeLessThan(0)
  })
  test('reads only a semver `version`', () => {
    expect(latestFromRegistry({ version: '1.2.3' })).toBe('1.2.3')
    expect(latestFromRegistry({ version: 'latest' })).toBeUndefined()
    expect(latestFromRegistry({})).toBeUndefined()
    expect(latestFromRegistry([1])).toBeUndefined()
  })
})

describe('the version document', () => {
  const install: InstallInfo = {
    location: '/usr/local/bin',
    packageManager: null,
    scope: 'standalone',
    type: 'standalone',
  }
  const wrapped = describeWrapped('1.15.0', 'embedded')

  test("without --check: upstream's keys, no update, the wrapped binary under openspec", () => {
    const doc = buildDocument('0.12.0', install, wrapped)
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'version', 'install', 'openspec'])
    expect(doc.openspec).toEqual({
      version: '1.15.0',
      source: 'embedded',
      inRange: true,
      range: '>=1.0.0 <2.0.0',
    })
    expect(renderText(doc)).toBe(
      'cospec 0.12.0 (standalone)\nOpenSpec 1.15.0 (embedded, in range >=1.0.0 <2.0.0)\n',
    )
  })

  test('an available update names the command for the install type', () => {
    const npm: InstallInfo = {
      ...install,
      packageManager: 'npm',
      scope: 'global',
      type: 'npm-global',
    }
    const doc = buildDocument('0.12.0', npm, wrapped, { status: 'available', latest: '0.13.0' })
    expect(doc.update).toEqual({
      status: 'available',
      latest: '0.13.0',
      command: 'npm install -g @aligned-team/cospec@latest',
      canSelfUpgrade: false,
    })
    expect(renderText(doc)).toContain(
      'Update available: 0.13.0\n  npm install -g @aligned-team/cospec@latest\n',
    )
  })

  test('a standalone install has no upgrade command, so the report names none', () => {
    const doc = buildDocument('0.12.0', install, wrapped, { status: 'available', latest: '0.13.0' })
    expect(doc.update?.command).toBeNull()
    expect(renderText(doc)).toContain('Update available: 0.13.0\n')
    expect(renderText(doc)).not.toContain('Update available: 0.13.0\n  ')
  })

  test('no command unless an update is available', () => {
    for (const status of ['current', 'disabled', 'offline'] as const)
      expect(
        buildDocument('1.0.0', install, wrapped, { status, latest: null }).update?.command,
      ).toBe(null)
  })

  test('each package-manager install type has its upgrade spelling; standalone and source have none', () => {
    expect(upgradeCommand('npm-global')).toBe('npm install -g @aligned-team/cospec@latest')
    expect(upgradeCommand('npx')).toBe('npx @aligned-team/cospec@latest')
    expect(upgradeCommand('bunx')).toBe('bunx @aligned-team/cospec@latest')
    expect(upgradeCommand('mise')).toBe('mise upgrade')
    expect(upgradeCommand('standalone')).toBeNull()
    expect(upgradeCommand('source')).toBeNull()
  })

  test('a wrapped binary outside the range is flagged and names the remedy', () => {
    const out = describeWrapped('2.1.0', 'package')
    expect(out.inRange).toBe(false)
    expect(out.remedy).toContain('outside >=1.0.0 <2.0.0')
    expect(renderText(buildDocument('1.0.0', install, out))).toContain('OUT OF RANGE')
    expect(describeWrapped('unknown', 'package').inRange).toBe(false)
  })
})

describe('list --archived floor', () => {
  test('a wrapped OpenSpec below 1.14.0 is refused; the pin and an unparseable version are not', async () => {
    const { listArchivedUnsupported } = await import('../../../src/commands/list.ts')
    expect(listArchivedUnsupported('1.13.2')).toContain('need OpenSpec >=1.14.0')
    expect(listArchivedUnsupported('1.14.0')).toBeUndefined()
    expect(listArchivedUnsupported('1.15.0')).toBeUndefined()
    expect(listArchivedUnsupported('garbage')).toBeUndefined()
  })
})
