// DeepSeek tool-calling loop (DESIGN §8.4). Raw fetch against DeepSeek's own
// OpenAI-compatible chat/completions endpoint (research/eval-e2e.md §1.3) — no
// SDK, no OpenRouter. The loop drives a small model through the shipped skill
// bodies using two jailed tools; it records only what the deterministic rubric
// needs (tool names, inputs, exit codes, final text) — never raw completions in
// any object that reaches a report.

import { join, resolve } from 'node:path'

export interface ToolResult {
  output: string
  isError?: boolean
  exitCode?: number
}

export interface AgentTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  handler: (input: Record<string, unknown>) => Promise<ToolResult> | ToolResult
}

export interface ToolCallRecord {
  name: string
  input: Record<string, unknown>
  ok: boolean
  exitCode?: number
}

/**
 * One model turn captured for the human-readable transcript: the assistant's
 * text, the tool calls it made, and the result each call returned. Persisted
 * (redacted) so torn-down sandboxes leave a diagnosable trail (DESIGN §8.4).
 */
export interface TranscriptStep {
  turn: number
  assistantText: string
  calls: { name: string; input: Record<string, unknown> }[]
  results: { name: string; ok: boolean; exitCode?: number; output: string }[]
  truncated: boolean
}

export interface AgentRun {
  turns: number
  finished: boolean
  toolCalls: ToolCallRecord[]
  finalText: string
  usage: { promptTokens: number; completionTokens: number }
  transcript: TranscriptStep[]
}

export interface AgentConfig {
  apiKey: string
  baseUrl: string
  model: string
  systemPrompt: string
  userPrompt: string
  tools: readonly AgentTool[]
  maxTurns: number
  maxTokens: number
  fetchImpl?: typeof fetch
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ChatToolCall[]
  tool_call_id?: string
}

interface ChatToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export async function runAgentLoop(config: AgentConfig): Promise<AgentRun> {
  const fetchImpl = config.fetchImpl ?? fetch
  const toolByName = new Map(config.tools.map((t) => [t.name, t]))
  const messages: ChatMessage[] = [
    { role: 'system', content: config.systemPrompt },
    { role: 'user', content: config.userPrompt },
  ]
  const toolSpec = config.tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))

  const toolCalls: ToolCallRecord[] = []
  const transcript: TranscriptStep[] = []
  const usage = { promptTokens: 0, completionTokens: 0 }
  let finalText = ''
  let finished = false
  let turns = 0

  while (turns < config.maxTurns) {
    turns += 1
    const res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        tools: toolSpec,
        tool_choice: 'auto',
        temperature: 0,
        max_tokens: config.maxTokens,
      }),
    })
    if (!res.ok) {
      throw new Error(`deepseek chat/completions returned HTTP ${res.status}`)
    }
    const body = (await res.json()) as {
      choices: { message: ChatMessage; finish_reason?: string }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    usage.promptTokens += body.usage?.prompt_tokens ?? 0
    usage.completionTokens += body.usage?.completion_tokens ?? 0

    const choice = body.choices[0]
    const message = choice?.message
    if (message === undefined) {
      throw new Error('deepseek response contained no choices')
    }
    messages.push(message)

    const step: TranscriptStep = {
      turn: turns,
      assistantText: message.content ?? '',
      calls: [],
      results: [],
      truncated: choice?.finish_reason === 'length',
    }

    const calls = message.tool_calls ?? []
    if (calls.length === 0) {
      finalText = message.content ?? ''
      finished = true
      transcript.push(step)
      break
    }

    for (const call of calls) {
      const tool = toolByName.get(call.function.name)
      let input: Record<string, unknown> = {}
      try {
        input = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
      } catch {
        input = {}
      }
      let result: ToolResult
      if (tool === undefined) {
        result = { output: `unknown tool: ${call.function.name}`, isError: true }
      } else {
        result = await tool.handler(input)
      }
      toolCalls.push({
        name: call.function.name,
        input,
        ok: result.isError !== true,
        exitCode: result.exitCode,
      })
      step.calls.push({ name: call.function.name, input })
      step.results.push({
        name: call.function.name,
        ok: result.isError !== true,
        exitCode: result.exitCode,
        output: result.output,
      })
      messages.push({ role: 'tool', tool_call_id: call.id, content: result.output })
    }
    transcript.push(step)
  }

  return { turns, finished, toolCalls, finalText, usage, transcript }
}

