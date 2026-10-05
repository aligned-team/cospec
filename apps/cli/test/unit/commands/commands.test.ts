import { afterAll, describe, expect, test } from 'bun:test'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CommandContext } from '../../../src/cli.ts'
import { run as instructionsRun } from '../../../src/commands/instructions.ts'
import { run as listRun } from '../../../src/commands/list.ts'
import {
  cospecSchemaInstalled,
  run as newRun,
  slugify,
  wrappedNewReason,
} from '../../../src/commands/new.ts'
import {
  computeStatus,
  gateLabel,
  hasAnyArtifact,
  run as statusRun,
} from '../../../src/commands/status.ts'
import { run as validateRun } from '../../../src/commands/validate.ts'
import { userSchemasDir } from '../../../src/core/change-metadata.ts'
import { commandRow, parseCommandArgs } from '../../../src/core/command-table.ts'
import { withEmptyMachineState } from '../../fixtures/support.ts'
import {
  ctx,
  DONE_TASKS,
  EMPTY_BLOCKERS,
  LITE_PROPOSAL,
  makeRepo,
  runCmd,
  writeArchived,
  writeChange,
} from './helpers.ts'

const roots: string[] = []
// An empty home for every user-level schema lookup here, so a schema the
// suite's own user has installed (`~/.local/share/openspec/schemas`,
// `$XDG_DATA_HOME/openspec/schemas`) never answers for the repo.
const SANDBOX_HOME = mkdtempSync(join(tmpdir(), 'cospec-home-'))
roots.push(SANDBOX_HOME)
const newIn = (context: CommandContext): Promise<number> =>
  newRun(context, { env: {}, home: SANDBOX_HOME })
