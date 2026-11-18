# Tasks

## 1. Docs

- [x] 1.1 Correct `CONTRIBUTING.md`'s setup to say `mise install` wires the
      hooks into the clone's `.git/config`, and verify it in a fresh clone of
      GitHub with an empty global git template: `mise install` alone installed
      `hook.hk-pre-commit`, `hook.hk-pre-push` and `hook.hk-commit-msg` in the
      clone's `.git/config`, and a commit and a push to a scratch remote ran
      pre-commit, commit-msg and pre-push. The archive commit follows this one.
