// The Copilot cloud-file decision against the pinned binary, cell for cell (design decision
// 12). Each cell scaffolds the same sandbox twice, once through the binary (`init --tools`) and
// once through cospec (`init --harness`), runs the same flags, and compares what the user can
// observe: which cloud paths exist afterwards, the persisted `githubCopilot.cloudAgent`, the
// upstream sentences (with `openspec` read as `cospec`) and the exit code. Bytes of the cloud
// files are not compared: they name different tools. Tier 4 needs a terminal and the binary's
// tool picker answered first, so it is outside this matrix (`init-copilot-cloud.test.ts` drives
// cospec's on a pty).

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { parse as parseYaml, parseDocument } from 'yaml'

import { cleanupAll, cospec, mkTempRepo, oracleEnv } from '../fixtures/support.ts'
import { assertNoAncestorOpenspec } from './support/upstream-init-capture.ts'
import { oracle } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

type Tool = 'github-copilot' | 'claude'
type ConfigState = 'absent' | 'true' | 'false' | 'malformed'
type FileState = 'none' | 'managed' | 'edited'

interface Cell {
  tool: Tool
  flags: string[]
  config: ConfigState
  files: FileState
  /** Extra planting, given the agent name (`openspec` or `cospec`) the side's files carry. */
  plant?: (dir: string, agent: string) => void
  label?: string
}

const WORKFLOW = '.github/workflows/copilot-setup-steps.yml'
const agentPath = (name: string): string => `.github/agents/${name}.agent.md`
const altPath = (name: string): string => `.github/agents/${name}.md`

interface Side {
  agent: 'openspec' | 'cospec'
  dir: string
  /** `init` for `tool` with `flags`. */
  init(tool: string, flags: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }>
}

function upstreamSide(): Side {
  const sandbox = mkTempRepo()
  assertNoAncestorOpenspec(sandbox)
  const dir = mkTempRepo({ git: true })
  return {
    agent: 'openspec',
    dir,
    init: (tool, flags) =>
      oracle(['init', '--tools', tool, '--no-animation', ...flags, '.'], sandbox, { cwd: dir }),
  }
}

function cospecSide(): Side {
  const env = oracleEnv(mkTempRepo())
  const dir = mkTempRepo({ git: true })
  return {
    agent: 'cospec',
    dir,
    init: (tool, flags) =>
      cospec(['init', '--harness', tool, '--no-gate', ...flags], { cwd: dir, env }),
  }
}

function setConfig(dir: string, state: ConfigState): void {
  const path = join(dir, 'openspec/config.yaml')
  const doc = parseDocument(readFileSync(path, 'utf8'))
  doc.delete('githubCopilot')
  if (state === 'true') doc.setIn(['githubCopilot', 'cloudAgent'], true)
  if (state === 'false') doc.setIn(['githubCopilot', 'cloudAgent'], false)
  if (state === 'malformed') doc.setIn(['githubCopilot', 'cloudAgent'], 'x')
  writeFileSync(path, doc.toString())
}

function put(dir: string, rel: string, content: string): void {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), content)
}

/** Scaffold `side` into the cell's starting state, with every step's exit code asserted. */
async function scaffold(side: Side, cell: Cell): Promise<void> {
  const none = await side.init('none', [])
  expect(none.exitCode, `${side.agent} scaffold: ${none.stderr}`).toBe(0)
  if (cell.files !== 'none') {
    const on = await side.init('github-copilot', ['--copilot-cloud'])
    expect(on.exitCode, `${side.agent} cloud scaffold: ${on.stderr}`).toBe(0)
    if (cell.files === 'edited') {
      for (const rel of [WORKFLOW, agentPath(side.agent)]) {
        if (existsSync(join(side.dir, rel))) {
          writeFileSync(
            join(side.dir, rel),
            `${readFileSync(join(side.dir, rel), 'utf8')}\n# edited\n`,
          )
        }
      }
    }
  }
  setConfig(side.dir, cell.config)
  cell.plant?.(side.dir, side.agent)
}

const respell = (text: string): string => text.replace(/openspec/gi, 'cospec')

/** The sentences the decision prints, wherever they appear, spelled for cospec. */
const SENTENCES: RegExp[] = [
  /(--copilot-cloud\/--no-copilot-cloud was ignored because the github-copilot tool was not selected\.)/,
  /(Skipped GitHub Copilot cloud files \(opt-in\)\. Enable with .*)/,
  /(Removed: \d+ Copilot cloud agent file\(s\) \(opted out of cloud files\))/,
  /(GitHub Copilot cloud files: .*)/,
  /(Left your existing .*)/,
  // The binary wraps the sentence in parentheses in its failure line; the sentence is compared.
  /(Conflicting Copilot agent profiles: preserve either \S+ or [^\s)]+)/,
  /(Invalid 'githubCopilot[^\n]*)/,
]

function sentences(text: string): string[] {
  const found: string[] = []
  for (const line of respell(text).split('\n')) {
    for (const pattern of SENTENCES) {
      const m = pattern.exec(line)
      if (m !== null) found.push(m[1]!.trim())
    }
  }
  return found.toSorted()
}

