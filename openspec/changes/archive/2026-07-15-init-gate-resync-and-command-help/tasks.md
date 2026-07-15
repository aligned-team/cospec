## 1. Gate resync on state-C re-init

- [x] 1.1 Add `gateAlreadyPresent(cwd)` to `init.ts`: parse `mise.toml` (if
      present) with `Bun.TOML`; return true iff its `tasks` table has any key
      starting with `"cospec:"`.
- [x] 1.2 Change `gateEnabled`'s default in `run()` to: `--gate` → true;
      `--no-gate` → false; `state === 'A'` → true; else
      `gateAlreadyPresent(target)`.
- [x] 1.3 Regression test: state C, `mise.toml` already has
      `[tasks."cospec:apply"]`, plain `cospec init` (no flag) → gate runs, merge
      is idempotent, `--json` `gate` is non-null.

## 2. Never-silent gate hint

- [x] 2.1 In `printReceipt`, when `d.gate === undefined`, `d.state !== 'A'`, and
      a `mise.toml` exists in `target`, print one hint line:
      `Gate: no     commit gate configured. Run 'cospec init --gate' to add it (merges     into your mise.toml).`
- [x] 2.2 Confirm `--json` output is unchanged in this case (`gate: null`, no
      new field) and document that as intentional.
- [x] 2.3 Test: state C, `mise.toml` lacks any `cospec:` task, no flag → hint
      line printed, `mise.toml` untouched, `hk.pkl`/`commitlint.config.mjs` not
      created.

## 3. Unreported empty-mise.toml write

- [x] 3.1 In `scaffoldGate`'s `existsSync(misePath)` branch, when
      `mergeMiseToml` returns `status: 'created'`, push `'mise.toml'` into
      `written` in addition to writing `mise.content`.
- [x] 3.2 Test: exists-but-empty `mise.toml` + `--gate` → template written to
      disk AND the text receipt / `--json` `gate.written` both report
      `mise.toml`.

## 4. Per-command `--help` flags

- [x] 4.1 Extend `CommandEntry` (`cli.ts`) with optional `usage` (positional
      signature) and `options` (pre-formatted command-flags block).
- [x] 4.2 Populate `usage`/`options` for every command with flags or
      positionals: `init` (`[path]`, `--yes`, `--force`, `--harness <list>`,
      `--gate`/`--no-gate`, `--remove-opsx`), `update` (`--check`/`--force`),
      `new` (`<type> <slug> --description`), `validate`
      (`--strict`/`--fast`/`--all`/`--changes`/`--specs`), `status`
      (`--change`), `list` (`--specs`/`--blocked`), `instructions`
      (`<artifact> --change --allow-soft`), `apply` (`<change> --allow-soft`),
      `archive` (`<change> --skip-specs`/`--force-incomplete`), `sync-blockers`
      (`--check`/`--change`), `store` (subcommands + `--no-cospec-init`),
      `context` (`--code-workspace`/`--force`), `workset` (subcommands), `show`
      (passthrough flags), `schema` (subcommands + `fork`/`init`
      `--description`/`--artifacts`) — cross-check each against
      `apps/docs/reference/commands.md`.
- [x] 4.3 Rewrite `commandHelpText` to render: a `Usage:` line built from
      `usage` (fallback to the current generic line when absent), a
      `Command     options:` block from `options` when present, then the shared
      `GLOBAL_OPTIONS` block.
- [x] 4.4 Test: `cospec init --help` output contains `--gate`, `--no-gate`,
      `--harness`, `--yes`, `--force`, `--remove-opsx`.

## 5. `help`-token safety

- [x] 5.1 In the `cli.ts` dispatcher, treat a bare `help` token immediately
      following the command name as equivalent to `--help`/`-h`.
- [x] 5.2 In `init.ts`'s `resolveTarget`, reject a bare `help` positional with a
      clear stderr message and exit 1 before any filesystem mutation (suggest
      `--help`; note `./help` scaffolds a directory literally named `help`).
- [x] 5.3 Test: `cospec init help` → exit 1, no `./help` directory created, no
      other write.
- [x] 5.4 Test: `cospec <command> help` behaves identically to
      `cospec     <command> --help` for at least one other command, and mutates
      nothing.

## 6. Real-binary integration coverage

- [x] 6.1 Add/extend `apps/cli/test/integration/gate.test.ts`: real pinned
      OpenSpec binary, state-C repo with an already-adopted gate, re-init with
      no `--gate` flag → merge runs and is idempotent on a second re-init.

## 7. Docs parity

- [x] 7.1 Update `apps/docs/guide/installation.md`: re-init keeps an already
      adopted gate synced by default; a repo without the gate sees a printed
      hint for how to add it.
- [x] 7.2 Update `apps/docs/reference/commands.md` global-flags section: note
      that `cospec <command> help` is equivalent to
      `cospec <command>     --help`.
- [x] 7.3 Confirm `.agents/shared.md` needs no change (no workflow/process
      change here) — leave as-is if confirmed.

## 8. Full gate

- [x] 8.1 `mise run check` green (lint, format, typecheck, unit, contract,
      integration, pack smoke, `generate:check`, `agents:check`).
