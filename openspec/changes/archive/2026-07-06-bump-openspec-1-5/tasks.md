## 1. Bump the dev/CI pin to exact 1.5.0

- [x] 1.1 Bump `@fission-ai/openspec` to exact `1.5.0` in
      `apps/cli/package.json`
- [x] 1.2 Regenerate `bun.lock` for the new pin
- [x] 1.3 Bump the `npm:@fission-ai/openspec` tool pin to `1.5.0` in `mise.toml`
- [x] 1.4 Regenerate `mise.lock` for linux-x64, linux-arm64, and macos-arm64
      (`mise install` / lockfile refresh) so all three platform entries carry
      1.5.0

## 2. Widen the runtime version acceptance to a semver range

- [x] 2.1 Replace the exact-match `EXPECTED_OPENSPEC_VERSION` constant and
      `checkVersion` string-equality check in `apps/cli/src/core/openspec.ts`
      with a semver-range check against `>=1.3.1 <2.0.0` (the higher of the two
      dossiers' recommended floors — both said 1.3.1 is fine)
- [x] 2.2 Give the range-mismatch error a clear message naming the accepted
      range (e.g. `expected an @fission-ai/openspec version satisfying
  > =1.3.1 <2.0.0, found <x>`)
- [x] 2.3 Confirm `COSPEC_ALLOW_OPENSPEC_DRIFT=1` still skips the check
      entirely, unchanged, and document that it does not make anything below
      version-safe

## 3. Fix the `generatedBy` prefix recognition for 1.5.0-stamped output

- [x] 3.1 Widen `isOpsxMarkdown()` in `apps/cli/src/commands/init.ts` (today
      hardcoded to `generatedBy.startsWith('1.3.')`) so it recognizes
      openspec-authored skill files stamped `generatedBy: '1.5.0'`, without
      weakening detection of genuinely foreign/user-authored files
- [x] 3.2 Bump the `generatedBy: '1.3.1'` literals in
      `apps/cli/test/fixtures/vanilla-openspec/.claude/skills/*/SKILL.md`
      (openspec-apply-change, openspec-archive-change, openspec-explore,
      openspec-propose) and in `apps/cli/test/unit/init/doctor.test.ts:83` and
      `apps/cli/test/unit/init/init.test.ts:179` to match real 1.5.0 output

## 4. Re-probe the contract suite against the real 1.5.0 binary

- [x] 4.1 Run `mise run test:contract` against the bumped
      `@fission-ai/openspec@1.5.0` and record every failure before touching any
      test — the suite must describe NEW reality honestly, never be weakened to
      pass
- [x] 4.2 Re-verify `archive-parity.test.ts` and `archive-gotchas.test.ts`:
      confirm `ABORTED_RE`/`CANCELLED_RE` and the exit-0-without-moving-the-
      directory behavior on each precondition failure (MODIFIED target missing,
      zero-op delta, ADDED-already-exists, RENAMED collision,
      new-spec-non-ADDED) still hold; update only if upstream behavior genuinely
      changed
- [x] 4.3 Re-verify `scenario-preservation.test.ts`: confirm a MODIFIED delta
      that drops `#### Scenario:` entries still merges cleanly at exit 0 (no
      upstream fix landed, per the dossier) — update the pinned assertion only
      if 1.5.0 actually added its own scenario-preservation check
- [x] 4.4 Re-verify `hard-reality.test.ts`: confirm `openspec validate --strict`
      on a delta-less change still hardcodes `CHANGE_NO_DELTAS` and exits 1 (the
      additive help-text tip is expected and fine) — update the assertion text
      only if the core sentence cospec matches actually changed
- [x] 4.5 Update `version-tripwire.test.ts` to assert the new
      package.json/mise.toml exact-1.5.0 pin plus the live binary satisfying the
      accepted range, replacing the old triple-exact-equality check — do not
      drop the tripwire, reshape it

## 5. Fix unit/integration fallout

- [x] 5.1 Run `mise run test` and `mise run test:integration`; fix any test that
      asserted the old exact-version constant, the old `generatedBy: '1.3.'`
      prefix match, or other now-stale literals
- [x] 5.2 Fix `apps/cli/test/unit/core/openspec.test.ts`'s live-binary checks of
      `status --json` / `list --json` shapes against the real 1.5.0 output

## 6. Update docs and generated-doc source

- [x] 6.1 Update `docs/architecture.md` and any other `docs/*.md` naming `1.3.1`
      to describe the new exact dev pin (1.5.0) and the accepted runtime range
      (`>=1.3.1 <2.0.0`)
- [x] 6.2 Update `README.md` and `apps/cli/README.md` version prose
- [x] 6.3 Update `.agents/shared.md` version-pin prose, then run
      `mise run agents:sync` to regenerate `CLAUDE.md`/`AGENTS.md` — never
      hand-edit the generated files directly
- [x] 6.4 Run `mise run agents:check` to confirm no drift remains

## 7. Full gate

- [x] 7.1 `mise run cospec -- validate bump-openspec-1-5 --strict` — must pass
      clean
- [x] 7.2 `mise run cospec -- apply bump-openspec-1-5` — obey the exit code: 0
      clear; if 3 (soft-blocked), report the soft blockers explicitly in the
      apply output rather than passing `--allow-soft` silently
- [x] 7.3 `mise run check` — full CI gate (lint, format, typecheck, unit,
      contract, integration, pack smoke, generate:check, agents:check) green
      before archive
