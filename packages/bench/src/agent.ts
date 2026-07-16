// Headless Claude Code driver via the Claude Agent SDK's query().
//
// Each cell spawns one real headless agent against its sandbox with hermetic
// options (no filesystem settings, no MCP, no session persistence) and explicit
// tool allowances. Telemetry is read from the SDK's own messages — the init
// system message (claude_code_version, resolved model) and the terminal result
// message (cost, durations, turns, token usage, terminal reason). Field names
// are taken verbatim from @anthropic-ai/claude-agent-sdk's sdk.d.ts
// (SDKSystemMessage, SDKResultMessage, ModelUsage), not guessed.

import { query } from '@anthropic-ai/claude-agent-sdk'
import type { Options } from '@anthropic-ai/claude-agent-sdk'

import type { Arm, BenchModel } from './matrix.ts'
import { MODEL_EFFORT } from './matrix.ts'

// Tools the agent may use in-sandbox. Intentionally the code-editing minimum —
// no WebFetch/WebSearch/Task — so cells are comparable and offline-hermetic.
const ALLOWED_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep']

/**
 * Appended, byte-identical across both arms. Neither arm's task prompt
 * (`Scenario.prompt`) mentions the spec-driven workflow at all — without this,
 * an agent has no reason not to solve the task directly, which measures
 * nothing about either tool (this is what the harness's first smoke run
 * showed: `changeProduced: false`). Wording is deliberately tool-neutral —
 * it names neither tool — so it cannot itself bias which arm looks better; it
 * only tells the agent that a workflow exists and where to find it, exactly
 * as this repository's real onboarding (CLAUDE.md's "Claude Code notes")
 * tells a live agent to look under `.claude/skills`.
 */
export const WORKFLOW_SYSTEM_PROMPT =
  'This repository manages every change through a spec-driven workflow whose ' +
  'skills are installed under .claude/skills. Before implementing, scaffold or ' +
  'propose a change using that tooling, author its required artifacts, ' +
  'validate it, then implement and complete the change through the workflow.'

// Hard per-cell spend ceiling; the SDK aborts with subtype 'error_max_budget_usd'.
// 10 (not 5) because full-cycle opus cells (feat/fix/perf/refactor/revert, now
// maxTurns 120) can exceed $5 on the propose->author->validate->implement->
// archive cycle; this stays a defensive cap, not a target spend.
export const DEFAULT_BUDGET_USD = 10

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
}

export interface AgentTelemetry {
  claudeCodeVersion?: string
  resolvedModel?: string
  /** result message subtype: 'success' | 'error_max_turns' | 'error_max_budget_usd' | … */
  resultSubtype?: string
  isError: boolean
  durationMs?: number
  durationApiMs?: number
  numTurns?: number
  totalCostUsd?: number
  stopReason?: string | null
  terminalReason?: string
  usage?: TokenUsage
  modelUsage?: Record<string, TokenUsage & { costUSD: number }>
  errors?: string[]
  /** Set when the SDK threw before producing a result message (e.g. auth failure). */
  crashed?: string
}

export interface AgentRunConfig {
  sandboxDir: string
  arm: Arm
  model: BenchModel
  prompt: string
  maxTurns: number
  budgetUsd?: number
}

/**
 * Build the hermetic query options for a cell. settingSources:[] disables
 * filesystem settings (no CLAUDE.md / user config leaking in); mcpServers:{} +
 * strictMcpConfig strips MCP; persistSession:false keeps runs ephemeral.
 *
 * `skills:'all'` is set for BOTH arms — and this is the fairness pivot of the
 * whole benchmark. Each tool ships its entire agent-facing guidance AS skills
 * under `.claude/skills/<tool>-*` (cospec via `cospec init --harness claude`,
 * openspec via `openspec init --tools claude`); neither writes a root
 * CLAUDE.md/AGENTS.md. Under settingSources:[] the CLI's default skill loading
 * is ambiguous, so relying on it for one arm while explicitly enabling the
 * other would risk running the openspec arm with NO guidance at all — a biased
 * comparison. A sandbox only ever contains its own tool's skills, so `'all'`
 * enables exactly that tool's guidance in each arm, symmetrically. Slash
 * commands (`.claude/commands/<tool>/*`) are irrelevant here: nothing invokes
 * them in a single-prompt headless run.
 *
 * `systemPrompt` uses the `preset: 'claude_code'` + `append` form, which keeps
 * Claude Code's own default system prompt and appends `WORKFLOW_SYSTEM_PROMPT`
 * after it — it does not replace anything (verified against
 * `@anthropic-ai/claude-agent-sdk`'s `sdk.d.ts`: `systemPrompt` as a bare
 * string is the only variant that replaces the default; the preset+append
 * variant is additive). The append is identical for both arms.
 */
function buildOptions(config: AgentRunConfig): Options {
  const effort = MODEL_EFFORT[config.model]
  return {
    cwd: config.sandboxDir,
    model: config.model,
    allowedTools: ALLOWED_TOOLS,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    mcpServers: {},
    strictMcpConfig: true,
    settingSources: [],
    skills: 'all',
    systemPrompt: { type: 'preset', preset: 'claude_code', append: WORKFLOW_SYSTEM_PROMPT },
    persistSession: false,
    maxTurns: config.maxTurns,
    maxBudgetUsd: config.budgetUsd ?? DEFAULT_BUDGET_USD,
    executable: 'bun',
    env: { ...process.env, CLAUDE_CODE_EFFORT_LEVEL: effort },
    // stderr from the child subprocess is discarded — it can echo prompt text
    // and must never reach a report or the console.
    stderr: () => {},
  }
}

function toTokenUsage(usage: {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}): TokenUsage {
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
  }
}

/**
 * Drive one cell to completion and return only structural telemetry — never the
 * assistant's text or tool payloads. A thrown SDK error (missing/invalid auth,
 * spawn failure) is captured as `crashed` so the caller can skip gracefully
 * instead of failing the whole run.
 */
export async function runAgent(config: AgentRunConfig): Promise<AgentTelemetry> {
  const telemetry: AgentTelemetry = { isError: true }
  try {
    for await (const message of query({ prompt: config.prompt, options: buildOptions(config) })) {
      if (message.type === 'system' && message.subtype === 'init') {
        telemetry.claudeCodeVersion = message.claude_code_version
        telemetry.resolvedModel = message.model
      } else if (message.type === 'result') {
        telemetry.resultSubtype = message.subtype
        telemetry.isError = message.is_error
        telemetry.durationMs = message.duration_ms
        telemetry.durationApiMs = message.duration_api_ms
        telemetry.numTurns = message.num_turns
        telemetry.totalCostUsd = message.total_cost_usd
        telemetry.stopReason = message.stop_reason
        telemetry.terminalReason = message.terminal_reason
        telemetry.usage = toTokenUsage(message.usage)
        telemetry.modelUsage = Object.fromEntries(
          Object.entries(message.modelUsage).map(([id, m]) => [
            id,
            {
              inputTokens: m.inputTokens,
              outputTokens: m.outputTokens,
              cacheReadInputTokens: m.cacheReadInputTokens,
              cacheCreationInputTokens: m.cacheCreationInputTokens,
              costUSD: m.costUSD,
            },
          ]),
        )
        if (message.subtype !== 'success') {
          telemetry.errors = message.errors
        }
      }
    }
  } catch (err) {
    telemetry.crashed = err instanceof Error ? err.message : String(err)
  }
  return telemetry
}
