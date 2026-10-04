// `cospec validate` — the composition algorithm (DESIGN §4.1). Runs cospec's
// rule families for cospec-typed changes, delegates to `openspec validate` for
// spec-bearing changes (merging its issues) and for legacy schemas, and adds
// cospec-only diagnostics over living specs. Openspec's hardcoded
// CHANGE_NO_DELTAS rule is never triggered for a change whose schema has no
// specs artifact (§4.1) — cospec only delegates when specs files exist.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { parse as parseYaml } from 'yaml'

import type { CommandContext } from '../cli.ts'
import { readRetireCapabilitiesMarker } from '../core/change-metadata.ts'
import {
  archiveDir,
  changesDir,
  describeNestedChange,
  findNestedChangesIn,
  isValidSchemaVersion,
  listChanges,
  openspecDir,
  resolveSchema,
} from '../core/change.ts'
import { flagValue, hasFlag } from '../core/command-table.ts'
import { parseLivingSpec } from '../core/deltas.ts'
import {
  isOpenspecErrorStatus,
  openspecBelow,
  runOpenspec,
  spawnOpenspec,
  type Root,
  threadedArgv,
  wrappedCallLabel,
  wrappedOpenspecVersion,
} from '../core/openspec.ts'
import { respellRemedies } from '../core/remedies.ts'
import {
  exitCode as reportExitCode,
  renderHuman,
  renderJson,
  toFindings,
  toJson,
  type FindingsScope,
  type ItemReport,
} from '../core/report.ts'
import type { ResolvedRoot } from '../core/root.ts'
import { runChangeRules, specsRules } from '../core/rules/index.ts'
import type { Issue, IssueLevel } from '../core/rules/issue.ts'
import {
  itemMissingIssue,
  nameKebabIssues,
  nestedChangeIssue,
  openspecYamlIssues,
  schemaClassificationIssues,
  unreadableArtifactIssue,
} from '../core/rules/meta.ts'
import {
  deriveSchemaInfo,
  type ArtifactSpec,
  type LoadedChange,
  type SchemaInfo,
  type ValidateContext,
} from '../core/rules/schema-info.ts'
import {
  ARTIFACT_GENERATES,
  enforcedApplyRequires,
  TYPE_ARTIFACTS,
  type ArtifactId,
  type CospecType,
} from '../core/rules/type-facts.ts'
import {
  capabilityForDeltaFile,
  discoverSpecFiles,
  isDeltaSpecFile,
  unreadDeltaExpectation,
} from '../core/spec-paths.ts'
import { resolveRootOrDocument, rootOutput } from '../core/upstream-keys.ts'

// --- Change loading (filesystem → LoadedChange) ---------------------------

/** A change file that exists but could not be read: its change-relative path and errno code. */
interface ReadFailure {
  path: string
  code: string
}

/**
 * The one way a change is read (design D7): every errno but `ENOENT` is
 * recorded against the file's change-relative path instead of thrown, so an
 * unreadable artifact fails the change — `meta/unreadable-artifact` — never
 * the command. Anything that is not an errno failure propagates.
 */
class ChangeReader {
  readonly failures: ReadFailure[] = []

  constructor(private readonly dir: string) {}

  private record(error: unknown, abs: string): void {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (!(error instanceof Error) || typeof code !== 'string') throw error
    if (code === 'ENOENT') return
    this.failures.push({ path: relative(this.dir, abs).split(sep).join('/') || '.', code })
  }

  /** A file's text, `undefined` when it is absent or could not be read. */
  read(abs: string): string | undefined {
    try {
      return readFileSync(abs, 'utf8')
    } catch (error) {
      this.record(error, abs)
      return undefined
    }
  }

  /** Every file under the change, change-relative and sorted; an unreadable directory is recorded. */
  files(): string[] {
    const out: string[] = []
    const walk = (abs: string): void => {
      let entries
      try {
        entries = readdirSync(abs, { withFileTypes: true })
      } catch (error) {
        this.record(error, abs)
        return
      }
      for (const entry of entries) {
        const child = join(abs, entry.name)
        if (entry.isDirectory()) walk(child)
        else if (entry.isFile()) out.push(relative(this.dir, child).split(sep).join('/'))
      }
    }
    walk(this.dir)
    return out.toSorted()
  }
}

function loadOpenspecYaml(changeDir: string, reader: ChangeReader): LoadedChange['openspecYaml'] {
  const path = join(changeDir, '.openspec.yaml')
  if (!existsSync(path)) return { present: false, parseable: false }
  const text = reader.read(path)
  if (text === undefined) return { present: true, parseable: false }
  let doc: unknown
  try {
    doc = parseYaml(text)
  } catch {
    return { present: true, parseable: false }
  }
  if (doc === null || typeof doc !== 'object') return { present: true, parseable: true }
  const record = doc as Record<string, unknown>
  const schema = typeof record.schema === 'string' ? record.schema : undefined
  const created = typeof record.created === 'string' ? record.created : undefined
  const rawSchemaVersion = record.schemaVersion
  // A present-but-non-positive-integer schemaVersion is reported via
  // schemaVersionInvalid (meta/openspec-yaml) but must not flow through as a
  // usable version — otherwise `?? 1` would keep the garbage and mis-filter
  // enforcedApplyRequires. Treat it as absent, matching readOpenspecYaml.
  const schemaVersion = isValidSchemaVersion(rawSchemaVersion) ? rawSchemaVersion : undefined
  const schemaVersionInvalid =
    rawSchemaVersion !== undefined && !isValidSchemaVersion(rawSchemaVersion)
  // `skip_specs:` / `retire_capabilities:` (openspec 1.7/1.8) are read here the
  // same way `schemaVersion` is: only the well-typed value flows through, and a
  // present-but-wrong-typed one raises its own rule rather than being coerced.
  const rawSkipSpecs = record.skip_specs
  const rawRetire = record.retire_capabilities
  return {
    present: true,
    parseable: true,
    schema,
    created,
    schemaVersion,
    schemaVersionInvalid,
    skipSpecs: typeof rawSkipSpecs === 'boolean' ? rawSkipSpecs : undefined,
    skipSpecsInvalid: rawSkipSpecs !== undefined && typeof rawSkipSpecs !== 'boolean',
    retireCapabilities: typeof rawRetire === 'boolean' ? rawRetire : undefined,
    retireCapabilitiesInvalid: rawRetire !== undefined && typeof rawRetire !== 'boolean',
  }
}

