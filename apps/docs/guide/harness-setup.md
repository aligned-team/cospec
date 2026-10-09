---
title: Harness setup
description:
  What cospec init writes for each of the 40 agent tools — skills, commands, the
  shared .agents root and its writer marker, the one home-scoped root, the
  legacy moves — and how to confirm it loaded.
---

# Harness setup

`cospec init --harness <list>` wires cospec's workflows — `propose`, `new`,
`continue`, `ff`, `apply`, `verify`, `archive`, `bulk-archive`, `sync-specs`,
`explore`, `onboard`, `update` — into your agent harness by writing project
files directly. This is cospec's full parity set with opsx 1.13.1: every live
opsx workflow has a cospec-adapted counterpart (opsx `sync` maps to cospec
`sync-specs`, which merges a change's delta specs into the main specs without
archiving it through `cospec sync-specs`; opsx `update` maps to cospec
`update`). By default every configured harness gets all twelve. A narrower set
is written only when you choose one explicitly
([below](#choosing-the-workflow-set)). There is no marketplace and no plugin
package. Almost everything lands inside the repo, under version control, and
`cospec update` regenerates it in place. One tool is the exception:
`minimax-code` reads its skills only from your home directory, so those skills
are written there and shared by every project on the machine
([see below](#the-home-skills-root-minimax-code)). The only other things cospec
writes outside the repo are a shell completion script and its rc wiring, and
only when you run `cospec completion install`, plus the one-time
`completionTipSeen` flag in OpenSpec's global config (see
[Shell completion](/guide/installation#shell-completion)). Every generated
workflow body calls only `cospec` commands, never bare `openspec`, so a harness
needs exactly one permission entry to run the whole loop.

## Choosing the workflow set

A narrower set applies only when you set it. The built-in default that OpenSpec
reports for an unset `profile` does not count, so a machine that never set one
gets all twelve workflows.

- **Profile.** `cospec init --profile core|custom` sets it for one repo. The
  same key can be set in the machine-global config file
  (`cospec config profile core`, or `cospec config set profile custom`), and it
  applies only while present there. `core` installs six workflows: `propose`,
  `explore`, `apply`, `update`, `sync-specs` and `archive`. `custom` installs
  the `workflows` list from that same file.
- **Custom list.** Ids are spelled as upstream spells them, so `sync` means
  `sync-specs`. Ids cospec does not know are dropped. `sync-specs` is added
  before `archive` or `bulk-archive` when the list has one of those and not
  `sync-specs`.
- **Delivery.** `delivery` (`skills`, `commands` or `both`) chooses which
  surface each workflow is written to. Unset means `both`, which is what cospec
  has always written. A value other than `skills` or `commands` acts as `both`.

cospec reads these keys and never writes them. `cospec update` never removes an
installed workflow: it writes the profile's set plus every cospec workflow the
repo already has, so a profile that drops one leaves its files in place, and
`cospec doctor` names them. Delivery is the one exception: switching to one
surface removes the other surface's cospec files. Under a narrower set, a
handoff to a workflow that is not installed falls back to the raw `cospec`
command, so no generated body points at a missing workflow. The full key
reference, and the two BREAKING cases for an explicit `profile` or `delivery`,
are in
[Configuration](/reference/configuration#installed-workflows-and-delivery).

## Target table

Every tool cospec can configure is one row below. `--harness` takes any id in
the first column, a comma-separated list of them, `all` or `none`; `windsurf` is
still accepted as an alias of `devin`. Paths are relative to the repo unless
marked as home-scoped. `<workflow>` stands for one of the installed workflow ids
and `<skill>` for its skill name (`cospec-<skill>`, below).

| `--harness`      | Tool                                      | Skills                      | Command files                                    | Invoke                             | Restart         |
| ---------------- | ----------------------------------------- | --------------------------- | ------------------------------------------------ | ---------------------------------- | --------------- |
| `agents`         | Other / Universal (shared .agents skills) | `.agents/skills/` (shared)  | —                                                | `/cospec-<skill>`                  | new session     |
| `amazon-q`       | Amazon Q Developer                        | `.amazonq/skills/`          | `.amazonq/prompts/cospec-<workflow>.md`          | `@cospec-<workflow>`               | restart IDE     |
| `antigravity`    | Antigravity                               | `.agents/skills/` (shared)  | `.agents/workflows/cospec-<workflow>.md`         | `/cospec-<workflow>`               | restart IDE     |
| `auggie`         | Auggie (Augment CLI)                      | `.augment/skills/`          | `.augment/commands/cospec-<workflow>.md`         | `/cospec-<workflow>`               | —               |
| `bob`            | Bob Shell                                 | `.bob/skills/`              | `.bob/commands/cospec-<workflow>.md`             | `/cospec-<workflow>`               | —               |
| `claude`         | Claude Code                               | `.claude/skills/`           | `.claude/commands/cospec/<workflow>.md`          | `/cospec:<workflow>`               | restart session |
| `cline`          | Cline                                     | `.cline/skills/`            | `.clinerules/workflows/cospec-<workflow>.md`     | `/cospec-<workflow>`               | restart IDE     |
| `codeartsagent`  | CodeArts                                  | `.codeartsdoer/skills/`     | —                                                | `/cospec-<skill>`                  | —               |
| `codeassistant`  | SourceCraft Code Assistant                | `.codeassistant/skills/`    | `.codeassistant/commands/cospec-<workflow>.md`   | `/cospec-<workflow>`               | —               |
| `codebuddy`      | CodeBuddy Code (CLI)                      | `.codebuddy/skills/`        | `.codebuddy/commands/cospec/<workflow>.md`       | `/cospec:<workflow>`               | —               |
| `codex`          | Codex                                     | `.agents/skills/` (shared)  | —                                                | `$cospec-<skill>`                  | new session     |
| `command-code`   | Command Code                              | `.commandcode/skills/`      | `.commandcode/commands/cospec-<workflow>.md`     | `/cospec-<workflow>`               | —               |
| `continue`       | Continue                                  | `.continue/skills/`         | `.continue/prompts/cospec-<workflow>.prompt`     | `/cospec-<workflow>`               | restart IDE     |
| `costrict`       | CoStrict                                  | `.cospec/skills/`           | `.cospec/openspec/commands/cospec-<workflow>.md` | `/cospec-<workflow>`               | restart IDE     |
| `crush`          | Crush                                     | `.crush/skills/`            | `.crush/commands/cospec/<workflow>.md`           | `/cospec:<workflow>`               | —               |
| `cursor`         | Cursor                                    | `.cursor/skills/`           | `.cursor/commands/cospec-<workflow>.md`          | `/cospec-<workflow>`               | restart IDE     |
| `devin`          | Devin Desktop (formerly Windsurf)         | `.devin/skills/`            | `.devin/workflows/cospec-<workflow>.md`          | `/cospec-<workflow>`               | restart IDE     |
| `factory`        | Factory Droid                             | `.factory/skills/`          | `.factory/commands/cospec-<workflow>.md`         | `/cospec-<workflow>`               | —               |
| `forgecode`      | ForgeCode                                 | `.forge/skills/`            | —                                                | `/cospec-<skill>`                  | —               |
| `gemini`         | Gemini CLI                                | `.gemini/skills/`           | `.gemini/commands/cospec/<workflow>.toml`        | `/cospec:<workflow>`               | —               |
| `github-copilot` | GitHub Copilot                            | `.github/skills/`           | `.github/prompts/cospec-<workflow>.prompt.md`    | `/cospec-<workflow>`               | restart IDE     |
| `hermes`         | Hermes Agent                              | `.hermes/skills/`           | —                                                | `/cospec-<skill>`                  | —               |
| `iflow`          | iFlow                                     | `.iflow/skills/`            | `.iflow/commands/cospec-<workflow>.md`           | `/cospec-<workflow>`               | —               |
| `junie`          | Junie                                     | `.junie/skills/`            | `.junie/commands/cospec-<workflow>.md`           | `/cospec-<workflow>`               | restart IDE     |
| `kilocode`       | Kilo Code                                 | `.kilocode/skills/`         | `.kilocode/workflows/cospec-<workflow>.md`       | `/cospec-<workflow>`               | restart IDE     |
| `kimi`           | Kimi Code                                 | `.kimi-code/skills/`        | —                                                | `/skill:cospec-<skill>`            | —               |
| `kiro`           | Kiro                                      | `.kiro/skills/`             | `.kiro/prompts/cospec-<workflow>.prompt.md`      | `/cospec-<workflow>`               | restart IDE     |
| `lingma`         | Lingma                                    | `.lingma/skills/`           | `.lingma/commands/cospec/<workflow>.md`          | `/cospec:<workflow>`               | restart IDE     |
| `minimax-code`   | MiniMax Code                              | `~/.minimax/skills/` (home) | —                                                | `/cospec-<skill>`                  | —               |
| `oh-my-pi`       | Oh My Pi                                  | `.omp/skills/`              | `.omp/commands/cospec-<workflow>.md`             | `/cospec-<workflow>`               | —               |
| `opencode`       | OpenCode                                  | `.opencode/skills/`         | `.opencode/commands/cospec-<workflow>.md`        | `/cospec-<workflow>`               | reload project  |
| `pi`             | Pi                                        | `.pi/skills/`               | `.pi/prompts/cospec-<workflow>.md`               | `/cospec-<workflow>`               | —               |
| `qoder`          | Qoder                                     | `.qoder/skills/`            | `.qoder/commands/cospec/<workflow>.md`           | `/cospec:<workflow>`               | restart IDE     |
| `qwen`           | Qwen Code                                 | `.qwen/skills/`             | `.qwen/commands/cospec-<workflow>.md`            | `/cospec-<workflow>`               | —               |
| `roocode`        | Zoo Code                                  | `.roo/skills/`              | `.roo/commands/cospec-<workflow>.md`             | `/cospec-<workflow>`               | restart IDE     |
| `rovodev`        | Rovo Dev CLI                              | `.rovodev/skills/`          | —                                                | ask for the `cospec-<skill>` skill | —               |
| `trae`           | Trae                                      | `.trae/skills/`             | `.trae/commands/cospec-<workflow>.md`            | `/cospec-<workflow>`               | restart IDE     |
| `vibe`           | Mistral Vibe                              | `.vibe/skills/`             | —                                                | `/cospec-<skill>`                  | —               |
| `zcode`          | ZCode                                     | `.zcode/skills/`            | `.zcode/commands/cospec/<workflow>.md`           | `/cospec:<workflow>`               | —               |
| `zed`            | Zed Agent                                 | `.agents/skills/` (shared)  | —                                                | `/cospec-<skill>`                  | —               |

Skill names differ from workflow ids, so spell them through the table: `propose`
is `cospec-propose`, `new` is `cospec-new-change`, `continue` is
`cospec-continue-change`, `ff` is `cospec-ff-change`, `apply` is
`cospec-apply-change`, `verify` is `cospec-verify-change`, `archive` is
`cospec-archive-change`, `bulk-archive` is `cospec-bulk-archive-change`,
`sync-specs` is `cospec-sync-specs`, `explore` is `cospec-explore`, `onboard` is
`cospec-onboard` and `update` is `cospec-update-change`. Only four of the twelve
spell the same (`/cospec:apply` becomes `$cospec-apply-change` in Codex).

Each row also sets how its files are spelled:

- **Claude Code** writes `/cospec:<workflow>` commands in namespaced folders
  (`.claude/commands/cospec/`), and its commands point at the paired skill. Init
  also reads `.claude/settings.json` (creating `{}` if it doesn't exist yet) and
  additively merges `Bash(cospec *)` into `permissions.allow`. Nothing else in
  the file is touched, and nothing is removed. If the file doesn't parse as
  JSON, cospec prints the snippet to add by hand instead of guessing at your
  settings.
- **Codex** writes its skills to the shared `.agents/skills` root and also
  `.codex/rules/cospec.rules`, which pre-approves the read-only and gate
  `cospec` calls. Pick `agents` alone when you want the skills without those
  rules.
- **OpenCode** writes self-contained command bodies, so they work even when
  `.claude/` is absent.
- **agents** (`.agents/skills`, read by Zed, Antigravity and other
  AGENTS.md-aware assistants) emits no command files; its bodies name the skill
  (`$cospec-<skill>` in Codex, `/cospec-<skill>` elsewhere) rather than a slash
  command that would not resolve.
- **Antigravity** and **Zed** share the `.agents/skills` root with `codex` and
  `agents`. Only one of the four writes it; see "The shared `.agents/skills`
  root" below.
- **Kimi Code** names skills with the `/skill:` prefix
  (`/skill:cospec-<skill>`), and its workflows are skills only.
- **Devin Desktop** (`devin`, formerly Windsurf) writes flat workflow commands
  and spells its skills differently from its commands, so its command bodies and
  skill bodies differ on purpose.
- **Rovo Dev** (`rovodev`) has no invocation syntax. Its bodies, and cospec's
  receipt hint, ask the tool by name:
  `ask <tool> to use the cospec-<skill> skill with <arguments>`.
- **GitHub Copilot** (`github-copilot`) writes skills under `.github/skills/`
  and one prompt file per workflow under `.github/prompts/`, each with a
  `description` frontmatter line and cospec's provenance. Its restart line comes
  from the row's restart flag. The cloud coding agent is a separate opt-in; see
  [GitHub Copilot cloud agent](#github-copilot-cloud-agent-opt-in) below.
- **Skills-only rows** (`codeartsagent`, `forgecode`, `hermes`, `kimi`,
  `minimax-code`, `rovodev`, `vibe`, `zed`) write no command files; invoke the
  skill instead.

Some workflows take a positional argument (a type and description, or a change
slug). Where a tool only forwards a command's arguments through an explicit
placeholder, cospec inserts one in the command body: `$ARGUMENTS` for OpenCode
and Command Code, `$@` for Pi and Oh My Pi. Tools that bind arguments implicitly
get no placeholder. Skill bodies never get one, so the command and skill bodies
for the same workflow can legitimately differ.

### Setup notes

Init prints each selected row's setup note in selection order:

- **Claude Code** — restart Claude Code to pick up `/cospec:*` commands.
- **Codex** — skills load per session from `.agents/skills`, invoked as
  `$cospec-<skill>`; start a new session.
- **OpenCode** — reload the project to pick up `/cospec-*` commands.
- **agents** — skills are read from `.agents/skills`; start a new session to
  load them. No slash commands are generated.
- **Hermes Agent** — Hermes only loads skills from `~/.hermes/skills` by
  default. Add this project's `.hermes/skills` directory to
  `skills.external_dirs` in `~/.hermes/config.yaml` so Hermes picks up the
  generated skills.

Rows that set a restart flag (the table's **Restart** column says `restart IDE`)
make init print one more line after the notes:
`Restart your IDE to refresh commands.`, or `skills.` when the row writes skills
only. `cospec update` prints the same line after any write when a detected
harness's row sets the flag.

A note prints only when the
[delivery](/reference/configuration#installed-workflows-and-delivery) writes the
surface it is about: the Claude Code and OpenCode notes are about commands, so
delivery `skills` drops them; the Codex, agents and Hermes notes are about
skills, so delivery `commands` drops them (Codex still gets its skills there).
The restart line follows the surface written for the flagged row, in the same
way.

### Receipt hint

`cospec init`'s receipt ends with a `Try:` hint spelled for the first harness
selected: the first one you list in `--harness` (so `--harness opencode,claude`
prints OpenCode's spelling), otherwise the first selected in table order. Claude
Code gets `Try: /cospec:propose …`, OpenCode `Try: /cospec-propose …`, and Codex
and the shared-root rows
`Try: $cospec-propose (Codex) or /cospec-propose (other agents) …`. Rovo Dev
asks by name. With `--harness none` the hint keeps `/cospec:propose`.

The hint names only what was written. Under delivery `skills` a row that has
command files gets its skill reference (`Try: /cospec-propose …`), and when no
selected harness gets a skill or a command (delivery `commands` with only
skills-only harnesses) the receipt prints the
`No skills or commands were generated for …` line and no hint. When the profile
leaves out `propose` the hint names `/cospec:new` if that workflow is installed,
and otherwise `Try: cospec new feat <slug>` followed by a pointer at
`cospec config profile`.

## The shared `.agents/skills` root

`.agents/skills` is the vendor-neutral skills root read by Codex, Zed,
Antigravity and other AGENTS.md-aware assistants. Four rows write to it:
`codex`, `agents`, `zed` and `antigravity`. Their skill files land at the same
paths, but Antigravity spells its skills as `/cospec-<skill>` while the others
spell `$cospec-<skill>` in Codex, so the tree can hold only one set of bytes.
cospec therefore writes it from one **writer** and records the writer in a
marker file, `.agents/skills/.cospec-target`, which is manifest-tracked like any
managed file. The writer is chosen in this order:

1. the row the marker names, if it is one of the selected rows that writes the
   tree (a marker naming a row that is not selected does not count);
2. cospec's own evidence on disk — a `.codex/rules/cospec.rules` file, or a
   legacy `.codex/skills/cospec-*` skill, means `codex`;
3. a cospec skill already in the root means `agents`;
4. otherwise `codex`, then the first selected row in OpenSpec's own tool order
   (`antigravity`, `codex`, `zed`, `agents`), so `agents,zed` on a fresh root is
   written for `zed`.

When a later `cospec init` selects only rows beside a configured owner of the
root (`agents` was set up, then `zed,antigravity`), the owner stays in the run
and stays the writer, as OpenSpec does.

Rows without commands (`codex`, `agents`, `zed`) are preferred over
`antigravity` when any of them is selected. The receipt names the sharing rows
and the writer:

```txt
skills for codex/agents/antigravity/zed share the .agents/skills root (one tree, written for codex)
```

`cospec update` and `cospec doctor` ask the same question — is this row the
writer here? — so they agree with init. Rows whose skills root is detected only
through the shared tree are kept only when they are the writer, so a repo with
just an `AGENTS.md` (or notes under `.agents/`) is not a harness. Auto-detection
keys on `.agents/skills`, not a bare `.agents/` directory.

::: tip Coexisting with OpenSpec's own `.agents/skills/` A project previously
initialized with `openspec` **1.7.0+** (its vendor-neutral `agents` target, or
1.8.0's Codex output, 1.10's `zed`, or 1.11's `antigravity`) may already have
`openspec-*` skills in this root. The two coexist: cospec owns only its
`cospec-*` directories and the marker, and `cospec init --remove-opsx` still
removes only openspec-authored files (frontmatter `author: openspec`), plus
OpenSpec's ownership marker `.agents/skills/.openspec-target` once no
`openspec-*` skill is left beside it. :::

## Legacy tool roots

Earlier releases of OpenSpec and cospec wrote some files to other roots. `init`
and `update` move them to the current root:

| Legacy root      | Tool          | When it moves                                 | Consent                                                                                                                    |
| ---------------- | ------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `.codex/skills/` | `codex`       | after generation, once the replacement exists | none                                                                                                                       |
| `.kimi/`         | `kimi`        | before generation                             | none                                                                                                                       |
| `.windsurf/`     | `devin`       | before generation                             | selecting `devin` in `init` is consent; `update` asks on a terminal, and a "no" leaves the files in place and reports them |
| `.agent/`        | `antigravity` | after generation                              | none                                                                                                                       |

A move carries OpenSpec's own files — `openspec-<skill>/SKILL.md` skills and
`opsx-*` commands. If the destination already holds an identical file, the
legacy copy is dropped; a differing one keeps both and is reported. Directories
are removed only when empty. cospec's own legacy skills under `.codex/skills`
follow the managed-file rule: a copy whose body still matches its stamped
`contentHash` is removed once its replacement exists under `.agents/skills`, and
a hand-edited copy is **left in place**, reported, and only discarded with
`--force`. `.codex/` itself is never removed, because the rules file lives
there. While a legacy file or a pending move remains, `cospec doctor` reports a
`legacy-layout` warning and `cospec update --check` exits `1`, so CI drift gates
catch it. Every move appears in init's or update's receipt and in the `--json`
`migration` array.

## The home skills root (minimax-code)

`minimax-code` reads its skills only from `~/.minimax/skills`, so this one root
lives outside the repo. cospec resolves the home directory the way upstream
does: `USERPROFILE`, else `HOME`, else the operating system's home directory. An
empty value counts as unset. The skills it writes are visible to every project
on the machine.

- **Selection.** Init selects `minimax-code` in any repo when that home
  directory already holds a skill cospec or OpenSpec wrote, as upstream does, so
  the tool is picked up without a flag. You can also name it explicitly with
  `--harness minimax-code`.
- **Ownership.** `cospec update` rewrites and removes only the files cospec
  authored there, identified by their frontmatter provenance. A skill of your
  own with the same name is never touched.
- **Dry runs.** `cospec update --check` and `cospec doctor` read that root and
  never write it.
- **Leftovers.** An OpenSpec-authored skill under that root
  (`metadata.author: openspec`) is listed by its absolute path by `cospec init`
  and `cospec doctor`. `cospec init --remove-opsx` deletes it, and only once
  this run has written the cospec skill that replaces it.

::: tip Managed files, not hand-edited ones Everything above is a _managed
file_: cospec tracks it by content hash and regenerates it on `cospec update`.
If you've hand-edited one, cospec writes its version alongside as
`<file>.cospec-new` rather than overwriting your changes. See
[Configuration](/reference/configuration) for the full managed-file protocol.
:::

::: warning Failed writes If a file cannot be written (permissions, a read-only
filesystem, or a path that is a file where a directory belongs), `init` and
`update` skip only that file, print a `Failed:` block naming its path and the
reason, and exit `1`. Every other file is still written, and the failed file is
retried by the next run. :::

## GitHub Copilot cloud agent (opt-in)

The `github-copilot` row writes Copilot's editor files. The GitHub-hosted
Copilot coding agent (github.com) reads two more files, and cospec writes them
only when you opt in:

- `.github/workflows/copilot-setup-steps.yml`, the setup workflow. Its job is
  named `copilot-setup-steps`, as GitHub requires; it installs
  `@aligned-team/cospec` and runs `cospec --version`. The install is unpinned so
  the file doesn't change on every release, since cospec already pins the
  OpenSpec it wraps.
- `.github/agents/cospec.agent.md`, a custom agent that walks the loop:
  `cospec new`, `cospec instructions`, `cospec validate --strict`,
  `cospec apply` (with the gate's exit codes) and `cospec archive`.

The agent file is `cospec.agent.md`, not `openspec.agent.md`. OpenSpec's own
files are never read, overwritten or removed by cospec, so both tools can live
in one repo.

### How init decides

`cospec init` uses the first of these that applies:

1. **A flag on this run.** `--copilot-cloud` writes the files;
   `--no-copilot-cloud` skips them and removes cospec's untouched copies. If
   both are given, the last one wins.
2. **`githubCopilot.cloudAgent` in `openspec/config.yaml`**, when it is a
   boolean. `true` writes; `false` removes, even with no flag and even when the
   files exist. The key is described in
   [the configuration reference](/reference/configuration#the-copilot-cloud-agent-key).
3. **Files already there.** When cospec's managed copies exist, from an earlier
   opt-in, init keeps them current.
4. **A y/N question**, default No, asked only when `github-copilot` is selected
   and init can prompt: no `--harness` or `--json`, and not in CI, with
   `OPEN_SPEC_INTERACTIVE=0`, or with a non-terminal stdin.
5. **Otherwise, skip.** Init prints
   `Skipped GitHub Copilot cloud files (opt-in). Enable with 'cospec init --copilot-cloud'.`
   and saves nothing.

The two flags act only when `github-copilot` is among the harnesses. Without it,
init prints
`--copilot-cloud/--no-copilot-cloud was ignored because the github-copilot tool was not selected.`
and writes nothing. Under `--json` that line goes to stderr, so stdout stays one
document.

A flag or an answered question is saved as `githubCopilot.cloudAgent` in
`openspec/config.yaml` (or `config.yml`, when only that exists; init never adds
a `config.yaml` beside it), after init has written the config. Comments and
other keys stay as they are. OpenSpec's own `init` reads the same key, so a repo
that uses both tools shares one decision. A skipped question (including Ctrl-D
at it), a flag left off and `update` save nothing.

### Removal and updates

- `cospec update` re-syncs the files on every run while the decision is on. An
  untouched file is rewritten when cospec's content changes.
- When `github-copilot` is no longer configured, or `cloudAgent` is `false`,
  update removes the untouched copies and says why:
  `Removed: <n> Copilot cloud agent file(s) (opted out of cloud files)` or
  `(github-copilot not configured)`.
- A file you edited since cospec wrote it is never removed. Update reports it:
  `Left <path> in place: edited since cospec wrote it (opted out of cloud files).`
  A file with no cospec provenance is never touched.
- When nothing is decided and you are at a terminal, update prints
  `GitHub Copilot cloud coding-agent files are available (opt-in). Enable with 'cospec init --copilot-cloud'.`
  It never prompts or saves a choice, and it doesn't print this on `--check` or
  `--json`.
- `cospec update --check` and `cospec doctor` report cloud-file drift like any
  other managed file.

### Files cospec does not own

If `.github/workflows/copilot-setup-steps.yml` already exists and isn't cospec's
(OpenSpec's own copy, say), init leaves it alone, writes cospec's version beside
it as `copilot-setup-steps.yml.cospec-new`, and asks you to add the cospec
install step to your file by hand. Copilot also reads a custom-agent profile
named `cospec.md`, which cospec treats as an alternate. If it exists, cospec
doesn't write `cospec.agent.md`, though it does remove its own untouched copy.
If `cospec.md` and an unmanaged `cospec.agent.md` both exist, init reports
`Conflicting Copilot agent profiles: preserve either .github/agents/cospec.md or .github/agents/cospec.agent.md`
in its `Failed:` block and exits 1, and `update` prints
`Warning: failed to sync Copilot cloud agent files: <message>` and goes on.

## Restart or reload per harness

Agent harnesses cache their command and skill lists at different points in their
lifecycle, so pick up newly generated files with:

- **Claude Code** — restart the session. `/cospec:*` commands are read at
  startup.
- **Codex** — start a new session; skills are loaded per session from
  `.agents/skills`, invoked as `$cospec-<skill>`.
- **OpenCode** — reload the project.
- **agents, Zed, Antigravity** — however the assistant reading `.agents/skills`
  reloads. Antigravity also prints the restart line for its commands.
- **MiniMax Code** — start a new session; its skills live in
  `~/.minimax/skills`.
- **Other restart rows** — restart the IDE when init prints
  `Restart your IDE to refresh commands.` (or `skills.`).

cospec ships no hooks, so there's no `[features] hooks` configuration to add
anywhere.

## Smoke checks

Confirm each harness actually picked up the generated files before relying on
it:

1. **Claude Code** — after restarting, `/cospec:propose` appears in the command
   list, and `Bash(cospec *)` is present in `.claude/settings.json`.
2. **Codex** — start a session and confirm the `cospec-*` skills from
   `.agents/skills` are listed; a read-only call like `cospec status` should run
   without an approval prompt, while `cospec archive` still prompts (that's
   intentional — see below).
3. **OpenCode** — after reloading, `/cospec-propose` runs and drives the
   proposal loop even with `.claude/` absent, since OpenCode's bodies are full
   rather than pointers to a skill file.
4. **`/cospec:verify`** — the dress-rehearsal command users specifically expect
   coming from opsx exists in every harness's command/skill list; run it against
   an in-flight change and confirm it walks the verification ledger and names
   the two hard archive gates before handing off to `archive`.

All enforcement lives in the `cospec` CLI itself, not in the harness layer, so a
partially loaded skill can't bypass a gate — worst case, an agent has to be told
to run the right command by hand. Codex's `cospec.rules` deliberately leaves
`cospec archive` outside the pre-approved set, since it mutates
`openspec/changes/` on disk — `bulk-archive` and `onboard` call the same
`cospec archive` command under the hood, so Codex prompts once per change
archived, not just once per workflow invocation.

## Coexisting with OpenSpec's own files

If a project previously ran plain `openspec init`, cospec's `init` detects
OpenSpec's own generated files (frontmatter `author: openspec`, or, for
OpenCode's description-only command files, one of the 12 ids the pinned dist
ever generates plus its `PROJECT_ROOT_GUARD` lead sentence and command reference
in the body) and lists them with a warning rather than silently leaving two
competing command sets in place; pass `--remove-opsx` (or confirm interactively)
to clean them up. Files you authored yourself are never touched — including one
at a lookalike OpenCode path or id, or one whose own prose happens to mention
the same upstream command; an old pre-opsx command such as
`.cursor/commands/openspec-*.md` counts as OpenSpec's only when it carries
OpenSpec's `<!-- OPENSPEC:START -->` markers, so a same-named file without them
is left alone (OpenSpec's own cleanup would remove it). The scan also never
descends into a nested git worktree checkout (such as one under
`.claude/worktrees/`, or a scan directory that is itself an embedded clone or a
symlink into such a checkout) — that copy of the project is cleaned up by its
own `cospec init --remove-opsx` — and never follows a symlinked scan root (a
`.claude` or `.agents/skills` that is itself a symlink to a directory outside
the project) out of the project either; a directory outside your project is
never listed or deleted by `--remove-opsx`, however it's reached. See
[How it relates to OpenSpec](/concepts/how-it-relates-to-openspec) for the
version pin this wrapping relies on.
