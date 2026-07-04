# @aligned-team/cospec

**cospec** — conventional openspec: OpenSpec change management, sized to your
commit type. `feat` gets the full treatment; `ci` takes two minutes.

`cospec` wraps
[`@fission-ai/openspec`](https://www.npmjs.com/package/@fission-ai/openspec)
`1.3.1` exactly and adds typed change schemas (one per conventional-commit
type), real validation, a gated `apply`, a verified `archive`, and blocker sync
— plus generated skills/commands for Claude Code, Codex, and OpenCode.

## Install

Not yet published. From a clone of the monorepo:

```bash
mise install && bun install
mise run cospec -- init
```

Once published:

```bash
bunx @aligned-team/cospec init
```

## Usage

```bash
cospec --help              # list commands
cospec new feat add-widget # create a typed change
cospec validate --all --strict
cospec apply add-widget    # gate on blockers + required artifacts
cospec archive add-widget  # validate, archive, fan out blocker updates
```

See the repository root for full docs.
