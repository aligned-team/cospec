# Design

## Context

Authored against `origin/main` at `72ce24a7` (v0.9.0). `tool-matrix` (R9) is
unmerged; the implement stage rebases onto it first. **What this change takes
from `tool-matrix`** (its `design.md`, decisions 1, 7, 9, 10, 12):

- `HARNESS_TABLE` already holds 35 more rows in upstream `AI_TOOLS` order after
  the four today, and a test asserts that order minus `github-copilot`.
- `CommandSurface.extension` already allows `.prompt.md` on a flat,
  markdown-serialized row (`kiro` is the model), with
  `buildOpencodeCommandFrontmatter` (description plus the provenance block) as
  the frontmatter builder.
- `generate()` isolates a per-file write failure (`EACCES`, `EPERM`, `EROFS`,
  `ENOTDIR`, `EISDIR`) into `GenerateResult.failed`; `init` and `update` print a
  `Failed:` block and exit 1.
- `update` and `doctor` detect a row from its skills root, its command surface
  or its rules file, not from a codex/agents special case.
- A row field for upstream's `LEGACY_SLASH_COMMAND_PATHS` (design decision 12,
  `legacyCommandPaths`), and the leftover scan accepting each row's upstream
  command path pattern. `tool-matrix` leaves the `github-copilot` entry to this
  change.

On `main` today none of that exists: `HARNESS_TABLE` has four rows,
`CommandSurface.extension` already names `.prompt.md` but no row uses it, and
the two flags are `pending('github-copilot')` in `command-table.ts`. This change
does not edit any of it on `main`'s shape; it states the row, the field value
and the hooks it needs, and the implement stage writes them against the rebased
tree. If the rebased names differ (for example the row field), the rebased names
win and the tasks read accordingly.

The pinned binary (`@fission-ai/openspec` 1.13.1) is the oracle. Everything
below was read from its `dist/` (`core/github-copilot/cloud-agent.js`,
`core/init.js`, `core/update.js`, `core/project-config.js`, `core/config.js`,
`core/legacy-cleanup.js`, `core/command-generation/adapters/github-copilot.js`)
and probed with the binary in a sandbox whose `HOME`, `XDG_*`, `CODEX_HOME`,
`USERPROFILE` and `ZDOTDIR` were private (stdin `/dev/null`, so **no interactive
run was probed**; tier 4 below is read from source only).

## Goals / Non-Goals

**Goals:**

- `github-copilot` is a harness row whose paths, detection, dialect and restart
  line equal upstream's with `opsx`/`openspec` respelled `cospec`.
- The cloud opt-in decides exactly as the binary does, cell for cell, and its
  outcomes (files present, config value, removed and left-in-place counts, the
  sentences) are what the binary's are.
- A file cospec did not write is never removed or overwritten; an edited one
  survives opt-out.

**Non-Goals:**

- Workflow profiles and delivery modes (`skills`/`commands`/`both`): the
  `workflow-profiles` change. The row renders all twelve workflows to both
  surfaces.
- `init --language` and `--profile`: the `workflow-profiles` change.

## Decisions

1. **The decision is upstream's five tiers, in upstream's order.** The binary's
   own comment (`core/init.js`, `resolveCopilotCloudDecision`) reads, quoted:

   ```
   Decide whether to generate GitHub Copilot cloud files, and whether to
   persist that decision. Precedence:
     1. `--copilot-cloud` / `--no-copilot-cloud` flag (explicit this run)
     2. persisted opt-in in config.yaml
     3. managed files already present (migration for pre-opt-in projects)
     4. interactive confirm (default No)
     5. non-interactive with no signal: skip, and don't persist a default
   ```

   The code behind it, and the probes (each cell was probed with the binary in
   the sandbox):

   | Tier | Applies when                               | write  | persist | optedOut (removes managed files) |
   | ---- | ------------------------------------------ | ------ | ------- | -------------------------------- |
   | pre  | `github-copilot` not selected              | no     | no      | no (flag ignored, sentence)      |
   | 1    | a flag was given                           | flag   | flag    | `!flag`                          |
   | 2    | `githubCopilot.cloudAgent` is a boolean    | value  | no      | `!value` (beats tier 3)          |
   | 3    | a managed cloud file exists                | yes    | no      | no                               |
   | 4    | `canPromptInteractively()` and the confirm | answer | answer  | `!answer` (EOF is no answer: 5)  |
   | 5    | none of the above                          | no     | no      | no; prints the "Skipped" hint    |

   Two things the comment does not say, both in the code: the "tool not
   selected" branch runs before tier 1 (so the flag is reported, not applied),
   and a tier-2 `false` removes managed files even with no flag, exactly like a
   tier-1 `--no-copilot-cloud`. Both flags present: commander's last occurrence
   wins. cospec ports all of it, `canPromptInteractively` included (decision 3).
   Rejected: collapsing tiers 2 and 3 into "enabled if config or files", which
   would lose the opt-out-beats-files cell.

