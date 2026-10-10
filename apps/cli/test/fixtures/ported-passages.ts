// The controlling sentences of the passages canon-workflow-parity ports from the pinned openspec
// workflow templates (design D5 and D6). Each sentence is upstream's text verbatim, so the
// integration check can find it in the pinned dist file; a backtick there is escaped as `\``
// inside the template literal, and the check unescapes it before matching.

/** The pinned templates a passage was ported from, relative to the openspec package dir. */
export const WORKFLOW_TEMPLATES = 'dist/core/templates/workflows'

export interface PortedPassage {
  readonly passage: string
  readonly files: readonly string[]
  readonly sentences: readonly string[]
}

/** Ported into `propose` and `ff` (design D5). */
export const INSPECT_BEFORE_DRAFTING: PortedPassage = {
  passage: 'inspect-before-drafting',
  files: ['propose.js', 'ff-change.js'],
  sentences: [
    'Inspect the relevant project before drafting',
    'inspect relevant implementation, nearby tests, configuration, and documentation outside `openspec/`',
    'Keep inspection read-only and proportional to the change',
    'reuse findings for later artifacts and inspect more only as needed',
    'Identify the target project from the request and project context',
    'If the target is unclear, ask.',
    'Ground scope, approach, and tasks in what you find.',
    'Distinguish observed behavior from assumptions and proposed additions',
    'surface conflicts with existing specs instead of silently deciding which is correct',
    'Do this discovery now, rather than leaving generic "explore the codebase" or "make a plan" tasks for implementation',
  ],
}

/** Ported into `explore` (design D6). */
export const ASCII_DIAGRAMS: PortedPassage = {
  passage: 'ascii-diagrams',
  files: ['explore.js'],
  sentences: [
    "Use ASCII diagrams liberally when they'd help clarify thinking",
    'Draw with plain ASCII only',
    'borders `+` `-` `|`, arrows `-->` `<--` `^` `v`, markers `*` `x`.',
    'Unicode diagram glyphs can render at different widths across terminals, fonts, and locales, so padded boxes and aligned tables can drift.',
    'Keep every diagram character ASCII.',
  ],
}

/** Ported into `apply` (design D7); the sentences read as one run once whitespace is flattened. */
export const OPERATION_INPUTS_PRECEDENCE: PortedPassage = {
  passage: 'operation-inputs-precedence',
  files: ['apply-change.js'],
  sentences: [
    'Treat `context` as a required prompt-level input.',
    'Treat `operationGuidance` as optional additive advice.',
    'follow entries that are applicable and compatible with the built-in workflow.',
    'They are not evidence of task completion, do not replace the built-in instruction, and do not permit bypassing a blocked state.',
    'If context conflicts with the built-in instruction, an explicit user choice, or a CLI-controlled value, report the conflict and preserve the controlling value.',
    'If guidance is inapplicable or conflicts with those controlling inputs, do not follow it and explain why.',
    'These are prompt-level behavior contracts, not enforceable checks.',
    'Do not copy `context` or `operationGuidance` verbatim into implementation files or planning artifacts unless the user separately asks for that content.',
  ],
}

/** Ported into `archive` (design D8). */
export const ARCHIVE_INPUTS_LOOKUP: PortedPassage = {
  passage: 'archive-inputs-lookup',
  files: ['archive-change.js'],
  sentences: [
    'This lookup is advisory and optional: it only supplies extra prompt inputs, so it must never block archiving.',
    'continue the archive workflow with no context and no operation guidance. Do not report an error and do not stop.',
    'A successful response may omit both optional fields.',
    'Treat `context` as a required prompt-level input: read and consider it, and apply relevant project facts, conventions, and constraints.',
    'Treat `operationGuidance` as optional additive advice: read and consider every entry, and follow entries that are applicable and compatible with the built-in archive workflow.',
    'Keep both fields separate from built-in steps, explicit user choices, resolved paths, CLI checks, and command contracts.',
    'If context conflicts with one of those controlling inputs, report the conflict and preserve the controlling value.',
    'If guidance is inapplicable or conflicts with a controlling input, do not follow it and explain why.',
    'Do not infer replacement paths, skipped prompts, or flags from either field',
    'do not copy their text verbatim into specs, change artifacts, or archive summaries unless the user separately asks for it.',
    'These are prompt-level behavior contracts, not enforceable checks.',
  ],
}

/** Ported into `bulk-archive` (design D8): the archive lookup, run once for the batch. */
export const BULK_ARCHIVE_INPUTS_LOOKUP: PortedPassage = {
  passage: 'archive-inputs-lookup',
  files: ['bulk-archive-change.js'],
  sentences: [
    'This lookup is advisory and optional: it only supplies extra prompt inputs, so it must never block the batch.',
    'continue the batch with no context and no operation guidance. Do not report an error and do not stop.',
    'A valid response may omit `context` and `operationGuidance`.',
    'Treat `context` as a required prompt-level input across the batch: read and consider it, and apply relevant project facts, conventions, and constraints.',
    'Treat `operationGuidance` as optional additive advice: read and consider every entry, and follow entries that are applicable and compatible with the built-in batch workflow.',
    'Keep both fields separate from conflict analysis, explicit user choices, resolved paths, CLI checks, and command contracts.',
    'If context conflicts with one of those controlling inputs, report the conflict and preserve the controlling value.',
    'If guidance is inapplicable or conflicts with a controlling input, do not follow it and explain why.',
    'Do not infer skipped prompts, replacement paths, or flags from either field, and do not copy their text verbatim into specs, changes, or summaries.',
    'These are prompt-level behavior contracts, not enforceable checks.',
  ],
}

/** Ported into `bulk-archive` (design D9): conflict detection and the include/exclude decision. */
export const COLLISION_RESOLUTION: PortedPassage = {
  passage: 'collision-resolution',
  files: ['bulk-archive-change.js'],
  sentences: [
    'A conflict exists when 2+ selected changes have delta specs for the exact same `<capability-path>`.',
    'from each conflicting change to understand what each claims to add/modify',
    'Look for code implementing requirements from each delta spec',
    'Check for related files, functions, or tests',
    'If both implemented -> apply in chronological order (older first, newer overwrites)',
    'An inclusion or exclusion decision for every delta spec, keyed by change and `<capability-path>`',
    'Rationale (what was found in codebase)',
  ],
}
