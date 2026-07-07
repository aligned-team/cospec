## 1. Update shared source

- [x] 1.1 Amend step 6 of "The cospec workflow (we self-host)" in
      `.agents/shared.md`: archive runs on the PR branch as the final commit
      before merge (never post-merge); state the never-merge-unarchived rule.
- [x] 1.2 Add the one-sentence clarification that schemas with no specs artifact
      (`ci`, `chore`, `docs`, …) correctly produce no spec-sync deltas on
      archive, next to the archive/spec-sync description.
- [x] 1.3 Run `mise run agents:sync` to regenerate `CLAUDE.md` and `AGENTS.md`
      from `.agents/shared.md`.

## 2. Update CONTRIBUTING.md

- [x] 2.1 Amend the "Self-hosting loop" step 6 with the same before-merge
      archive requirement.
- [x] 2.2 Amend "The cospec change workflow" step 6 with the same requirement.
- [x] 2.3 Add a line to "PR etiquette": a PR is complete only once it carries
      its own change's archive commit (`chore: archive <slug>`).

## 3. Verify

- [x] 3.1 Run `mise run generate:check` to confirm no drift between
      `.agents/shared.md` and the generated `CLAUDE.md`/`AGENTS.md`.
- [x] 3.2 Run `mise run check` and confirm it is green.
