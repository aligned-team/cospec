// Unit rows of change `passthrough-json-and-doctor` (ledger 2.6, 4.4, 6.5,
// 6.6): doctor's relationship envelope and its WARNING remedy, whole-line
// respelling (`respellLines`), the terminal-handover pre-flights with the
// terminal injected, and the `workset open` handover environment. Every call
// into the wrapped binary is answered by a `Bun.spawn` stub that records it,
// and a spawn with inherited stdin — a handover — is recorded, never started.
//
// The exports these rows exercise are looked up by name, so a missing one
// fails the row rather than the file.

import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CommandContext } from '../../src/cli.ts'
import * as configModule from '../../src/commands/config.ts'
import * as doctorModule from '../../src/commands/doctor.ts'
import * as worksetModule from '../../src/commands/workset.ts'
import { localRoot, OpenspecCallError, PINNED_OPENSPEC_VERSION } from '../../src/core/openspec.ts'
import * as remediesModule from '../../src/core/remedies.ts'
import { REMEDIES } from '../../src/core/remedies.ts'
import { notRelayed } from '../contract/support/remedy-sources.ts'

/** A bare `openspec` command a user could copy and run outside cospec. */
const BARE_OPENSPEC = /\bopenspec [a-z-]/

function exported<T>(module: object, name: string): T {
  const value = (module as Record<string, unknown>)[name]
  if (typeof value !== 'function') throw new Error(`no export '${name}'`)
  return value as T
}

function upstream(id: string): string {
  const remedy = REMEDIES.find((r) => r.id === id)
  if (remedy === undefined) throw new Error(`no allowlist entry '${id}'`)
  return remedy.upstream
}

interface Answer {
  stdout?: string
  stderr?: string
  exitCode?: number
}

interface Spawned {
  /** The wrapped argv of each piped call, after the forced leading `--no-color`. */
  piped: string[][]
  /** Each handover: its argv after the bin path, and its environment. */
  handovers: { argv: string[]; env: Record<string, string | undefined> }[]
  stdout: string
  stderr: string
}

/**
 * Runs `fn` with `Bun.spawn` answered by `answer` (the version probe answered
 * with the pin) and process output captured.
 */
async function stubbed<T>(
  answer: (argv: string[]) => Answer | Error,
  fn: () => Promise<T>,
): Promise<{ value: T | undefined; error: unknown; spawned: Spawned }> {
  const spawned: Spawned = { piped: [], handovers: [], stdout: '', stderr: '' }
  const originalSpawn = Bun.spawn
  const originalOut = process.stdout.write
  const originalErr = process.stderr.write
  // @ts-expect-error — test-only override of Bun.spawn's overloaded signature.
  Bun.spawn = (cmd: string[], opts: { stdin?: unknown; env?: Record<string, string> }) => {
    if (opts?.stdin === 'inherit') {
      spawned.handovers.push({ argv: cmd.slice(2), env: opts.env ?? {} })
      return { exited: Promise.resolve(0) }
    }
    const argv = cmd.slice(3)
    const reply: Answer | Error =
      argv.length === 1 && argv[0] === '--version'
        ? { stdout: `${PINNED_OPENSPEC_VERSION}\n` }
        : (spawned.piped.push(argv), answer(argv))
    if (reply instanceof Error) throw reply
    return {
      stdout: new Response(reply.stdout ?? '').body,
      stderr: new Response(reply.stderr ?? '').body,
      exited: Promise.resolve(reply.exitCode ?? 0),
    }
  }
  process.stdout.write = ((chunk: unknown) => {
    spawned.stdout += String(chunk)
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: unknown) => {
    spawned.stderr += String(chunk)
    return true
  }) as typeof process.stderr.write
  try {
    return { value: await fn(), error: undefined, spawned }
  } catch (error) {
    return { value: undefined, error, spawned }
  } finally {
    Bun.spawn = originalSpawn
    process.stdout.write = originalOut
    process.stderr.write = originalErr
  }
}

