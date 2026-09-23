# Design

## Context

cospec's delta reader is a port of OpenSpec's, and every divergence between the
two is a place where cospec's hard archive gates reason about a different set of
operations than the binary actually applies. The canonical requirement header is
one such divergence: upstream 1.13.1 matches it with `/i`, cospec does not.

The root cause is not "a missing flag" but a porting asymmetry. Upstream widened
the header regex (case) and the bullet regex (marker class) in separate places
and did **not** apply `/i` to the bullet or rename forms. cospec's comments
already record the marker-class half of that history (PR #39); the case half was
never ported.

The failure mode is sharpened by cospec's single-pass reader. Because an
unmatched `### ` line inside an open requirement is treated as body, a
case-variant header does not merely vanish — it is appended to the preceding
canonical block, inflating that block's `scenarioNames` while the real block
never exists. `archive/scenario-preservation` then validates the wrong pairing
and reports PASS over a scenario the binary will delete.

## Decisions

1. **Widen `REQUIREMENT_RE` only.** One regex gains `i`. It backs the ADDED/
   MODIFIED reader, the REMOVED plain-header reader, the orphan reader and the
   living-spec extractor — the same four surfaces upstream covers with its two
   `/i` regexes.
2. **Do not widen the bullet or rename regexes.** Probed against the real pinned
   binary: a lowercase REMOVED bullet and lowercase `from:`/`to:` lines both
   yield `deltaCount` 0 and a "no deltas found" validation error. Widening them
   would make cospec accept deltas the binary refuses — the inverse of the bug,
   and equally a lie about what archive will do. Fidelity means mirroring the
   asymmetry, not resolving it.
3. **Change nothing about scenarios or section titles.** Both are already
   case-tolerant in cospec for the same reasons they are upstream (`/^####\s+/`;
   lowercased section-title lookup). Verified rather than assumed — see
   verification 3.3.
4. **Pin the asymmetry in a contract test.** The accepted OpenSpec range is
   `>=1.0.0 <2.0.0`; a future version could make the bullet form
   case-insensitive too. A contract test over the probe matrix turns that into a
   loud failure instead of a silent re-divergence.

## Integration contract

- **Wrapped binary**: `@fission-ai/openspec`, pinned 1.13.1, accepted range
  `>=1.0.0 <2.0.0`. Spawned by resolved path as always; this change adds no new
  wrapped call and no new flag.
- **Parser parity surface** — what cospec's reader must agree with, by upstream
  symbol:
  - `requirement-blocks.ts` `REQUIREMENT_HEADER_REGEX`
    (`/^###\s*Requirement:\s*(.+)\s*$/i`) ↔ cospec `REQUIREMENT_RE` — **being
    reconciled here.**
  - `spec-structure.ts` `REQUIREMENT_HEADER`
    (`/^###\s+Requirement:\s*(.+)\s*$/i`) ↔ the living-spec extractor, same
    regex — reconciled by the same edit.
  - `requirement-blocks.ts` REMOVED bullet
    (``/^\s*[-*+]\s*`?###\s*Requirement:\s*(.+?)`?\s*$/``, no `i`) ↔ cospec
    `REMOVED_BULLET_RE` — already byte-identical; **stays** case-sensitive.
  - `requirement-blocks.ts` rename pair regexes (no `i`) ↔ cospec
    `RENAMED_FROM_RE` / `RENAMED_TO_RE` — already identical; **stay**
    case-sensitive.
  - `requirement-text.ts` `SCENARIO_HEADER` (`/^####\s+/`) ↔ cospec
    `SCENARIO_RE` — already identical.
  - `requirement-blocks.ts` `getSectionsCaseInsensitive` ↔ cospec's lowercased
    `SECTION_TITLES` lookup — already equivalent.
- **Direction of travel**: after this change cospec neither leads nor lags the
  pin on header case. It still deliberately leads the 1.11.0 floor on bullet
  markers (documented in `deltas.ts`); that divergence is unchanged here.

## Risks / Trade-offs

- **Risk: a delta relying on case-sensitivity to distinguish two requirements.**
  Not real — upstream already folds names case-insensitively
  (`normalizeRequirementName(...).toLowerCase()`), so `Foo` and `foo` were never
  two requirements to the binary. cospec's own `foldRequirementName` does the
  same. The fix removes a disagreement, it does not create a collision.
- **Trade-off: mirroring an upstream inconsistency.** A reader will reasonably
  ask why the bullet form is stricter than the plain form. The answer belongs in
  the code comment and the docs, not in a divergence: cospec's job is to predict
  archive, and archive is the binary's.
- **Risk: scenario names.** Scenario-name comparison stays case-**sensitive**
  (an existing living-spec requirement says so, and upstream agrees). This
  change must not disturb it; verification 3.3 and the existing
  `Scenario names are case-sensitive` scenario both guard that.
