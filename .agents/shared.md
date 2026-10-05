# cospec — Shared Agent Context

# Edit .agents/shared.md — run `mise run agents:sync` to propagate.

> To update shared content in `CLAUDE.md` and `AGENTS.md`, edit this file then
> run `mise run agents:sync`.

## Project context

cospec (conventional openspec) is an opinionated superset of, and drop-in
replacement for, OpenSpec 1.13.1 that sizes the spec-driven workflow to your
conventional-commit type. `feat` gets the full treatment — proposal,
blocking-changes, specs, verification, tasks; `refactor` additionally requires
design; `ci`/`chore`/`docs` and their siblings take two minutes with three short
artifacts. It ships as `@aligned-team/cospec` with one bin, `cospec`.

cospec is an opinionated implementation of OpenSpec, functionally a drop-in
replacement with compatibility upheld: it wraps the real binary (resolved by
path, never `$PATH`, accepting `>=1.0.0 <2.0.0`, pinned to 1.13.1 for dev/CI)
and adds: 11 typed schemas that map 1:1 to the conventional-commit types, real
change validation with stable rule IDs, a deterministic `apply` gate, a
filesystem-verified `archive`, a machine-parsed `verification` evidence ledger
with hard archive gates, `## Surfaces` flag triggers that soft-nudge
verification and design sections, versioned schemas with `schemaVersion`
grandfathering, and a blocking-changes ledger with auto-sync. The tool
self-hosts: this repo's own `openspec/` tree is managed by cospec.

## Stack snapshot

| Layer         | Choice                                                           |
| ------------- | ---------------------------------------------------------------- |
| Runtime       | Bun 1.3                                                          |
| Language      | TypeScript 7 via `@typescript/native-preview`; `tsgo --noEmit`   |
| Wrapped tool  | `@fission-ai/openspec` 1.13.1 (pin; `>=1.0.0 <2.0.0` accepted)   |
| CLI           | `cospec` — Bun entry at `apps/cli/src/index.ts`                  |
| Lint + format | oxlint + oxfmt (no ESLint, no Prettier)                          |
| Git hooks     | hk (jdx/hk) via mise                                             |
| Tests         | bun test — unit, contract (real binary), integration, pack smoke |
| Eval          | DeepSeek v4 Flash (native API) — advisory, never gates CI        |
| Bench         | Claude Agent SDK drives both arms; DeepSeek-judged — advisory    |

## Repository layout

```
cospec/
├── apps/cli/          @aligned-team/cospec — the cospec CLI
│   ├── src/canon/     single source of truth: schemas + workflows + gate
│   ├── src/harness/   HARNESS_TABLE (per-tool layout) + the harness renderer
│   ├── src/core/      openspec wrapper, parsers, validation, managed files
│   ├── src/commands/  one file per cospec subcommand
│   └── test/          unit / contract / integration / fixtures
├── apps/docs/         public docs site — https://cospec.aligned.team
├── docs/              flat topic docs (architecture, schemas, validation, …)
├── e2e/eval/          DeepSeek e2e eval harness (advisory)
├── packages/bench/    cospec-vs-openspec benchmark harness (advisory)
├── openspec/          self-hosted: cospec-managed schemas + changes + specs
├── scripts/           hook entrypoints + mise task scripts
└── .agents/shared.md  source for the shared block in CLAUDE.md / AGENTS.md
```

## Build, lint, format, test

All operations run through mise tasks — never raw tool invocations:

| Task                | Command                             |
| ------------------- | ----------------------------------- |
| Run the CLI         | `mise run cospec -- <args>`         |
| Build the binary    | `mise run build`                    |
| Lint                | `mise run lint`                     |
| Lint (fix)          | `mise run lint:fix`                 |
| Format (check)      | `mise run format:check`             |
| Format (fix)        | `mise run format:fix`               |
| Typecheck           | `mise run typecheck`                |
| Unit tests          | `mise run test`                     |
| Contract tests      | `mise run test:contract`            |
| Integration tests   | `mise run test:integration`         |
| Bench unit tests    | `mise run test:bench`               |
| Pack smoke          | `mise run test:pack`                |
| Regenerate managed  | `mise run generate`                 |
| Drift check         | `mise run generate:check`           |
| Schema validate     | `mise run openspec:schema:validate` |
| Sync agent docs     | `mise run agents:sync`              |
| Agent-doc drift     | `mise run agents:check`             |
| Docs site (build)   | `mise run docs:build`               |
| Docs site (dev)     | `mise run docs:dev`                 |
| E2E eval (advisory) | `mise run eval:e2e`                 |
| Bench (advisory)    | `mise run bench`                    |
| Bench smoke         | `mise run bench:smoke`              |
| Full CI gate        | `mise run check`                    |

