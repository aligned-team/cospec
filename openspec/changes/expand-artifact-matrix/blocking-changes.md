# Dependencies

## Blocked by

<!-- Changes that MUST be archived before this change can be applied. -->
<!-- Format: - [ ] `change-slug` — what it provides -->
<!-- cospec checks the box and appends *(archived YYYY-MM-DD)* when the dependency ships. -->

None.

## Soft-blocked by

<!-- Changes that improve this one but aren't strictly required. -->
<!-- Format: - [ ] `change-slug` — what degrades without it -->

None.

## Notes

<!-- Extra sections are allowed and ignored by the gate. -->

This is the only active change in `openspec/changes/`. The two archived changes
(`describe-self-hosting`, `fix-pre-push-gate-empty-remote`) provide nothing this
change consumes: it builds new canon, parser, rule, and command surface on the
existing composer and gate machinery, all of which already ships. No prior
change must land first.
