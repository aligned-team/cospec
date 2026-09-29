// Unit rows of change `passthrough-json-and-doctor` (ledger 2.6, 4.4, 6.5,
// 6.6): doctor's relationship envelope and its WARNING remedy, whole-line
// respelling (`respellLines`), the terminal-handover pre-flights with the
// terminal injected, and the `workset open` handover environment. Every call
// into the wrapped binary is answered by a `Bun.spawn` stub that records it,
// and a spawn with inherited stdin — a handover — is recorded, never started.
//
// The exports these rows exercise are looked up by name, so a missing one
// fails the row rather than the file.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
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

// The handover preload is written to cospec's cache: a temp one here, never the user's.
const originalXdgCacheHome = process.env.XDG_CACHE_HOME
beforeAll(() => {
  process.env.XDG_CACHE_HOME = mkdtempSync(join(tmpdir(), 'cospec-cache-'))
})
afterAll(() => {
  if (originalXdgCacheHome === undefined) delete process.env.XDG_CACHE_HOME
  else process.env.XDG_CACHE_HOME = originalXdgCacheHome
})

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
  /** The piped calls that ran with a `--preload` ahead of the bin path, as `piped` records them. */
  pipedPreloaded: string[][]
  /** The piped calls whose stdin is a pipe cospec forwards input into, as `piped` records them. */
  pipedWithInput: string[][]
  /** Each handover: its argv after the bin path, its environment, and its `--preload` file. */
  handovers: {
    argv: string[]
    env: Record<string, string | undefined>
    preload: string | undefined
  }[]
  stdout: string
  stderr: string
}

/** A spawn's `--preload <file>` ahead of the bin path, and the argv from the bin path on. */
function splitPreload(cmd: string[]): { preload: string | undefined; fromBin: string[] } {
  return cmd[1] === '--preload'
    ? { preload: cmd[2], fromBin: cmd.slice(3) }
    : { preload: undefined, fromBin: cmd.slice(1) }
}

/**
 * Runs `fn` with `Bun.spawn` answered by `answer` (the version probe answered
 * with the pin) and process output captured.
 */
