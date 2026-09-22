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

This change is pin-independent: it corrects agent guidance that is wrong at the
current OpenSpec pin, touches no wrapper code, and shares no file with the
task-marker or delta-parser fixes or with the pin bump. It does, however, own
`mise run generate` exclusively for its review window — a concurrent change that
edits `apps/cli/src/canon/**` would collide on the regenerated harness tree and
on `generate:check`. `.agents/shared.md` is deliberately out of scope here so
that `mise run generate` and `mise run agents:sync` stay in separate changes.
