## ADDED Requirements

### Requirement: Wrapped calls list directories in Node's order

Every wrapped openspec call — piped or a terminal handover, against a project
copy or the embedded bundle — SHALL run behind a preload, ahead of any other,
that makes the binary's non-recursive `fs.readdirSync`, callback `fs.readdir`
and `fs.promises.readdir` return a directory's entries in the order Node returns
them: sorted by the bytes of each name on every platform but Windows, where Node
does not sort and the preload SHALL change nothing. It SHALL reach every import
form the pinned dist uses (`node:fs` and `fs` namespaces, `promises`, and
`node:fs/promises`), for names, `Dirent`s and buffers alike. A contract row
SHALL fail a pinned dist that lists a directory through an API the preload does
not cover (`opendir`, a recursive `readdir`, `fs.glob`).

#### Scenario: Available changes are listed as upstream lists them

- **WHEN** the filesystem returns a project's change directories out of byte
  order and `cospec instructions` runs without a change
- **THEN** its `Available changes` lines, and the exit code, are byte-identical
  to the pinned binary's under Node

#### Scenario: Every wrapped spawn carries the preload first

- **WHEN** cospec spawns the wrapped binary, piped or as a terminal handover
- **THEN** the readdir preload is the first `--preload` on the argv, ahead of
  the handover preload where there is one

#### Scenario: A dist that lists directories another way fails the contract suite

- **WHEN** the pinned dist calls `opendir`, a recursive `readdir`, or `fs.glob`
- **THEN** the contract row that enumerates the dist's directory listings fails
