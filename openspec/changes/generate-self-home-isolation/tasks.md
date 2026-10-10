# Tasks

## 1. Regression test first

- [x] 1.1 Add `apps/cli/test/integration/generate-self-home.test.ts`: init a
      scratch HOME's `.minimax` skills, stamp them stale, add a
      `delivery: commands` global config, run
      `scripts/generate-self update --check`, assert exit 0, "no drift" and an
      unchanged HOME snapshot; add a stand-in-`bun` test that all seven
      variables name one empty scratch directory -- verify each fails on the
      script with the matching assignment removed

## 2. Isolation

- [x] 2.1 Point `HOME`, `USERPROFILE`, `CODEX_HOME` and the XDG directories at
      the script's temporary directory and correct its header comment -- verify
      the new test passes and `mise run generate:check` still exits 0

## 3. Docs

- [x] 3.1 Update the `mise.toml` comment, `docs/self-hosting.md`,
      `docs/architecture.md` and `.agents/shared.md`, then
      `mise run     agents:sync` -- verify `mise run agents:check`

## 4. Gate

- [x] 4.1 `mise run check` green and
      `cospec validate generate-self-home-isolation     --strict` clean, every
      verification row `[x]` with its observed result -- the archive commit
      follows this one
