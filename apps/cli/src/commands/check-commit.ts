// `cospec check-commit <msg-file>` (hidden; DESIGN §7) — the commit-msg hook
// entrypoint. Structural linting is commitlint's job (it runs first in the same
// hook script); this adds ONE heuristic: if the staged files touch exactly one
// active change dir and the commit-header type disagrees with that change's
// schema, print a WARNING. It NEVER blocks — exit 0 always (a change's
// implementation may legitimately include a `test:`/`docs:` commit).

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { readOpenspecYaml } from '../core/change.ts'

/** Conventional-commit header: `type(scope)!: subject`. */
const HEADER_RE = /^([a-z]+)(?:\([^)]*\))?!?:\s/
/** git's `Revert "…"` template (a revert of any prior commit). */
const REVERT_RE = /^Revert\s+"/

/** The commit type declared by the header, or undefined if unrecognized. */
function headerType(message: string): string | undefined {
  for (const raw of message.split('\n')) {
    const line = raw.trim()
    if (line.length === 0 || line.startsWith('#')) continue
    if (REVERT_RE.test(line)) return 'revert'
    return HEADER_RE.exec(line)?.[1]
  }
  return undefined
}

/** Distinct active-change dir names touched by the staged file list. */
function stagedChangeDirs(files: string[]): Set<string> {
  const dirs = new Set<string>()
  for (const f of files) {
    const m = /^openspec\/changes\/([^/]+)\//.exec(f)
    if (m !== null && m[1] !== 'archive') dirs.add(m[1]!)
  }
  return dirs
}

async function stagedFiles(cwd: string): Promise<string[]> {
  try {
    const proc = Bun.spawn(['git', 'diff', '--cached', '--name-only'], {
      cwd,
      stdout: 'pipe',
      stderr: 'ignore',
    })
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    if (code !== 0) return []
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
  } catch {
    return []
  }
}

export async function run(ctx: CommandContext): Promise<number> {
  const msgFile = ctx.args.find((a) => !a.startsWith('-'))
  if (msgFile === undefined || !existsSync(msgFile)) return 0

  const type = headerType(readFileSync(msgFile, 'utf8'))
  if (type === undefined) return 0

  const dirs = stagedChangeDirs(await stagedFiles(ctx.cwd))
  // Multi-change and no-change commits are never flagged (§7 step 2).
  if (dirs.size !== 1) return 0

  const [name] = [...dirs]
  const changeDir = join(ctx.cwd, 'openspec', 'changes', name!)
  const yaml = readOpenspecYaml(changeDir)
  if (yaml === undefined) return 0

  if (yaml.schema !== type)
    process.stderr.write(
      `cospec check-commit: commit type '${type}' does not match change '${name}' ` +
        `(schema: ${yaml.schema}). If this commit is not part of that change, ignore this.\n`,
    )
  return 0
}