function loadChange(
  base: string,
  id: string,
  dir: string,
): { load: LoadedChange; unreadable: ReadFailure[] } {
  const reader = new ChangeReader(dir)
  const files = existsSync(dir) ? reader.files() : []
  const designText = reader.read(join(dir, 'design.md'))
  // Capability comes from the file's whole path under `specs/`, not its first
  // segment: the nested `specs/<area>/<capability>/spec.md` layout openspec grew
  // in 1.6.0 is one capability named `<area>/<capability>`, and that is the name
  // its living spec, its report path, and the archive merge all use. A file with
  // no capability at all (`specs/spec.md`) keeps an empty capability and is
  // reported by `deltas/spec-at-specs-root`.
  //
  // Only `spec.md` is a delta: openspec's own change parser reads nothing else,
  // so validating a companion `README.md`/`notes.md` sitting in a capability
  // directory would report issues against content openspec never sees.
  const deltaFiles = files
    .filter((f) => f.startsWith('specs/') && isDeltaSpecFile(f))
    .map((f) => ({
      path: f,
      capability: capabilityForDeltaFile(f) ?? '',
      text: reader.read(join(dir, f)) ?? '',
    }))

  // Everything else under `specs/` that a merge would never read. Only
  // markdown, and never a dot-entry: the walk mirrors openspec's
  // `findUnreadDeltaFiles` so the two agree about which files are candidates,
  // and `deltas/unread-file` then decides which of them carry delta sections.
  const unreadSpecFiles = files
    .filter(
      (f) =>
        f.startsWith('specs/') &&
        !isDeltaSpecFile(f) &&
        f.toLowerCase().endsWith('.md') &&
        !f.split('/').some((seg) => seg.startsWith('.')),
    )
    .map((f) => ({
      path: f,
      expected: unreadDeltaExpectation(f),
      text: reader.read(join(dir, f)) ?? '',
    }))

  const livingSpecs: LoadedChange['livingSpecs'] = new Map()
  for (const cap of new Set(deltaFiles.map((d) => d.capability))) {
    if (cap === '') continue
    const livingPath = join(openspecDir(base), 'specs', ...cap.split('/'), 'spec.md')
    if (existsSync(livingPath))
      livingSpecs.set(cap, parseLivingSpec(readFileSync(livingPath, 'utf8')))
  }

  const load: LoadedChange = {
    id,
    openspecYaml: loadOpenspecYaml(dir, reader),
    files,
    proposalText: reader.read(join(dir, 'proposal.md')),
    blockersText: reader.read(join(dir, 'blocking-changes.md')),
    tasksText: reader.read(join(dir, 'tasks.md')),
    verificationText: reader.read(join(dir, 'verification.md')),
    designExists: designText !== undefined,
    designText,
    deltaFiles,
    unreadSpecFiles,
    livingSpecs,
    retireMarker: readRetireCapabilitiesMarker(dir),
  }
  return { load, unreadable: reader.failures }
}

/**
 * `applyRequires` is filtered through `enforcedApplyRequires` (DESIGN §5) so a
 * change stamped (or defaulted to) `schemaVersion` 1 is never flagged for an
 * artifact introduced at v2 — applied here so both `verification/missing` and
 * `change/artifact-missing` grandfather identically at validate, apply, and
 * archive (all three delegate through `validateChange`/this function).
 */
function cospecSchemaInfo(type: string, schemaVersion: number, skipSpecs = false): SchemaInfo {
  const ta = TYPE_ARTIFACTS[type as keyof typeof TYPE_ARTIFACTS]
  const artifacts: ArtifactSpec[] = ta.declared.map((id: ArtifactId) => ({
    id,
    generates: ARTIFACT_GENERATES[id],
    requires: [],
  }))
  // `skip_specs: true` is the persisted form of `--skip-specs`: the change
  // declares it changes no specified behaviour, so `specs` stops being a
  // required artifact. It stays *declared* — the type is unchanged, so
  // `meta/forbidden-artifact` must not start firing for a specs/ dir, and the
  // contradiction of declaring the marker while carrying spec files is reported
  // sharply by `deltas/skip-specs-conflict` instead.
  const applyRequires = enforcedApplyRequires(type as CospecType, schemaVersion).filter(
    (id) => !(skipSpecs && id === 'specs'),
  )
  return deriveSchemaInfo(type, artifacts, applyRequires, true)
}

// --- openspec delegation ---------------------------------------------------

interface OpenspecIssue {
  level: string
  path?: string
  line?: number
  message: string
}
interface OpenspecItem {
  id: string
  valid: boolean
  issues: OpenspecIssue[]
  durationMs?: number
}
interface OpenspecValidateJson {
  items: OpenspecItem[]
}

function normalizeLevel(level: string): IssueLevel {
  const up = level.toUpperCase()
  if (up === 'ERROR' || up === 'WARNING' || up === 'INFO') return up
  return 'ERROR'
}

/** `<capability-path>/spec.md` at any depth — the change-relative path openspec
 *  reports a delta issue against, minus cospec's `specs/` prefix. */
const DELEGATED_DELTA_PATH_RE = /^(?:[^/]+\/)*spec\.md$/

/**
 * openspec 1.13.1's unread-delta ERROR reports a path relative to the change's
 * `specs/` dir whose shape says nothing about where it lives — `user-auth.md`
 * is indistinguishable from the change-root `tasks.md` — so the `specs/` prefix
 * is taken from the message, which spells the same path out, and only when the
 * two agree.
 */
const DELEGATED_UNREAD_DELTA_RE =
  /^Delta spec found at (specs\/.+?\.md)\. Delta specs must be a spec\.md inside a capability folder/

/**
 * Map an openspec issue into cospec's frozen shape, tagged `openspec/validate`.
 *
 * `deltaPaths` says the issue came from validating a CHANGE, where openspec
 * reports delta paths relative to the change's `specs/` dir — including the
 * bare `spec.md` it uses for a root-level delta, and the nested
 * `<area>/<capability>/spec.md` of the multi-area layout. Living-spec issues
 * use in-document locators (`overview`, `requirements[0]`) instead, so they are
 * passed through untouched.
 */
function mapDelegated(issue: OpenspecIssue, deltaPaths = false): Issue {
  let path = issue.path ?? '.'
  if (deltaPaths) {
    const unread = DELEGATED_UNREAD_DELTA_RE.exec(issue.message)?.[1]
    if (unread === `specs/${path}`) path = unread
    else if (DELEGATED_DELTA_PATH_RE.test(path)) path = `specs/${path}`
  }
  return {
    level: normalizeLevel(issue.level),
    rule: 'openspec/validate',
    path,
    line: issue.line,
    // Every allowlisted upstream remedy spelled through cospec, every other byte as written.
    message: respellRemedies(issue.message),
  }
}

/**
 * Defects both cospec and openspec 1.6+ now report. cospec's rule fires first
 * with its own id, hint and severity; printing openspec's twin underneath tells
 * the reader the same thing again in different words and doubles the issue
 * count `--strict` and the report summary read.
 *
 * Suppression is deliberately narrow — it needs a specific delegated message,
 * and the cospec rule must actually have fired on the same item. A delegated
 * issue with no cospec twin is always kept: cospec's own rules are the ones
 * that may be narrower, so the wrapped binary stays the safety net rather than
 * becoming noise to filter.
 */
/**
 * A delegated-message matcher: a `RegExp`, or a function-backed matcher of
 * the same `exec` shape where one regex could not match in linear time.
 */
interface MessageMatcher {
  exec(message: string): readonly (string | undefined)[] | null
}

interface DuplicateClass {
  /** the cospec rule whose finding already covers this defect. */
  rule: string
  /** the delegated message for the same defect; `[1]` is its key when `nativeKey` is set. */
  delegated: MessageMatcher
  /**
   * When set, the two findings must also name the same requirement and sit on
   * the same file: a *different* requirement's loss is a second real finding
   * rather than a duplicate. The capture group is the requirement name on both
   * sides, so the two are compared on the requirement, never on the wording.
   */
  nativeKey?: RegExp
}

/** The fixed head of 1.13.1's structurally-invalid refusal; `[1]` is the capability. */
const TARGET_INVALID_HEAD =
  /^Archive would refuse this delta: (.+?): target spec is structurally invalid and cannot be updated until fixed:$/