2. **The parser reports which of the pair came last.** `ParsedArgs.flags` is a
   record, so `--copilot-cloud --no-copilot-cloud --copilot-cloud` loses its
   order, and `init`'s `--gate`/`--no-gate` pattern (positive wins) would give
   the wrong answer for `--no-copilot-cloud --copilot-cloud` (the binary gives
   `true`). The table parser records every long flag in argv order
   (`ParsedArgs.occurrences`, after alias and short-flag resolution), and a
   helper `lastFlagOf(parsed, '--copilot-cloud', '--no-copilot-cloud')` returns
   `true`, `false` or `undefined`. Rejected: scanning `ctx.args` in `init`,
   which would re-implement the parser's `=`, alias and `--` handling.

3. **Tier 4 is ported, gated like the binary.** The binary's
   `canPromptInteractively()` is `false` when `--tools` was given, and otherwise
   `isInteractive()` (`OPEN_SPEC_INTERACTIVE=0`, a `CI` variable, or a non-TTY
   stdin turns it off). cospec's counterpart: `--harness`/`--tools` given,
   `--json` given, or `isWorksetOpenInteractive()` false (it already ports
   `isInteractive()`; it moves to a shared module) means no prompt. The prompt
   is a single y/N question on stdin through `node:readline`, default No, with
   upstream's text:
   `Set up GitHub Copilot cloud coding-agent files? This is for the GitHub-hosted Copilot coding agent (github.com), not Copilot in your editor. It writes two files: .github/workflows/copilot-setup-steps.yml and .github/agents/cospec.agent.md.`
   No new dependency (the binary uses `@inquirer/prompts`; cospec pins exact
   versions and has no prompt library). cospec's init auto-detects harnesses, so
   tier 4 is reachable when no `--harness` is given and `github-copilot` is
   detected. Not probed against the binary (it needs a terminal and answers its
   tool picker first); the evidence is the quoted source plus a unit test that
   injects the terminal state and the answer stream.

4. **One row, in upstream's slot.** The row sits between `gemini` and `hermes`
   (upstream `AI_TOOLS` position), so table order, `--harness all`, detection
   and doctor order keep following upstream; `tool-matrix`'s order assertion
   (the 35 appended rows) is amended to include it, as task 2.1 states. Fields,
   all from `core/config.js:44` and the adapter: `id: 'github-copilot'`,
   `displayName: 'GitHub Copilot'`, `skillsDir: '.github'`, commands
   `.github/prompts` / flat / `cospec-{command}` / `.prompt.md` / markdown /
   `buildOpencodeCommandFrontmatter` (upstream's `description` frontmatter plus
   cospec's provenance), `invocationPrefix: '/'`, `bodyDialect: 'flat'`,
   `requiresIdeRestart: true`, `detectionPaths` the seven upstream paths in
   upstream's order, no `setupNote` (upstream has none; the restart line comes
   from `requiresIdeRestart`), and the legacy command path
   `.github/prompts/openspec-*.prompt.md`. A contract test deep-imports the
   pinned `AI_TOOLS` in tests only and asserts `skillsDir`, `detectionPaths`,
   `requiresIdeRestart` and `globalSkillsDir` for this id, plus the adapter's
   path template with `opsx` read as `cospec`. Rejected: appending the row at
   the end, which would break "table order is upstream order" and give
   `--harness all` a different order from the binary's.