function repo(schema?: string): string {
  const dir = makeRepo(schema)
  roots.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

describe('new: slugify', () => {
  test('derives kebab slugs from free text', () => {
    expect(slugify('add a greeting endpoint')).toBe('add-a-greeting-endpoint')
    expect(slugify('  Fix the Release Workflow!! ')).toBe('fix-the-release-workflow')
  })
  test('strips leading non-letters so the slug grammar holds', () => {
    expect(slugify('123 go')).toBe('go')
  })
  test('undefined when nothing usable remains', () => {
    expect(slugify('12345')).toBeUndefined()
    expect(slugify('   ')).toBeUndefined()
  })
})

describe("new: a failed wrapped new change's reason", () => {
  const result = (stdout: string, stderr = '') => ({ stdout, stderr, exitCode: 1 })
  test("takes its --json document's first status message", () => {
    const doc = JSON.stringify({
      change: null,
      status: [
        { severity: 'error', code: 'change_error', message: "Failed to parse schema at 'x'\n" },
      ],
    })
    expect(wrappedNewReason(result(doc))).toBe("Failed to parse schema at 'x'")
  })
  // On EACCES/ENOTDIR the binary logs a stat warning to stdout ahead of its
  // --json document (`change-utils.js` directoryExists), so stdout is not one
  // document: its reason is still that document's message.
  test('takes the document that follows a warning line on stdout', () => {
    const message = "EACCES: permission denied, mkdir '/w/my openspec list dir/openspec/changes/y'"
    const doc = JSON.stringify(
      { change: null, status: [{ severity: 'error', code: 'change_error', message }] },
      null,
      2,
    )
    const stdout = `Unable to check if directory exists at /w/my openspec list dir/openspec/changes/y: EACCES: permission denied, stat '/w/my openspec list dir/openspec/changes/y'\n${doc}\n`
    expect(wrappedNewReason(result(stdout))).toBe(message)
  })
  test('falls back to stderr without color codes or its error prefix', () => {
    expect(wrappedNewReason(result('', "\x1b[31m✖ Error: Schema 'nope' not found\x1b[39m\n"))).toBe(
      "Schema 'nope' not found",
    )
    expect(wrappedNewReason(result('', 'boom\n'))).toBe('boom')
    expect(wrappedNewReason(result('', ''))).toBeUndefined()
  })
  // Only upstream's own sentences are respelled (`core/remedies.ts`), each
  // verbatim; their holes (a list, a path) are relayed as captured.
  test("spells each of upstream's own remedy sentences it holds through cospec", () => {
    const doc = JSON.stringify({
      change: null,
      status: [
        {
          message:
            'No OpenSpec root found in the current directory or its ancestors. Registered stores: st1, st2. Pass --store <id> to use one, or run openspec init to create a local root.',
        },
      ],
    })
    expect(wrappedNewReason(result(doc))).toBe(
      'No OpenSpec root found in the current directory or its ancestors. Registered stores: st1, st2. Pass --store <id> to use one, or run cospec init to create a local root.',
    )
  })
  // A schema's own content and path are the user's: only the remedy spellings
  // ahead of the binary's parse-error payload are respelled.
  test("leaves a schema parse error's path and quoted excerpt untouched", () => {
    const payloads = [
      "Failed to parse schema at '/w/openspec new/schemas/broken/schema.yaml': Flow sequence in block collection must be sufficiently indented and end with a ] at line 3, column 1:\n\ndescription: run openspec init first\ninstruction: `openspec status --change x`\n",
      "Invalid schema at '/w/openspec/schemas/s1/schema.yaml': artifacts.0.id: Expected 'openspec list' to be a kebab-case id; see openspec schema validate",
    ]
    for (const payload of payloads) {
      const doc = JSON.stringify({ change: null, status: [{ message: payload }] })
      expect(wrappedNewReason(result(doc))).toBe(payload.trim())
      const stderr = `\x1b[31m✖ Error: ${payload}\x1b[39m\n`
      expect(wrappedNewReason(result('', stderr))).toBe(payload.trim())
    }
    // An upstream sentence ahead of the payload is still respelled; the
    // payload is not, even where the user's schema copies one verbatim.
    const mixed =
      "Run openspec init to create a root here. Failed to parse schema at '/w/s.yaml': Run openspec init to create a root here."
    const doc = JSON.stringify({ change: null, status: [{ message: mixed }] })
    expect(wrappedNewReason(result(doc))).toBe(
      "Run cospec init to create a root here. Failed to parse schema at '/w/s.yaml': Run openspec init to create a root here.",
    )
  })
  // Text that is not one of upstream's sentences is relayed verbatim, however
  // remedy-like its wording (no lead-in, quote or backtick is a trigger).
  test('respells only an upstream sentence, never prose that names a command', () => {
    const prose = 'openspec widgets are not openspec store setup or `openspec status --change x`'
    const remedy =
      'Create it with `openspec instructions proposal --change x` (`openspec status --change x` shows what is left).'
    const doc = JSON.stringify({ change: null, status: [{ message: `${prose}. ${remedy}` }] })
    expect(wrappedNewReason(result(doc))).toBe(
      `${prose}. Create it with \`cospec instructions proposal --change x\` (\`cospec status --change x\` shows what is left).`,
    )
  })
  // The binary quotes every path it reports (`mkdir '<path>'`) and ends an
  // existing change's message with its path: a directory named after a
  // command is still the user's.
  test('leaves a quoted path and the path after "already exists at" untouched', () => {
    const reasons = [
      "EACCES: permission denied, mkdir '/w/my openspec list dir/openspec/changes/y'",
      "EEXIST: file already exists, mkdir 'openspec new/openspec/changes/z'",
      "ENOTDIR: not a directory, mkdir '/w/run openspec init/openspec/changes/z'",
      "Change 'x' already exists at /w/a openspec list/b openspec new/c openspec init/openspec/changes/x",
    ]
    for (const reason of reasons) {
      const doc = JSON.stringify({ change: null, status: [{ message: reason }] })
      expect(wrappedNewReason(result(doc))).toBe(reason)
      expect(wrappedNewReason(result('', `\x1b[31m✖ Error: ${reason}\x1b[39m\n`))).toBe(reason)
    }
  })
  // Free text is never pattern-matched: a path that happens to read like a
  // remedy stays the user's, quoted or not, whatever it contains.
  test('leaves a path that reads like a remedy untouched, quoted or not', () => {
    const reasons = [
      "EACCES: permission denied, mkdir '/w/Bob's run openspec init dir/openspec/changes/y'",
      'Invalid store declaration in /w/run openspec init/openspec/config.yaml: the store key is not a string.',
      'Invalid store declaration in /w/a (openspec list)/openspec/config.yaml: the store key is not a string.',
    ]
    for (const reason of reasons) {
      const doc = JSON.stringify({ change: null, status: [{ message: reason }] })
      expect(wrappedNewReason(result(doc))).toBe(reason)
      expect(wrappedNewReason(result('', `\x1b[31m✖ Error: ${reason}\x1b[39m\n`))).toBe(reason)
    }
  })
  // A sentence's hole is re-emitted unread: a path in it that reads like a
  // remedy is still the user's.
  test("respells upstream's store remedies, never the path a sentence names", () => {
    const pairs = [
      [
        'Run openspec store setup s1 or openspec store register <path> first.',
        'Run cospec store setup s1 or cospec store register <path> first.',
      ],
      [
        'Pass a registered store id, or run openspec store list.',
        'Pass a registered store id, or run cospec store list.',
      ],
      [
        "Register the store (openspec store register <path> --id s1) or edit /w/Bob's run openspec init/openspec/config.yaml to name a registered store.",
        "Register the store (cospec store register <path> --id s1) or edit /w/Bob's run openspec init/openspec/config.yaml to name a registered store.",
      ],
    ]
    for (const [reason, respelled] of pairs) {
      const doc = JSON.stringify({ change: null, status: [{ message: reason }] })
      expect(wrappedNewReason(result(doc))).toBe(respelled!)
      expect(wrappedNewReason(result('', `\x1b[31m✖ Error: ${reason}\x1b[39m\n`))).toBe(respelled!)
    }
  })
})

describe('new: where the wrapped binary resolves a user-level schema', () => {
  test('userSchemasDir follows its global data dir, never ~/.config', () => {
    expect(userSchemasDir({ XDG_DATA_HOME: '/x' }, '/h', 'darwin')).toBe('/x/openspec/schemas')
    expect(userSchemasDir({ XDG_DATA_HOME: '' }, '/h', 'linux')).toBe(
      '/h/.local/share/openspec/schemas',
    )
    expect(userSchemasDir({}, '/h', 'darwin')).toBe('/h/.local/share/openspec/schemas')
    expect(userSchemasDir({ LOCALAPPDATA: '/l' }, '/h', 'win32')).toBe(
      join('/l', 'openspec', 'schemas'),
    )
    expect(userSchemasDir({}, '/h', 'win32')).toBe(
      join('/h', 'AppData', 'Local', 'openspec', 'schemas'),
    )
  })

  test('a project schema or a user-level one counts; a schema.yaml linked outside does not', () => {
    const cwd = repo()
    const data = mkdtempSync(join(tmpdir(), 'cospec-data-'))
    roots.push(data)
    const user = join(data, 'openspec', 'schemas')
    // The data dir alone decides, whatever the suite's own home holds.
    const installed = (): boolean =>
      cospecSchemaInstalled(cwd, 'feat', { XDG_DATA_HOME: data }, SANDBOX_HOME)
    expect(installed()).toBe(true)
    cpSync(join(cwd, 'openspec', 'schemas', 'feat'), join(user, 'feat'), { recursive: true })
    rmSync(join(cwd, 'openspec', 'schemas', 'feat'), { recursive: true })
    expect(installed()).toBe(true)
    rmSync(join(user, 'feat', 'schema.yaml'))
    symlinkSync(
      join(cwd, 'openspec', 'schemas', 'fix', 'schema.yaml'),
      join(user, 'feat', 'schema.yaml'),
    )
    expect(installed()).toBe(false)
    rmSync(join(user, 'feat'), { recursive: true })
    expect(installed()).toBe(false)
  })

  test('with no $XDG_DATA_HOME the home directory decides', () => {
    const cwd = repo()
    const home = mkdtempSync(join(tmpdir(), 'cospec-home-'))
    roots.push(home)
    const user = join(home, '.local', 'share', 'openspec', 'schemas')
    cpSync(join(cwd, 'openspec', 'schemas', 'feat'), join(user, 'feat'), { recursive: true })
    rmSync(join(cwd, 'openspec', 'schemas', 'feat'), { recursive: true })
    expect(cospecSchemaInstalled(cwd, 'feat', {}, home)).toBe(true)
    expect(cospecSchemaInstalled(cwd, 'feat', {}, SANDBOX_HOME)).toBe(false)
  })
})

describe('new: validation before delegation', () => {
  test('no openspec/ directory exits 1 with an actionable init hint', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'cospec-noinit-'))
    roots.push(cwd)
    const r = await withEmptyMachineState(() =>
      runCmd(newIn, ctx(cwd, ['feat', 'foo'], { command: 'new' })),
    )
    expect(r.code).toBe(1)
    expect(r.err).toContain('no openspec/ directory')
    expect(r.err).toContain("run 'cospec init' first")
    // Must not leak the internal wrapped-openspec spawn command / exit code.
    expect(r.err).not.toContain('openspec new change')
    expect(r.err).not.toContain('exited')
  })

  test('a cospec type with no installed schema exits 1 naming the setup, not the wrapped call', async () => {
    const cwd = repo()
    rmSync(join(cwd, 'openspec', 'schemas', 'feat'), { recursive: true })
    const r = await runCmd(newIn, ctx(cwd, ['feat', 'foo'], { command: 'new' }))
    expect(r.code).toBe(1)
    expect(r.err).toBe(
      "cospec new: schema 'feat' is not installed in this repo — run 'cospec init' first\n",
    )
    expect(r.err).not.toContain('wrapped')
  })

  test("the missing-schema refusal under --json is one document in new change's shape", async () => {
    const cwd = repo()
    rmSync(join(cwd, 'openspec', 'schemas', 'feat'), { recursive: true })
    const r = await runCmd(newIn, ctx(cwd, ['feat', 'foo'], { command: 'new', json: true }))
    expect(r.code).toBe(1)
    expect(r.err).toBe('')
    expect(r.out).toBe(
      `${JSON.stringify(
        {
          change: null,
          status: [
            {
              severity: 'error',
              code: 'change_error',
              message: "schema 'feat' is not installed in this repo — run 'cospec init' first",
            },
          ],
        },
        null,
        2,
      )}\n`,
    )
  })

  test('unknown type exits 1 with a suggestion and the table', async () => {
    const cwd = repo()
    const r = await runCmd(newIn, ctx(cwd, ['feaf', 'x'], { command: 'new' }))
    expect(r.code).toBe(1)
    expect(r.err).toContain("unknown type 'feaf'")
    expect(r.err).toContain("Did you mean 'feat'")
    expect(r.err).toContain('Valid types:')
  })

  test('invalid slug exits 1', async () => {
    const cwd = repo()
    const r = await runCmd(newIn, ctx(cwd, ['ci', 'Bad_Slug'], { command: 'new' }))
    expect(r.code).toBe(1)
    expect(r.err).toContain('invalid slug')
  })

  test('collision with an active change exits 1', async () => {
    const cwd = repo()
    writeChange(cwd, 'dup', 'ci')
    const r = await runCmd(newIn, ctx(cwd, ['ci', 'dup'], { command: 'new' }))
    expect(r.code).toBe(1)
    expect(r.err).toContain('already exists')
  })

  test('collision with an archive-entry suffix exits 1', async () => {
    const cwd = repo()
    writeArchived(cwd, '2026-06-01-shipped', 'ci')
    const r = await runCmd(newIn, ctx(cwd, ['ci', 'shipped'], { command: 'new' }))
    expect(r.code).toBe(1)
    expect(r.err).toContain('collides with an archived change')
  })

  test("under --json every own refusal is one document in new change's shape", async () => {
    const doc = (message: string): string =>
      `${JSON.stringify(
        { change: null, status: [{ severity: 'error', code: 'change_error', message }] },
        null,
        2,
      )}\n`
    const bare = mkdtempSync(join(tmpdir(), 'cospec-noinit-'))
    roots.push(bare)
    const cwd = repo()
    writeChange(cwd, 'dup', 'ci')
    writeArchived(cwd, '2026-06-01-shipped', 'ci')
    const cases: [string, string[], string][] = [
      [bare, ['feat', 'foo'], "no openspec/ directory — run 'cospec init' first"],
      [
        cwd,
        ['feaf', 'x'],
        "unknown type 'feaf' — did you mean 'feat'? Valid types: " +
          'build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test',
      ],
      [
        cwd,
        ['ci: !!!'],
        "could not derive a slug from '!!!' — pass an explicit slug: cospec new ci <slug>",
      ],
      [
        cwd,
        ['ci', 'Bad_Slug'],
        "invalid slug 'Bad_Slug' — must match ^[a-z][a-z0-9]*(-[a-z0-9]+)*$",
      ],
      [cwd, ['ci', 'dup'], "change 'dup' already exists in openspec/changes/"],
      [
        cwd,
        ['ci', 'shipped'],
        "'shipped' collides with an archived change suffix — choose a different slug",
      ],
    ]
    for (const [dir, args, message] of cases) {
      // oxlint-disable-next-line no-await-in-loop -- each run writes the shared process streams
      const r = await runCmd(newIn, ctx(dir, args, { command: 'new', json: true }))
      expect(r.code, args.join(' ')).toBe(1)
      expect(r.err, args.join(' ')).toBe('')
      expect(r.out, args.join(' ')).toBe(doc(message))
    }
  })
})