Run `mise run check` before every commit. Never bypass hk with `--no-verify`.

## Docs site

`apps/docs` is the public documentation site at https://cospec.aligned.team —
exact-pinned VitePress plus vitepress-plugin-llms, which emits
`llms.txt`/`llms-full.txt`. Deploys are release-synced: the docs build and
publish only when a release ships, from inside `.github/workflows/release.yml`,
never on pushes to `main` (to redeploy, re-run that workflow's docs jobs on a
release run). A dedicated CI job gates every PR that touches `apps/docs` on a
successful docs build. Each fact (artifact matrix, exit codes, layer and
Surfaces vocabulary, the OpenSpec pin, …) is owned by exactly one page — other
pages link to it, and anything that is OpenSpec's job links out to OpenSpec's
docs.

## The cospec workflow (we self-host)

Every substantive change to this repo is a cospec-typed OpenSpec change. Do not
hand-edit `openspec/changes/` state, and never call bare `openspec` — always go
through `cospec`:

1. `mise run cospec -- new <type> <slug>` — pick the conventional-commit type;
   cospec prints the artifact plan (how heavy the type is).
2. Author artifacts using `cospec instructions <artifact> --change <slug>` —
   including `cospec instructions verification` for `feat`/`fix`/`perf`/
   `refactor`, whose acceptance-evidence ledger is planned before you implement.
3. `mise run cospec -- validate <slug> --strict` — must pass.
4. `mise run cospec -- apply <slug>` — the gate. Obey the exit code: `0` clear,
   `2` blocked (stop, report the blockers), `3` soft-blocked (confirm, then
   `--allow-soft`). Never re-derive the gate from files.
5. Implement, checking off `tasks.md` as you go, and record verification
   evidence: mark each row `[x]` with the observed result after `->`, or
   `[~] defer: <reason>` for a row you will not run.
6. `mise run cospec -- archive <slug>` — validates, gates on tasks, runs the two
   hard gates (`archive/verification-incomplete`,
   `archive/scenario-preservation` — no `--force`), delegates to
   `openspec archive`, verifies the move on disk, and fans out blocker sync.
   Schemas with no specs artifact (`ci`, `chore`, `docs`, …) correctly produce
   no spec-sync deltas here. **Timing is non-negotiable** — see "Branch, PR, and
   merge flow" below.

Steps 1–2 also have `/cospec:new` + `/cospec:ff`/`/cospec:continue` as
entry-point variants of `/cospec:propose`, and you can optionally dress-rehearse
step 6 with `/cospec:verify` — it walks the verification ledger and names the
hard archive gates without moving anything.

In-flight v1 changes are grandfathered until `cospec migrate <slug>` stamps them
to the current `schemaVersion`; `cospec doctor` lists changes still on v1.

## Branch, PR, and merge flow

- Never commit directly to `main`. Every change goes through a worktree branch
  and a PR with green checks.
- Branches rebase onto `main` with `--force-with-lease`; never merge commits.
- `mise run cospec -- archive <slug>` is the **final commit on the PR branch,
  before merge**. A PR must never merge leaving its change unarchived in
  `openspec/changes/` on `main`. Archive commits belong inside the PR that
  completes the change — never a standalone archive PR after the fact.
- Recovery: if a change does land on `main` unarchived anyway, the very next
  action is a follow-up PR whose first commit is the archive.

## Style rules (oxlint + oxfmt enforced)

- No semicolons; single quotes; `printWidth` 100 (80 for JSON/Markdown).
- Trailing commas everywhere; arrow parens always; LF endings.
- Sorted imports (`internalPattern` scoped to `@aligned-team`).
- TypeScript strict; `noUncheckedIndexedAccess`; `consistent-type-imports`.
- Comments explain non-obvious constraints only — not what the code plainly
  says.

## Engineering discipline