async function stubbed<T>(
  answer: (argv: string[]) => Answer | Error,
  fn: () => Promise<T>,
): Promise<{ value: T | undefined; error: unknown; spawned: Spawned }> {
  const spawned: Spawned = {
    piped: [],
    pipedPreloaded: [],
    pipedWithInput: [],
    handovers: [],
    stdout: '',
    stderr: '',
  }
  const originalSpawn = Bun.spawn
  const originalOut = process.stdout.write
  const originalErr = process.stderr.write
  // @ts-expect-error — test-only override of Bun.spawn's overloaded signature.
  Bun.spawn = (cmd: string[], opts: { stdin?: unknown; env?: Record<string, string> }) => {
    const { preload, fromBin } = splitPreload(cmd)
    if (opts?.stdin === 'inherit') {
      spawned.handovers.push({ argv: fromBin.slice(1), env: opts.env ?? {}, preload })
      return { exited: Promise.resolve(0) }
    }
    const argv = fromBin.slice(2)
    if (preload !== undefined) spawned.pipedPreloaded.push(argv)
    if (opts?.stdin === 'pipe') spawned.pipedWithInput.push(argv)
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
  test('a call that could not run: a WARNING naming cospec doctor --json', async () => {
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
    test(`the binary's remedies in the carried keys and findings (exit ${exitCode})`, async () => {
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
    })
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

/** Member paths the binary's `pathIsDirectory` reads as no folder: every stat failure. */
function unusableMembers(): [code: string, path: string][] {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-member-'))
  writeFileSync(join(dir, 'file'), '')
  symlinkSync(join(dir, 'loop-b'), join(dir, 'loop-a'))
  symlinkSync(join(dir, 'loop-a'), join(dir, 'loop-b'))
  mkdirSync(join(dir, 'locked'))
  mkdirSync(join(dir, 'locked', 'inner'))
  chmodSync(join(dir, 'locked'), 0o000)
  // Readable again afterwards, so the temp tree can be removed.
  afterAll(() => chmodSync(join(dir, 'locked'), 0o755))
  return [
    ['ENOENT', join(dir, 'missing')],
    ['ENOTDIR', join(dir, 'file', 'x')],
    ['ELOOP', join(dir, 'loop-a')],
    ['EACCES', join(dir, 'locked', 'inner')],
    ['ENAMETOOLONG', join(dir, 'n'.repeat(1100))],
    ['ERR_INVALID_ARG_VALUE', `${dir}/nul\0byte`],
  ]
}

describe('workset open: the read-only pre-flight on a terminal', () => {
  test("the binary's own interactivity test, ported", () => {
    const interactive = exported<(env: Record<string, string>, tty: boolean) => boolean>(
      worksetModule,
      'isWorksetOpenInteractive',
    )
    expect(interactive({}, true)).toBe(true)
    expect(interactive({}, false)).toBe(false)
    expect(interactive({ OPEN_SPEC_INTERACTIVE: '0' }, true)).toBe(false)
    expect(interactive({ OPEN_SPEC_INTERACTIVE: '1' }, true)).toBe(true)
    expect(interactive({ CI: '' }, true)).toBe(false)
  })

  const refusal = { stderr: "Error: Workset 'nope' is not saved on this machine.\n", exitCode: 1 }

  test('an unsaved name is answered through the piped call', async () => {
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

  test('a workset with no member folder on this machine is answered piped', async () => {
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

  test('a workset with a surviving member hands the terminal over', async () => {
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

  test('any other pre-flight answer is a wrapped-call violation', async () => {
    const open = exported<RunWorksetOpen>(worksetModule, 'runWorksetOpen')
    const { error, spawned } = await stubbed(
      () => ({ stdout: '{"unexpected":true}' }),
      () => open(ctxFor('/repo'), ['w1'], { interactive: true }),
    )
    expect(error).toBeInstanceOf(OpenspecCallError)
    expect(spawned.handovers).toEqual([])
  })

  // Review round 2: a pre-flight answer that refuses is the binary's refusal
  // to relay, never a wrapped-call violation.
  const invalid = { severity: 'error', code: 'invalid_workset_file', message: 'm', fix: 'f' }
  const unreadable = { worksets: [], status: [invalid] }
  // A saved workset with a surviving member: only the status[] error refuses it.
  const flagged = {
    worksets: [
      { name: 'w1', members: [{ name: 'm', path: mkdtempSync(join(tmpdir(), 'cospec-member-')) }] },
    ],
    status: [invalid],
  }
  for (const [label, reply] of [
    ['exit 1 (an unreadable worksets file)', { stdout: JSON.stringify(unreadable), exitCode: 1 }],
    ['exit 0 with an error in status[]', { stdout: JSON.stringify(flagged), exitCode: 0 }],
  ] as const) {
    test(`a refusing pre-flight answer, ${label}, is answered piped`, async () => {
      const open = exported<RunWorksetOpen>(worksetModule, 'runWorksetOpen')
      const { value, error, spawned } = await stubbed(
        (argv) => (argv[1] === 'list' ? reply : refusal),
        () => open(ctxFor('/repo'), ['w1'], { interactive: true }),
      )
      expect(error).toBeUndefined()
      expect(spawned.handovers).toEqual([])
      expect(spawned.piped).toEqual([
        ['workset', 'list', '--json'],
        ['workset', 'open', 'w1'],
      ])
      expect(value).toBe(1)
      expect(spawned.stderr).toBe(refusal.stderr)
    })
  }

  for (const [code, path] of unusableMembers()) {
    test(`a member whose stat fails with ${code} is no folder, never a crash`, async () => {
      const open = exported<RunWorksetOpen>(worksetModule, 'runWorksetOpen')
      const list = { worksets: [{ name: 'w1', members: [{ name: 'm', path }] }], status: [] }
      const { value, error, spawned } = await stubbed(
        (argv) => (argv[1] === 'list' ? { stdout: JSON.stringify(list) } : refusal),
        () => open(ctxFor('/repo'), ['w1'], { interactive: true }),
      )
      expect(error).toBeUndefined()
      expect(spawned.handovers).toEqual([])
      expect(spawned.piped.at(-1)).toEqual(['workset', 'open', 'w1'])
      expect(value).toBe(1)
    })
  }
})

type RunHandover = (
  ctx: CommandContext,
  call: configModule.ConfigCall,
  terminal: configModule.ConfigTerminal,
) => Promise<number>

describe('config profile: the piped pre-flight on a terminal', () => {
  function profileCall(): configModule.ConfigCall {
    const plan = configModule.planConfigCall(['profile'], { json: false })
    if (plan.kind !== 'handover') throw new Error('config profile did not plan as a handover')
    return plan
  }

  test('an unreadable config is relayed respelled, never handed over', async () => {
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

  test('the interactive-mode answer clears the handover', async () => {
    const handover = exported<RunHandover>(configModule, 'runHandover')
    const { value, spawned } = await stubbed(
      () => ({ stderr: `${upstream('config/profile-interactive-required')}\n`, exitCode: 1 }),
      () => handover(ctxFor('/repo'), profileCall(), { stdoutIsTTY: true }),
    )
    expect(spawned.piped).toEqual([['config', 'profile']])
    expect(spawned.handovers.map((h) => h.argv)).toEqual([['config', 'profile']])
    expect(value).toBe(0)
  })

  test('any other pre-flight answer is a wrapped-call violation', async () => {
    const handover = exported<RunHandover>(configModule, 'runHandover')
    const { error, spawned } = await stubbed(
      () => ({ stdout: 'something else\n', exitCode: 0 }),
      () => handover(ctxFor('/repo'), profileCall(), { stdoutIsTTY: true }),
    )
    expect(error).toBeInstanceOf(OpenspecCallError)
    expect(spawned.handovers).toEqual([])
  })
})

function handoverPlan(args: string[]): configModule.ConfigCall {
  const planned = configModule.planConfigCall(args, { json: false })
  if (planned.kind !== 'handover') throw new Error(`${args.join(' ')} did not plan as a handover`)
  return planned
}

describe('config handover pre-flights: only the binary’s own interactive answer hands over', () => {
  const tty = { stdoutIsTTY: true, stdinIsTTY: true }

  test('config profile: any other refusal is relayed respelled, never handed over', async () => {
    const handover = exported<RunHandover>(configModule, 'runHandover')
    const stderr = `Error: a refusal of its own.\n${upstream('config/list-keys')}\n`
    const { value, error, spawned } = await stubbed(
      () => ({ stderr, exitCode: 1 }),
      () => handover(ctxFor('/repo'), handoverPlan(['--scope', 'project', 'profile']), tty),
    )
    expect(error).toBeUndefined()
    expect(spawned.piped).toEqual([['config', '--scope', 'project', 'profile']])
    expect(spawned.handovers).toEqual([])
    expect(value).toBe(1)
    expect(spawned.stderr).toBe(remediesModule.respellRemedies(stderr))
    expect(BARE_OPENSPEC.test(spawned.stderr)).toBe(false)
  })

  test('config reset --all with no TTY on stdin runs piped and exits as the binary exits', async () => {
    const handover = exported<RunHandover>(configModule, 'runHandover')
    const stdout = 'the binary’s prompt and its cancellation line\n'
    const { value, error, spawned } = await stubbed(
      () => ({ stdout, exitCode: 130 }),
      () =>
        handover(ctxFor('/repo'), handoverPlan(['reset', '--all']), {
          stdoutIsTTY: true,
          stdinIsTTY: false,
          input: () => new Response('').body!,
        }),
    )
    expect(error).toBeUndefined()
    expect(spawned.handovers).toEqual([])
    expect(spawned.piped).toEqual([['config', 'reset', '--all']])
    // The prompt ends at its given-no-input answer as it does under Node.
    expect(spawned.pipedPreloaded).toEqual([['config', 'reset', '--all']])
    // Its stdin forwards cospec's own to the confirm (design D14).
    expect(spawned.pipedWithInput).toEqual([['config', 'reset', '--all']])
    expect(value).toBe(130)
    expect(spawned.stdout).toBe(stdout)
  })

  test('config reset --all with no TTY on stdin: any other answer is a wrapped-call violation', async () => {
    const handover = exported<RunHandover>(configModule, 'runHandover')
    const { error, spawned } = await stubbed(
      () => ({ stdout: '', exitCode: 0 }),
      () =>
        handover(ctxFor('/repo'), handoverPlan(['reset', '--all']), {
          stdoutIsTTY: true,
          stdinIsTTY: false,
          input: () => new Response('').body!,
        }),
    )
    expect(error).toBeInstanceOf(OpenspecCallError)
    expect(spawned.handovers).toEqual([])
  })

  test('config reset --all on a terminal hands the terminal over', async () => {
    const handover = exported<RunHandover>(configModule, 'runHandover')
    const { value, spawned } = await stubbed(
      () => new Error('no piped call expected'),
      () => handover(ctxFor('/repo'), handoverPlan(['reset', '--all']), tty),
    )
    expect(spawned.piped).toEqual([])
    expect(spawned.handovers.map((h) => h.argv)).toEqual([['config', 'reset', '--all']])
    expect(value).toBe(0)
  })
})

// --- the handover runtime: a prompt given no input (review round 2) ------------------

/**
 * Runs a stand-in for the binary under `preload`: a prompt left pending when
 * its input ends, rejected by signal-exit's shared emitter (as inquirer's is)
 * and answered by a catch that prints its cancellation line and sets exit 130.
 */
async function pendingPromptUnder(preload: string | undefined): Promise<SpawnedChild> {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-preload-'))
  const script = join(dir, 'prompt.mjs')
  writeFileSync(
    script,
    [
      "const key = Symbol.for('signal-exit emitter')",
      'const listeners = []',
      'globalThis[key] = {',
      '  emitted: false,',
      '  emit(ev, code) {',
      "    if (ev !== 'exit' || this.emitted) return false",
      '    this.emitted = true',
      '    for (const fn of listeners) fn(code)',
      '    return false',
      '  },',
      '}',
      'const pending = new Promise((_resolve, reject) => {',
      "  listeners.push(() => reject(new Error('force closed')))",
      '})',
      'async function main() {',
      '  try {',
      '    await pending',
      '  } catch {',
      "    console.log('Prompt cancelled.')",
      '    process.exitCode = 130',
      '  }',
      '}',
      'main()',
      '',
    ].join('\n'),
  )
  const cmd =
    preload === undefined
      ? [process.execPath, script]
      : [process.execPath, '--preload', preload, script]
  const proc = Bun.spawn(cmd, { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' })
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
  return { stdout, exitCode }
}

interface SpawnedChild {
  stdout: string
  exitCode: number
}

describe('the handover runtime answers a prompt given no input as the binary does under Node', () => {
  test('without the preload, Bun exits 0 and the prompt’s cancel path never runs', async () => {
    // The mechanism the preload exists for: Bun never routes its natural exit
    // through signal-exit's emitter, and drains no microtask an exit listener queues.
    expect(await pendingPromptUnder(undefined)).toEqual({ stdout: '', exitCode: 0 })
  })

  test('every handover spawn carries the preload, and under it the cancel path runs: 130', async () => {
    const open = exported<RunWorksetOpen>(worksetModule, 'runWorksetOpen')
    const handover = exported<RunHandover>(configModule, 'runHandover')
    const member = mkdtempSync(join(tmpdir(), 'cospec-member-'))
    const list = {
      worksets: [{ name: 'w1', members: [{ name: 'm', path: member }] }],
      status: [],
    }
    const workset = await stubbed(
      () => ({ stdout: JSON.stringify(list) }),
      () => open(ctxFor('/repo'), ['w1'], { interactive: true }),
    )
    const edit = configModule.planConfigCall(['edit'], { json: false })
    if (edit.kind !== 'handover') throw new Error('config edit did not plan as a handover')
    const config = await stubbed(
      () => new Error('no piped call expected'),
      () => handover(ctxFor('/repo'), edit, { stdoutIsTTY: true, stdinIsTTY: true }),
    )
    const preloads = [...workset.spawned.handovers, ...config.spawned.handovers].map(
      (h) => h.preload,
    )
    expect(preloads).toHaveLength(2)
    for (const preload of preloads) {
      expect(preload).toBeString()
      expect(await pendingPromptUnder(preload)).toEqual({
        stdout: 'Prompt cancelled.\n',
        exitCode: 130,
      })
    }
  })
})

// --- the workset open handover environment (ledger 6.6) --------------------------------

describe('workset open: the handover environment', () => {
  test('carries OPENSPEC_NO_COMPLETIONS=1 beside telemetry off and BUN_BE_BUN', async () => {
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
  })

  test('notRelayed.TIP states every spawn turns the completions tip off', () => {
    expect(notRelayed.TIP).toContain('OPENSPEC_NO_COMPLETIONS=1')
    expect(notRelayed.TIP).toMatch(/every spawn/i)
    expect(notRelayed.TIP).not.toMatch(/does not/)
  })
})