describe('status', () => {
  test('empty change renders "in progress", never Unknown item', async () => {
    const cwd = repo()
    writeChange(cwd, 'bare', 'feat')
    const r = await runCmd(statusRun, ctx(cwd, ['--change', 'bare'], { command: 'status' }))
    expect(r.code).toBe(0)
    expect(r.out).toContain('in progress — no artifacts yet')
    expect(r.out).toContain('cospec instructions proposal --change bare')
  })

  test('unknown change exits 1 with a suggestion', async () => {
    const cwd = repo()
    writeChange(cwd, 'add-widget', 'feat')
    const r = await runCmd(statusRun, ctx(cwd, ['--change', 'add-widgets'], { command: 'status' }))
    expect(r.code).toBe(1)
    expect(r.err).toContain("Did you mean 'add-widget'")
  })

  test('under --json every refusal and the no-changes answer is one document', async () => {
    const cwd = repo()
    const none = await runCmd(statusRun, ctx(cwd, [], { json: true, command: 'status' }))
    expect(none.code).toBe(0)
    expect(JSON.parse(none.out)).toMatchObject({ changes: [], message: 'No active changes.' })

    writeChange(cwd, 'add-widget', 'feat')
    const unknown = await runCmd(
      statusRun,
      ctx(cwd, ['--change', 'add-widgets'], { json: true, command: 'status' }),
    )
    expect(unknown.code).toBe(1)
    expect(unknown.err).toBe('')
    expect(JSON.parse(unknown.out)).toEqual({
      status: [
        {
          severity: 'error',
          code: 'change_error',
          message: "unknown change 'add-widgets'. Did you mean 'add-widget'?",
        },
      ],
    })

    writeChange(cwd, 'second', 'ci')
    const required = await runCmd(statusRun, ctx(cwd, [], { json: true, command: 'status' }))
    expect(required.code).toBe(1)
    expect(required.err).toBe('')
    expect(JSON.parse(required.out)).toEqual({
      status: [
        {
          severity: 'error',
          code: 'change_error',
          message: '--change <id> is required. Active changes: add-widget, second',
        },
      ],
    })
  })

  test('computeStatus reports artifacts, gate, and archive-readiness', () => {
    const cwd = repo()
    const dir = writeChange(cwd, 'c', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    const status = computeStatus(cwd, { id: 'c', dir, schema: 'ci' })
    expect(status.type).toBe('ci')
    expect(status.gate).toBe('clear')
    expect(status.tasks).toEqual({ total: 1, complete: 1 })
    expect(status.archiveReady).toBe(true)
    const specs = status.artifacts.find((a) => a.id === 'proposal')
    expect(specs?.done).toBe(true)
    // Every artifact is done, so every artifact's deps are satisfied.
    expect(status.artifacts.every((a) => a.ready)).toBe(true)
  })

  test('ready reflects the dependency graph — deps unmet means not ready', () => {
    const cwd = repo()
    // blocking-changes present but proposal (its only dep) is missing.
    const dir = writeChange(cwd, 'partial', 'ci', {
      'blocking-changes.md': EMPTY_BLOCKERS,
    })
    const status = computeStatus(cwd, { id: 'partial', dir, schema: 'ci' })
    const byId = (id: string) => status.artifacts.find((a) => a.id === id)!
    // proposal has no deps → ready even though it is not written yet.
    expect(byId('proposal')).toMatchObject({ done: false, ready: true })
    // blocking-changes requires proposal, which is not done → not ready.
    expect(byId('blocking-changes')).toMatchObject({ done: true, ready: false })
    // tasks requires proposal → not ready.
    expect(byId('tasks')).toMatchObject({ done: false, ready: false })
  })

  test('feat tasks stay not-ready until specs exists (dependency graph)', () => {
    const cwd = repo()
    // feat: tasks requires [proposal, specs]; design requires [proposal].
    const dir = writeChange(cwd, 'f', 'feat', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
    })
    const status = computeStatus(cwd, { id: 'f', dir, schema: 'feat' })
    const byId = (id: string) => status.artifacts.find((a) => a.id === id)!
    expect(byId('specs').ready).toBe(true) // only needs proposal (done)
    expect(byId('design').ready).toBe(true) // only needs proposal (done)
    expect(byId('tasks').ready).toBe(false) // needs specs, which is not written
  })

  test('human output marks each unwritten artifact ready or waiting', async () => {
    const cwd = repo()
    writeChange(cwd, 'partial', 'ci', { 'blocking-changes.md': EMPTY_BLOCKERS })
    const r = await runCmd(statusRun, ctx(cwd, ['--change', 'partial'], { command: 'status' }))
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/proposal.*ready/)
    expect(r.out).toMatch(/tasks.*waiting/)
  })

  test('archiveReady is false while a hard blocker is unchecked', () => {
    const cwd = repo()
    const dir = writeChange(cwd, 'c', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': `## Blocked by\n\n- [ ] \`dep\` — needed\n\n## Soft-blocked by\n\nNone.\n`,
      'tasks.md': DONE_TASKS,
    })
    writeChange(cwd, 'dep', 'ci')
    const status = computeStatus(cwd, { id: 'c', dir, schema: 'ci' })
    expect(status.gate).toBe('blocked (1 hard)')
    expect(status.archiveReady).toBe(false)
  })

  test('gateLabel formats each state', () => {
    expect(gateLabel({ state: 'clear', hard: [], soft: [] })).toBe('clear')
    expect(gateLabel({ state: 'blocked', hard: [{ slug: 'a', active: true }], soft: [] })).toBe(
      'blocked (1 hard)',
    )
    expect(
      gateLabel({ state: 'soft-blocked', hard: [], soft: [{ slug: 'a', active: false }] }),
    ).toBe('soft-blocked (1)')
  })

  test('hasAnyArtifact detects specs-only changes', () => {
    const cwd = repo()
    const dir = writeChange(cwd, 'c', 'feat', { 'specs/w/spec.md': 'x' })
    expect(hasAnyArtifact(dir)).toBe(true)
    const empty = writeChange(cwd, 'e', 'feat')
    expect(hasAnyArtifact(empty)).toBe(false)
  })
})

