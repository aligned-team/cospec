// Shared fixtures for the lifecycle-command tests. `makeRepo` materializes the
// 11 composed schemas the way `cospec init` does, so the real dependency-resolved
// openspec binary resolves them for the apply/archive integration tests.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { CommandContext } from '../../../src/cli.ts'
import { composeType, COSPEC_TYPES } from '../../../src/core/schema-compose.ts'

/** A temp repo with `openspec/{config.yaml,schemas/**,changes/archive}`. */
export function makeRepo(defaultSchema = 'feat'): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-cmd-'))
  mkdirSync(join(dir, 'openspec', 'changes', 'archive'), { recursive: true })
  mkdirSync(join(dir, 'openspec', 'specs'), { recursive: true })
  writeFileSync(join(dir, 'openspec', 'config.yaml'), `schema: ${defaultSchema}\n`)
  for (const type of COSPEC_TYPES) {
    const composed = composeType(type)
    const schemaDir = join(dir, 'openspec', 'schemas', type)
    mkdirSync(join(schemaDir, 'templates'), { recursive: true })
    writeFileSync(join(schemaDir, 'schema.yaml'), composed.schemaYaml)
    for (const [name, body] of Object.entries(composed.templates))
      writeFileSync(join(schemaDir, 'templates', name), body)
  }
  return dir
}

/** Write a change with its schema pointer and a map of relative artifact paths. */
export function writeChange(
  cwd: string,
  id: string,
  schema: string,
  files: Record<string, string> = {},
): string {
  const dir = join(cwd, 'openspec', 'changes', id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '.openspec.yaml'), `schema: ${schema}\ncreated: 2026-07-03\n`)
  for (const [rel, body] of Object.entries(files)) {
    const path = join(dir, rel)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, body)
  }
  return dir
}

/** Drop a date-prefixed archive entry (with the schema pointer that travels with it). */
export function writeArchived(cwd: string, dirName: string, schema = 'feat'): void {
  const dir = join(cwd, 'openspec', 'changes', 'archive', dirName)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '.openspec.yaml'), `schema: ${schema}\n`)
}

export function ctx(
  cwd: string,
  args: string[],
  opts: { json?: boolean; noColor?: boolean } = {},
): CommandContext {
  const noColor = opts.noColor ?? true
  return { args, cwd, flags: { json: opts.json ?? false, noColor, cwd } }
}

export interface CaptureResult {
  code: number
  out: string
  err: string
}

/** Run a command's `run`, capturing stdout/stderr and its exit code. */
export async function runCmd(
  run: (ctx: CommandContext) => number | Promise<number>,
  context: CommandContext,
): Promise<CaptureResult> {
  let out = ''
  let err = ''
  const origOut = process.stdout.write
  const origErr = process.stderr.write
  const sink =
    (target: 'out' | 'err') =>
    (chunk: unknown): boolean => {
      const text = typeof chunk === 'string' ? chunk : String(chunk)
      if (target === 'out') out += text
      else err += text
      return true
    }
  process.stdout.write = sink('out') as typeof process.stdout.write
  process.stderr.write = sink('err') as typeof process.stderr.write
  try {
    const code = await run(context)
    return { code, out, err }
  } finally {
    process.stdout.write = origOut
    process.stderr.write = origErr
  }
}

/** Standard valid blocking-changes.md with both sections empty. */
export const EMPTY_BLOCKERS = `# Dependencies

## Blocked by

None.

## Soft-blocked by

None.
`

export const LITE_PROPOSAL = `## Why

This change exists to exercise the lifecycle end to end in a test fixture repo.

## What Changes

- Something small

## Impact

- ci
`

export const DONE_TASKS = `## 1. Group

- [x] 1.1 do the thing
`
