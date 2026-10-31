// `cospec init` at a store-only repo root, held to the pinned binary (verification 8.5 of
// openspec-1-15-parity). A repo whose `openspec/config.yaml` holds only `store: <id>` keeps its
// planning in that registered store: 1.15.0 resolves the pointer, installs the tool
// integrations at the repo root, and creates no `openspec/changes` or `openspec/specs` there.
// cospec must do the same, and must leave the config byte for byte as the binary does.
//
// The store is registered through the pinned binary inside an `oracleEnv` sandbox (its own HOME
// and XDG dirs), so neither run ever reads or writes the real machine's store registry.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, oracleEnv } from '../fixtures/support.ts'
import { oracle } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

const STORE_ID = 'team-plans'
const CONFIG = `store: ${STORE_ID}\n`

interface Pair {
  root: string
  env: Record<string, string>
  mine: string
  theirs: string
}

/** A sandbox with `team-plans` registered, and two store-only repo roots inside it. */
async function storeOnlyPair(): Promise<Pair> {
  const root = mkTempRepo()
  const env = oracleEnv(root)
  const setup = await oracle(
    ['store', 'setup', STORE_ID, '--path', join(root, 'stores', STORE_ID), '--no-init-git'],
    root,
  )
  if (setup.exitCode !== 0)
    throw new Error(`openspec store setup exited ${setup.exitCode}: ${setup.stderr}`)
  const dirs = { mine: join(root, 'mine'), theirs: join(root, 'theirs') }
  for (const dir of Object.values(dirs)) {
    mkdirSync(join(dir, 'openspec'), { recursive: true })
    writeFileSync(join(dir, 'openspec', 'config.yaml'), CONFIG)
    Bun.spawnSync(['git', 'init', '-q'], { cwd: dir, env })
  }
  return { root, env, ...dirs }
}

describe('init at a store-only repo root (1.15.0)', () => {
  test('cospec and the pinned binary both install integrations, keep the config, create no planning dirs', async () => {
    const p = await storeOnlyPair()

    const theirs = await oracle(['init', '--tools', 'claude'], p.root, { cwd: p.theirs })
    const mine = await cospec(['init', '--tools', 'claude', '--no-gate', '--yes'], {
      cwd: p.mine,
      env: p.env,
    })
    expect(theirs.exitCode).toBe(0)
    expect(mine.exitCode).toBe(0)

    // Integrations installed at the repo root by both.
    expect(existsSync(join(p.theirs, '.claude', 'skills', 'openspec-propose', 'SKILL.md'))).toBe(
      true,
    )
    expect(existsSync(join(p.mine, '.claude', 'skills', 'cospec-propose', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(p.mine, '.claude', 'commands', 'cospec', 'propose.md'))).toBe(true)

    // The pointer config is untouched by either, so the two are byte-identical.
    const mineConfig = readFileSync(join(p.mine, 'openspec', 'config.yaml'))
    const theirConfig = readFileSync(join(p.theirs, 'openspec', 'config.yaml'))
    expect(theirConfig.toString('utf8')).toBe(CONFIG)
    expect(mineConfig.equals(theirConfig)).toBe(true)

    // No planning dirs at the pointer root: they live in the store.
    for (const dir of [p.mine, p.theirs]) {
      expect(existsSync(join(dir, 'openspec', 'changes'))).toBe(false)
      expect(existsSync(join(dir, 'openspec', 'specs'))).toBe(false)
    }
  }, 120_000)
})
