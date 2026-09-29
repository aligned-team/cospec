# Verification

"Before" is `main` at `d25c5c0`. Linux runs use a container (`oven/bun:1.3.14`
plus Node 22) over a copy of the worktree, HOME/XDG\_\* sandboxed.

## 1. A `yes |` reset relays the binary's answer [critical]

- [ ] 1.1 @regression (agent) the contract row `yes | cospec config reset --all: as the binary answers` looped 20× in the Linux container -> before: fails a share of runs with `printed no answer line after its prompt`, exit 1; after: 0/20
- [ ] 1.2 @regression (agent) `handover-preload.test.ts` mechanism row: a Bun child under the preload backlogs a piped stdout, then `console.log`s its answer, 20 times -> before (preload of `d25c5c0`): the answer is lost in some runs on Linux; after: present at the end of every run
- [ ] 1.3 @runtime (agent) instrumented wrapped call in the container (copy only) -> failing runs show config reset, exit 0, and no `Configuration reset to defaults` anywhere in stdout
- [ ] 1.4 @integration (agent) the same row looped 20× on macOS -> 0/20 before and after

## 2. The post-condition observes the answer

- [ ] 2.1 @integration (agent) full `handover-prevalidation.test.ts` (every piped reset row, the read-only-cache rows, the pty handover rows) on macOS and in the container -> all pass
- [ ] 2.2 @unit (agent) `env -u FORCE_COLOR -u NO_COLOR -u COLORTERM -u CLICOLOR mise run check` -> green

## 3. Docs

- [ ] 3.1 @manual (agent) `docs/architecture.md` and `apps/docs/reference/configuration.md` describe the preload's console routing -> updated in this change