function ctxFor(cwd: string, args: string[] = []): CommandContext {
  return { args, flags: { json: false, noColor: false, cwd }, cwd }
}

// --- doctor's relationship envelope (ledger 2.6) ---------------------------------

interface Finding {
  level: string
  check: string
  message: string
  remedy?: string
}
interface RelationshipKeys {
  root: unknown
  store: unknown
  references: unknown[]
  status: { message: string; fix?: string }[]
}
type CheckRelationship = (
  root: ReturnType<typeof localRoot>,
  cwd: string,
  findings: Finding[],
  initialized: boolean,
) => Promise<RelationshipKeys>

describe('doctor: the delegated relationship report', () => {
  test.failing('a call that could not run: a WARNING naming cospec doctor --json', async () => {
    const check = exported<CheckRelationship>(doctorModule, 'checkOpenspecRelationship')
    const findings: Finding[] = []
    const { value, error } = await stubbed(
      () => new Error('spawn failed'),
      () => check(localRoot('/repo'), '/repo', findings, true),
    )
    expect(error).toBeUndefined()
    expect(value).toEqual({ root: null, store: null, references: [], status: [] })
    const warning = findings.find((f) => f.check === 'openspec-doctor')
    expect(warning?.level).toBe('WARNING')
    expect(warning?.remedy).toContain('cospec doctor --json')
    for (const f of findings)
      expect(BARE_OPENSPEC.test(`${f.message} ${f.remedy ?? ''}`)).toBe(false)
  })

  for (const exitCode of [0, 1]) {
    test.failing(
      `the binary's remedies in the carried keys and findings (exit ${exitCode})`,
      async () => {
        const check = exported<CheckRelationship>(doctorModule, 'checkOpenspecRelationship')
        const doctorFix = upstream('root/store-doctor').replace('{id}', 'st2')
        const doc = {
          root: null,
          store: null,
          references: [
            {
              store_id: 'gone',
              status: [
                {
                  severity: 'warning',
                  code: 'reference_unresolved',
                  message: "Referenced store 'gone' is not registered on this machine.",
                  fix: upstream('references/get-checkout').replace('{id}', 'gone'),
                },
              ],
            },
          ],
          status: [
            {
              // An error at exit 0 would be read as a failed answer.
              severity: exitCode === 0 ? 'warning' : 'error',
              code: 'store_identity_mismatch',
              message: `Store 'st2' is missing identity metadata. ${doctorFix}`,
              fix: doctorFix,
            },
          ],
        }
        const findings: Finding[] = []
        const { value, error } = await stubbed(
          () => ({ stdout: JSON.stringify(doc), exitCode }),
          () => check(localRoot('/repo'), '/repo', findings, true),
        )
        expect(error).toBeUndefined()
        const keys = value as RelationshipKeys
        expect(keys.status[0]!.fix).toBe(doctorFix.replace('openspec', 'cospec'))
        // A failed answer is respelled whole, message included; a successful
        // one only in its fix fields.
        expect(BARE_OPENSPEC.test(keys.status[0]!.message)).toBe(exitCode === 0)
        for (const f of findings) expect(BARE_OPENSPEC.test(f.remedy ?? '')).toBe(false)
        expect(BARE_OPENSPEC.test(JSON.stringify(keys.references))).toBe(false)
      },
    )
  }
})

// --- respellLines (ledger 4.4) -----------------------------------------------------

type RespellLines = (text: string, ids: readonly string[]) => string

