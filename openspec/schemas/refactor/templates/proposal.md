## Why

<!-- Motivation. What problem does this solve? Why now? At least two sentences. -->

## What Changes

<!-- New capabilities, modifications, or removals. Mark breaking changes with BREAKING. -->

## Capabilities

### New Capabilities
<!-- Each becomes specs/<capability-path>/spec.md. A capability path is relative to specs/: kebab-case per segment, one segment on a flat layout (user-auth), nested only where the project already nests (identity/user-auth). -->
- `<capability-path>`: <what this capability covers>

### Modified Capabilities
<!-- Existing capabilities whose requirements change; each needs a delta spec at its existing path, unmoved and unrenamed. Leave empty if none. -->

## Impact

<!-- Affected files, APIs, dependencies, migrations. -->

## Surfaces

<!-- Check every surface this change touches; each drives a verification/design expectation (soft). -->
- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
