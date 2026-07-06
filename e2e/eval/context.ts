// Shared scenario plumbing: sandbox lifecycle, a working-tree `cospec` runner,
// and small openspec-tree readers used by the deterministic scorers. Kept
// separate from run.ts so scenario modules import types without a cycle.

import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ARTIFACT_FILES,
  type ArtifactId,
  type CospecType,
  TYPE_ARTIFACTS,
} from '../../apps/cli/src/core/rules/type-facts.ts'
import {
  makeRunCommandTool,
  makeWriteFileTool,
  runAgentLoop,
  type AgentRun,
  type TranscriptStep,
} from './agent.ts'
import { redactText, type Sentinels } from './redact.ts'
import type { RubricItem } from './score.ts'

// Ceiling on model output tokens per turn. A single write_file call may carry a
// full artifact body (proposal + specs deltas run long); the DeepSeek default
// is too small and silently truncates the JSON tool-call arguments, which then
// fail to parse and waste a turn. 8k comfortably fits any one artifact.
export const MAX_TOKENS_PER_TURN = 8192

export interface EvalContext {
  repoRoot: string
  apiKey: string
  model: string
  baseUrl: string
  systemPrompt: string
  sentinels: Readonly<Record<string, string>>
  fetchImpl?: typeof fetch
}

export interface ScenarioOutcome {
  turns: number
  passed: Record<string, boolean>
  transcript: readonly TranscriptStep[]
}

export interface Scenario {
  id: string
  title: string
  rubric: readonly RubricItem[]
  execute: (ctx: EvalContext) => Promise<ScenarioOutcome>
}

export interface CospecResult {
  stdout: string
  stderr: string
  exitCode: number
}

export async function runCospec(
  sandbox: string,
  repoRoot: string,
  args: readonly string[],
): Promise<CospecResult> {
  const proc = Bun.spawn(['bun', 'run', join(repoRoot, 'apps/cli/src/index.ts'), '--', ...args], {
    cwd: sandbox,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, NO_COLOR: '1' },
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  return { stdout, stderr, exitCode }
}

/** Fresh temp git repo with the schemas materialized (no harness files). */
export async function createSandbox(repoRoot: string): Promise<string> {
  const sandbox = await mkdtemp(join(tmpdir(), 'cospec-eval-'))
  await Bun.spawn(['git', 'init', '-q'], { cwd: sandbox }).exited
  const init = await runCospec(sandbox, repoRoot, ['init', '.', '--harness', 'none', '--yes'])
  if (init.exitCode !== 0) {
    throw new Error(`cospec init failed in sandbox (exit ${init.exitCode})`)
  }
  return sandbox
}

export async function teardown(sandbox: string): Promise<void> {
  await rm(sandbox, { recursive: true, force: true })
}

/**
 * The non-`specs` artifact file names a type DECLARES (§3.2 matrix), derived
 * from `type-facts.ts` rather than hand-copied — a scenario hardcoding this
 * set drifts from the matrix and mis-scores `verification.md` as an
 * unexpected/forbidden file the moment a type's declared set changes. `specs`
 * is excluded since scenarios match it by directory prefix (`specs/**`), not
 * a fixed file name.
 */
export function declaredArtifactFiles(type: CospecType): ReadonlySet<string> {
  const declared = TYPE_ARTIFACTS[type].declared.filter(
    (id): id is Exclude<ArtifactId, 'specs'> => id !== 'specs',
  )
  return new Set(declared.map((id) => ARTIFACT_FILES[id]))
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** The single active change slug, or undefined if none / ambiguous. */
export async function activeChange(sandbox: string): Promise<string | undefined> {
  const changesDir = join(sandbox, 'openspec/changes')
  if (!(await exists(changesDir))) {
    return undefined
  }
  const entries = await readdir(changesDir, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory() && e.name !== 'archive').map((e) => e.name)
  return dirs.length === 1 ? dirs[0] : undefined
}

export interface ResolvedChange {
  slug: string
  dir: string
  archived: boolean
}

/**
 * The scenario's change, resolved whether it is still active or already
 * archived (archive moves the dir, so scoring runs after the fact must follow
 * it). The sandbox starts with an empty archive, so any archive entry is the
 * model's.
 */
export async function resolveChange(sandbox: string): Promise<ResolvedChange | undefined> {
  const active = await activeChange(sandbox)
  if (active !== undefined) {
    return { slug: active, dir: `openspec/changes/${active}`, archived: false }
  }
  const matches = (await archiveDirs(sandbox))
    .map((name) => ({ name, m: /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(name) }))
    .filter((x): x is { name: string; m: RegExpExecArray } => x.m !== null)
  const last = matches[matches.length - 1]
  const slug = last?.m[1]
  if (last === undefined || slug === undefined) {
    return undefined
  }
  return { slug, dir: `openspec/changes/archive/${last.name}`, archived: true }
}

export async function changeSchema(
  sandbox: string,
  changeDir: string,
): Promise<string | undefined> {
  const text = await readFileOr(sandbox, `${changeDir}/.openspec.yaml`)
  return text === undefined ? undefined : /^schema:\s*(\S+)/m.exec(text)?.[1]
}

/** Relative artifact-ish paths present under a change dir (excludes .openspec.yaml). */
export async function changeFiles(sandbox: string, changeDir: string): Promise<string[]> {
  const base = join(sandbox, changeDir)
  if (!(await exists(base))) {
    return []
  }
  const out: string[] = []
  const walk = async (dir: string, prefix: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      if (e.name === '.openspec.yaml') {
        continue
      }
      const rel = prefix === '' ? e.name : `${prefix}/${e.name}`
      if (e.isDirectory()) {
        await walk(join(dir, e.name), rel)
      } else {
        out.push(rel)
      }
    }
  }
  await walk(base, '')
  return out.toSorted()
}

export async function archiveDirs(sandbox: string): Promise<string[]> {
  const dir = join(sandbox, 'openspec/changes/archive')
  if (!(await exists(dir))) {
    return []
  }
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name)
}

