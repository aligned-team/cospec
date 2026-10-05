# Spec Delta

## ADDED Requirements

### Requirement: Init receipt hint follows the selected harness

`cospec init`'s receipt SHALL end with its two hint lines (`Try: …` and
`Lightweight change? …`) spelled the way the first selected harness invokes the
`propose` workflow. The lines SHALL be rendered through that harness's body
dialect and invocation prefix, the same respelling its generated bodies get, so
the hint names a command or skill that exists for that harness. The first
selected harness SHALL be the first id of an explicit `--harness`/`--tools` list
as given, or otherwise the first selected row in table order. When no harness is
selected (`--harness none`), the hint SHALL keep the canonical `/cospec:propose`
spelling.

#### Scenario: OpenCode receipt names the flat command

- **WHEN** `cospec init --harness opencode` runs in a fresh repo
- **THEN** the receipt ends with
  `Try: /cospec-propose "feat: <what you want to build>"` and no line of it
  contains `/cospec:propose`

#### Scenario: Shared-root receipt names the skill

- **WHEN** `cospec init --harness codex` or `cospec init --harness agents` runs
  in a fresh repo
- **THEN** the receipt ends with
  `Try: $cospec-propose (Codex) or /cospec-propose (other agents) "feat: <what you want to build>"`

#### Scenario: Claude-first receipts are unchanged

- **WHEN** `cospec init` runs with `--harness claude`, with `--harness all`, or
  in a fresh repo where nothing is detected
- **THEN** the receipt ends with
  `Try: /cospec:propose "feat: <what you want to build>"`, byte-identical to the
  receipt before this requirement

#### Scenario: The first listed harness decides

- **WHEN** `cospec init --harness opencode,claude` runs
- **THEN** the hint uses OpenCode's `/cospec-propose` spelling

#### Scenario: No harness keeps the canonical hint

- **WHEN** `cospec init --harness none` runs in a fresh repo
- **THEN** the receipt ends with
  `Try: /cospec:propose "feat: <what you want to build>"`, byte-identical to the
  receipt before this requirement

### Requirement: Doctor checks only the harness files cospec writes

`cospec doctor`'s `stale-harness`, `mixed-versions` and `dangling-ref` checks
SHALL read only files at a path cospec generates:
`<skills-root>/<skill>/SKILL.md`, with exactly one directory between a harness
row's project or legacy skills root and the file, and each markdown harness
row's command paths
(`<commands dir>/<file template with one path segment for the command><extension>`).
Any other file under a harness directory SHALL NOT produce one of those
findings. That includes a user's own markdown and a nested worktree's checkout.
The opsx leftover scan is not narrowed by this requirement.

#### Scenario: A user note is not a harness document

- **WHEN** `cospec doctor` runs in an initialized repo whose `.claude/notes.md`
  is the user's own file and mentions `/cospec:foo`
- **THEN** doctor reports no `dangling-ref`, `stale-harness` or `mixed-versions`
  finding for `.claude/notes.md`

#### Scenario: A nested worktree's copy is not checked

- **WHEN** `cospec doctor` runs in an initialized repo that holds a nested
  worktree under `.claude/worktrees/<name>/`, whose `.claude/skills/` and
  `.claude/commands/cospec/` files carry an older `generatedBy` and a reference
  to an unknown workflow
- **THEN** doctor reports no `stale-harness`, `mixed-versions` or `dangling-ref`
  finding that names a path under `.claude/worktrees/`

#### Scenario: A dangling reference in a cospec-written file still errors

- **WHEN** `.claude/commands/cospec/propose.md` references
  `/cospec:not-a-real-workflow` and `cospec doctor` runs
- **THEN** doctor reports a `dangling-ref` ERROR naming that file