**Route through cospec** — all agent-facing OpenSpec access goes through the
`cospec` CLI. Generated skills and this repo's docs never call bare `openspec`.
The wrapped binary is spawned by resolved path and version-asserted to the
accepted range `>=1.0.0 <2.0.0` (dev/CI pins 1.13.1). Every OpenSpec capability
has a cospec counterpart — a passthrough, a mirror, or an improved version — so
any OpenSpec user can switch with zero regressions: the change lifecycle, plus
`store` (`setup`/`register` auto-run `cospec init`), `context`, `workset`,
`show`, `view`, `schemas`/`schema`, `templates`, `config` (machine-global,
`path`/`list`/`get`/`set`/`unset`/`reset`/`edit`/`profile`), native
`completion`, and `feedback` — so there is never a reason to call bare
`openspec`. `init`/`update` stay cospec-native by design. Read-only and personal
surfaces are disciplined passthroughs (no gate, full wrapped-call discipline);
`config edit`/`profile`/`reset --all` (no `-y`) join `workset open` in the
terminal-handover class instead (inherited stdio, verbatim child exit code, no
`--json`), each pre-validated before the handover — its argv refused by the
table parser as the binary would refuse it, and piped instead when it could not
be interactive or the binary would refuse it anyway; see docs/architecture.md
and docs/stores.md.

**The reachability test is the parity gate** — every command, flag, tool id and
workflow the pinned OpenSpec binary exposes must resolve to exactly one of: the
command table (`apps/cli/src/core/command-table.ts`), an alias in
`apps/cli/src/canon/parity/aliases.yaml`, or a pending entry in
`apps/cli/test/contract/parity-pending.yaml` tagged with the change that owns
it. A command-table row or flag that IS one of `aliases.yaml`'s upstream
spellings (`init --tools`, the hidden `experimental`/`new change`/
`completion generate` rows) carries an `aliasOf` marking to its canonical cospec
name, and the test checks the pairing two ways — every `aliases.yaml` entry has
a matching marking, and every marking has a matching entry — so an alias can
never resolve silently through the table alone or drift out of sync with its
registry. `apps/cli/test/contract/reachability.test.ts` enforces this against
the pinned dist and is the gate — never a hand-maintained checklist, and never a
proposal's non-goals section standing in for an entry. A capability cospec
deliberately never implements lives only in
`apps/cli/src/canon/parity/exceptions.yaml`, verified the same way, not as a
silent gap or a comment. See docs/architecture.md.

