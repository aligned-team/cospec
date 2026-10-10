// `scripts/generate-self` (the body of `mise run generate` and `generate:check`) must see neither
// the machine-global config nor the home directory of whoever runs it. Two behavioural rows:
// `update` reads and rewrites a home-scoped row's skills root (`minimax-code`:
// `<home>/.minimax/skills`), so a host holding cospec skills from an older version reported drift
// under its real home and `generate` rewrote them there; and it honours the global config's
// `delivery` key, so a host whose config says `commands` deleted the committed skills. The first
// row's scratch HOME and global config are those hosts. A variable `update` does not read today
// (`CODEX_HOME`, the XDG data/state/cache roots, `USERPROFILE` while `HOME` is also set) leaves no
// behavioural trace, so the second row runs the script around a stand-in `bun` that records its
// environment and requires every one of the seven to name the one scratch directory. The same
// stand-in requires the first-run completion tip off (`OPENSPEC_NO_COMPLETIONS=1`) and `ZSH` and
// `ZSH_CUSTOM` unset, so the tip never stats a `_cospec` under a host's oh-my-zsh.
import { afterAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'

import {
  cleanup,
  cleanupAll,
  homeCospec,
  homeSandbox,
  mkTempRepo,
  REPO_ROOT,
} from '../fixtures/support.ts'

afterAll(cleanupAll)

const SKILLS = '.minimax/skills'

/** Every variable `scripts/generate-self` must point at its one scratch directory. */
const ISOLATED = [
  'HOME',
  'USERPROFILE',
  'CODEX_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'XDG_CACHE_HOME',
] as const

/** Every path under `dir` with its size, mtime and content hash, sorted: a canary for any write. */
function snapshot(dir: string, rel = ''): string[] {
  const abs = join(dir, rel)
  return readdirSync(abs, { withFileTypes: true })
    .flatMap((entry): string[] => {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`
      if (entry.isDirectory()) return [`${child}/`, ...snapshot(dir, child)]
      const path = join(dir, child)
      const hash = createHash('sha256').update(readFileSync(path)).digest('hex')
      return [`${child} ${statSync(path).size} ${statSync(path).mtimeMs} ${hash}`]
    })
    .toSorted()
}

describe('generate-self runs off the real home', () => {
  test('stale cospec skills and a delivery-commands config on the host: no drift, HOME untouched', async () => {
    const sandbox = homeSandbox()
    const project = mkTempRepo({ git: true })
    try {
      const init = await homeCospec(
        sandbox,
        ['init', '--harness', 'minimax-code', '--no-gate', '--yes'],
        { cwd: project },
      )
      expect(init.exitCode).toBe(0)

      // An earlier cospec's install: every skill carries an older generatedBy stamp.
      const skillsRoot = join(sandbox.home, SKILLS)
      const skills = readdirSync(skillsRoot).filter((name) => name.startsWith('cospec-'))
      expect(skills).toHaveLength(12)
      for (const name of skills) {
        const file = join(skillsRoot, name, 'SKILL.md')
        writeFileSync(file, readFileSync(file, 'utf8').replace(/cospec@[\d.]+/, 'cospec@0.9.0'))
      }
      // And the host's own delivery, which `update` would honour from here: `commands` would
      // remove every committed skill file, so a config that leaked in fails the check (a
      // `profile: core` alone changes nothing `update` renders for an installed workflow).
      const configDir = join(sandbox.env.XDG_CONFIG_HOME!, 'openspec')
      mkdirSync(configDir, { recursive: true })
      writeFileSync(join(configDir, 'config.json'), '{"profile":"core","delivery":"commands"}\n')

      const before = snapshot(sandbox.home)
      expect(existsSync(join(skillsRoot, 'cospec-explore', 'SKILL.md'))).toBe(true)

      const proc = Bun.spawn(['bash', 'scripts/generate-self', 'update', '--check'], {
        cwd: REPO_ROOT,
        env: { ...process.env, ...sandbox.env },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])

      expect({ exitCode, out: stdout + stderr }).toMatchObject({ exitCode: 0 })
      expect(stdout).toContain('no drift')
      expect(stdout + stderr).not.toContain('set by the global config')
      expect(stdout + stderr).not.toContain('.minimax')
      expect(snapshot(sandbox.home)).toEqual(before)
    } finally {
      cleanup(sandbox.root)
      cleanup(project)
    }
  }, 180_000)

  test('every home and config variable reaches the run as one empty scratch directory', async () => {
    const sandbox = homeSandbox()
    const bin = mkdtempSync(join(tmpdir(), 'cospec-fake-bun-'))
    try {
      const probe = join(bin, 'probe.txt')
      const fake = join(bin, 'bun')
      writeFileSync(
        fake,
        [
          '#!/usr/bin/env bash',
          '{',
          `  for name in ${ISOLATED.join(' ')}; do printf '%s=%s\\n' "$name" "\${!name-}"; done`,
          '  printf \'ENTRIES=%s\\n\' "$(ls -A "$HOME" | wc -l | tr -d \' \')"',
          '  printf \'ARGS=%s\\n\' "$*"',
          '  printf \'OPENSPEC_NO_COMPLETIONS=%s\\n\' "${OPENSPEC_NO_COMPLETIONS-}"',
          '  printf \'ZSH_SET=%s\\n\' "${ZSH+set}"',
          '  printf \'ZSH_CUSTOM_SET=%s\\n\' "${ZSH_CUSTOM+set}"',
          '} > "$PROBE_OUT"',
          '',
        ].join('\n'),
      )
      chmodSync(fake, 0o755)

      const proc = Bun.spawn(['bash', 'scripts/generate-self', 'update', '--check'], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          ...sandbox.env,
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          PROBE_OUT: probe,
          // Hostile values: the preloaded machine-state fixture exports `OPENSPEC_NO_COMPLETIONS=1`
          // into `process.env`, so only the script itself can make these three come out right.
          OPENSPEC_NO_COMPLETIONS: '0',
          ZSH: join(sandbox.home, '.oh-my-zsh'),
          ZSH_CUSTOM: join(sandbox.home, '.oh-my-zsh', 'custom'),
        },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])
      expect({ exitCode, out: stdout + stderr }).toMatchObject({ exitCode: 0 })

      const seen = Object.fromEntries(
        readFileSync(probe, 'utf8')
          .trimEnd()
          .split('\n')
          .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
      )
      const scratch = seen.HOME!
      expect(isAbsolute(scratch)).toBe(true)
      // Not the host's home, and not inside it: the scratch directory is the script's own.
      expect(scratch).not.toBe(sandbox.home)
      expect(relative(sandbox.root, scratch).startsWith('..')).toBe(true)
      expect(Object.fromEntries(ISOLATED.map((name) => [name, seen[name]]))).toEqual(
        Object.fromEntries(ISOLATED.map((name) => [name, scratch])),
      )
      expect(seen.ENTRIES).toBe('0')
      expect(seen.ARGS).toBe('run apps/cli/src/index.ts -- update --check')
      // The completion tip is off, and no oh-my-zsh root from the host reaches the run.
      expect(seen.OPENSPEC_NO_COMPLETIONS).toBe('1')
      expect(seen.ZSH_SET).toBe('')
      expect(seen.ZSH_CUSTOM_SET).toBe('')
      // And it does not outlive the run.
      expect(existsSync(scratch)).toBe(false)
    } finally {
      cleanup(sandbox.root)
      cleanup(bin)
    }
  }, 60_000)
})
