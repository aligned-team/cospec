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
