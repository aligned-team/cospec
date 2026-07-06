// Cheap unit coverage for `declaredArtifactFiles` (no API key, no agent loop):
// guards the eval's DECLARED-derivation fix (§4.5) — `verification.md` must
// never be mis-scored as an unexpected/forbidden file for the types that
// declare it.

import { describe, expect, test } from 'bun:test'

import { ARTIFACT_FILES, TYPE_ARTIFACTS } from '../../apps/cli/src/core/rules/type-facts.ts'
import { declaredArtifactFiles } from './context.ts'

describe('declaredArtifactFiles', () => {
  test('feat includes verification.md (declared per §3.2)', () => {
    expect(declaredArtifactFiles('feat').has('verification.md')).toBe(true)
  })

  test('ci includes verification.md (declared, optional)', () => {
    expect(declaredArtifactFiles('ci').has('verification.md')).toBe(true)
  })

  test('chore excludes verification.md (not declared)', () => {
    expect(declaredArtifactFiles('chore').has('verification.md')).toBe(false)
  })

  test('never includes the specs file id (matched by directory prefix instead)', () => {
    for (const type of Object.keys(TYPE_ARTIFACTS) as (keyof typeof TYPE_ARTIFACTS)[]) {
      const files = declaredArtifactFiles(type)
      expect(files.has('specs')).toBe(false)
    }
  })

  test('mirrors TYPE_ARTIFACTS.declared exactly, for every type', () => {
    for (const [type, facts] of Object.entries(TYPE_ARTIFACTS)) {
      const expected = new Set(
        facts.declared
          .filter((id) => id !== 'specs')
          .map((id) => ARTIFACT_FILES[id as Exclude<typeof id, 'specs'>]),
      )
      expect(declaredArtifactFiles(type as keyof typeof TYPE_ARTIFACTS)).toEqual(expected)
    }
  })
})