// ── Jailed tool implementations ──────────────────────────────────────────────

const SHELL_METACHARS = /[;&|`$><\n(){}]/
const READ_ALLOWLIST = new Set(['cat', 'ls'])

function tokenize(command: string): string[] {
  const raw = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
  return raw.map((tok) => tok.replace(/^['"]|['"]$/g, ''))
}

function pathEscapesSandbox(arg: string): boolean {
  return arg.startsWith('/') || arg.split('/').includes('..')
}

/**
 * run_command — allowlisted to `cospec`, `cat`, `ls` inside the sandbox.
 * `cospec` is mapped to the working-tree CLI so the eval exercises the exact
 * code under test with zero install step.
 */
export function makeRunCommandTool(sandbox: string, repoRoot: string): AgentTool {
  return {
    name: 'run_command',
    description:
      'Run a shell command in the change repo. Allowed programs: cospec, cat, ls. ' +
      'No pipes, redirects, or command chaining. Returns exit code and combined output.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'e.g. `cospec status --json` or `cat proposal.md`',
        },
      },
      required: ['command'],
    },
    handler: async (input) => {
      const command = typeof input['command'] === 'string' ? input['command'] : ''
      if (command.trim().length === 0) {
        return { output: 'rejected: empty command', isError: true }
      }
      if (SHELL_METACHARS.test(command)) {
        return { output: 'rejected: shell metacharacters are not allowed', isError: true }
      }
      const argv = tokenize(command)
      const [cmd, ...rest] = argv
      if (cmd === undefined) {
        return { output: 'rejected: empty command', isError: true }
      }
      let spawnArgv: string[]
      if (cmd === 'cospec') {
        spawnArgv = ['bun', 'run', join(repoRoot, 'apps/cli/src/index.ts'), '--', ...rest]
      } else if (READ_ALLOWLIST.has(cmd)) {
        const bad = rest.find((a) => !a.startsWith('-') && pathEscapesSandbox(a))
        if (bad !== undefined) {
          return { output: `rejected: path escapes sandbox: ${bad}`, isError: true }
        }
        spawnArgv = [cmd, ...rest]
      } else {
        return {
          output: `rejected: '${cmd}' is not on the eval allowlist (cospec, cat, ls)`,
          isError: true,
        }
      }
      const proc = Bun.spawn(spawnArgv, {
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
      return { output: `exit=${exitCode}\n${stdout}${stderr}`.slice(0, 8000), exitCode }
    },
  }
}

/** write_file — path-jailed to the sandbox. */
export function makeWriteFileTool(sandbox: string): AgentTool {
  const root = resolve(sandbox)
  return {
    name: 'write_file',
    description: 'Create or overwrite a file inside the change repo (paths are relative to it).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'repo-relative path, e.g. openspec/changes/x/proposal.md',
        },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
    handler: async (input) => {
      const rel = typeof input['path'] === 'string' ? input['path'] : ''
      const content = typeof input['content'] === 'string' ? input['content'] : ''
      if (rel.length === 0) {
        return { output: 'rejected: empty path', isError: true }
      }
      const target = resolve(root, rel)
      if (target !== root && !target.startsWith(`${root}/`)) {
        return { output: `rejected: path escapes sandbox: ${rel}`, isError: true }
      }
      await Bun.write(target, content)
      return { output: `wrote ${rel} (${content.length} bytes)` }
    },
  }
}
