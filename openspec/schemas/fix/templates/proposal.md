## Why

<!-- Motivation. What problem does this solve? Why now? At least two sentences. -->

## What Changes

<!-- New capabilities, modifications, or removals. Mark breaking changes with BREAKING. -->

## Capabilities

### New Capabilities
<!-- Each becomes specs/<name>/spec.md. Use kebab-case names (e.g. user-auth). -->
- `<name>`: <what this capability covers>

### Modified Capabilities
<!-- Existing capabilities whose requirements change; each needs a delta spec. Leave empty if none. -->

## Impact

<!-- Affected files, APIs, dependencies, migrations. -->

## Surfaces

<!-- Check every surface this change touches; each drives a verification/design expectation (soft). -->
- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