describe('respellLines: a whole allowlisted line, nothing else', () => {
  const OPEN = 'Open it any time with: openspec workset open w1'
  const NONE = 'No worksets saved. Create one with: openspec workset create'
  const PROFILE = 'Config updated. Run `openspec update` in your projects to apply.'
  const IDS = ['workset/open-any-time', 'workset/none-saved', 'config/profile-applied']

  test('rewrites a line that is the sentence, holes filled, indentation kept', () => {
    const respell = exported<RespellLines>(remediesModule, 'respellLines')
    const text = `\nSaved workset 'w1' (1 member) to your machine.\n${OPEN}\n  ${NONE}\n${PROFILE}\n`
    expect(respell(text, IDS)).toBe(
      "\nSaved workset 'w1' (1 member) to your machine.\n" +
        'Open it any time with: cospec workset open w1\n' +
        '  No worksets saved. Create one with: cospec workset create\n' +
        'Config updated. Run `cospec update` in your projects to apply.\n',
    )
  })

  test('leaves the sentence inside a member path, after a name, or split', () => {
    const respell = exported<RespellLines>(remediesModule, 'respellLines')
    const text = [
      `  root  /tmp/${OPEN}`,
      `w1 ${OPEN}`,
      'Open it any time with: openspec',
      'workset open w1',
      `${NONE} now`,
      '',
    ].join('\n')
    expect(respell(text, IDS)).toBe(text)
  })

  test('rewrites only the sentences it is given', () => {
    const respell = exported<RespellLines>(remediesModule, 'respellLines')
    expect(respell(`${OPEN}\n${PROFILE}\n`, ['config/profile-applied'])).toBe(
      `${OPEN}\nConfig updated. Run \`cospec update\` in your projects to apply.\n`,
    )
  })
})

// --- the handover pre-flights (ledger 6.5) -------------------------------------------

type RunWorksetOpen = (
  ctx: CommandContext,
  rest: string[],
  terminal: { interactive: boolean },
) => Promise<number>

describe('workset open: the read-only pre-flight on a terminal', () => {
  const refusal = { stderr: "Error: Workset 'nope' is not saved on this machine.\n", exitCode: 1 }

  test.failing('an unsaved name is answered through the piped call', async () => {
    const open = exported<RunWorksetOpen>(worksetModule, 'runWorksetOpen')
    const { value, spawned } = await stubbed(
      (argv) => (argv[1] === 'list' ? { stdout: '{"worksets":[],"status":[]}' } : refusal),
      () => open(ctxFor('/repo'), ['nope'], { interactive: true }),
    )
    expect(spawned.handovers).toEqual([])
    expect(spawned.piped).toEqual([
      ['workset', 'list', '--json'],
      ['workset', 'open', 'nope'],
    ])
    expect(value).toBe(1)
    expect(spawned.stderr).toBe(refusal.stderr)
  })

  test.failing('a workset with no member folder on this machine is answered piped', async () => {
    const open = exported<RunWorksetOpen>(worksetModule, 'runWorksetOpen')
    const list = { worksets: [{ name: 'w1', members: [{ name: 'm', path: '/no/such/dir' }] }] }
    const { spawned } = await stubbed(
      (argv) =>
        argv[1] === 'list' ? { stdout: JSON.stringify({ ...list, status: [] }) } : refusal,
      () => open(ctxFor('/repo'), ['w1'], { interactive: true }),
    )
    expect(spawned.handovers).toEqual([])
    expect(spawned.piped.at(-1)).toEqual(['workset', 'open', 'w1'])
  })

  test.failing('a workset with a surviving member hands the terminal over', async () => {
    const open = exported<RunWorksetOpen>(worksetModule, 'runWorksetOpen')
    const member = mkdtempSync(join(tmpdir(), 'cospec-member-'))
    const list = { worksets: [{ name: 'w1', members: [{ name: 'm', path: member }] }], status: [] }
    const { value, spawned } = await stubbed(
      () => ({ stdout: JSON.stringify(list) }),
      () => open(ctxFor('/repo'), ['w1', '--tool', 'code'], { interactive: true }),
    )
    expect(spawned.piped).toEqual([['workset', 'list', '--json']])
    expect(spawned.handovers.map((h) => h.argv)).toEqual([
      ['workset', 'open', 'w1', '--tool', 'code'],
    ])
    expect(value).toBe(0)
  })

  test.failing('any other pre-flight answer is a wrapped-call violation', async () => {
    const open = exported<RunWorksetOpen>(worksetModule, 'runWorksetOpen')
    const { error, spawned } = await stubbed(
      () => ({ stdout: '{"unexpected":true}' }),
      () => open(ctxFor('/repo'), ['w1'], { interactive: true }),
    )
    expect(error).toBeInstanceOf(OpenspecCallError)
    expect(spawned.handovers).toEqual([])
  })
})

