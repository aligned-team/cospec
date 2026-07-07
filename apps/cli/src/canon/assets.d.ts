// Bun `{ type: 'file' }` imports resolve to a path string (on-disk in dev,
// $bunfs inside a compiled executable). Scoped to the canon assets used by
// embedded.ts.
declare module '*.yaml' {
  const path: string
  export default path
}

declare module '*.md' {
  const path: string
  export default path
}