/** `Skipped ... Enable with 'cospec init --copilot-cloud'.` is the one line whose tail differs. */
const skippedTail = (lines: string[]): string[] =>
  lines.map((l) => (l.startsWith('Skipped GitHub Copilot') ? l.replace(/\s*Enable with.*/, '') : l))

interface Outcome {
  exit: number
  paths: string[]
  persisted: string
  said: string[]
}

async function observe(side: Side, cell: Cell): Promise<Outcome> {
  const run = await side.init(cell.tool, cell.flags)
  const paths = [WORKFLOW, agentPath(side.agent)]
    .filter((rel) => existsSync(join(side.dir, rel)))
    .map((rel) => respell(rel))
  const raw = parseYaml(readFileSync(join(side.dir, 'openspec/config.yaml'), 'utf8')) as {
    githubCopilot?: { cloudAgent?: unknown }
  } | null
  const value = raw?.githubCopilot?.cloudAgent
  return {
    exit: run.exitCode,
    paths,
    persisted: value === undefined ? 'absent' : JSON.stringify(value),
    said: skippedTail(sentences(`${run.stdout}\n${run.stderr}`)),
  }
}

async function compare(cell: Cell): Promise<void> {
  const [upstream, ours] = [upstreamSide(), cospecSide()]
  await Promise.all([scaffold(upstream, cell), scaffold(ours, cell)])
  const [want, got] = await Promise.all([observe(upstream, cell), observe(ours, cell)])
  expect(got).toEqual(want)
}

const FLAG_SETS: string[][] = [
  [],
  ['--copilot-cloud'],
  ['--no-copilot-cloud'],
  ['--copilot-cloud', '--no-copilot-cloud'],
  ['--no-copilot-cloud', '--copilot-cloud'],
]
const CONFIGS: ConfigState[] = ['absent', 'true', 'false', 'malformed']
const FILES: FileState[] = ['none', 'managed', 'edited']

function nameOf(cell: Cell): string {
  const flags = cell.flags.length === 0 ? 'no flag' : cell.flags.join(' ')
  return `${cell.tool} | ${flags} | config ${cell.config} | files ${cell.files}${cell.label === undefined ? '' : ` | ${cell.label}`}`
}

function register(cells: Cell[]): void {
  for (const cell of cells) {
    const run = (): Promise<void> => compare(cell)
    test(nameOf(cell), run, 120_000)
  }
}

const MATRIX: Cell[] = []
for (const flags of FLAG_SETS)
  for (const config of CONFIGS)
    for (const files of FILES) MATRIX.push({ tool: 'github-copilot', flags, config, files })
// The tool not selected: the flag is reported, never applied; nothing is read, persisted or removed.
for (const flags of FLAG_SETS.slice(0, 3))
  for (const config of ['absent', 'false'] as const)
    for (const files of ['none', 'managed'] as const)
      MATRIX.push({ tool: 'claude', flags, config, files })

describe('the Copilot cloud decision matches the pinned binary, cell for cell', () => {
  register(MATRIX)
})

describe('the alternate profile and files cospec did not write', () => {
  const agentWith = (content: string) => (dir: string, agent: string) =>
    put(dir, agentPath(agent), content)
  register([
    {
      tool: 'github-copilot',
      flags: ['--copilot-cloud'],
      config: 'absent',
      files: 'none',
      label: 'the alternate profile suppresses the agent file',
      plant: (dir, agent) => put(dir, altPath(agent), 'mine\n'),
    },
    {
      tool: 'github-copilot',
      flags: ['--copilot-cloud'],
      config: 'absent',
      files: 'managed',
      label: 'the alternate profile removes an untouched managed agent file',
      plant: (dir, agent) => put(dir, altPath(agent), 'mine\n'),
    },
    {
      tool: 'github-copilot',
      flags: ['--copilot-cloud'],
      config: 'absent',
      files: 'none',
      label: 'both profiles with the agent file unmanaged: conflict, exit 1',
      plant: (dir, agent) => {
        put(dir, altPath(agent), 'mine\n')
        put(dir, agentPath(agent), 'also mine\n')
      },
    },
    {
      tool: 'github-copilot',
      flags: ['--copilot-cloud'],
      config: 'absent',
      files: 'none',
      label: 'an unmanaged agent file is left untouched',
      plant: agentWith('mine\n'),
    },
    {
      tool: 'github-copilot',
      flags: ['--copilot-cloud'],
      config: 'absent',
      files: 'none',
      label: 'an unmanaged workflow is left untouched',
      plant: (dir) => put(dir, WORKFLOW, 'name: mine\n'),
    },
    {
      tool: 'github-copilot',
      flags: ['--no-copilot-cloud'],
      config: 'absent',
      files: 'none',
      label: 'an unmanaged workflow survives an opt-out',
      plant: (dir) => put(dir, WORKFLOW, 'name: mine\n'),
    },
  ])
})
