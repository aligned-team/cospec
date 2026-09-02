export interface Doc {
  id: string
  text: string
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 0)
}

/**
 * For each query term, return the ids of docs containing that EXACT word
 * (not a substring). Naive: re-tokenizes and re-scans every doc for every
 * query, so it is O(queries * docs * wordsPerDoc) overall.
 */
export function searchBatch(docs: Doc[], queries: string[]): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const query of queries) {
    const term = query.toLowerCase()
    const matches: string[] = []
    for (const doc of docs) {
      if (tokenize(doc.text).includes(term)) matches.push(doc.id)
    }
    result[query] = matches
  }
  return result
}
