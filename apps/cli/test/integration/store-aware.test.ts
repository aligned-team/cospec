// Store-awareness end-to-end (DESIGN: the `--store` operating root). Proves the
// full change lifecycle runs against a registered OpenSpec store instead of the
// local repo: `cospec new/validate/apply/archive --store` all read and write the
// store's `openspec/` tree, the blocker gate + fan-out + spec-merge happen IN
// the store, and the invocation cwd is never touched. The machine-global store
// registry is sandboxed per-run via XDG_DATA_HOME so tests never pollute it.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo } from '../fixtures/support.ts'
import { authorFeat, blockersHard } from './support.ts'

afterAll(cleanupAll)

const STORE_ID = 'pilot-store'

let workspace: string // an unrelated cwd with no openspec/ of its own
let storeDir: string // the store's on-disk root
let env: Record<string, string>

function storeArchivedDirs(): string[] {
  const dir = join(storeDir, 'openspec/changes/archive')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
}

beforeAll(async () => {
  // Register a store WITHOUT `openspec store setup`: build the store skeleton and
  // the machine registry directly, so the test never depends on the git-init /
  // identity behavior that varies across CI runners. XDG_DATA_HOME sandboxes the
  // registry into the temp tree; a store's on-disk shape is just
  // `.openspec-store/store.yaml` + an `openspec/` tree.
  workspace = mkTempRepo()
  storeDir = join(workspace, 'store')
  const xdg = join(workspace, 'xdg')
  env = { XDG_DATA_HOME: xdg, OPENSPEC_TELEMETRY: '0' }

  mkdirSync(join(storeDir, '.openspec-store'), { recursive: true })
  writeFileSync(join(storeDir, '.openspec-store', 'store.yaml'), `version: 1\nid: ${STORE_ID}\n`)
  mkdirSync(join(storeDir, 'openspec', 'changes', 'archive'), { recursive: true })
  mkdirSync(join(storeDir, 'openspec', 'specs'), { recursive: true })
  writeFileSync(join(storeDir, 'openspec', 'config.yaml'), 'schema: feat\n')
  mkdirSync(join(xdg, 'openspec', 'stores'), { recursive: true })
  writeFileSync(
    join(xdg, 'openspec', 'stores', 'registry.yaml'),
    `version: 1\nstores:\n  ${STORE_ID}:\n    backend:\n      type: git\n      local_path: ${storeDir}\n`,
  )

  // Give the store cospec's typed schemas (init by path — a store is state C).
  const init = await cospec(['init', storeDir, '--harness', 'none', '--yes'], {
    cwd: workspace,
    env,
  })
  expect(init.exitCode).toBe(0)
  expect(existsSync(join(storeDir, 'openspec/schemas/feat/schema.yaml'))).toBe(true)
})

describe('cospec --store', () => {
  test('new --store creates the change in the store (v2), never in the cwd', async () => {
    const res = await cospec(['new', 'feat', 'created-in-store', '--store', STORE_ID], {
      cwd: workspace,
      env,
    })
    expect(res.exitCode).toBe(0)

    const yamlPath = join(storeDir, 'openspec/changes/created-in-store/.openspec.yaml')
    expect(existsSync(yamlPath)).toBe(true)
    // `cospec new` stamps schemaVersion 2 in the store, same as a local repo.
    expect(readFileSync(yamlPath, 'utf8')).toMatch(/schemaVersion:\s*2/)
    // The invocation cwd is untouched — the change did not land locally.
    expect(existsSync(join(workspace, 'openspec/changes/created-in-store'))).toBe(false)
  }, 30_000)

  test('an unknown store id fails loudly instead of falling back to local', async () => {
    const res = await cospec(['status', 'anything', '--store', 'no-such-store'], {
      cwd: workspace,
      env,
    })
    expect(res.exitCode).not.toBe(0)
    expect(res.stderr).toMatch(/unknown store 'no-such-store'/)
  }, 30_000)

  test('full lifecycle in the store: gate → archive → fan-out → spec-merge', async () => {
    // Author a provider and a consumer that hard-depends on it, both in the
    // STORE. (v1 feat — no schemaVersion stamp — so the verification gate is
    // grandfathered off and the test stays focused on the store threading.)
    authorFeat(storeDir, 'provider', 'provider-cap', { tasksDone: true })
    authorFeat(storeDir, 'consumer', 'consumer-cap', { blockers: blockersHard('provider') })

    // Both validate against the store.
    const vProvider = await cospec(['validate', 'provider', '--store', STORE_ID, '--strict'], {
      cwd: workspace,
      env,
    })
    expect(vProvider.exitCode).toBe(0)
    const vConsumer = await cospec(['validate', 'consumer', '--store', STORE_ID, '--strict'], {
      cwd: workspace,
      env,
    })
    expect(vConsumer.exitCode).toBe(0)

    // The consumer is blocked (exit 2) while the provider is still active.
    const blocked = await cospec(['apply', 'consumer', '--store', STORE_ID, '--json'], {
      cwd: workspace,
      env,
    })
    expect(blocked.exitCode).toBe(2)
    expect(blocked.stdout).toContain('provider')

    // Archiving the provider fans blocker check-off out across the store.
    const archiveProvider = await cospec(['archive', 'provider', '--store', STORE_ID], {
      cwd: workspace,
      env,
    })
    expect(archiveProvider.exitCode).toBe(0)
    expect(storeArchivedDirs().some((d) => /^\d{4}-\d{2}-\d{2}-provider$/.test(d))).toBe(true)
    expect(archiveProvider.stdout).toMatch(/consumer/)
    const consumerBlockers = readFileSync(
      join(storeDir, 'openspec/changes/consumer/blocking-changes.md'),
      'utf8',
    )
    expect(consumerBlockers).toMatch(/- \[x\] `provider`/)

    // Now the consumer clears.
    const cleared = await cospec(['apply', 'consumer', '--store', STORE_ID, '--json'], {
      cwd: workspace,
      env,
    })
    expect(cleared.exitCode).toBe(0)

    // Complete its tasks, archive it, and confirm the spec merged into the store.
    authorFeat(storeDir, 'consumer', 'consumer-cap', {
      blockers: blockersHard('provider'),
      tasksDone: true,
    })
    const archiveConsumer = await cospec(['archive', 'consumer', '--store', STORE_ID], {
      cwd: workspace,
      env,
    })
    expect(archiveConsumer.exitCode).toBe(0)
    expect(storeArchivedDirs().some((d) => /^\d{4}-\d{2}-\d{2}-consumer$/.test(d))).toBe(true)

    const livingSpec = join(storeDir, 'openspec/specs/consumer-cap/spec.md')
    expect(existsSync(livingSpec)).toBe(true)
    expect(readFileSync(livingSpec, 'utf8')).toContain('### Requirement: consumer-cap behavior')

    // The invocation cwd never grew an openspec/ tree of its own.
    expect(existsSync(join(workspace, 'openspec'))).toBe(false)
  }, 60_000)
})