5. **The cloud files are canon templates that name cospec.**
   `apps/cli/src/canon/github-copilot/copilot-setup-steps.yml.tpl` and
   `cospec.agent.md.tpl`, registered in `canon/embedded.ts` so the compiled
   binary has them. Structure is upstream's (a workflow that keeps GitHub's
   required job name `copilot-setup-steps`, checkout, install, verify; an agent
   with `tools: execute, read, search, edit`); content is cospec's:
   `npm install -g @aligned-team/cospec`, `cospec --version`, and an agent body
   that walks `cospec new`, `cospec instructions`, `cospec validate --strict`,
   `cospec apply` and `cospec archive` and states the gate exit codes. The agent
   is `cospec.agent.md`, not `openspec.agent.md`: OpenSpec's file is then never
   cospec's to read, overwrite or remove, and both tools can live in one repo.
   The install is unpinned like upstream's: a pin would rewrite the workflow on
   every release (churn in `update --check`), and `cospec` already pins the
   OpenSpec it wraps. Both carry
   `Generated by cospec for GitHub Copilot coding agent support.`

6. **Managed means cospec's existing provenance, not content equality.**
   Upstream decides "managed" by byte equality with the current or a legacy
   generation (`isManagedCopilotCloudFile`). cospec's files already identify
   themselves, and the roadmap asks for canon and provenance markers: the agent
   file is self-describing markdown (`metadata.author: cospec` and a
   `contentHash` over its body; GitHub documents `metadata` as a string
   name-value map for custom agents, and all three values are strings), and the
   workflow is frontmatter-less, so the manifest
   (`openspec/.cospec-manifest.json`) tracks its hash, as it does for
   `.codex/rules/cospec.rules`. The rules are the engine's own: unedited and
   tracked is managed (rewrite or remove); edited is `preserved-modified`
   (sidecar on write; never removed); no provenance is `preserved-foreign`
   (sidecar on write; never removed). This keeps the binary's behavior (an
   edited agent file survives opt-out, an untouched workflow is removed) and
   extends it: OpenSpec's own `copilot-setup-steps.yml` is foreign to cospec.
   `.github` becomes a removal root through the row (`removalRoots()`), so the
   manifest-key containment check admits `.github/workflows/...`. Rejected: byte
   equality with cospec's generations, which would need every past template kept
   forever to recognise old files.

7. **`generate()` owns emitting and removing the cloud files.** It gains
   `cloud?: boolean` (an explicit decision, which `init` passes after the tier
   resolution); when absent it resolves tiers 2 and 3 from `cwd` (what `update`
   and `doctor` need). When `github-copilot` is among the harnesses and the
   decision is enabled, the two files join the emitted set (workflow as a
   frontmatter-less entry, agent as markdown) through the existing writers; when
   the decision is disabled, or `github-copilot` is not among the harnesses, the
   workflow falls to the existing manifest-removal loop and the agent file to
   one explicit `removeMarkdown` call (the orphan sweep reads only skills and
   command dirs). The result gains a `cloud` report:
   `{ present, collisions, removed, leftInPlace }`. Because `doctor` and
   `update --check` already call `generate({ dryRun: true })`, they see cloud
   drift with no second code path. A removal that finds an edited file reports
   it in `leftInPlace` and not as a drift outcome (the six write outcomes are a
   frozen contract; an unremovable, opted-out file is not drift). Rejected: a
   separate `syncCopilotCloud()` beside `generate()`, which would need its own
   dry-run, manifest write and failure isolation.

8. **The alternate profile and the failures are ported, spelled for cospec.**
   `classifyCopilotAgentReconciliation` and its two guards
   (`assertCreatableFilePath`, `assertMissingOrRegularFile`) are ported with
   `cospec.md` as the alternate and `cospec.agent.md` as the profile: alternate
   absent means reconcile; alternate present and profile absent means skip;
   alternate present and profile managed means remove the profile; both present
   and the profile unmanaged throws
   `Conflicting Copilot agent profiles: preserve either .github/agents/cospec.md or .github/agents/cospec.agent.md`.
   In `init` the binary records this as the Copilot tool's failure after its
   skills and prompts are written and exits 1; cospec reports it in the same
   `Failed:` block `tool-matrix` adds. In `update` the binary catches everything
   into `Warning: failed to sync Copilot cloud agent files: <message>` and keeps
   its exit code; cospec prints that line for these specific cases (the
   conflict, the two guards, and the errno set) and lets any other exception
   propagate, because the repo rule is to catch only expected cases. This is the
   one place cospec is stricter than the binary.

