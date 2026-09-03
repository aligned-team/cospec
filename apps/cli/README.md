# @aligned-team/cospec

**cospec** — conventional openspec: OpenSpec change management, sized to your
commit type. `feat` gets the full treatment; `ci` takes two minutes.

`cospec` wraps
[`@fission-ai/openspec`](https://www.npmjs.com/package/@fission-ai/openspec)
`1.11.0` (pinned for dev/CI; any `>=1.0.0 <2.0.0` accepted at runtime) and adds
typed change schemas (one per conventional-commit type), real validation, a
gated `apply`, a machine-parsed `verification` evidence ledger with hard archive
gates, a verified `archive`, and blocker sync — plus generated skills/commands
for Claude Code, Codex, and OpenCode, and skills for the shared `.agents/skills`
root read by Codex, Zed, Antigravity, and other AGENTS.md-aware assistants.

## Install

cospec ships as standalone executables (one per platform), so it runs with no JS
runtime required and installs cleanly on Node, Deno, or Bun.

Via mise (no JS runtime needed):

```bash
mise use github:aligned-team/cospec
cospec init
```

The binary is fully self-contained: no JS runtime, no `node_modules`, no extra
install step. It embeds the pinned OpenSpec CLI as a single-file bundle and runs
it with its own bun runtime, so every wrapped command (`new`, `validate`,
`apply`, `archive`, …) works out of the box.

> mise's github backend applies a default release-age cooldown
> (`minimum_release_age`) that hides very recent releases from "latest"
> resolution. If you're testing a release cut in the last day or so and it
> doesn't show up, pin the exact version instead:
> `mise use github:aligned-team/cospec@0.5.2` (a full `major.minor.patch`, not
> `@0.5`) — exact pins bypass the cooldown.

Via a package manager (the launcher execs the prebuilt binary for your
platform):

```bash
npm  i -D @aligned-team/cospec && npx cospec init
pnpm add -D @aligned-team/cospec && pnpm cospec init
bun  add -d @aligned-team/cospec && bun run cospec init
```

From a clone of the monorepo (development):

```bash
mise install && bun install
mise run cospec -- init
```

## Usage

```bash
cospec --help              # list commands
cospec new feat add-widget # create a typed change
cospec validate --all --strict
cospec apply add-widget    # gate on blockers + required artifacts
cospec archive add-widget  # validate, archive, fan out blocker updates
cospec show add-widget     # read a change or spec (text or --json)
cospec store setup platform --path ./platform-store  # create + auto-init a store
```

Store management (`store setup|register|unregister|remove|ls|doctor`),
cross-repo context (`context`), personal worksets (`workset`), machine-global
config (`config path|list|get|set|unset|reset|edit|profile`), native shell
completion (`completion [bash|zsh|fish]`), and bug filing (`feedback`) are all
first-class cospec commands — you never drop out to bare `openspec`. See the
repository root for full docs.