/**
 * One defect line of that refusal, of a kind cospec's rule reads. The quoted
 * header is spec content — the author's own text, `"` included — so its span
 * is `.*` up to the fixed suffix, on one line; no group repeats around it.
 */
const TARGET_INVALID_LINE =
  /^line \d+: (?:Main spec contains delta header ".*"\.|Requirement header ".*" (?:duplicates the requirement declared on line \d+\.|appears outside the main ## Requirements section\.))/

/**
 * The `archive/target-invalid` twin, matched in linear time (design D7): the
 * fixed head once, then each line on its own. One regex over the whole list
 * backtracked a quoted span against its trailing text once per repeated line —
 * exponential on a quote-heavy message (CodeQL js/redos) — and narrowing the
 * span to `[^"\n]*` to stop that missed every header holding a `"`.
 */
export const TARGET_INVALID: MessageMatcher = {
  exec(message: string) {
    const lines = message.split('\n')
    if (lines.at(-1) === '') lines.pop()
    const head = TARGET_INVALID_HEAD.exec(lines[0] ?? '')
    if (head === null || lines.length < 2) return null
    return lines.slice(1).every((line) => TARGET_INVALID_LINE.test(line))
      ? [message, head[1]]
      : null
  },
}

const DUPLICATE_CLASSES: readonly DuplicateClass[] = [
  // 1.11.0 purpose-placeholder vs specs/purpose-tbd.
  { rule: 'specs/purpose-tbd', delegated: /^Purpose section is still a placeholder/ },
  // 1.7.0 root-level delta block vs deltas/spec-at-specs-root. Anchored through
  // its own second sentence, and keyed on the path: 1.13.1's unread-delta ERROR
  // opens with the same six words for any file whose name starts `spec.md`
  // (`specs/spec.md.md`), and a bare prefix match would suppress it.
  {
    rule: 'deltas/spec-at-specs-root',
    delegated: /^Delta spec found at (specs\/spec\.md)\. Delta specs must live under a capability/,
    nativeKey: /^delta spec found at (specs\/spec\.md) —/,
  },
  // 1.13.1 unread delta file vs deltas/unread-file. Keyed on the path both
  // messages name, so a second unread file is a second finding.
  {
    rule: 'deltas/unread-file',
    delegated: DELEGATED_UNREAD_DELTA_RE,
    nativeKey: /^delta spec found at (specs\/.+?\.md) —/,
  },
  // 1.13.1's unpaired FROM:/TO: ERROR vs deltas/unpaired-rename. cospec grew
  // its own rule while the pin still dropped the stray line silently; 1.13.1
  // caught up (`validation/validator.ts`) with a message whose first sentence
  // is byte-identical to cospec's, plus a remedy sentence. Keyed on the whole
  // `<side>: "<name>" has no matching <side>: line` span, so a second unpaired
  // line — a different side, or a different requirement — is a second finding.
  {
    rule: 'deltas/unpaired-rename',
    delegated:
      /^RENAMED ((?:FROM|TO): ".*" has no matching (?:FROM|TO): line)\. Write each rename as a FROM: line followed immediately by its TO: line\.$/,
    nativeKey: /^RENAMED ((?:FROM|TO): ".*" has no matching (?:FROM|TO): line)$/,
  },
  // 1.13.1 task-checkbox-format lint vs tasks/has-tasks. Same state, and cospec
  // is strictly ahead of upstream on it: an ERROR where 1.13.1 warns.
  { rule: 'tasks/has-tasks', delegated: /^This change counts as 0 tasks/ },
  // 1.7.0 CHANGE_SKIP_SPECS_CONFLICT vs deltas/skip-specs-conflict.
  {
    rule: 'deltas/skip-specs-conflict',
    delegated: /^skip_specs is set in \.openspec\.yaml but spec files exist/,
  },
  // 1.8.0/1.9.0 validate-scenario-loss-check vs archive/scenario-preservation.
  // The native key stops at `drops scenario` so it matches both shapes cospec
  // prints: the name-identity one (`drops scenario(s) "X" (living 2 -> delta
  // 2)`) and the count-arm fallback (`drops scenario count from 2 to 1`).
  {
    rule: 'archive/scenario-preservation',
    delegated: /^MODIFIED "(.*)" omits scenario\(s\)/,
    nativeKey: /^MODIFIED "(.*)" drops scenario/,
  },

  // 1.13.1 empty delta sections vs archive/no-ops: the same file, the same
  // state. Keyed on the path alone — `()` captures '' on both sides — because
  // the binary raises it at most once per file.
  {
    rule: 'archive/no-ops',
    delegated: /^Delta sections .+ were found, but no requirement entries parsed\.()/,
    nativeKey: /^delta file has requirement headers but no parseable operations()$/,
  },
  // 1.13.1 CHANGE_NO_DELTAS vs archive/no-ops. Item-level (`path: file`), and
  // raised only when no delta file parsed an entry — which is exactly when
  // cospec's rule fired on a file that has a delta header — so it has no key.
  { rule: 'archive/no-ops', delegated: /^Change must have at least one delta\. No deltas found\./ },
  // 1.13.1 SHALL/MUST grading vs deltas/requirement-shape. The binary splits
  // the defect over three wordings and two levels — header-only (WARNING),
  // empty body under a keyword header (ERROR), no keyword in the body at all
  // (WARNING); cospec keeps its one ERROR (roadmap: cospec-typed schemas keep
  // cospec severities). Keyed on `<OP> "<name>"`, so a requirement cospec
  // counts as having SHALL/MUST — one in a scenario step, say — keeps the
  // binary's finding.
  {
    rule: 'deltas/requirement-shape',
    delegated: /^((?:ADDED|MODIFIED) ".*") (?:should|must) contain SHALL or MUST\b/,
    nativeKey: /^((?:ADDED|MODIFIED) ".*") must use SHALL\/MUST normative language$/,
  },
  // The same defect with an empty body under a plain header — whether cospec
  // reads no SHALL/MUST at all, or one only in a scenario step.
  {
    rule: 'deltas/requirement-shape',
    delegated: /^((?:ADDED|MODIFIED) ".*") is missing requirement text$/,
    nativeKey:
      /^((?:ADDED|MODIFIED) ".*") (?:must use SHALL\/MUST normative language|is missing requirement text)$/,
  },
  // 1.13.1's missing-scenario ERROR vs the scenario arm of the same rule.
  // Keyed on `<OP> "<name>"`, and not anchored at its end: the binary appends
  // its empty-scenario hint to the sentence when the block has a bare header.
  {
    rule: 'deltas/requirement-shape',
    delegated: /^((?:ADDED|MODIFIED) ".*") must include at least one scenario\b/,
    nativeKey: /^((?:ADDED|MODIFIED) ".*") must include at least one #### Scenario:$/,
  },

  // 1.13.1 skipped-header INFOs vs deltas/skipped-header. Both readers skip
  // the same `###` lines, so each is keyed on its header text: a second
  // skipped header in the file is a second finding. Anchored through each
  // sentence's own clause, and the not-a-requirement one excludes a
  // `Scenario:` header, which is `deltas/scenario-depth`'s (below).
  // Captures may be empty: both tools quote a blank-titled `###   ` header as
  // `"### "`.
  {
    rule: 'deltas/skipped-header',
    delegated:
      /^Header "### ((?!Scenario:).*)" in .+ is not a "### Requirement:" header and is ignored by validation\./,
    nativeKey:
      /^header "### (.*)" in .+ is not a "### Requirement:" header and is ignored by validation$/,
  },
  {
    rule: 'deltas/skipped-header',
    delegated:
      /^Header "### (.*)" in .+ is missing a requirement name and is ignored by validation\./,
    nativeKey:
      /^header "### (.*)" in .+ is missing a requirement name and is ignored by validation$/,
  },
  // A `### Scenario:` the binary skips as a header is the scenario cospec
  // reports one level too shallow. Keyed on the header text both messages
  // quote, not the file alone: the binary also reports a `### Scenario:`
  // written inside an HTML comment, which cospec's advisory reader masks, and
  // a path-only key let a real one elsewhere in the file suppress it.
  {
    rule: 'deltas/scenario-depth',
    delegated:
      /^Header "### (Scenario:.*)" in .+ is not a "### Requirement:" header and is ignored by validation\./,
    nativeKey: /^scenario heading "### (Scenario:.*)" uses 3 hashtags; must be `#### Scenario:`$/,
  },

  // 1.13.1 skipped-header INFOs vs archive/split-requirement: a skipped header
  // inside an ADDED/MODIFIED block that the archive's rebuilt spec refuses is
  // cospec's ERROR, not its `deltas/skipped-header` INFO. Keyed on the header
  // text both messages quote, `### Scenario:` included — that entry's native
  // twin, `deltas/scenario-depth`, stays silent on a header the advisory
  // reader masks.
  {
    rule: 'archive/split-requirement',
    delegated:
      /^Header "### (.*)" in .+ is not a "### Requirement:" header and is ignored by validation\./,
    nativeKey: /^header "### (.*?)" inside (?:ADDED|MODIFIED) ".*" splits it when archived/,
  },
  {
    rule: 'archive/split-requirement',
    delegated:
      /^Header "### (.*)" in .+ is missing a requirement name and is ignored by validation\./,
    nativeKey: /^header "### (.*?)" inside (?:ADDED|MODIFIED) ".*" splits it when archived/,
  },

  // 1.13.1 cross-section conflicts vs archive/added-exists. Each native key
  // names its own section, so a delta that ADDs, REMOVEs and MODIFIES one name
  // keeps the second delegated ERROR beside cospec's one finding.
  {
    rule: 'archive/added-exists',
    delegated: /^Requirement present in both ADDED and REMOVED: "(.*)"$/,
    nativeKey: /^ADDED "(.*)" is also REMOVED in this delta$/,
  },
  {
    rule: 'archive/added-exists',
    delegated: /^Requirement present in both MODIFIED and ADDED: "(.*)"$/,
    nativeKey: /^ADDED "(.*)" is also MODIFIED in this delta$/,
  },
  // 1.13.1 MODIFIED+REMOVED of one name vs archive/target-missing: the merge
  // runs REMOVED first, so cospec reports the MODIFIED target already gone.
  // Keyed on the name, and only on that "no longer exists" wording, so a
  // MODIFIED whose target was never there stays a finding of its own.
  {
    rule: 'archive/target-missing',
    delegated: /^Requirement present in both MODIFIED and REMOVED: "(.*)"$/,
    nativeKey: /^MODIFIED target "(.+)" no longer exists in capability /,
  },
  // 1.13.1 duplicate ADDED vs archive/added-exists: by the time the second
  // copy runs, the first has written the name, so cospec reports a collision.
  {
    rule: 'archive/added-exists',
    delegated: /^Duplicate requirement in ADDED: "(.*)"$/,
    nativeKey: /^ADDED "(.+)" already exists with different content/,
  },
  // 1.13.1's RENAMED conflicts. Two renames onto one name: the second finds
  // the first's target standing. A rename onto an ADDED name: cospec's
  // RENAMED-TO arm reports it (and the ADDED arms leave it alone). Two renames
  // of one source: the second finds it already carried away.
  {
    rule: 'archive/added-exists',
    delegated: /^Duplicate TO in RENAMED: "(.*)"$/,
    nativeKey: /^RENAMED target "(.+)" collides with an existing requirement/,
  },
  {
    rule: 'archive/added-exists',
    delegated: /^RENAMED TO collides with ADDED for "(.*)"$/,
    nativeKey: /^RENAMED target "(.+)" collides with an ADDED requirement/,
  },
  {
    rule: 'archive/target-missing',
    delegated: /^Duplicate FROM in RENAMED: "(.*)"$/,
    nativeKey: /^RENAMED target "(.+)" no longer exists in capability /,
  },
  // 1.13.1's MODIFIED of a RENAMED FROM vs archive/target-missing: the merge
  // runs RENAMED first, so cospec reports the MODIFIED target carried away.
  // The binary quotes the rename's TO, so cospec's message names it too and
  // the two pair on that name.
  {
    rule: 'archive/target-missing',
    delegated: /^MODIFIED references old name from RENAMED\. Use new header for "(.*)"$/,
    nativeKey:
      /^MODIFIED target ".*" no longer exists in capability '.*' — an earlier operation in this delta renamed it to "(.*)"$/,
  },

  // --- round-4 pairings: one defect, a cospec rule and a binary finding -----
  //
  // 1.13.1's three in-file conflicts no other archive/* arm reports, vs
  // archive/op-conflict, keyed on the requirement both name — for the
  // RENAMED+REMOVED pair, the RENAMED FROM, which the binary quotes.
  {
    rule: 'archive/op-conflict',
    delegated: /^Duplicate requirement in MODIFIED: "(.*)"$/,
    nativeKey: /^MODIFIED "(.*)" appears twice in this delta$/,
  },
  {
    rule: 'archive/op-conflict',
    delegated: /^Duplicate requirement in REMOVED: "(.*)"$/,
    nativeKey: /^REMOVED "(.*)" appears twice in this delta$/,
  },
  {
    rule: 'archive/op-conflict',
    delegated:
      /^Requirement present in both RENAMED and REMOVED: "(.*?)"(?: \(REMOVED spells it ".*"\))?$/,
    nativeKey: /^REMOVED ".*" names the source of RENAMED "(.*)" -> "/,
  },
  //
  // 1.13.1's orphaned-requirement WARNING vs deltas/orphaned-requirement.
  // Keyed on the requirement name, never the section text: cospec's advisory
  // reader quotes a header's `## Notes` with any trailing comment masked away,
  // the binary with it.
  {
    rule: 'deltas/orphaned-requirement',
    delegated:
      /^Requirement "(.*)" is (?:under ".*"|above the first "## " section), which is not a delta section, so it is ignored\. Move it under /,
    nativeKey:
      /^requirement "(.*)" is (?:under ".*"|above the first "## " section), which is not a delta section, so it is ignored$/,
  },
  // 1.13.1's headerless-delta ERROR vs deltas/header-present, the same file.
  {
    rule: 'deltas/header-present',
    delegated: /^No delta sections found\. Add headers such as "## ADDED Requirements"()/,
    nativeKey:
      /^no recognized delta header \(## ADDED\|MODIFIED\|REMOVED\|RENAMED Requirements\) found()$/,
  },
  // CHANGE_NO_DELTAS, item-level: raised only when no delta file parsed an
  // entry, which a headerless file is. No key, as for archive/no-ops above.
  {
    rule: 'deltas/header-present',
    delegated: /^Change must have at least one delta\. No deltas found\./,
  },

  // --- round-5 pairings -------------------------------------------------------
  //
  // A requirement a delta writes inside an HTML comment: the binary's delta
  // validator reads it, cospec's advisory reader masks it, and the archive
  // merges it — so the defect is `archive/rebuilt-spec-invalid`'s, on the
  // commented header's line. Keyed on the requirement name both quote.
  {
    rule: 'archive/rebuilt-spec-invalid',
    delegated: /^(?:ADDED|MODIFIED) "(.*)" is missing requirement text$/,
    nativeKey:
      /^requirement "(.*)" \(line \d+ of this delta\) has (?:.* and )?no text under its header\b/,
  },
  {
    rule: 'archive/rebuilt-spec-invalid',
    delegated:
      /^(?:ADDED|MODIFIED) "(.*)" must contain SHALL or MUST in the requirement body, not only in the header\./,
    nativeKey:
      /^requirement "(.*)" \(line \d+ of this delta\) has (?:.* and )?no text under its header\b/,
  },
  {
    rule: 'archive/rebuilt-spec-invalid',
    delegated: /^(?:ADDED|MODIFIED) "(.*)" must include at least one scenario\b/,
    nativeKey:
      /^requirement "(.*)" \(line \d+ of this delta\) has (?:.* and )?no scenario in the rebuilt spec/,
  },

  // --- 1.12.0 archive-preflight INFO (`Validator.findArchiveBlockers`) ------
  //
  // 1.12 dry-runs archive's merge builder during `validate` and relays each
  // thrown precondition as an INFO. cospec's archive/* family has already
  // reported the same preconditions as ERRORs with its own wording, so the INFO
  // is the same defect said twice — one entry per precondition shape openspec
  // throws, because `rule` pairs one-to-one.
  //
  // Every capture stops inside the closing quote of the offending header, so a
  // near-miss tail (`, but "### Requirement: X" exists; fix the header …`,
  // `and differs only in case or spacing; …`) is outside the key rather than
  // inside it. `- header mismatch in content` has NO cospec twin and is
  // deliberately absent: it must keep reaching the reader.
  //
  // The scenario-preservation blocker (`- current spec contains scenario(s) not
  // present …`) has no entry either, and cannot: `findArchiveBlockers` skips a
  // spec whose path already carries an ERROR, and upstream's own scenario-loss
  // check has emitted one on that path first. The same path-keying bounds the
  // whole family at one preflight INFO per delta file per run.
  {
    rule: 'archive/target-missing',
    delegated:
      /^Archive would refuse this delta: .*MODIFIED failed for header "### Requirement: (.+?)" - not found/,
    nativeKey: /^MODIFIED target "(.+)" does not exist in living spec/,
  },
  {
    rule: 'archive/target-missing',
    delegated:
      /^Archive would refuse this delta: .*REMOVED failed for header "### Requirement: (.+?)" - not found/,
    nativeKey: /^REMOVED target "(.+)" does not exist in living spec/,
  },
  {
    rule: 'archive/target-missing',
    delegated:
      /^Archive would refuse this delta: .*RENAMED failed for header "### Requirement: (.+?)" - source not found/,
    nativeKey: /^RENAMED target "(.+)" does not exist in living spec/,
  },
  {
    rule: 'archive/added-exists',
    delegated:
      /^Archive would refuse this delta: .*RENAMED failed for header "### Requirement: (.+?)" - target already exists/,
    nativeKey: /^RENAMED target "(.+)" collides with an /,
  },
  {
    rule: 'archive/added-exists',
    delegated:
      /^Archive would refuse this delta: .*ADDED failed for header "### Requirement: (.+?)" - already exists/,
    nativeKey: /^ADDED "(.+)" already exists with different content/,
  },
  // A new capability's MODIFIED/RENAMED vs archive/new-spec-non-added, keyed
  // on the capability both messages name.
  {
    rule: 'archive/new-spec-non-added',
    delegated:
      /^Archive would refuse this delta: (.+?): target spec does not exist; only ADDED requirements are allowed for new specs\./,
    nativeKey: / targets capability '(.+?)', which has no living spec — /,
  },
  // 1.13.1's structurally-invalid living spec vs archive/target-invalid,
  // keyed on the capability both messages name. Only when every defect the
  // binary lists is one of the three kinds cospec's rule reads — a delta
  // header, a misplaced or a duplicate requirement — so a listed defect
  // cospec does not check still reaches the reader. Matched line by line
  // (`TARGET_INVALID`), linear in the message whatever its quoted headers hold.
  {
    rule: 'archive/target-invalid',
    delegated: TARGET_INVALID,
    nativeKey: /^living spec openspec\/specs\/(.+?)\/spec\.md is structurally invalid — /,
  },
  // 1.13.1's two case-collision refusals, paired with the fold arms
  // `rules/archive.ts` grew for them.
  {
    rule: 'archive/added-exists',
    delegated:
      /^Archive would refuse this delta: .*RENAMED failed for header "### Requirement: (.+?)" - "### Requirement: .*" already exists and differs only in case or spacing/,
    nativeKey: /^RENAMED target "(.+)" differs only in case or spacing/,
  },
  {
    rule: 'archive/added-exists',
    delegated:
      /^Archive would refuse this delta: .*ADDED failed for header "### Requirement: (.+?)" - "### Requirement: .*" already exists and differs only in case or spacing/,
    nativeKey: /^ADDED "(.+)" differs only in case or spacing/,
  },
]

/**
 * cospec's own issues followed by the delegated ones, minus every delegated
 * duplicate of a cospec rule that already fired on this item.
 */
export function mergeDelegated(native: Issue[], delegated: Issue[]): Issue[] {
  const kept = delegated.filter((issue) => {
    for (const cls of DUPLICATE_CLASSES) {
      const match = cls.delegated.exec(issue.message)
      if (match === null) continue
      const twin = native.some((n) => {
        if (n.rule !== cls.rule) return false
        if (cls.nativeKey === undefined) return true
        return n.path === issue.path && cls.nativeKey.exec(n.message)?.[1] === match[1]
      })
      if (twin) return false
    }
    return true
  })
  return [...native, ...kept]
}

/**
 * Run `openspec validate <args>` and return its parsed items. Tolerant: a
 * non-JSON body (e.g. the plain-text `Unknown item` an artifact-less change
 * yields) resolves to no items rather than throwing — cospec's own rules
 * already diagnose those states.
 */
async function delegate(root: Root, args: string[]): Promise<OpenspecItem[]> {
  const res = await spawnOpenspec(
    threadedArgv(['validate'], ['--strict', '--json', '--no-interactive', ...root.storeArgs], args),
    root.cwd,
  )
  try {
    const parsed = JSON.parse(res.stdout) as OpenspecValidateJson
    return Array.isArray(parsed.items) ? parsed.items : []
  } catch {
    return []
  }
}

// --- per-item validation ---------------------------------------------------

function buildReport(
  id: string,
  issues: Issue[],
  type: string | undefined,
  strict: boolean,
): ItemReport {
  const errors = issues.filter((i) => i.level === 'ERROR').length
  const warnings = issues.filter((i) => i.level === 'WARNING').length
  const valid = errors === 0 && (!strict || warnings === 0)
  return { id, kind: 'change', type, valid, issues }
}

/**
 * Build the archive/active-slug context a change validation needs. Exported so
 * other commands (`apply`, `archive`) can run `validateChange` programmatically
 * without re-deriving the indexes.
 */
/**
 * Every slug an archive directory could have come from.
 *
 * Openspec stamps `YYYY-MM-DD-<slug>` on archive, so the slug is normally the
 * name minus that prefix. Since 1.7.0 it refuses to stamp a *second* prefix on
 * a slug that already opens with a date, and archives it verbatim — so
 * `2026-07-04-thing` is ambiguous on disk: it is either slug `thing` archived
 * with a date, or slug `2026-07-04-thing` archived as itself. Both are
 * returned. This set only ever answers "has this slug been archived?"
 * (`blockers/*`, archive-collision), so covering both readings resolves the
 * blocker either way, while dropping one silently mis-answers it.
 */
export function archivedSlugsFor(dirName: string): string[] {
  const stripped = /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(dirName)?.[1]
  if (stripped === undefined) return [dirName]
  return [stripped, dirName]
}

export function buildValidateContext(base: string): ValidateContext {
  const archiveSlugs = new Set(
    existsSync(archiveDir(base))
      ? readdirSync(archiveDir(base), { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .flatMap((e) => archivedSlugsFor(e.name))
      : [],
  )
  return { archiveSlugs, activeSlugs: new Set(listChanges(base).map((c) => c.id)) }
}

/**
 * Validate one change and return its report (DESIGN §4.1). Exported for `apply`
 * (§5.1 step 2, `fast: true`) and `archive` (§5.2 step 2, full). `opts.fast`
 * skips the archive-precondition family.
 */
export async function validateChange(
  root: Root,
  change: { id: string; dir: string; schema: string },
  ctx: ValidateContext,
  opts: { strict: boolean; fast: boolean },
): Promise<ItemReport> {
  // A namespace folder is reported as one, and nothing else runs on it.
  const nested = findNestedChangesIn(changesDir(root.base), change.id)
  if (nested !== undefined)
    return buildReport(
      change.id,
      [nestedChangeIssue(describeNestedChange(nested))],
      undefined,
      opts.strict,
    )

  const { load, unreadable } = loadChange(root.base, change.id, change.dir)
  // An artifact that cannot be read fails the change, not the command, and
  // nothing is delegated for it.
  if (unreadable.length > 0)
    return buildReport(
      change.id,
      unreadable.map((f) => unreadableArtifactIssue(f.path, f.code)),
      load.openspecYaml.schema,
      opts.strict,
    )
  const y = load.openspecYaml

  // meta/openspec-yaml precondition — cannot classify without a schema.
  if (!y.present || !y.parseable || y.schema === undefined || y.schema.length === 0) {
    const issues = [...openspecYamlIssues(y), ...nameKebabIssues(change.id)]
    return buildReport(change.id, issues, undefined, opts.strict)
  }

  const resolution = resolveSchema(root.base, y.schema)

  if (resolution.kind === 'cospec') {
    const schema = cospecSchemaInfo(y.schema, y.schemaVersion ?? 1, y.skipSpecs === true)
    const issues = runChangeRules(load, schema, ctx, opts)
    // Delegate to openspec only for spec-bearing cospec changes that have a
    // proposal (openspec is blind to artifact-less changes — probe §5.3).
    if (
      schema.declared.has('specs') &&
      load.deltaFiles.length > 0 &&
      load.proposalText !== undefined
    ) {
      const items = await delegate(root, [change.id])
      const delegated = items
        .filter((item) => item.id === change.id)
        .flatMap((item) => item.issues.map((i) => mapDelegated(i, true)))
      return buildReport(change.id, mergeDelegated(issues, delegated), y.schema, opts.strict)
    }
    return buildReport(change.id, issues, y.schema, opts.strict)
  }

  // Legacy / unknown: no cospec rule families; classify and (legacy) delegate.
  const stub = deriveSchemaInfo(y.schema, [], [], resolution.kind === 'legacy')
  const issues = [
    ...openspecYamlIssues(y),
    ...nameKebabIssues(change.id),
    ...schemaClassificationIssues(stub),
  ]
  if (resolution.kind === 'legacy') {
    const items = await delegate(root, [change.id])
    for (const item of items)
      if (item.id === change.id) issues.push(...item.issues.map((i) => mapDelegated(i, true)))
  }
  return buildReport(change.id, issues, y.schema, opts.strict)
}

/**
 * Living capabilities, discovered recursively so the nested
 * `specs/<area>/<capability>/spec.md` layout is listed under the same id
 * openspec itself uses (`<area>/<capability>`) rather than being missed
 * entirely by a one-level readdir.
 */
function livingSpecFiles(base: string): { id: string; specFile: string }[] {
  return discoverSpecFiles(join(openspecDir(base), 'specs'))
}

async function validateSpecs(root: Root, only: string | undefined): Promise<ItemReport[]> {
  const caps = livingSpecFiles(root.base).filter((c) => only === undefined || c.id === only)
  if (caps.length === 0) return []

  // One delegation serves every spec, so each item's time runs from its start.
  const start = Date.now()
  const delegated = new Map<string, OpenspecIssue[]>()
  for (const item of await delegate(root, ['--specs'])) delegated.set(item.id, item.issues)

  return caps.map((cap) => specReport(cap, delegated.get(cap.id) ?? [], start))
}

/** One living spec's report: cospec's spec rules merged with the binary's issues for it. */
function specReport(
  cap: { id: string; specFile: string },
  delegated: readonly OpenspecIssue[],
  start: number,
): ItemReport {
  const path = `specs/${cap.id}/spec.md`
  const living = parseLivingSpec(readFileSync(cap.specFile, 'utf8'))
  const issues = mergeDelegated(
    specsRules(living, path),
    delegated.map((i) => mapDelegated(i)),
  )
  const errors = issues.filter((i) => i.level === 'ERROR').length
  const durationMs = Date.now() - start
  return { id: cap.id, kind: 'spec' as const, valid: errors === 0, issues, durationMs }
}

/**
 * `validate <id> --type spec` on a spec file discovery skips (a dot-directory,
 * a capability behind a linked directory): the binary's `validateDirectItem`
 * validates the file at `specs/<id>/spec.md` anyway, and its bulk `--specs`
 * sweep skips it too, so the binary is asked for that one item.
 */
async function validateForcedSpec(root: Root, id: string): Promise<ItemReport[]> {
  const start = Date.now()
  const specFile = join(openspecDir(root.base), 'specs', ...id.split('/'), 'spec.md')
  const delegated = (await delegate(root, [id, '--type', 'spec'])).find((item) => item.id === id)
  return [specReport({ id, specFile }, delegated?.issues ?? [], start)]
}

/** The first openspec release whose `validate` takes `--archived`. */
const ARCHIVED_SINCE = '1.9.0'

/** A diagnostic of the binary's failure document (`{status: [...]}`). */
interface StatusDiagnostic {
  severity: string
  code?: string
  message: string
  fix?: string
}

/**
 * The binary's answer to `validate --archived`: its report's items, or its
 * failure document (an unreadable `changes/archive/`, say) with its exit code.
 */
type ArchivedAnswer =
  | { items: ItemReport[] }
  | { failure: { status: StatusDiagnostic[] } & Record<string, unknown>; exitCode: number }

/**
 * `cospec validate --archived` — pure delegation (openspec >= 1.9.0). The
 * wrapped binary walks `changes/archive/` and reports any archived change whose
 * tasks are not all complete; cospec has no native rule family for archived
 * changes, so nothing is merged in. Its report is relayed through cospec's own
 * renderer so the output and exit code match every other validate surface;
 * its failure document is the answer as it stands. Whether the binary is too
 * old for the flag is read from its version, never guessed from its output.
 */
async function validateArchived(root: Root): Promise<ArchivedAnswer> {
  const args = threadedArgv(
    ['validate'],
    ['--json', '--no-interactive', ...root.storeArgs],
    ['--archived'],
  )
  const label = wrappedCallLabel(args)
  let answer: ArchivedAnswer | undefined
  await runOpenspec(args, {
    cwd: root.cwd,
    expect: {
      exitCodes: [0, 1],
      postCondition: (result) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(result.stdout)
        } catch {
          return `${label} did not print one JSON document`
        }
        if (isOpenspecErrorStatus(parsed)) {
          answer = {
            failure: parsed as { status: StatusDiagnostic[] },
            exitCode: result.exitCode,
          }
          return true
        }
        const items = (parsed as Partial<OpenspecValidateJson> | null)?.items
        if (!Array.isArray(items))
          return `${label} printed neither a validation report nor a diagnostic`
        answer = {
          items: items.map((item) => ({
            id: item.id,
            kind: 'change' as const,
            valid: item.valid,
            issues: item.issues.map((i) => mapDelegated(i, true)),
            ...(typeof item.durationMs === 'number' ? { durationMs: item.durationMs } : {}),
          })),
        }
        return true
      },
    },
  })
  return answer!
}

/**
 * The binary's failure document as cospec relays it: each diagnostic's
 * message and fix spelled through the remedy allowlist, the document (under
 * `--json`) or `cospec: <message>` lines (text), with the binary's exit code.
 */
function relayFailure(
  failure: { status: StatusDiagnostic[] } & Record<string, unknown>,
  exitCode: number,
  json: boolean,
): number {
  const status = failure.status.map((d) => ({
    ...d,
    message: respellRemedies(d.message),
    ...(d.fix === undefined ? {} : { fix: respellRemedies(d.fix) }),
  }))
  if (json) process.stdout.write(`${JSON.stringify({ ...failure, status }, null, 2)}\n`)
  else
    for (const d of status)
      process.stderr.write(`cospec: ${d.message}\n${d.fix === undefined ? '' : `Fix: ${d.fix}\n`}`)
  return exitCode
}

// --- item resolution (the binary's `validateDirectItem`) ------------------------

/** The binary's `utils/match` `levenshtein`. */
function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost)
    }
  return dp[a.length]![b.length]!
}

