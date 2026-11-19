// The matrix (task 8.1): profile x delivery x harness, each cell running init, update and doctor
// in its own sandbox. The harness list is one row per distinct command surface, so a row added
// to HARNESS_TABLE with a new surface joins the matrix with no edit here. Each
// `profiles-matrix-<part>.test.ts` runs every `parts`-th row, so CI's shards and a local
// `--parallel` run's workers split the matrix instead of waiting on one file.

import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  commandPath,
  HARNESS_TABLE,
  type HarnessAdapter,
  skillPath,
} from '../../../src/harness/adapters.ts'
import {
  commandSurfaceCapability,
  type Delivery,
  shouldGenerateCommands,
  shouldGenerateSkills,
} from '../../../src/harness/delivery.ts'
import { cospec } from '../../fixtures/support.ts'
import { ALL_IDS, CORE_IDS, type DoctorFinding, files, MANIFEST, sandbox } from './profiles.ts'

// Every cell runs these as child processes; each part's test file reaches them through this
// module, so `bun test --changed` selects it.
import '../../../src/commands/doctor.ts'
import '../../../src/commands/init.ts'
import '../../../src/commands/update.ts'

/** Defines part `part` (1-based) of `parts`: every `parts`-th harness row of the matrix. */
export function profileMatrix(part: number, parts: number): void {
  describe(`the profile x delivery x harness matrix, part ${part} of ${parts}`, () => {
    // `flag` picks the profile on init's command line with no key in the global file, so nothing
    // persists it: `update` would then write all twelve, and only init and doctor are run.
    type ProfileCase = { name: string; config?: object; flag?: string; expected: string[] }
    const PROFILES: ProfileCase[] = [
      { name: 'unset', expected: ALL_IDS },
      { name: 'core', config: { profile: 'core' }, expected: CORE_IDS },
      { name: 'core by flag only', flag: 'core', expected: CORE_IDS },
      {
        name: 'custom with archive',
        config: { profile: 'custom', workflows: ['archive'] },
        expected: ['archive', 'sync-specs'],
      },
      {
        name: 'custom without archive',
        config: { profile: 'custom', workflows: ['explore', 'verify'] },
        expected: ['explore', 'verify'],
      },
    ]
    const DELIVERIES: (Delivery | undefined)[] = [undefined, 'skills', 'commands', 'both']

    const surfaceKey = (r: HarnessAdapter): string =>
      JSON.stringify([
        commandSurfaceCapability(r),
        r.commands?.serializer,
        r.commands?.namespacing,
        r.commands?.injectArguments,
        r.bodyDialect,
        r.skillDialect,
        r.skillsOnlyDialect,
        r.invocationPrefix,
        r.rulesPath !== undefined,
        r.skillsDir !== undefined,
      ])
    const seen = new Set<string>()
    const ROWS: HarnessAdapter[] = []
    for (const row of HARNESS_TABLE as readonly HarnessAdapter[]) {
      const key = surfaceKey(row)
      const named = ['claude', 'codex', 'opencode', 'agents', 'github-copilot'].includes(row.id)
      if (named || !seen.has(key)) ROWS.push(row)
      seen.add(key)
    }

    if (part === 1)
      test('the four named rows and the copilot row are in the matrix', () => {
        const ids = ROWS.map((r) => r.id)
        for (const id of ['claude', 'codex', 'opencode', 'agents', 'github-copilot'])
          expect(ids).toContain(id)
      })

    async function cell(row: HarnessAdapter, profile: ProfileCase, delivery?: Delivery) {
      const label = `${row.id} / ${profile.name} / delivery ${delivery ?? 'unset'}`
      const problems: string[] = []
      const config = {
        ...profile.config,
        ...(delivery === undefined ? {} : { delivery }),
      }
      const s = sandbox(Object.keys(config).length === 0 ? undefined : config)
      const run = (args: string[]) => cospec(args, { cwd: s.project, env: s.env })
      const effective: Delivery = delivery ?? 'both'
      const expectFiles = (phase: string): void => {
        for (const w of MANIFEST) {
          const want = profile.expected.includes(w.id)
          if (row.skillsDir !== undefined) {
            const have = existsSync(join(s.project, skillPath(row, w.skill)))
            const should = want && shouldGenerateSkills(row, effective)
            if (have !== should)
              problems.push(`${phase}: skill ${w.id} present=${have}, want ${should}`)
          }
          const cmd = commandPath(row, w.command)
          if (cmd !== undefined) {
            const have = existsSync(join(s.project, cmd))
            const should = want && shouldGenerateCommands(row, effective)
            if (have !== should)
              problems.push(`${phase}: command ${w.id} present=${have}, want ${should}`)
          }
        }
      }
      const init = await run([
        'init',
        '--harness',
        row.id,
        '--no-gate',
        ...(profile.flag === undefined ? [] : ['--profile', profile.flag]),
      ])
      if (init.exitCode !== 0)
        problems.push(`init exit ${init.exitCode}: ${init.stderr.slice(0, 200)}`)
      expectFiles('init')
      if (profile.flag === undefined) {
        const update = await run(['update', '--json'])
        if (update.exitCode !== 0) {
          problems.push(`update exit ${update.exitCode}: ${update.stderr.slice(0, 200)}`)
        } else {
          const moved = files(update.stdout).filter(
            (f) => !['unchanged', 'skipped'].includes(f.outcome),
          )
          if (moved.length > 0)
            problems.push(`update changed ${moved.map((f) => `${f.path}:${f.outcome}`).join(', ')}`)
        }
        expectFiles('update')
      }
      const doctor = await run(['doctor', '--json'])
      if (doctor.exitCode !== 0) problems.push(`doctor exit ${doctor.exitCode}`)
      const bad = (JSON.parse(doctor.stdout).findings as DoctorFinding[]).filter(
        (f) =>
          f.level === 'ERROR' ||
          f.check === 'drift' ||
          f.check === 'stale-harness' ||
          f.check === 'mixed-versions',
      )
      for (const f of bad) problems.push(`doctor ${f.level} ${f.check}: ${f.message.slice(0, 120)}`)
      return problems.map((p) => `${label}: ${p}`)
    }

    for (const row of ROWS.filter((_, i) => i % parts === part - 1)) {
      test(`${row.id}: every profile x delivery cell passes init, update and doctor`, async () => {
        const cells = PROFILES.flatMap((profile) => DELIVERIES.map((d) => cell(row, profile, d)))
        expect((await Promise.all(cells)).flat()).toEqual([])
      }, 300_000)
    }
  })
}