describe('status --all (OpenSpec 1.11 parity)', () => {
  test('--all and --change are mutually exclusive', async () => {
    const cwd = repo()
    const r = await runCmd(
      statusRun,
      ctx(cwd, ['--all', '--change', 'bare'], { command: 'status' }),
    )
    expect(r.code).toBe(1)
    expect(r.err).toContain('--all and --change options are mutually exclusive')
  })

  test('--json turns the mutex error into a JSON envelope on stdout', async () => {
    // A caller that asked for JSON must always get something parseable — a
    // bare stderr line leaves it with nothing to parse.
    const cwd = repo()
    const r = await runCmd(
      statusRun,
      ctx(cwd, ['--all', '--change', 'bare'], { json: true, command: 'status' }),
    )
    expect(r.code).toBe(1)
    expect(r.err).toBe('')
    expect(JSON.parse(r.out)).toEqual({
      changes: [],
      root: null,
      error: 'The --all and --change options are mutually exclusive.',
    })
  })

  test('a positional change name beside --all or --change is an excess argument, as upstream', () => {
    const status = commandRow('status')
    if (status?.parse !== 'table') throw new Error('status is a table row')
    for (const args of [
      ['--all', 'bare'],
      ['bare', '--change', 'other'],
      ['--change', 'other', 'bare'],
    ]) {
      const result = parseCommandArgs(status, args)
      expect(result.ok, args.join(' ')).toBe(false)
      if (!result.ok)
        expect(result.refusal.message).toBe(
          'cospec status: too many arguments. Expected 0 arguments but got 1.\n',
        )
    }
    expect(parseCommandArgs(status, ['bare']).ok).toBe(true)
  })

  test('no active changes: reports the empty case and exits 0', async () => {
    const cwd = repo()
    const r = await runCmd(statusRun, ctx(cwd, ['--all'], { command: 'status' }))
    expect(r.code).toBe(0)
    expect(r.out).toContain('no active changes')
  })

  test('--all --json sweeps every change, sorted by id, in one envelope', async () => {
    const cwd = repo()
    writeChange(cwd, 'zeta', 'ci')
    writeChange(cwd, 'alpha', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    const r = await runCmd(statusRun, ctx(cwd, ['--all'], { json: true, command: 'status' }))
    expect(r.code).toBe(0)
    const parsed = JSON.parse(r.out) as { changes: { change: string }[]; root: unknown }
    expect(parsed.changes.map((c) => c.change)).toEqual(['alpha', 'zeta'])
    // BREAKING (cli-surface-parity): the binary's {path, source} object, not a path string.
    expect(parsed.root).toEqual({ path: realpathSync(cwd), source: 'nearest' })
  })

  test('single-change JSON shape is unchanged by the --all addition', async () => {
    const cwd = repo()
    const dir = writeChange(cwd, 'c', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    const single = await runCmd(
      statusRun,
      ctx(cwd, ['--change', 'c'], { json: true, command: 'status' }),
    )
    const swept = await runCmd(statusRun, ctx(cwd, ['--all'], { json: true, command: 'status' }))
    const sweptParsed = JSON.parse(swept.out) as { changes: unknown[] }
    // A sweep entry is the single document without its top-level `root`, which
    // the sweep carries once, as the binary's `status --all --json` does.
    const { root, ...entry } = JSON.parse(single.out) as Record<string, unknown>
    expect(root).toEqual({ path: realpathSync(cwd), source: 'nearest' })
    expect(sweptParsed.changes).toEqual([entry])
    expect(computeStatus(cwd, { id: 'c', dir, schema: 'ci' }).change).toBe('c')
  })

  test('one bad change does not abort the sweep — it becomes a failure entry, exit 1', async () => {
    const cwd = repo()
    writeChange(cwd, 'good', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    // A change directory with a blocking-changes.md that hasAnyArtifact sees but
    // whose content computeStatus's blocker parse can't make sense of is hard to
    // provoke deterministically; instead corrupt the artifact-presence path by
    // making blocking-changes.md a directory, so `readFileSync` throws in
    // `computeStatus`'s gate lookup.
    const badDir = writeChange(cwd, 'bad', 'ci', { 'proposal.md': LITE_PROPOSAL })
    mkdirSync(join(badDir, 'blocking-changes.md'))

    const r = await runCmd(statusRun, ctx(cwd, ['--all'], { json: true, command: 'status' }))
    expect(r.code).toBe(1)
    const parsed = JSON.parse(r.out) as {
      changes: ({ change: string; error: string } | { change: string })[]
    }
    const bad = parsed.changes.find((c) => c.change === 'bad') as { error?: string }
    expect(bad?.error).toBeDefined()
    const good = parsed.changes.find((c) => c.change === 'good') as { archiveReady?: boolean }
    expect(good?.archiveReady).toBe(true)
  })
})

describe('list', () => {
  test('renders one row per change; empty change shows "no artifacts yet"', async () => {
    const cwd = repo()
    writeChange(cwd, 'bare', 'ci')
    writeChange(cwd, 'ready', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    const r = await runCmd(listRun, ctx(cwd, [], { command: 'list' }))
    expect(r.code).toBe(0)
    expect(r.out).toContain('bare')
    expect(r.out).toContain('no artifacts yet')
    expect(r.out).toContain('ready')
    expect(r.out).toContain('archive-ready')
  })

  test("an untyped schema's own declared artifact decides its state, not cospec's fixed filenames", async () => {
    const cwd = repo()
    // A schema cospec doesn't type, whose artifact lives under a filename
    // none of cospec's own (proposal.md, tasks.md, ...) match.
    mkdirSync(join(cwd, 'openspec', 'schemas', 'rfc', 'templates'), { recursive: true })
    writeFileSync(
      join(cwd, 'openspec', 'schemas', 'rfc', 'schema.yaml'),
      [
        'name: rfc',
        'version: 1',
        'description: An rfc-style schema',
        'artifacts:',
        '  - id: doc',
        '    generates: doc.md',
        '    description: The RFC document',
        '    template: doc.md',
        '    instruction: Write the RFC.',
        '    requires: []',
        'apply:',
        '  requires: [doc]',
        '  tracks: null',
        '',
      ].join('\n'),
    )
    writeFileSync(join(cwd, 'openspec', 'schemas', 'rfc', 'templates', 'doc.md'), '# Doc\n')
    writeChange(cwd, 'r-doc', 'rfc', { 'doc.md': '# RFC\n' })
    writeChange(cwd, 'r-empty', 'rfc')

    const r = await runCmd(listRun, ctx(cwd, [], { json: true, command: 'list' }))
    expect(r.code).toBe(0)
    const parsed = JSON.parse(r.out) as { changes: { change: string; state: string }[] }
    expect(parsed.changes.find((c) => c.change === 'r-doc')?.state).toBe('building')
    expect(parsed.changes.find((c) => c.change === 'r-empty')?.state).toBe('in-progress')

    const text = await runCmd(listRun, ctx(cwd, [], { command: 'list' }))
    expect(text.out).toMatch(/r-doc\s+rfc/)
    expect(text.out).not.toMatch(/r-doc\s+rfc\s+clear\s+no artifacts yet/)
  })

  test('--blocked filters to gated changes', async () => {
    const cwd = repo()
    writeChange(cwd, 'clear-one', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    writeChange(cwd, 'blocked-one', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': `## Blocked by\n\n- [ ] \`dep\` — needed\n\n## Soft-blocked by\n\nNone.\n`,
      'tasks.md': DONE_TASKS,
    })
    const r = await runCmd(listRun, ctx(cwd, ['--blocked'], { json: true, command: 'list' }))
    const parsed = JSON.parse(r.out) as { changes: { change: string }[] }
    expect(parsed.changes.map((c) => c.change)).toEqual(['blocked-one'])
  })

  test('--specs delegates to `openspec list --specs` and renders a spec table', async () => {
    const cwd = repo()
    mkdirSync(join(cwd, 'openspec', 'specs', 'widget'), { recursive: true })
    writeFileSync(
      join(cwd, 'openspec', 'specs', 'widget', 'spec.md'),
      [
        '# widget Specification',
        '',
        '## Purpose',
        '',
        'Widgets exist to exercise `list --specs` in a fixture repo.',
        '',
        '## Requirements',
        '',
        '### Requirement: Widgets spin',
        '',
        'The system SHALL spin widgets.',
        '',
        '#### Scenario: A widget spins',
        '',
        '- **WHEN** a widget is asked to spin',
        '- **THEN** it spins',
        '',
      ].join('\n'),
    )

    const jsonResult = await runCmd(listRun, ctx(cwd, ['--specs'], { json: true, command: 'list' }))
    expect(jsonResult.code).toBe(0)
    const parsed = JSON.parse(jsonResult.out) as {
      specs: { id: string; requirementCount: number }[]
    }
    expect(parsed.specs).toEqual([{ id: 'widget', requirementCount: 1 }])

    const humanResult = await runCmd(listRun, ctx(cwd, ['--specs'], { command: 'list' }))
    expect(humanResult.code).toBe(0)
    expect(humanResult.out).toContain('widget')
    expect(humanResult.out).toContain('1 requirement')
  })
})

describe('instructions: argument handling', () => {
  // Upstream's `instructions [artifact]` is optional, and its action answers a
  // missing artifact or `--change` itself (change `upstream-spellings`).
  test('a missing artifact parses: the binary answers it', () => {
    const row = commandRow('instructions')
    if (row?.parse !== 'table') throw new Error("no table row 'instructions'")
    for (const args of [[], ['--change', 'x']]) {
      const result = parseCommandArgs(row, args)
      expect(result.ok, args.join(' ')).toBe(true)
    }
  })

  test("non-apply artifact without --change exits 1 with the binary's answer", async () => {
    const cwd = repo()
    const r = await runCmd(instructionsRun, ctx(cwd, ['proposal'], { command: 'instructions' }))
    expect(r.code).toBe(1)
    // The fixture has no changes, so the binary's answer is its new-change hint.
    expect(r.err).toContain('No changes found. Create one with: cospec new <type> <name>')
  })
})

describe('validate: validation before delegation', () => {
  test('no openspec/ directory exits 1 with an actionable init hint', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'cospec-noinit-'))
    roots.push(cwd)
    const r = await withEmptyMachineState(() =>
      runCmd(validateRun, ctx(cwd, [], { command: 'validate' })),
    )
    expect(r.code).toBe(1)
    expect(r.err).toContain('no openspec/ directory')
    expect(r.err).toContain("run 'cospec init' first")
  })
})
