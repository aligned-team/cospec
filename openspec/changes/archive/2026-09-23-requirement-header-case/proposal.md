# Proposal

## Why

OpenSpec 1.13.1 matches the canonical requirement header case-insensitively —
`src/core/parsers/requirement-blocks.ts` reads
`/^###\s*Requirement:\s*(.+)\s*$/i`, `src/core/parsers/spec-structure.ts` reads
`/^###\s+Requirement:\s*(.+)\s*$/i`, and delta section titles are matched
through `getSectionsCaseInsensitive`. cospec's `REQUIREMENT_RE`
(`apps/cli/src/core/deltas.ts`) is case-**sensitive**, so `### requirement: Foo`
and `### REQUIREMENT: Foo` are real requirements to the binary and invisible to
cospec.

The failure is not a benign miss. Probed against the real pinned binary in a
throwaway project (see the probe log below), a lowercase REMOVED header deletes
the living requirement at archive, and a lowercase MODIFIED header rewrites it —
while cospec's parser returns zero ops for the same file. Worse, in a mixed
section the lowercase block is **absorbed into the preceding canonical block**:
cospec reads `### Requirement: Alpha` + `### requirement: Beta` as one op named
`Alpha` carrying Beta's scenarios, so `archive/scenario-preservation` checks an
inflated scenario set for Alpha and never checks Beta at all. A requirement's
scenarios can be dropped by the binary with cospec's hard gate reporting PASS —
the same silent-drop-into-a-hard-gate class as the bullet-marker defect fixed in
PR #39, and a false archive PASS is a release blocker.

## What Changes

- `REQUIREMENT_RE` in `apps/cli/src/core/deltas.ts` becomes case-insensitive,
  matching upstream's `REQUIREMENT_HEADER_REGEX` exactly. This covers the ADDED/
  MODIFIED block reader, the REMOVED plain-header reader, the orphaned-block
  reader, and the living-spec requirement extractor — every call site upstream
  reaches with its own `/i` regex.
- Nothing else loosens. The probe (below) establishes that upstream's REMOVED
  **bullet** form, the `FROM:`/`TO:` keywords, and the `Requirement:` keyword
  inside a rename line are all case-**sensitive** at 1.13.1, so cospec's
  `REMOVED_BULLET_RE`, `RENAMED_FROM_RE` and `RENAMED_TO_RE` stay as they are.
  Matching upstream means mirroring its inconsistency, not tidying it.

### Probe of the real binary (`apps/cli/node_modules/.bin/openspec` 1.13.1)

Run in a throwaway project; `validate --strict` exit and
`show --json --deltas-only` `deltaCount` recorded.

| Input                                              | 1.13.1 result                                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `## added requirements` (lowercase section header) | parsed — section recognised                                                                                 |
| `### requirement: Foo` under ADDED                 | parsed — `deltaCount` 1                                                                                     |
| `### REQUIREMENT: Foo` under ADDED                 | parsed — `deltaCount` 2 for both                                                                            |
| `#### scenario: Foo` / `#### SCENARIO: Foo`        | parsed — `SCENARIO_HEADER` is `/^####\s+/`, so **any** level-4 header is a scenario and case never mattered |
| `### requirement: Alpha` under REMOVED             | parsed; `archive` really removed `### Requirement: Alpha` from the living spec                              |
| `### REQUIREMENT: Alpha` under MODIFIED            | parsed; `archive` really rewrote the living requirement                                                     |
| ``- `### requirement: Alpha` `` (REMOVED bullet)   | **not** parsed — `deltaCount` 0, validate errors "no deltas found"                                          |
| ``- FROM: `### requirement: Alpha` `` / TO         | **not** parsed — `deltaCount` 0                                                                             |
| `- from:` / `- to:` (lowercase keywords)           | **not** parsed — `deltaCount` 0                                                                             |

So the fix mirrors exactly one upstream behavior: the canonical
`### Requirement:` header keyword is case-insensitive. Scenario headers need no
change (cospec's `SCENARIO_RE` is already `/^####\s+/`) and section titles need
no change (cospec already lowercases the title before the `SECTION_TITLES`
lookup).

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `spec-parsing-and-discovery`: the parsing-tolerances requirement must state
  that the requirement-header keyword is matched case-insensitively, and that
  the REMOVED bullet and rename keywords are not.

## Impact

- `apps/cli/src/core/deltas.ts` — `REQUIREMENT_RE` gains `i`, with the comment
  recording which upstream regexes it mirrors and which neighbouring forms stay
  case-sensitive.
- `apps/cli/test/unit/deltas*.test.ts` — regression coverage for the ADDED,
  MODIFIED, REMOVED and mixed-section cases.
- `apps/cli/test/contract/` — a contract test pinning the real binary's answers
  recorded above, so a pin bump that changes them fails loudly.
- `apps/docs` + `docs/validation.md` — wherever the delta header format is
  documented, the case tolerance and its limits.
- No CLI surface, flag, exit code or schema changes.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
