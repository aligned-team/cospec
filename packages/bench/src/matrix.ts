// Matrix cell model + cartesian expansion + CLI argument parsing.
//
// A cell is one (scenario × arm × model × repeat). The full matrix is the
// cartesian product of the registered scenarios, both arms, both models, and
// `repeats` copies; CLI filters narrow each axis. `--smoke` collapses to the one
// cheap cell (ci scenario, sonnet-5, cospec arm, one repeat).

export type Arm = 'cospec' | 'openspec'
export type BenchModel = 'claude-sonnet-5' | 'claude-opus-4-8'

export const ARMS: readonly Arm[] = ['cospec', 'openspec']
export const MODELS: readonly BenchModel[] = ['claude-sonnet-5', 'claude-opus-4-8']

/**
 * Per-model reasoning effort, applied via `CLAUDE_CODE_EFFORT_LEVEL` for the
 * cell's run (DESIGN: sonnet-5 → high, opus-4-8 → medium). Keeping effort tied
 * to the model keeps the matrix two-dimensional instead of exploding into a
 * model×effort grid.
 */
export const MODEL_EFFORT: Record<BenchModel, string> = {
  'claude-sonnet-5': 'high',
  'claude-opus-4-8': 'medium',
}

export interface Cell {
  scenarioId: string
  arm: Arm
  model: BenchModel
  repeat: number
}

export interface MatrixFilters {
  scenarios?: string[]
  arms?: Arm[]
  models?: BenchModel[]
  repeats: number
  concurrency: number
  smoke: boolean
  /**
   * Include the opt-in `-hard` scenario variants (see `scenarios/index.ts`'s
   * `HARD_SCENARIOS`) in the DEFAULT (no `--scenario` filter) expansion. Off
   * by default — these are multi-file, larger-turn-budget fixtures, not part
   * of the standard matrix. An EXPLICIT `--scenario feat-hard` (etc.) always
   * resolves regardless of this flag, since `availableIds` includes every
   * registered id unconditionally — only the default "all ids" set is
   * hard-gated.
   */
  hard: boolean
  /** Run the adversarial review stage inline after scoring each cell (off by default; spawns extra agents). */
  review: boolean
  /**
   * Standalone review mode: review every cell of a PAST run from its persisted
   * diffs, without re-running any benchmark agent. When set, the harness reviews
   * `<reviewReport>` and rewrites its aggregate/summary instead of running the
   * matrix.
   */
  reviewReport?: string
}

function isArm(v: string): v is Arm {
  return (ARMS as readonly string[]).includes(v)
}

function isModel(v: string): v is BenchModel {
  return (MODELS as readonly string[]).includes(v)
}

/** Split a flag value on commas so `--arm cospec,openspec` and repeated flags both work. */
function splitValues(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Parse `--scenario --arm --model --repeats --concurrency --smoke`. Flags accept
 * `--flag value` and `--flag=value`; multi-valued flags accumulate across
 * repetitions and comma-splits. Unknown flags throw so a typo does not silently
 * run the full (expensive) matrix.
 */
export function parseArgs(argv: readonly string[]): MatrixFilters {
  const scenarios: string[] = []
  const arms: Arm[] = []
  const models: BenchModel[] = []
  let repeats = 1
  let concurrency = 2
  let smoke = false
  let hard = false
  let review = false
  let reviewReport: string | undefined

  const tokens = [...argv]
  while (tokens.length > 0) {
    const token = tokens.shift()
    if (token === undefined) break
    if (token === '--') continue
    const eq = token.indexOf('=')
    const flag = eq === -1 ? token : token.slice(0, eq)
    const inlineValue = eq === -1 ? undefined : token.slice(eq + 1)
    const takeValue = (): string => {
      if (inlineValue !== undefined) return inlineValue
      const next = tokens.shift()
      if (next === undefined) throw new Error(`missing value for ${flag}`)
      return next
    }

    switch (flag) {
      case '--scenario':
        scenarios.push(...splitValues(takeValue()))
        break
      case '--arm':
        for (const v of splitValues(takeValue())) {
          if (!isArm(v)) throw new Error(`unknown arm: ${v} (expected cospec|openspec)`)
          arms.push(v)
        }
        break
      case '--model':
        for (const v of splitValues(takeValue())) {
          if (!isModel(v)) throw new Error(`unknown model: ${v} (expected ${MODELS.join('|')})`)
          models.push(v)
        }
        break
      case '--repeats':
        repeats = Number.parseInt(takeValue(), 10)
        if (!Number.isInteger(repeats) || repeats < 1) throw new Error('--repeats must be >= 1')
        break
      case '--concurrency':
        concurrency = Number.parseInt(takeValue(), 10)
        if (!Number.isInteger(concurrency) || concurrency < 1) {
          throw new Error('--concurrency must be >= 1')
        }
        break
      case '--smoke':
        smoke = true
        break
      case '--hard':
        hard = true
        break
      case '--review':
        review = true
        break
      case '--review-report':
        reviewReport = takeValue()
        break
      default:
        throw new Error(`unknown flag: ${flag}`)
    }
  }

  return {
    scenarios: scenarios.length > 0 ? scenarios : undefined,
    arms: arms.length > 0 ? arms : undefined,
    models: models.length > 0 ? models : undefined,
    repeats,
    concurrency,
    smoke,
    hard,
    review,
    reviewReport,
  }
}

/**
 * Expand the matrix over the available scenario ids. `--smoke` overrides every
 * axis to the single cheap cell. Otherwise each filter, when present, narrows
 * that axis; absent filters take the full axis — EXCEPT that the default
 * (no `--scenario` filter) axis excludes `-hard`-suffixed ids unless `--hard`
 * is set, so the opt-in hard variants (see `scenarios/index.ts`'s
 * `HARD_SCENARIOS`) never silently join the standard matrix. An EXPLICIT
 * `--scenario feat-hard` (etc.) always resolves regardless of `--hard`, since
 * it is matched directly against `availableIds`. Requested scenarios not in
 * `availableIds` are dropped (the caller reports them).
 */
export function expandMatrix(availableIds: readonly string[], filters: MatrixFilters): Cell[] {
  if (filters.smoke) {
    const scenarioId = availableIds.includes('ci') ? 'ci' : availableIds[0]
    if (scenarioId === undefined) return []
    return [{ scenarioId, arm: 'cospec', model: 'claude-sonnet-5', repeat: 1 }]
  }

  const defaultIds = filters.hard
    ? availableIds
    : availableIds.filter((id) => !id.endsWith('-hard'))
  const scenarioIds = (filters.scenarios ?? defaultIds).filter((id) => availableIds.includes(id))
  const arms = filters.arms ?? ARMS
  const models = filters.models ?? MODELS

  const cells: Cell[] = []
  for (const scenarioId of scenarioIds) {
    for (const arm of arms) {
      for (const model of models) {
        for (let repeat = 1; repeat <= filters.repeats; repeat += 1) {
          cells.push({ scenarioId, arm, model, repeat })
        }
      }
    }
  }
  return cells
}

/** Stable, filesystem-safe key for a cell (used for JSONL rows and logs). */
export function cellKey(cell: Cell): string {
  return `${cell.scenarioId}__${cell.arm}__${cell.model}__r${cell.repeat}`
}