/**
 * The binary's `nearestMatches(input, candidates, 5)`: the five nearest
 * candidates by edit distance, stable in candidate order, duplicates kept.
 */
export function nearestMatches(input: string, candidates: readonly string[], max = 5): string[] {
  return candidates
    .map((candidate) => ({ candidate, distance: levenshtein(input, candidate) }))
    .toSorted((a, b) => a.distance - b.distance)
    .slice(0, max)
    .map((s) => s.candidate)
}

/** The binary's `normalizeType`: `change` or `spec`, any case; anything else is no override. */
function normalizeType(value: string | undefined): 'change' | 'spec' | undefined {
  const v = value?.toLowerCase()
  return v === 'change' || v === 'spec' ? v : undefined
}

/** The binary's `folderStyleNameProblem(value, label)` (`core/id.js`). */
function folderStyleNameProblem(value: string, label: string): string | undefined {
  if (value.length === 0) return `${label} must not be empty`
  if (value === '.' || value === '..') return `${label} must not be '${value}'`
  if (/[\\/]/u.test(value)) return `${label} must not contain path separators`
  return undefined
}

/** The binary's ambiguity fix, `validate/ambiguous-noun-form` as cospec spells it (no noun-form commands). */
const AMBIGUOUS_FIX = 'Pass --type change|spec.'

