# Design

## Context

Issue #58 read the failure as a trailing-byte check tripping on a prompt that
redraws a nondeterministic number of times. Probing says otherwise. With the
wrapped call's result dumped from the post-condition (in a container copy, never
the worktree), every failing run had exit 0, the global config reset, and stdout
ending `\n\e[G\e[?25h` — the prompt's final redraw and cursor restore — with
`Configuration reset to defaults` absent from all 1.3 MB of it. The binary did
print it: the reset precedes the `console.log` by one synchronous statement.

Under Bun, `console.log` writes to fd 1 through the console's own writer, not
through `process.stdout`. inquirer writes every redraw through `process.stdout`;
a `yes` feeder makes one per `y`, backlogging a 64 KiB Linux pipe, and
`process.stdout` queues what the pipe cannot take and flushes it before exit.
The console's line has no such queue: written while the pipe is full, it is
lost. A Bun child that writes a backlog through `process.stdout` and then
`console.log`s one line loses that line in roughly half of runs on Linux; never
on macOS in the same probe, which is why only `ci-bun` flaked. Node's console
writes through `process.stdout`, so the binary under Node never loses it.

## Goals / Non-Goals

**Goals:**

- Every line the wrapped binary prints under the preload reaches cospec, in
  order, as it does under Node.
- The piped reset's post-condition observes the binary's answer itself.

**Non-Goals:**

- Changing what the binary prints, or the redraw count a `yes` feeder causes.

## Decisions

- **Route the console through the process streams in the preload.** The preload
  already exists to give the binary Node's semantics under Bun (the closed-input
  `exit`); every console method the pinned binary calls (`CONSOLE_ROUTES`:
  `log`/`info`/`debug`, `warn`/`error`) becomes
  `process.stdout.write(format(...) + '\n')` or `process.stderr.write(...)` —
  the stream Node's console writes it to — `format` from `node:util`, which is
  what Node's console does. A method left on Bun's console would still write
  past the queue (a line lost from the middle of a backlogged stream, or printed
  ahead of an earlier one), so a contract row enumerates the dist's
  `console.<method>` calls and fails a pin that adds one unrouted. Rejected:
  giving the child a file instead of a pipe for stdout (changes every wrapped
  call's shape for one command's symptom, and leaves handovers exposed);
  relaxing the post-condition (the row would still fail on the missing answer,
  and cospec would relay a reset with no answer line).
- **The routed writes ignore a gone reader, as Node's console does.** A write to
  a pipe whose reader has exited (`cospec workset open w1 | head -0`) fails with
  EPIPE, delivered on Bun and Node alike as the stream's `error` event, never
  thrown: with no listener it crashes the process (exit 1, Bun's crash report).
  Node's console (`ignoreErrors`) holds a no-op `error` listener for each write
  and re-arms it from the write's callback; Bun's native console ignores the
  failure too. The preload's write does the same. Rejected: a `catch` narrowed
  to `EPIPE` (unreachable — nothing is thrown); a listener that discriminates by
  code (Node's console swallows every write error, so the binary under Node
  never surfaces one either).
- **Post-condition names the answer.** Exit 0/130: the last line of stdout,
  trimmed, is `Configuration reset to defaults` or `Reset cancelled.`. Exit 1:
  stderr non-empty. This is stronger than a trailing `\n` (a redraw ending in
  `\n` satisfied it) and matches the contract row's final-line compare.

## Risks / Trade-offs

- [A future binary prints another answer sentence] → the post-condition refuses
  it loudly, the contract suite pins the pinned binary's answers, and a pin bump
  re-probes.
- [Handovers now format console output with `node:util` `format`, not Bun's
  console] → the binary prints strings; `format` of strings is identity, and it
  is Node's own formatter.

## Operational surface

The fix runs wherever the wrapped binary runs: cospec's own Bun (1.3.14 in
dev/CI) spawning the pinned OpenSpec 1.13.1 behind the preload, on the Linux x64
`ci-bun` runner and on macOS arm64; reproduced on Linux arm64 in a container. No
bind address, secrets or services are involved. The preload's content address
changes, so a stale cached copy is never reused.
