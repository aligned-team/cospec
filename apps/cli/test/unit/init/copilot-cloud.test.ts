import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { isInteractive } from '../../../src/core/interactive.ts'
import { computeContentHash, writeManifest } from '../../../src/core/managed-files.ts'
import {
  COPILOT_CLOUD_FILES,
  COPILOT_CLOUD_IGNORED_FLAG,
  COPILOT_CLOUD_PROMPT,
  copilotAgentContent,
  copilotCloudDirective,
  copilotSetupStepsContent,
  decideCopilotCloud,
  type CopilotCloudDecision,
  type CopilotCloudDecisionInput,
} from '../../../src/harness/copilot-cloud.ts'

// The decision table of design decision 1, one row per cell: the pre row, tiers 1 to 5, and
// the gates tier 4 sits behind. Each row's `write`, `persist` and `optedOut` are the pinned
// binary's (`resolveCopilotCloudDecision`); the contract matrix compares the binary itself.

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'cospec-copilot-decide-'))
  mkdirSync(join(cwd, 'openspec'))
})
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

function put(rel: string, content: string): void {
  const full = join(cwd, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}

const config = (cloudAgent: string | undefined): void =>
  put(
    'openspec/config.yaml',
    cloudAgent === undefined
      ? 'schema: feat\n'
      : `schema: feat\ngithubCopilot:\n  cloudAgent: ${cloudAgent}\n`,
  )

/** An untouched, cospec-written agent file: managed. */
const managedAgent = (): void => put(COPILOT_CLOUD_FILES.agent, copilotAgentContent())

/** The workflow as cospec wrote it, tracked in the manifest: managed. */
function managedWorkflow(): void {
  const content = copilotSetupStepsContent()
  put(COPILOT_CLOUD_FILES.setupSteps, content)
  writeManifest(cwd, {
    cospecVersion: '0.0.0',
    files: { [COPILOT_CLOUD_FILES.setupSteps]: computeContentHash(content) },
  })
}

interface Run {
  decision: CopilotCloudDecision
  warnings: string[]
  asked: string[]
}

function decide(over: Partial<CopilotCloudDecisionInput> = {}): Run {
  const warnings: string[] = []
  const asked: string[] = []
  const decision = decideCopilotCloud({
    cwd,
    selected: true,
    flag: undefined,
    harnessGiven: true,
    json: false,
    terminal: {
      interactive: false,
      ask: (question) => {
        asked.push(question)
        return undefined
      },
    },
    warn: (line) => warnings.push(line),
    ...over,
  })
  return { decision, warnings, asked }
}

const SHAPE = (d: CopilotCloudDecision): Record<string, unknown> => ({
  tier: d.tier,
  write: d.write,
  persist: d.persist,
  optedOut: d.optedOut,
  skippedUndecided: d.skippedUndecided,
  ignoredFlag: d.ignoredFlag,
})

describe('the tool is not selected (the branch before tier 1)', () => {
  test('no flag: nothing written, persisted or removed, and no notice', () => {
    config('true')
    expect(SHAPE(decide({ selected: false }).decision)).toEqual({
      tier: 'not-selected',
      write: false,
      persist: undefined,
      optedOut: false,
      skippedUndecided: false,
      ignoredFlag: false,
    })
  })

  test.each([true, false])('flag %p: reported as ignored, never applied or persisted', (flag) => {
    const { decision } = decide({ selected: false, flag })
    expect(SHAPE(decision)).toEqual({
      tier: 'not-selected',
      write: false,
      persist: undefined,
      optedOut: false,
      skippedUndecided: false,
      ignoredFlag: true,
    })
  })

  test('the notice is upstream sentence', () => {
    expect(COPILOT_CLOUD_IGNORED_FLAG).toBe(
      '--copilot-cloud/--no-copilot-cloud was ignored because the github-copilot tool was not selected.',
    )
  })

  test('managed files on disk and a persisted false are left alone (upstream returns first)', () => {
    config('false')
    managedAgent()
    const { decision } = decide({ selected: false })
    expect(decision.optedOut).toBe(false)
    expect(decision.write).toBe(false)
  })
})

describe('tier 1: a flag', () => {
  test('--copilot-cloud writes and persists true', () => {
    expect(SHAPE(decide({ flag: true }).decision)).toEqual({
      tier: 'flag',
      write: true,
      persist: true,
      optedOut: false,
      skippedUndecided: false,
      ignoredFlag: false,
    })
  })

  test('--no-copilot-cloud persists false and opts out', () => {
    expect(SHAPE(decide({ flag: false }).decision)).toEqual({
      tier: 'flag',
      write: false,
      persist: false,
      optedOut: true,
      skippedUndecided: false,
      ignoredFlag: false,
    })
  })

  test('a flag beats a persisted opposite and never reads the config', () => {
    config('false')
    const run = decide({ flag: true })
    expect(run.decision.write).toBe(true)
    expect(run.decision.persist).toBe(true)
    config('true')
    expect(decide({ flag: false }).decision.persist).toBe(false)
  })

  test('a flag beats a malformed config without warning about it', () => {
    config('x')
    const run = decide({ flag: true })
    expect(run.decision.tier).toBe('flag')
    expect(run.warnings).toEqual([])
  })
})

describe('tier 2: a persisted boolean', () => {
  test('true writes and does not persist', () => {
    config('true')
    expect(SHAPE(decide().decision)).toEqual({
      tier: 'config',
      write: true,
      persist: undefined,
      optedOut: false,
      skippedUndecided: false,
      ignoredFlag: false,
    })
  })

  test('false opts out with no flag, and does not persist', () => {
    config('false')
    expect(SHAPE(decide().decision)).toEqual({
      tier: 'config',
      write: false,
      persist: undefined,
      optedOut: true,
      skippedUndecided: false,
      ignoredFlag: false,
    })
  })

  test('false beats managed files on disk (the opt-out-beats-files cell)', () => {
    config('false')
    managedAgent()
    managedWorkflow()
    const { decision } = decide()
    expect(decision.tier).toBe('config')
    expect(decision.write).toBe(false)
    expect(decision.optedOut).toBe(true)
  })

  test('true with an untracked, foreign workflow still takes tier 2', () => {
    config('true')
    put(COPILOT_CLOUD_FILES.setupSteps, 'name: mine\n')
    expect(decide().decision.tier).toBe('config')
  })
})

describe('a malformed persisted value is undecided, with the binary warning', () => {
  test('a non-boolean cloudAgent', () => {
    config('x')
    const run = decide()
    expect(run.decision.tier).toBe('undecided')
    expect(run.decision.skippedUndecided).toBe(true)
    expect(run.warnings).toEqual([
      "Invalid 'githubCopilot.cloudAgent' field in config (must be a boolean)",
    ])
  })

  test('a non-object githubCopilot', () => {
    put('openspec/config.yaml', 'githubCopilot: nope\n')
    const run = decide()
    expect(run.decision.tier).toBe('undecided')
    expect(run.warnings).toEqual(["Invalid 'githubCopilot' field in config (must be an object)"])
  })

  test('a malformed value falls through to tier 3 when a managed file exists', () => {
    config('x')
    managedAgent()
    expect(decide().decision.tier).toBe('existing-files')
  })
})

describe('tier 3: a managed cloud file already on disk', () => {
  test('the managed agent file enables, persists nothing and does not opt out', () => {
    managedAgent()
    expect(SHAPE(decide().decision)).toEqual({
      tier: 'existing-files',
      write: true,
      persist: undefined,
      optedOut: false,
      skippedUndecided: false,
      ignoredFlag: false,
    })
  })

  test('the manifest-tracked workflow enables too', () => {
    managedWorkflow()
    expect(decide().decision.tier).toBe('existing-files')
  })

  test('an edited agent file is not managed (upstream: byte equality), so tier 5', () => {
    put(COPILOT_CLOUD_FILES.agent, `${copilotAgentContent()}\nmy edit\n`)
    expect(decide().decision.tier).toBe('undecided')
  })

  test('OpenSpec own files are not managed', () => {
    put('.github/agents/openspec.agent.md', '---\nname: openspec\n---\nbody\n')
    put(COPILOT_CLOUD_FILES.setupSteps, 'name: Copilot Setup Steps\n')
    expect(decide().decision.tier).toBe('undecided')
  })
})

describe('tier 4: the interactive confirm', () => {
  /** Interactive, no `--harness`, no `--json`; `answer` is what the user types (undefined: EOF). */
  function prompted(
    answer: string | undefined,
    over: Partial<CopilotCloudDecisionInput> = {},
  ): Run {
    const asked: string[] = []
    const run = decide({
      harnessGiven: false,
      terminal: {
        interactive: true,
        ask: (question) => {
          asked.push(question)
          return answer
        },
      },
      ...over,
    })
    return { ...run, asked }
  }

  test('the prompt text is the quoted upstream text naming cospec.agent.md', () => {
    expect(COPILOT_CLOUD_PROMPT).toBe(
      'Set up GitHub Copilot cloud coding-agent files? This is for the GitHub-hosted Copilot coding agent (github.com), not Copilot in your editor. It writes two files: .github/workflows/copilot-setup-steps.yml and .github/agents/cospec.agent.md.',
    )
  })

  test.each(['y', 'Y', 'yes', ' YES \n'])('an answer of %p writes and persists true', (answer) => {
    const run = prompted(answer)
    expect(SHAPE(run.decision)).toEqual({
      tier: 'prompt',
      write: true,
      persist: true,
      optedOut: false,
      skippedUndecided: false,
      ignoredFlag: false,
    })
    expect(run.asked).toEqual([COPILOT_CLOUD_PROMPT])
  })

  test.each(['', '\n', 'n', 'N', 'no', 'maybe'])(
    'an answer of %p (default No) persists false and opts out',
    (answer) => {
      const run = prompted(answer)
      expect(SHAPE(run.decision)).toEqual({
        tier: 'prompt',
        write: false,
        persist: false,
        optedOut: true,
        skippedUndecided: false,
        ignoredFlag: false,
      })
    },
  )

  test('input that ends before a line (EOF) is no answer: tier 5, nothing saved or removed', () => {
    const run = prompted(undefined)
    expect(run.asked).toEqual([COPILOT_CLOUD_PROMPT])
    expect(SHAPE(run.decision)).toEqual({
      tier: 'undecided',
      write: false,
      persist: undefined,
      optedOut: false,
      skippedUndecided: true,
      ignoredFlag: false,
    })
    expect(copilotCloudDirective(run.decision)).toBe('leave')
  })

  test('a persisted value, a flag or a managed file is reached before the prompt', () => {
    config('true')
    expect(prompted('n').decision.tier).toBe('config')
    config(undefined)
    managedAgent()
    expect(prompted('n').decision.tier).toBe('existing-files')
    expect(prompted('n').asked).toEqual([])
  })

  test('a flag is never asked about', () => {
    const run = prompted('y', { flag: false })
    expect(run.decision.tier).toBe('flag')
    expect(run.asked).toEqual([])
  })
})

describe('tier 4 gates: no prompt, tier 5 applies', () => {
  const GATED: [string, Partial<CopilotCloudDecisionInput>][] = [
    [
      '--harness or --tools given',
      { harnessGiven: true, terminal: { interactive: true, ask: () => 'y' } },
    ],
    [
      '--json',
      { json: true, harnessGiven: false, terminal: { interactive: true, ask: () => 'y' } },
    ],
    ['no terminal', { harnessGiven: false, terminal: { interactive: false, ask: () => 'y' } }],
  ]
  test.each(GATED)('%s', (_name, input) => {
    const run = decide(input)
    expect(SHAPE(run.decision)).toEqual({
      tier: 'undecided',
      write: false,
      persist: undefined,
      optedOut: false,
      skippedUndecided: true,
      ignoredFlag: false,
    })
  })

  test('a CI variable or OPEN_SPEC_INTERACTIVE=0 turns the terminal off, a TTY stdin alone turns it on', () => {
    expect(isInteractive({}, true)).toBe(true)
    expect(isInteractive({ CI: '' }, true)).toBe(false)
    expect(isInteractive({ CI: 'true' }, true)).toBe(false)
    expect(isInteractive({ OPEN_SPEC_INTERACTIVE: '0' }, true)).toBe(false)
    expect(isInteractive({ OPEN_SPEC_INTERACTIVE: '1' }, true)).toBe(true)
    expect(isInteractive({}, false)).toBe(false)
  })
})

describe('tier 5: nothing decided and nobody to ask', () => {
  test('skips, persists nothing and removes nothing', () => {
    expect(SHAPE(decide().decision)).toEqual({
      tier: 'undecided',
      write: false,
      persist: undefined,
      optedOut: false,
      skippedUndecided: true,
      ignoredFlag: false,
    })
  })

  test('with no openspec/config.yaml at all', () => {
    rmSync(join(cwd, 'openspec'), { recursive: true })
    expect(decide().decision.tier).toBe('undecided')
  })
})