/**
 * An item-resolution refusal: the binary's message after `cospec: ` on
 * stderr (and its fix on the next line), or its one-diagnostic document
 * under `--json`; exit 1.
 */
function refuseItem(json: boolean, code: string, message: string, fix?: string): number {
  if (json) {
    const status = [{ severity: 'error', code, message, ...(fix === undefined ? {} : { fix }) }]
    process.stdout.write(`${JSON.stringify({ status }, null, 2)}\n`)
  } else process.stderr.write(`cospec: ${message}\n${fix === undefined ? '' : `${fix}\n`}`)
  return 1
}

/**
 * `cospec validate <name>` resolves the name as the binary does (design D7):
 * `--type` forces the kind; else membership among the active change ids and
 * the living spec ids — a name that is both is refused as ambiguous, one that
 * is neither gets the binary's nearest matches. A forced kind first rejects a
 * path-shaped name, then reports an item that is not on disk as one
 * `meta/item-missing` ERROR.
 */
async function validateItem(
  root: Root,
  name: string,
  typeFlag: string | undefined,
  opts: { strict: boolean; fast: boolean; json: boolean },
): Promise<ItemReport[] | number> {
  const base = root.base
  const changeIds = listChanges(base).map((c) => c.id)
  const specIds = livingSpecFiles(base).map((s) => s.id)
  const isChange = changeIds.includes(name)
  const isSpec = specIds.includes(name)
  const override = normalizeType(typeFlag)
  const kind = override ?? (isChange ? 'change' : isSpec ? 'spec' : undefined)
  if (kind === undefined) {
    const suggestions = nearestMatches(name, [...changeIds, ...specIds])
    const message =
      suggestions.length > 0
        ? `Unknown item '${name}'. Did you mean: ${suggestions.join(', ')}?`
        : `Unknown item '${name}'.`
    return refuseItem(opts.json, 'unknown_item', message)
  }
  if (override === undefined && isChange && isSpec)
    return refuseItem(
      opts.json,
      'ambiguous_item',
      `Ambiguous item '${name}' matches both a change and a spec.`,
      AMBIGUOUS_FIX,
    )
  // Spec ids nest (`<area>/<capability>`), so the guard runs per segment;
  // change names are flat and keep the whole-value check.
  const problem =
    kind === 'change'
      ? folderStyleNameProblem(name, 'Change name')
      : name
          .split('/')
          .map((segment) => folderStyleNameProblem(segment, 'Spec id'))
          .find((p) => p !== undefined)
  if (problem !== undefined) return refuseItem(opts.json, 'invalid_item', problem)

  const start = Date.now()
  if (kind === 'change') {
    const dir = join(base, 'openspec', 'changes', name)
    if (!existsSync(dir)) {
      const issues = [itemMissingIssue('change', name)]
      return [{ id: name, kind: 'change', valid: false, issues, durationMs: Date.now() - start }]
    }
    const change = listChanges(base).find((c) => c.id === name) ?? { id: name, dir, schema: '' }
    const report = await validateChange(root, change, buildValidateContext(base), opts)
    return [{ ...report, durationMs: Date.now() - start }]
  }
  if (!existsSync(join(openspecDir(base), 'specs', ...name.split('/'), 'spec.md'))) {
    const issues = [itemMissingIssue('spec', name)]
    return [{ id: name, kind: 'spec', valid: false, issues, durationMs: Date.now() - start }]
  }
  return isSpec ? validateSpecs(root, name) : validateForcedSpec(root, name)
}

