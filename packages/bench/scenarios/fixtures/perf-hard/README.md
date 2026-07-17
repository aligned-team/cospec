# perf-hard-sample

Three small, correct-but-slow functions across three files: `src/dedupe.ts`
(remove duplicate numbers), `src/groupBy.ts` (group items by a key), and
`src/search.ts` (batch exact-word search over a small document set). All three
are implemented with an asymptotically slow approach and are too slow on large
inputs (see `bench/measure.ts`).