**Relayed remedies come from one allowlist** — every sentence of the pinned dist
that names a bare `openspec <command>` is an entry in
`apps/cli/src/core/remedies.ts` (upstream's exact text and its cospec spelling;
relays call `respellRemedies`), or listed in
`apps/cli/test/contract/support/remedy-sources.ts` with the reason no cospec
relay prints it, or listed there (`REACHABLE_OWNED`) as reachable through a
successful answer cospec relays untouched, with the roadmap PR that owns its
spelling. `remedy-enumeration.test.ts` enforces this against the pinned dist, so
a pin bump fails until each new line is classified. A failed answer is respelled
wherever an allowlisted sentence stands verbatim. Never respell with a pattern
over free text (a lead-in word, a quote, a backtick): a path, a name or a
user-owned schema's text must pass through byte-for-byte. A successful answer's
commands are respelled from structure instead, only where the binary gives its
own guidance: in a parsed `--json` document through `respellCommandFields`
(`core/passthrough-command.ts` — a field path and either the fixed lead before
the command, rewriting only a leading `openspec` token, or the allowlist entries
the whole value can be, rewriting it only when it is one of them; then rendering
text from the result) or a field passed alone to the allowlist (a diagnostic's
`fix`); where upstream has no such field, a whole allowlisted line
(`respellLines`, for a next step with no document) or a fixed line only the
binary writes, found by its position in the binary's output and spelled through
the allowlist (`schema init`'s last next step). `cospec instructions <artifact>`
is built this way from the binary's `--json` document
(`core/instructions-render.ts` ports the text printer): its field map is
`references[].fetch` / `references[].status[].fix`, and only for a change whose
schema `schema which --json` reports as `source: package` (the pinned built-in
`spec-driven`) are that schema's own command lines spelled, each a whole-line
`SCHEMA_LINES` entry in `core/remedies.ts` — a project or user copy stays
verbatim. What a live terminal-handover session prints is listed in
`remedy-sources.ts` as its residual.

**Gates read what the archive reads** — every check that can change a validate,
apply or archive outcome reads a spec document the way the pinned binary's
archive reads it: fences masked, HTML comments kept (`parseDeltaSpec`'s `Delta`,
`parseLivingSpec`'s top level). The comment-masked view (`parseAdvisoryDelta`,
`LivingSpec.advisory`) is a distinct type no gate accepts, and feeds only the
advisory findings listed in `apps/cli/src/core/rules/views.ts`
(`ADVISORY_RULES`). `apps/cli/test/unit/rules/views.test.ts` enumerates every
`archive/*`, `deltas/*` and `specs/*` rule and fails until a new one has a
fixture proving it reads the view it is registered under. A new rule or gate
takes the verbatim view unless no commented line can ever trigger it.

**Wrapped-call discipline** — every call into the wrapped binary declares its
expected exit codes, a stdout deny-list, and an observable post-condition. Trust
filesystem/JSON post-conditions, never exit codes alone (OpenSpec aborts with
exit 0). See docs/architecture.md.

**Never bypass hk** — hooks are managed by hk (jdx/hk) via mise. If a hook
fails, fix the root cause; never use `--no-verify`, `pre-commit`, or raw
`.git/hooks/` scripts.

**Managed files are generated** — `openspec/schemas/**` and the harness dirs
(`.claude/`, `.agents/skills/cospec-*/`, `.codex/`, `.opencode/`) are composed
from `apps/cli/src/canon/` (schemas, workflow bodies and workflow identity) and
`HARNESS_TABLE` in `apps/cli/src/harness/adapters.ts` — the one declaration of
each tool's layout: skills and commands dirs, filenames, serializer,
frontmatter, body dialect, rules file, detection paths and receipt note.
`render.ts`, `init`, `update` and `doctor` all read the table; none keeps its
own copy of a layout fact. A new tool is mostly a new row, not only one: a
home-scoped skills root renders but is not yet written; the legacy-skills
migration (`harness/legacy-skills.ts`, its receipt and `update --check` lines,
doctor's `legacy-layout` warning) covers only Codex's `.codex/skills`, so a new
row's `legacySkillsDirs` is detected but never migrated; and deliberate
Claude-only behaviour sits outside the table — `init`'s `.claude/settings.json`
merge and its `claude` default (docs/harness-integration.md names them). The
receipt's `/cospec:propose` hint, always in Claude's spelling regardless of
selected row, and doctor's scan reading every `.md` file under a skills root
rather than just `SKILL.md` and the table's command paths, are known defects on
`main`, not part of that deliberate set; the follow-on change
`harness-receipt-and-doctor-scope` fixes both. Edit the canon or the table, run
`mise run generate`; never hand-edit generated output. The `generate:check`
drift gate blocks the commit otherwise.

**Error handling** — never silently swallow errors. Catch only specific expected
cases; let unexpected exceptions propagate. Fixes must change observable
behavior, not relabel exceptions.

**Scope discipline** — touch only files related to the current change. Surface
out-of-scope issues as a proposed follow-up, not a silent fix.

**Dependencies** — pin exact versions in `package.json`; regenerate the lockfile
after editing the manifest. The OpenSpec pin is load-bearing: bumping it means
running the contract suite and re-probing before updating
`EXPECTED_OPENSPEC_VERSION`. Tool pins in `mise.toml` are lockfile-backed — bump
a version and regenerate `mise.lock` in the same commit; CI's "mise lockfile
drift gate" step (`mise install` then `git diff --exit-code mise.lock`) fails
the PR otherwise.

**Tests** — every command change lands with a contract or integration test.
Contract tests run the real pinned binary; a false archive PASS is a release
blocker. The oracle (`test/contract/support/upstream-oracle.ts`) and
`openspec()`/`openspecRaw()` (`test/fixtures/support.ts`) run it under Bun with
cospec's wrapped env over a private HOME/XDG sandbox, as the product does and
never against the real HOME; pass `{ runtime: 'node' }` (the tests-only
`mise.toml` node pin) only for an argv that starts with `--`. Assert errno
failures through `test/fixtures/errno.ts` (code, syscall, path), never the
OS-specific sentence.

**Docs never drift** — zero drift between the published docs site and released
behavior is non-negotiable. Any change that alters user-facing behavior —
commands, flags, schemas, validation rules, workflow semantics, exit codes —
updates `apps/docs` in the same change, on the page that owns the fact, and
records the docs update in the change's verification ledger (or `tasks.md` where
the type has none).

**Keep shared.md current** — any change that alters how work gets done here (new
apps, workflows, tasks, conventions, disciplines) updates `.agents/shared.md` in
the same change — unprompted — then `mise run agents:sync`. `agents:check`
enforces propagation only; stale guidance is a defect no tool catches.

**Secrets** — never read or print `.env.local`; the eval and the bench harness
read their keys (`DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`) from the process
environment only. Reports contain counts, scores, and rule IDs, never keys, raw
prompts, completions, or artifact bodies — a redaction self-check gates every
write.

**Decisiveness** — research before asking; if the answer is in the codebase or
DESIGN, find it. Lead with a recommendation when presenting options.