// --- --concurrency ---------------------------------------------------------------

/** The binary's bulk default when neither `--concurrency` nor `OPENSPEC_CONCURRENCY` names one. */
const DEFAULT_CONCURRENCY = 6

/** The binary's `normalizeConcurrency`: a positive `parseInt`, else nothing (never refused). */
function normalizeConcurrency(value: string | undefined): number | undefined {
  if (value === undefined || value.length === 0) return undefined
  const n = Number.parseInt(value, 10)
  return Number.isNaN(n) || n <= 0 ? undefined : n
}

/** How many change validations run at once: `--concurrency`, else `OPENSPEC_CONCURRENCY`, else 6. */
export function concurrencyBound(
  flag: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): number {
  return (
    normalizeConcurrency(flag) ??
    normalizeConcurrency(env.OPENSPEC_CONCURRENCY) ??
    DEFAULT_CONCURRENCY
  )
}

/**
 * `fn` over `items` with at most `limit` calls in flight, the results in
 * input order whatever order they settle in (design D7). A rejection rejects
 * the whole pool, as `Promise.all` did.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = Array.from<R>({ length: items.length })
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// --- --report (the binary's request validation) ---------------------------------

/** The binary's one fix for every refused report request. */
const REPORT_FIX =
  'Use --report full|findings with --all, --changes, --specs, or --archived, without an item name. Do not combine archived and active scopes.'