9. **Persisting uses the YAML document model, and failures are reported.**
   `persistCopilotCloudOptIn` is ported (`parseDocument`, `setIn`, `isMap`,
   `YAMLMap`, `Document`; the `yaml` package is already a dependency), so
   comments and order survive, a non-map `githubCopilot` is replaced, and a
   non-mapping root starts a fresh document. It runs after `init` has written
   `config.yaml` (and writes nothing when no config file exists, upstream's
   no-op). Config path order is `config.yaml` then `config.yml`
   (`resolveConfigFilePath`). The binary swallows every persist and removal
   failure with an empty `catch`; cospec does not: a YAML parse error leaves the
   file untouched with a stderr warning, `EACCES`/`EPERM`/`EROFS` warn with the
   code and path and do not fail the init, anything else propagates. Reading
   `githubCopilot.cloudAgent` is a small native reader, not the binary's
   `readProjectConfig`: a malformed value is undecided and cospec prints the
   binary's warning
   (`Invalid 'githubCopilot.cloudAgent' field in config (must be a boolean)`,
   `Invalid 'githubCopilot' field in config (must be an object)`) to stderr. The
   `CONFIG_YAML` template is not changed (its header says cospec never
   regenerates the file; a one-key edit is not regeneration, and the template is
   `workflow-profiles`' file to extend).

10. **`update` has four branches and a hint.** Read from
    `syncCopilotCloudFiles`: `github-copilot` configured and enabled (tier 2,
    else tier 3) writes; configured and `cloudAgent: false` removes with
    `Removed: <n> Copilot cloud agent file(s) (opted out of cloud files)`;
    configured and undecided is silent except for the interactive hint; not
    configured removes with `... (github-copilot not configured)`. cospec spells
    the hint `cospec init --copilot-cloud`, prints it only on an interactive run
    that is not `--check` and not `--json`, and never prompts or persists.
    "Configured" is cospec's `detectHarnesses` (the sentinel skill), which is
    the same signal the binary uses (skills present). Rejected: running the sync
    only when other files drifted: the binary syncs on every `update` run, up to
    date or not.

11. **Messages and the JSON key are cospec's own sentences, upstream's shape.**
    Receipt lines: `GitHub Copilot cloud files: <paths>`, the "Left your
    existing ... untouched" line with `cospec` in place of `OpenSpec`,
    `Removed: <n> Copilot cloud agent file(s) (opted out of cloud files)`, the
    "Skipped ..." hint, and one line per `leftInPlace` path
    (`Left <path> in place: edited since cospec wrote it (opted out of cloud files).`).
    `init --json` gains `copilotCloud` (spec). Because every sentence names
    `cospec`, none is a relay of the binary's text; the three
    `remedy-sources.ts` entries that name `openspec init --copilot-cloud` stay
    classified as not relayed, and the `core/github-copilot/` tree reason is
    reworded from "which cospec never spawns" to "ported natively by
    `harness/copilot-cloud.ts`, never spawned". The `--json` stdout stays one
    document: the flag-ignored sentence and warnings go to stderr.

12. **"Matches upstream row for row" is defined per cell.** The precedence
    matrix test (`test/contract/copilot-cloud.test.ts`) runs the binary through
    the oracle and cospec through the CLI on the same sandboxed scaffold for
    each cell (flag state x config state x file state x tool selected) and
    compares: which cloud paths exist, the persisted value (absent, `true`,
    `false`), the number of files removed, the presence of each upstream
    sentence with `openspec` read as `cospec`, and the exit code. Bytes of the
    generated files are not compared (they name different tools). Tier 4 is
    outside the matrix (decision 3).

13. **Where the binary contradicts the roadmap row, the binary wins.**
    - T3 asks for a "loud warning" for a flag without the tool. The binary
      prints one yellow sentence on stdout and carries on, exit 0. That sentence
      is ported; it is not an error and not louder.
    - T3 says to persist "the choice". The binary persists only a flag or an
      answered confirm, never tiers 2, 3 or 5. Ported.
    - T4 says to remove on opt-out. The binary also removes when the tool is no
      longer configured, and on a tier-2 `false` with no flag. Both ported.
    - The row says "5-tier". The code has a sixth, earlier branch (tool not
      selected). Ported as the "pre" row of decision 1.
    - T2 says provenance markers; the binary decides by content equality.
      cospec's markers are its own provenance (decision 6).

## Risks / Trade-offs

- [`tool-matrix` lands with different names for the row field, the failure seam
  or the order assertion] -> The tasks name each seam by role; task 1.1 is the
  rebase and re-reads them, and the contract test (decision 4) fails if a row
  value drifts.
- [The agent file's `metadata` block is ignored or rejected by a Copilot
  surface] -> GitHub documents `metadata` as a string name-value map on custom
  agents ("not used in VS Code and other IDE custom agents"), and cospec's three
  values are strings. If a surface rejected it the file would simply not load as
  an agent; the workflow is unaffected.
- [An unpinned `npm install -g @aligned-team/cospec` in the cloud agent's
  environment picks up a newer cospec than the repo's gate was written for] ->
  The same trade-off as upstream's unpinned install; a repo that needs a pin can
  edit the workflow, which then survives `update` as an edited file
  (`preserved-modified`, with the new version beside it).
- [Writing a `.cospec-new` sidecar under `.github/workflows/` for a foreign
  `copilot-setup-steps.yml`] -> GitHub reads only `*.yml`/`*.yaml` there, so the
  sidecar is inert; it is the paste-ready source for the "add the install step
  by hand" line.
- [`update`'s catch of specific cases differs from the binary's catch-all] ->
  Documented in decision 8 and covered by a test row per case; an unexpected
  exception surfaces instead of becoming a warning.
- [Auto-detection now selects `github-copilot` in any repo with
  `.github/prompts`, `.github/agents` or `.github/skills`] -> That is upstream's
  detection list verbatim; `--harness` overrides it, and the receipt names what
  was selected.

## Operational surface

cospec is a CLI and binds nothing. The surface this change adds is the workflow
cospec writes for GitHub's runners.

- **Runner:** `runs-on: ubuntu-latest`, `timeout-minutes: 10`, the
  Copilot-coding-agent environment GitHub provisions from
  `.github/workflows/copilot-setup-steps.yml` (job `copilot-setup-steps`).
- **Triggers:** `workflow_dispatch`, and `push`/`pull_request` limited to the
  workflow file's own path, as upstream's, so editing the file validates it.
- **Secrets and permissions:** none. `permissions: contents: read`; the steps
  use no token and no secret.
- **Network:** the npm registry, for `npm install -g`. No inbound ports, no
  connection limits.
- **Binary versions:** the Node that the runner image ships (cospec's package
  needs `node >=18`); `@aligned-team/cospec` at the registry's latest, which
  brings its pinned `@fission-ai/openspec`.
- **Local writes:** `init` and `update` write only the paths in the spec; every
  write is atomic (temp file then rename), as the engine's.

## Integration contract

The external contract is GitHub Copilot's file layout, not an SDK.

- **Path ownership:** `.github/workflows/copilot-setup-steps.yml` is a single
  path GitHub requires and a single job it requires (`copilot-setup-steps`), so
  OpenSpec and cospec cannot both own it; whichever wrote it first owns it, and
  cospec treats the other's file as foreign (decision 6). The agent profile is
  `cospec.agent.md`, so it never collides with OpenSpec's `openspec.agent.md`.
  Prompts are `.github/prompts/cospec-<command>.prompt.md` and skills
  `.github/skills/cospec-<skill>/SKILL.md`, both under cospec's own names.
- **Fixture shape:** the pinned dist is the fixture. The contract suite reads
  `AI_TOOLS['github-copilot']`, `COPILOT_CLOUD_FILES` and the adapter's path
  from the dist and asserts cospec's row and paths against them, so a pin bump
  fails loudly instead of drifting. The agent frontmatter keys are `name`,
  `description`, `tools` and `metadata`; the `tools` aliases (`execute`, `read`,
  `search`, `edit`) are upstream's current ones (an older generation used
  `terminal`).
- **Id and schema reconciliation:** the persisted key is upstream's,
  `githubCopilot.cloudAgent` (boolean), read by both tools, so a repo that uses
  `openspec` and `cospec` shares one decision. A non-boolean value is undecided
  for both.
