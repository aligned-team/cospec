## 1. Track and regenerate the build schema output

- [x] 1.1 Add `!openspec/schemas/build/` to `.gitignore` so the generated schema
      is no longer matched by the broad `build/` rule.
- [x] 1.2 Run `mise run generate` to compose `openspec/schemas/build/**` from
      the committed canon.
- [x] 1.3 Confirm only `openspec/schemas/build/**` changed (no other
      managed-file drift) and that `mise run generate:check` passes.