/**
 * The binary's `--report` request validation, checked before any root is
 * resolved: the refusal message, or undefined for an acceptable request.
 */
function reportRequestProblem(
  report: string,
  name: string | undefined,
  archived: boolean,
  bulk: boolean,
): string | undefined {
  if (report !== 'full' && report !== 'findings') return `Unknown validation report '${report}'.`
  if (name !== undefined) return 'A validation report cannot be combined with an item name.'
  if (archived && bulk) return 'A validation report cannot combine archived and active scopes.'
  if (!archived && !bulk) return 'A validation report requires an explicit bulk scope.'
  return undefined
}

/** The binary's `findingsScope` for an accepted `--report findings` request. */
function findingsScope(o: {
  archived: boolean
  all: boolean
  changes: boolean
  specs: boolean
}): FindingsScope {
  if (o.archived) return 'archived'
  if (o.all || (o.changes && o.specs)) return 'all'
  return o.changes ? 'changes' : 'specs'
}

/** A report in the requested shape: the full report, or its findings projection. */
function renderReport(
  items: ItemReport[],
  opts: { json: boolean; strict: boolean; noColor: boolean; findings?: FindingsScope },
  root: ResolvedRoot,
  kinds: readonly ItemReport['kind'][],
): string {
  const upstream = { root: rootOutput(root), kinds }
  if (opts.findings !== undefined && opts.json)
    return `${JSON.stringify(toFindings(toJson(items, upstream), opts.findings), null, 2)}\n`
  if (opts.json) return renderJson(items, upstream)
  return renderHuman(items, {
    strict: opts.strict,
    noColor: opts.noColor,
    findingsOnly: opts.findings !== undefined,
  })
}

