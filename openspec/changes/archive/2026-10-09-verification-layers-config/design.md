# Design

## Context

The plumbing for project-extended layers is complete except its source. The rule
(`core/rules/verification.ts`) takes `extraLayers`, `core/rules/index.ts` feeds
it `ctx.verificationLayers`, and `isKnownLayer` honours it. But
`readValidateContext` (`commands/validate.ts`) is the only producer of a
`ValidateContext`, and it returns `{ archiveSlugs, activeSlugs }` only; nothing
in `apps/cli/src` reads `verification.layers` from the config file. Every gate
that validates a change (`validate`, `apply`, `archive`, `sync-specs`) goes
through `readValidateContext`, so one producer fixes all of them. The existing
unit test for the extended-layer case passes `extraLayers` straight to the rule,
so nothing exercised the config-to-context path.

## Goals / Non-Goals

**Goals:**

- A layer declared under `verification.layers` is accepted by every gate that
  validates verification rows, and an undeclared one still fails closed.
- A malformed declaration never crashes a gate and is surfaced by `doctor`.

**Non-Goals:**

- Changing the core layer set, a row's owner defaults for project layers (a
  project layer defaults to `(agent)` like every non-`@manual` token), or any
  other config key.
- Reading `verification.layers` from anywhere but the project's
  `openspec/config.yaml`/`config.yml`.

## Decisions

1. **Follow the issue's recommended shape.** A pure
   `parseVerificationLayers(doc)` returning `{ layers, invalid }` plus
   `projectVerificationLayers(base)` beside `projectConfigSchema` in
   `core/change.ts`, reading the file the same way (`config.yaml`, else
   `config.yml`; missing or unparseable ⇒ no layers). Splitting the pure parse
   from the file read lets `doctor`'s `checkConfig`, which already holds the
   parsed document, report malformed input from the same code the gate reads
   with, so the two can never disagree about what is usable.
2. **Entry normalisation.** Keep string entries, trim, strip one leading `@`
   (the docs write tokens as `@<layer>`), and drop an empty result or one
   containing whitespace: the row parser's layer token is `\S+` followed by the
   rest of the row, so such an entry could never match. Duplicates and a layer
   that shadows a core one are harmless (`isKnownLayer` is an `includes`), so
   the list is deduped only for stable output. Non-string entries (numbers,
   booleans, nested lists) are invalid, not coerced.
3. **Lenient for gates, loud in `doctor`.** A gate must never crash on a config
   typo, so malformed input yields no extra layers for that entry. The cost is
   that a typo fails closed as `layer-unknown`; `doctor` pays that back with a
   WARNING (`check: 'config'`) when `verification` is present but not a mapping,
   `layers` is present but not a list, or an entry is unusable. A null
   `verification:`/`layers:` (the key with no value) is read as absent, not
   malformed.
4. **Both contexts.** `readValidateContext` computes the layers once and passes
   them in the normal context and the `archive_unreadable` fallback, so an
   unreadable archive directory never changes what a row's layer means.
5. **Hint.** `verification/layer-unknown`'s hint appends `project layers: @a @b`
   when any are declared, so a user who mistyped `@staging` sees the vocabulary
   actually in force. With none declared the hint is byte-identical to today's.

## Where the fact is owned in docs

`apps/docs/concepts/verification.md` owns the layer vocabulary and its
extension; it gains the config key's exact shape, spellings and the doctor
warning. `reference/configuration.md` and `reference/validation-rules.md` keep
their one-line links, and the `cospec doctor` row of `reference/commands.md`
names the new warning.

## Operational surface

Nothing changes in how cospec deploys or runs. The fix reads one more key from a
local `openspec/config.yaml` that `projectConfigSchema` already reads. There is
no bind address, container, network call or secret. The `bun run` entry, the npm
package and the standalone compiled binaries behave the same, and the wrapped
OpenSpec binary (pinned 1.13.1, accepted `>=1.0.0 <2.0.0`) is not involved.

## Risks / Trade-offs

- A project that declared layers on 0.9.0 (they were silently ignored) and wrote
  rows against them now validates; nothing that passed before can fail, because
  the change only widens the accepted set.
