# Proposal

## Why

The `permissions.ask` rules in `.claude/settings.json` add confirmation delays
that auto permission mode should handle instead.

## What Changes

- Remove the `permissions.ask` array from `.claude/settings.json`, keeping
  `permissions.allow` unchanged.

## Impact

- `.claude/settings.json` only. No other harness (`.codex/rules/`, `.opencode/`)
  has ask/prompt-style permission rules to remove.
