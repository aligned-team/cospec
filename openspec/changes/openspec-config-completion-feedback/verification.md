<!-- Layer vocabulary is the core set: openspec/config.yaml extends no layers. -->
<!-- Every config row that touches the real binary sandboxes XDG_CONFIG_HOME -->
<!-- and HOME into a temp dir; WRAPPED_ENV spreads process.env, so the sandbox -->
<!-- reaches the child. Every gh row stubs gh on PATH except the one @manual -->
<!-- submission. -->

## 1. cospec config reaches every subcommand of a surface the shared helper cannot call [critical]

- [ ] 1.1 @unit (agent) build the argv for each of `path`, `list`, `get`, `set`, `unset`, `reset`, `profile`, `edit` and inspect every token -> no argv contains `--store` or `--no-color`; `--json` appears only for `list`; `--scope <v>` and `--scope=<v>` both re-emit as `config --scope <v> <sub> …` with the scope ahead of the subcommand
- [ ] 1.2 @unit (agent) invoke `cospec config --store x list` and `cospec config` with no subcommand against a spawn spy -> both exit 1 with their named messages and the spy records zero wrapped spawns
- [ ] 1.3 @integration (agent) run `cospec config path` and `cospec config list --json` against the real pinned binary under a sandboxed `XDG_CONFIG_HOME`/`HOME` -> `path` prints the sandboxed config path at exit 0; `list --json` is exactly one parseable document carrying `profile` and `delivery`
- [ ] 1.4 @integration (agent) run `cospec config get <unset-key>` plain and with `--json` -> plain form exits 1 with upstream's message and no partial JSON; `--json` form exits 1 emitting exactly one document with `version:1`, `found:false`, `value:null`
- [ ] 1.5 @integration (agent) contract suite: append a trailing `--no-color` to real `openspec config` invocations (and to `openspec schemas`/`templates`), with no leading `--no-color` in the argv -> every one is accepted, exiting exactly as it does without the flag and never raising `unknown option`, establishing that rule 1.1's omission is redundancy-avoidance rather than error-avoidance and that the other passthroughs carry no trailing-`--no-color` hazard
- [ ] 1.6 @integration (agent) `cospec config set defaultStore <id>` under a sandboxed home, then run a cospec command from a directory with no `openspec/` above it, then `cospec config unset defaultStore` and repeat -> the first run resolves against the named store, the second falls back to the local cwd, and neither path outranks a local `openspec/` root

## 2. Interactive config subcommands hand over the terminal instead of hanging [critical]

- [ ] 2.1 @integration (agent) run `cospec config edit` with `EDITOR=true` under a sandboxed home -> the child is spawned with inherited stdio, exits 0, and cospec exits 0; with `EDITOR` and `VISUAL` unset, upstream's own error block is relayed with its exit code
- [ ] 2.2 @integration (agent) run `cospec config profile` with no preset and no TTY -> upstream's own interactive-mode-required error is relayed verbatim with its exit code, and no cospec-invented substitute message appears
- [ ] 2.3 @integration (agent) run `cospec config edit --json` and `cospec config profile --json` -> each exits 1 emitting exactly one JSON document with `ok:false` naming the subcommand as interactive, and no editor or menu is spawned
- [ ] 2.4 @manual (human) run `cospec config profile` in a real TTY and cancel at the menu with Ctrl-C; run `cospec config reset --all` in a real TTY and answer no -> the upstream menu renders and cancellation exits 130 unchanged; the reset confirm renders and declining leaves the config file byte-identical

## 3. cospec config never lets a misleading key pass silently [critical]

- [ ] 3.1 @integration (agent) `cospec config set telemetry.enabled true` under a sandboxed home, capturing the two streams separately -> the forced-`OPENSPEC_TELEMETRY=0` note is on stderr and absent from stdout; under `--json` stdout is still exactly one parseable document
- [ ] 3.2 @integration (agent) `cospec config profile <preset>` and `cospec config set delivery <v>` -> each prints the canon-managed-harness note naming `cospec update` on stderr; `cospec config set defaultStore <id>` prints no note at all
- [ ] 3.3 @unit (agent) drive the note selector across every known config key -> exactly `telemetry.enabled`, `profile`, `workflows`, and `delivery` are annotated, and a failed write is annotated for none of them

## 4. Shell completion covers every cospec command and parses in its own shell [critical]

- [ ] 4.1 @unit (agent) generate all three scripts from the real `COMMANDS` table -> each lists every non-hidden command, lists no hidden entry, contains no `openspec` token, and per-command flags match the extraction snapshot
- [ ] 4.2 @integration (agent) pipe each generated script through `bash -n`, `zsh -n`, and `fish --no-execute` -> all three parse clean with no diagnostics
- [ ] 4.3 @integration (agent) run `cospec completion` with `SHELL=/bin/zsh`, with `SHELL=/bin/tcsh`, and with `--json`; snapshot the temp `HOME` before and after -> zsh is detected and printed at exit 0; tcsh exits 1 naming bash/zsh/fish; `--json` exits 1 with one JSON error document and no script; `HOME` is unchanged in every case
- [ ] 4.4 @manual (human) install the generated zsh and fish scripts in a real interactive session and press Tab after `cospec ` and after `cospec show ` -> commands complete with their summaries and change ids complete from the live repo

