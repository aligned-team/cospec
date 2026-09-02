// Benchmark script for the `perf-hard` scenario
// (packages/bench/scenarios/perf-hard.ts). Its completion predicate spawns
// this file and requires exit 0, which needs BOTH correct output and real
// speed thresholds for all three functions: the seeded O(n^2)/O(n^2)/O(q*d*w)
// implementations miss their thresholds on these input sizes; a rewrite
// backed by a Set/Map/inverted-index clears all three comfortably (verified
// during authoring: naive ~400ms/~207ms/~400ms vs optimized ~1ms/~2ms/~7ms on
// this machine, cold).

import { dedupe } from '../src/dedupe.ts'
import { groupBy } from '../src/groupBy.ts'
import { searchBatch } from '../src/search.ts'
import type { Doc } from '../src/search.ts'

let failed = false

function fail(message: string): void {
  console.error(message)
  failed = true
}

// --- dedupe ---
const DEDUPE_SIZE = 15000
const DEDUPE_RANGE = 7000
const DEDUPE_THRESHOLD_MS = 150

const dedupeInput: number[] = []
for (let i = 0; i < DEDUPE_SIZE; i += 1) dedupeInput.push(i % DEDUPE_RANGE)
const dedupeExpectedUnique = new Set(dedupeInput).size

const dedupeStart = performance.now()
const dedupeResult = dedupe(dedupeInput)
const dedupeElapsed = performance.now() - dedupeStart

const dedupeIsUnique = new Set(dedupeResult).size === dedupeResult.length
if (!dedupeIsUnique || dedupeResult.length !== dedupeExpectedUnique) {
  fail(
    `dedupe correctness check failed: got ${dedupeResult.length} values (unique=${dedupeIsUnique}), expected ${dedupeExpectedUnique}`,
  )
}
console.log(
  `dedupe(${DEDUPE_SIZE}) took ${dedupeElapsed.toFixed(1)}ms (threshold ${DEDUPE_THRESHOLD_MS}ms)`,
)
if (dedupeElapsed > DEDUPE_THRESHOLD_MS) {
  fail(`dedupe is too slow: ${dedupeElapsed.toFixed(1)}ms > ${DEDUPE_THRESHOLD_MS}ms`)
}

// --- groupBy ---
const GROUP_SIZE = 20000
const GROUP_RANGE = 9000
const GROUP_THRESHOLD_MS = 80

const groupItems: number[] = []
for (let i = 0; i < GROUP_SIZE; i += 1) groupItems.push(i % GROUP_RANGE)

const groupStart = performance.now()
const groups = groupBy(groupItems, (n) => String(n))
const groupElapsed = performance.now() - groupStart

if (groups.size !== GROUP_RANGE) {
  fail(`groupBy correctness check failed: got ${groups.size} groups, expected ${GROUP_RANGE}`)
}
console.log(
  `groupBy(${GROUP_SIZE}) took ${groupElapsed.toFixed(1)}ms (threshold ${GROUP_THRESHOLD_MS}ms)`,
)
if (groupElapsed > GROUP_THRESHOLD_MS) {
  fail(`groupBy is too slow: ${groupElapsed.toFixed(1)}ms > ${GROUP_THRESHOLD_MS}ms`)
}

// --- searchBatch ---
const DOC_COUNT = 1500
const WORDS_PER_DOC = 40
const VOCAB = 60
const QUERY_COUNT = 200
const SEARCH_THRESHOLD_MS = 150

const docs: Doc[] = []
for (let i = 0; i < DOC_COUNT; i += 1) {
  const words: string[] = []
  for (let w = 0; w < WORDS_PER_DOC; w += 1) words.push(`word${(i + w) % VOCAB}`)
  docs.push({ id: `doc${i}`, text: words.join(' ') })
}
const queries: string[] = []
for (let i = 0; i < QUERY_COUNT; i += 1) queries.push(`word${i % VOCAB}`)

const searchStart = performance.now()
const searchResult = searchBatch(docs, queries)
const searchElapsed = performance.now() - searchStart

const firstQueryMatches = searchResult['word0']?.length ?? -1
if (firstQueryMatches <= 0) {
  fail(
    `searchBatch correctness check failed: expected matches for 'word0', got ${firstQueryMatches}`,
  )
}
console.log(
  `searchBatch(${DOC_COUNT} docs, ${QUERY_COUNT} queries) took ${searchElapsed.toFixed(1)}ms (threshold ${SEARCH_THRESHOLD_MS}ms)`,
)
if (searchElapsed > SEARCH_THRESHOLD_MS) {
  fail(`searchBatch is too slow: ${searchElapsed.toFixed(1)}ms > ${SEARCH_THRESHOLD_MS}ms`)
}

if (failed) process.exit(1)
