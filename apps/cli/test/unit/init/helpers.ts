import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CommandContext } from '../../../src/cli.ts'
import { computeContentHash, CURRENT_GENERATED_BY } from '../../../src/core/managed-files.ts'

/** Create an isolated temp repo dir; caller cleans up via `cleanup`. */
export function makeRepo(): string {
  return mkdtempSync(join(tmpdir(), 'cospec-init-test-'))
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

/** Build a CommandContext for a command's `run`. */
export function ctx(cwd: string, args: string[] = [], json = false): CommandContext {
  return { args, flags: { json, noColor: true, cwd }, cwd }
}

/** Run a (sync) command entrypoint capturing stdout/stderr. */
export function capture(fn: () => number): { code: number; out: string; err: string } {
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  let out = ''
  let err = ''
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    out += chunk.toString()
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    err += chunk.toString()
    return true
  }) as typeof process.stderr.write
  try {
    const code = fn()
    return { code, out, err }
  } finally {
    process.stdout.write = origOut
    process.stderr.write = origErr
  }
}

/**
 * A byte-valid cospec-managed markdown file whose `metadata.contentHash` matches
 * its body — i.e. an "unmodified managed file" the write/remove layer will treat
 * as safe to overwrite or delete.
 */
export function managedMarkdown(name: string, body: string): string {
  const bodySection = `\n${body}\n`
  const hash = computeContentHash(bodySection)
  return (
    `---\nname: ${name}\nmetadata:\n  author: cospec\n` +
    `  generatedBy: "${CURRENT_GENERATED_BY}"\n  contentHash: "${hash}"\n---\n${bodySection}`
  )
}
