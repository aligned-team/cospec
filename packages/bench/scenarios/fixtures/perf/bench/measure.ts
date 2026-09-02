// Benchmark script for the `perf` scenario (packages/bench/scenarios/perf.ts).
// Its completion predicate spawns this file and requires exit 0, which needs
// BOTH correct output and a real speed threshold: the seeded O(n^2)
// implementation of `dedupe` misses the threshold on this input size; an O(n)
// rewrite (e.g. backed by a Set) clears it comfortably.

import { dedupe } from '../src/dedupe.ts'

const SIZE = 15000
const VALUE_RANGE = 7500
const THRESHOLD_MS = 150

const input: number[] = []
for (let i = 0; i < SIZE; i += 1) input.push(i % VALUE_RANGE)

const expectedUnique = new Set(input).size

const start = performance.now()
const result = dedupe(input)
const elapsedMs = performance.now() - start

const resultIsUnique = new Set(result).size === result.length
const correct = resultIsUnique && result.length === expectedUnique

if (!correct) {
  console.error(
    `dedupe correctness check failed: got ${result.length} values (unique=${resultIsUnique}), expected ${expectedUnique} unique`,
  )
  process.exit(1)
}

console.log(`dedupe(${SIZE}) took ${elapsedMs.toFixed(1)}ms (threshold ${THRESHOLD_MS}ms)`)

if (elapsedMs > THRESHOLD_MS) {
  console.error(`dedupe is too slow: ${elapsedMs.toFixed(1)}ms > ${THRESHOLD_MS}ms`)
  process.exit(1)
}
