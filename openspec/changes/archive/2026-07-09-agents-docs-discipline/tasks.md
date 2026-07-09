## 1. Author shared context

- [x] 1.1 Add docs-site context to `.agents/shared.md`: what `apps/docs` is,
      release-synced deploy via `release.yml` docs jobs, `ci-docs` PR gate,
      `docs:build`/`docs:dev` mise tasks, llms.txt output, canonical-content
      ownership -> `## Docs site` section added after the mise-task table, plus
      `apps/docs/` layout entry and two docs task rows
- [x] 1.2 Add the docs-sync discipline: user-facing behavior changes update
      `apps/docs` in the same change, with what counts as user-facing and
      verification-evidence expectations -> `**Docs never drift**` entry in
      Engineering discipline, after `**Tests**`
- [x] 1.3 Add the shared.md self-maintenance discipline: update it unprompted in
      any change that alters how work gets done, then `mise run agents:sync` ->
      `**Keep shared.md current**` entry in Engineering discipline

## 2. Propagate and verify

- [x] 2.1 Run `mise run agents:sync` to regenerate `CLAUDE.md` / `AGENTS.md` ->
      Synced: CLAUDE.md, AGENTS.md
- [x] 2.2 Run `mise run agents:check` — must pass (no drift) -> "All shared
      blocks are in sync.", exit 0
- [x] 2.3 Run `mise run cospec -- validate agents-docs-discipline --strict` —
      must pass -> "0 errors, 0 warnings — validation passed", exit 0