## 5. The dynamic completion source can never corrupt a Tab press [critical]

- [ ] 5.1 @integration (agent) run `cospec __complete changes` and `cospec __complete specs` in a seeded repo -> each emits tab-separated id/description lines covering the repo's active changes and capability specs, exit 0
- [ ] 5.2 @integration (agent) run `cospec __complete changes` from a directory with no resolvable root, and `cospec __complete nonsense` -> both exit 1 with stdout empty and stderr empty, byte for byte
- [ ] 5.3 @unit (agent) run `cospec __complete types` against a spawn spy -> the eleven `COSPEC_TYPES` values are listed and the spy records zero wrapped spawns

## 6. Feedback files where it says it files, and never through a shell [critical]

- [ ] 6.1 @unit (agent) format a title from a message longer than 72 graphemes containing emoji and combining marks, and build the gh argv for a message containing shell metacharacters -> the title truncates at 72 graphemes with an ellipsis and splits no character; the argv is an array carrying the raw message and body as separate elements, names `aligned-team/cospec`, contains no `--label`, and no shell is invoked
- [ ] 6.2 @integration (agent) run `cospec feedback "<msg>"` with a stub `gh` on `PATH` reporting authenticated and echoing an issue URL, plain and with `--json` -> the stub receives an argv targeting `aligned-team/cospec` with no `--label`; the URL is printed; `--json` emits exactly one document with `submitted:true`, that `url`, the title, and `repo:"aligned-team/cospec"`
- [ ] 6.3 @integration (agent) run `cospec feedback "<msg>"` with `gh` absent from `PATH`, then with a stub `gh` whose `auth status` fails -> both print the formatted issue plus a prefilled `aligned-team/cospec` issue URL and exit **0**
- [ ] 6.4 @integration (agent) run `cospec feedback --upstream "<msg>"` with a stub `gh` that exits with a code outside the shared passthrough allow-list -> stderr carries the note naming `Fission-AI/OpenSpec`, the wrapped stdout/stderr are relayed unchanged, and cospec exits with exactly the child's code
- [ ] 6.5 @manual (human) run one real `cospec feedback` against an authenticated `gh` -> an issue is created at `aligned-team/cospec` with the expected title, provenance footer, and no label, and its URL is printed
- [ ] 6.6 @unit (agent) inspect the provenance footer for a project-resolved and an embedded-resolved wrapped binary -> each footer names the correct resolution source and version alongside the cospec version, platform, and ISO timestamp

## 7. The three commands survive registration and the compiled standalone binary [critical]

- [ ] 7.1 @integration (agent) `mise run test:pack` plus `pack-standalone.test.ts` extended to run `cospec config path`, `cospec completion zsh`, and `cospec feedback --help` from the packed standalone binary -> all three succeed with no `node_modules` present, proving the literal-`import()` bundling trap is not tripped
- [ ] 7.2 @integration (agent) `mise run generate` then `mise run generate:check` -> the drift gate is clean and `.codex/rules/cospec.rules` contains prefix rules for `config get`, `config list`, `config path`, `completion`, and `__complete`, and none for `config set`, `config unset`, `config reset`, `config edit`, `config profile`, or `feedback`
- [ ] 7.3 @eval (agent) `mise run eval:e2e` against the regenerated harness files, comparing the run to the pre-change baseline -> no regression in the advisory DeepSeek scores, and no eval transcript in which an agent reaches for bare `openspec config`, `openspec completion`, or `openspec feedback` now that a cospec command answers each (advisory only, never a CI gate; defer with a recorded reason if no API key is available to the pass)
- [ ] 7.4 @regression (agent) `mise run check` on the final branch state -> lint, format, typecheck, unit, contract, integration, and pack smoke all green, with no pre-existing test edited to accommodate the new commands

## 8. Docs and agent guidance ship with the behaviour, not after it

- [ ] 8.1 @integration (agent) `mise run docs:build` -> green, with `apps/docs/reference/commands.md`, `reference/configuration.md`, and `guide/installation.md` carrying the new rows, the precedence table, the envelope shapes, and the per-shell install snippets, each fact on exactly one page
- [ ] 8.2 @integration (agent) update `.agents/shared.md`, run `mise run agents:sync`, then `mise run agents:check` -> clean, with `CLAUDE.md` and `AGENTS.md` both naming `config`, `completion`, and `feedback` in the every-everyday-surface paragraph
- [ ] 8.3 @manual (human) read `docs/architecture.md`'s passthrough section against the shipped code -> the two config exceptions (no `storeArgs`, no trailing `--no-color`) and the terminal-handover class shared by `workset open` and `config edit|profile|reset` are described as implemented, with no stale claim that every passthrough uses the shared helper