// --- command entrypoint -----------------------------------------------------

export async function run(ctx: CommandContext): Promise<number> {
  const { flags } = ctx
  const parsed = ctx.parsed!
  const strict = hasFlag(parsed, '--strict')
  const fast = hasFlag(parsed, '--fast')
  const wantAll = hasFlag(parsed, '--all')
  const wantChanges = hasFlag(parsed, '--changes')
  const wantSpecs = hasFlag(parsed, '--specs')
  const wantArchived = hasFlag(parsed, '--archived')
  const name = parsed.positionals[0]
  const bulk = wantAll || wantChanges || wantSpecs

  // `--report` is validated before any root is resolved, as the binary does.
  const report = flagValue(parsed, '--report')
  let findings: FindingsScope | undefined
  if (report !== undefined) {
    const problem = reportRequestProblem(report, name, wantArchived, bulk)
    if (problem !== undefined) {
      if (flags.json) {
        const status = [
          {
            severity: 'error',
            code: 'invalid_validation_report_request',
            message: problem,
            fix: REPORT_FIX,
          },
        ]
        process.stdout.write(`${JSON.stringify({ status }, null, 2)}\n`)
      } else process.stderr.write(`Error: ${problem}\nFix: ${REPORT_FIX}\n`)
      return 1
    }
    if (report === 'findings')
      findings = findingsScope({
        archived: wantArchived,
        all: wantAll,
        changes: wantChanges,
        specs: wantSpecs,
      })
  }
  const renderOpts = { json: flags.json, strict, noColor: flags.noColor, findings }

  const root = await resolveRootOrDocument(ctx, 'validate_error')
  if (root === undefined) return 1
  const base = root.base

  if (!existsSync(openspecDir(base))) {
    process.stderr.write(`cospec: no openspec/ directory at ${base} — run 'cospec init' first\n`)
    return 1
  }

  // `--archived` is its own scope, resolved before every other flag: it reads
  // changes/archive/, which active-change discovery deliberately excludes, and
  // it must never quietly alter an ordinary invocation.
  if (wantArchived) {
    const version = await wrappedOpenspecVersion()
    if (openspecBelow(version, ARCHIVED_SINCE)) {
      process.stderr.write(
        `cospec: validate --archived needs OpenSpec >=${ARCHIVED_SINCE}; the wrapped OpenSpec is ` +
          `${version}\n`,
      )
      return 1
    }
    const archived = await validateArchived(root)
    if ('failure' in archived) return relayFailure(archived.failure, archived.exitCode, flags.json)
    process.stdout.write(renderReport(archived.items, renderOpts, root, ['change']))
    return reportExitCode(archived.items, strict)
  }

  const items: ItemReport[] = []
  // The kinds in scope, each counted in `summary.byType` as the binary counts it.
  const kinds: ItemReport['kind'][] = []
  if (name !== undefined && !bulk) {
    // A bulk flag beside a name runs the bulk scope and ignores the name, as
    // the binary does; a name alone is resolved as the binary resolves it.
    const resolved = await validateItem(root, name, flagValue(parsed, '--type'), {
      strict,
      fast,
      json: flags.json,
    })
    if (typeof resolved === 'number') return resolved
    items.push(...resolved)
    kinds.push(...new Set(resolved.map((item) => item.kind)))
  } else {
    const changes = listChanges(base)
    const ctxRules = buildValidateContext(base)
    const doChanges = wantChanges || wantAll || !bulk
    const doSpecs = wantSpecs || wantAll || !bulk
    if (doChanges) kinds.push('change')
    if (doSpecs) kinds.push('spec')
    if (doChanges) {
      const bound = concurrencyBound(flagValue(parsed, '--concurrency'))
      const reports = await mapPool(changes, bound, async (change) => {
        const start = Date.now()
        const report = await validateChange(root, change, ctxRules, { strict, fast })
        return { ...report, durationMs: Date.now() - start }
      })
      items.push(...reports)
    }
    if (doSpecs) items.push(...(await validateSpecs(root, undefined)))
  }

  // The findings report's exit code is always the full report's.
  process.stdout.write(renderReport(items, renderOpts, root, kinds))
  return reportExitCode(items, strict)
}