export async function readFileOr(sandbox: string, rel: string): Promise<string | undefined> {
  const path = join(sandbox, rel)
  return (await exists(path)) ? Bun.file(path).text() : undefined
}

/** Concatenated text of every living spec.md (empty when none exist). */
export async function livingSpecText(sandbox: string): Promise<string> {
  const base = join(sandbox, 'openspec/specs')
  if (!(await exists(base))) {
    return ''
  }
  let text = ''
  const walk = async (dir: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        await walk(p)
      } else if (e.name.endsWith('.md')) {
        text += await Bun.file(p).text()
      }
    }
  }
  await walk(base)
  return text
}

/** Drive the model through one scenario against a sandbox. */
export async function driveAgent(
  ctx: EvalContext,
  sandbox: string,
  userPrompt: string,
  maxTurns: number,
): Promise<AgentRun> {
  return runAgentLoop({
    apiKey: ctx.apiKey,
    baseUrl: ctx.baseUrl,
    model: ctx.model,
    systemPrompt: ctx.systemPrompt,
    userPrompt,
    tools: [makeRunCommandTool(sandbox, ctx.repoRoot), makeWriteFileTool(sandbox)],
    maxTurns,
    maxTokens: MAX_TOKENS_PER_TURN,
    fetchImpl: ctx.fetchImpl,
  })
}

/**
 * Render a captured transcript as redacted Markdown for on-disk persistence.
 * Every model-authored or tool-echoed string passes through `redactText`, so
 * the API key and fixture-unique refs never land on disk even though the
 * transcript keeps the prose a diagnosis needs.
 */
export function formatTranscript(
  scenarioId: string,
  title: string,
  transcript: readonly TranscriptStep[],
  sentinels: Sentinels,
): string {
  const red = (s: string): string => redactText(s, sentinels)
  const lines: string[] = [`# ${scenarioId} — ${title}`, '', `Turns: ${transcript.length}`, '']
  for (const step of transcript) {
    lines.push(
      `## Turn ${step.turn}${step.truncated ? ' (OUTPUT TRUNCATED — hit max_tokens)' : ''}`,
    )
    if (step.assistantText.trim().length > 0) {
      lines.push('', '**assistant:**', '', red(step.assistantText.trim()))
    }
    for (let i = 0; i < step.calls.length; i += 1) {
      const call = step.calls[i]
      const result = step.results[i]
      if (call === undefined) {
        continue
      }
      lines.push('', `**tool call → \`${call.name}\`**`)
      const cmd = call.input['command']
      const path = call.input['path']
      const content = call.input['content']
      if (typeof cmd === 'string') {
        lines.push('', '```', red(cmd), '```')
      }
      if (typeof path === 'string') {
        lines.push('', `path: \`${red(path)}\``)
      }
      if (typeof content === 'string') {
        lines.push('', '```', red(content), '```')
      }
      if (result !== undefined) {
        const status = result.ok ? 'ok' : 'ERROR'
        const code = result.exitCode === undefined ? '' : ` exit=${result.exitCode}`
        lines.push('', `**result (${status}${code}):**`, '', '```', red(result.output), '```')
      }
    }
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}
