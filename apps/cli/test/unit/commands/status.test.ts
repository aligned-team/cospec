// `cospec status` next-step decision (design D4, verification 3.3).

import { afterAll, describe, expect, test } from 'bun:test'
import { rmSync } from 'node:fs'

import {
  computeStatus,
  resolveNext,
  respelledUpstream,
  run as statusRun,
  upstreamFailure,
} from '../../../src/commands/status.ts'
import { respellRemedies } from '../../../src/core/remedies.ts'
import { ctx, makeRepo, writeChange } from './helpers.ts'

const roots: string[] = []
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

function repo(): string {
  const dir = makeRepo()
  roots.push(dir)
  return dir
}

const s = (id: string, state: 'done' | 'ready' | 'blocked' | 'skipped') => ({ id, state })

describe('resolveNext (verification 3.3)', () => {
  const required = new Set(['proposal', 'blocking-changes', 'specs', 'tasks'])

  test('the first ready artifact the change requires', () => {
    const states = [s('proposal', 'done'), s('design', 'ready'), s('blocking-changes', 'ready')]
    expect(resolveNext(states, required, 'a')).toBe(
      'cospec instructions blocking-changes --change a',
    )
  })

  test('the first ready optional artifact when no required one is ready', () => {
    const states = [
      s('proposal', 'done'),
      s('blocking-changes', 'blocked'),
      s('design', 'ready'),
      s('specs', 'blocked'),
      s('tasks', 'blocked'),
    ]
    expect(resolveNext(states, required, 'a')).toBe('cospec instructions design --change a')
  })

  test('cospec apply <id> once every required artifact is done, an optional one unwritten', () => {
    const states = [
      s('proposal', 'done'),
      s('blocking-changes', 'done'),
      s('specs', 'done'),
      s('design', 'ready'),
      s('tasks', 'done'),
    ]
    expect(resolveNext(states, required, 'a')).toBe('cospec apply a')
  })

  test('a skipped specs counts as done', () => {
    const states = [
      s('proposal', 'done'),
      s('blocking-changes', 'done'),
      s('specs', 'skipped'),
      s('tasks', 'done'),
    ]
    expect(resolveNext(states, required, 'a')).toBe('cospec apply a')
  })

  test('nothing when every artifact is blocked', () => {
    const states = [s('blocking-changes', 'blocked'), s('tasks', 'blocked')]
    expect(resolveNext(states, new Set(['blocking-changes', 'tasks']), 'a')).toBeUndefined()
  })

  test("a cospec change's JSON next and its human Next: line are the same command", async () => {
    const cwd = repo()
    const dir = writeChange(cwd, 'alpha', 'feat', { 'proposal.md': '# p\n' })
    const status = computeStatus(cwd, { id: 'alpha', dir, schema: 'feat' })
    expect(status.next).toBe('cospec instructions blocking-changes --change alpha')
    const out: string[] = []
    const write = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string) => {
      out.push(chunk)
      return true
    }) as typeof process.stdout.write
    try {
      expect(await statusRun(ctx(cwd, ['--change', 'alpha'], { command: 'status' }))).toBe(0)
    } finally {
      process.stdout.write = write
    }
    expect(out.join('').endsWith(`Next: ${status.next}\n`)).toBe(true)
  })

  test('a skip_specs feat change reads its absent specs as skipped', () => {
    const cwd = repo()
    const dir = writeChange(cwd, 'skip', 'feat', {
      'proposal.md': '# p\n',
      'blocking-changes.md': '# d\n',
      'verification.md': '# v\n',
      'tasks.md': '## 1. W\n\n- [ ] 1.1 t\n',
    })
    const status = computeStatus(cwd, {
      id: 'skip',
      dir,
      schema: 'feat',
      skipSpecs: true,
      schemaVersion: 2,
    })
    expect(status.next).toBe('cospec apply skip')
  })
})

describe('every relayed binary diagnostic is spelled cospec (verification 16.13)', () => {
  const NOT_FOUND =
    "Change 'todo' not found. No changes exist. Create one with: openspec new change <name>"
  const BARE = /(?<![\w./-])openspec\s+[a-z][\w-]*/
  const failure = {
    status: [{ severity: 'error', code: 'change_error', message: NOT_FOUND, fix: NOT_FOUND }],
  }

  test('the text relay reads respelled messages', () => {
    const messages = upstreamFailure(failure)!.map((d) => d.message)
    expect(messages).toEqual([respellRemedies(NOT_FOUND)])
    expect(messages[0]).not.toMatch(BARE)
    expect(messages[0]).not.toBe(NOT_FOUND)
  })

  test('the --json relay respells status[] message and fix, singly and in the sweep', () => {
    const want = {
      ...failure.status[0],
      message: respellRemedies(NOT_FOUND),
      fix: respellRemedies(NOT_FOUND),
    }
    expect(respelledUpstream(failure)).toEqual({ status: [want] })
    const sweep = { changes: [{ changeName: 'todo', ...failure }], root: null }
    expect(respelledUpstream(sweep)).toEqual({
      changes: [{ changeName: 'todo', status: [want] }],
      root: null,
    })
    expect(JSON.stringify(respelledUpstream(sweep))).not.toMatch(BARE)
  })
})