type RunHandover = (
  ctx: CommandContext,
  call: configModule.ConfigCall,
  terminal: { stdoutIsTTY: boolean },
) => Promise<number>

describe('config profile: the piped pre-flight on a terminal', () => {
  function profileCall(): configModule.ConfigCall {
    const plan = configModule.planConfigCall(['profile'], { json: false })
    if (plan.kind !== 'handover') throw new Error('config profile did not plan as a handover')
    return plan
  }

  test.failing('an unreadable config is relayed respelled, never handed over', async () => {
    const handover = exported<RunHandover>(configModule, 'runHandover')
    const stderr =
      'Error: /home/u/.config/openspec/config.json could not be parsed, so it was left unchanged.\n' +
      `${upstream('config/invalid-file')}\n`
    const { value, spawned } = await stubbed(
      () => ({ stderr, exitCode: 1 }),
      () => handover(ctxFor('/repo'), profileCall(), { stdoutIsTTY: true }),
    )
    expect(spawned.piped).toEqual([['config', 'profile']])
    expect(spawned.handovers).toEqual([])
    expect(value).toBe(1)
    expect(spawned.stderr).toContain('"cospec config edit"')
    expect(spawned.stderr).toContain('"cospec config reset --all"')
    expect(BARE_OPENSPEC.test(spawned.stderr)).toBe(false)
  })

  test.failing('the interactive-mode answer clears the handover', async () => {
    const handover = exported<RunHandover>(configModule, 'runHandover')
    const { value, spawned } = await stubbed(
      () => ({ stderr: `${upstream('config/profile-interactive-required')}\n`, exitCode: 1 }),
      () => handover(ctxFor('/repo'), profileCall(), { stdoutIsTTY: true }),
    )
    expect(spawned.piped).toEqual([['config', 'profile']])
    expect(spawned.handovers.map((h) => h.argv)).toEqual([['config', 'profile']])
    expect(value).toBe(0)
  })

  test.failing('any other pre-flight answer is a wrapped-call violation', async () => {
    const handover = exported<RunHandover>(configModule, 'runHandover')
    const { error, spawned } = await stubbed(
      () => ({ stdout: 'something else\n', exitCode: 0 }),
      () => handover(ctxFor('/repo'), profileCall(), { stdoutIsTTY: true }),
    )
    expect(error).toBeInstanceOf(OpenspecCallError)
    expect(spawned.handovers).toEqual([])
  })
})

// --- the workset open handover environment (ledger 6.6) --------------------------------

describe('workset open: the handover environment', () => {
  test.failing(
    'carries OPENSPEC_NO_COMPLETIONS=1 beside telemetry off and BUN_BE_BUN',
    async () => {
      const open = exported<RunWorksetOpen>(worksetModule, 'runWorksetOpen')
      const member = mkdtempSync(join(tmpdir(), 'cospec-member-'))
      const list = {
        worksets: [{ name: 'w1', members: [{ name: 'm', path: member }] }],
        status: [],
      }
      const { spawned } = await stubbed(
        () => ({ stdout: JSON.stringify(list) }),
        () => open(ctxFor('/repo'), ['w1'], { interactive: true }),
      )
      expect(spawned.handovers).toHaveLength(1)
      const env = spawned.handovers[0]!.env
      expect(env.OPENSPEC_NO_COMPLETIONS).toBe('1')
      expect(env.OPENSPEC_TELEMETRY).toBe('0')
      expect(env.BUN_BE_BUN).toBe('1')
    },
  )

  test.failing('notRelayed.TIP states every spawn turns the completions tip off', () => {
    expect(notRelayed.TIP).toContain('OPENSPEC_NO_COMPLETIONS=1')
    expect(notRelayed.TIP).toMatch(/every spawn/i)
    expect(notRelayed.TIP).not.toMatch(/does not/)
  })
})
