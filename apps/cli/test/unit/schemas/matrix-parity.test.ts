import { describe, expect, test } from 'bun:test'

import {
  ARTIFACT_GENERATES,
  ARTIFACT_IDS,
  TYPE_ARTIFACTS,
  TYPE_FACTS,
} from '../../../src/core/rules/type-facts.ts'
import {
  ARTIFACT_ORDER,
  composeSchema,
  composeTemplates,
  COSPEC_TYPES,
  getTypeInfo,
} from '../../../src/core/schema-compose.ts'

// The dossier's #1 systemic risk (DESIGN §0, §4.1): the composer
// (canon/types/*.yaml → schema-compose.ts) and the hand-transcribed twin matrix
// (rules/type-facts.ts TYPE_ARTIFACTS) are two mirrored surfaces with, until now,
// no cross-check. This is the permanent gate that ends that risk class: it
// asserts byte-equality of the STATIC v2 matrix across all 11 types × 6 artifacts.
// Grandfathering (enforcedApplyRequires) is a filter ON TOP of this matrix and is
// tested separately (schema-versioning.test.ts) — it never forks this matrix.

describe('twin-matrix parity: schema-compose ⇄ type-facts', () => {
  test('the two artifact-id orderings are identical', () => {
    expect([...ARTIFACT_ORDER]).toEqual([...ARTIFACT_IDS])
  })

  for (const type of COSPEC_TYPES) {
    test(`${type}: composed declared === TYPE_ARTIFACTS.declared`, () => {
      const composedDeclared = composeSchema(type).artifacts.map((a) => a.id)
      expect(composedDeclared).toEqual(TYPE_ARTIFACTS[type].declared)
      // getTypeInfo derives the same declared list from the same canon.
      expect(getTypeInfo(type)!.declaredArtifacts).toEqual(TYPE_ARTIFACTS[type].declared)
    })

    test(`${type}: composed apply.requires === TYPE_ARTIFACTS.applyRequires`, () => {
      expect(composeSchema(type).apply.requires).toEqual(TYPE_ARTIFACTS[type].applyRequires)
      expect(getTypeInfo(type)!.requiredArtifacts).toEqual(TYPE_ARTIFACTS[type].applyRequires)
    })

    test(`${type}: every composed generates path === ARTIFACT_GENERATES`, () => {
      for (const a of composeSchema(type).artifacts) {
        expect(a.generates).toBe(ARTIFACT_GENERATES[a.id as keyof typeof ARTIFACT_GENERATES])
      }
    })

    // `TYPE_FACTS.hasSurfaces` is a third hand-mirrored fact (proposal/surfaces-vocab
    // gates on it); cross-check it against canon's `surfaces:` boolean, observed
    // through the composed proposal template emitting the `## Surfaces` block.
    test(`${type}: TYPE_FACTS.hasSurfaces === canon surfaces (composed template)`, () => {
      const composedHasSurfaces = composeTemplates(type)['proposal.md']!.includes('## Surfaces')
      expect(TYPE_FACTS[type].hasSurfaces).toBe(composedHasSurfaces)
    })
  }

  test('all 11×6 cells agree: declared / apply-required / forbidden', () => {
    for (const type of COSPEC_TYPES) {
      const info = getTypeInfo(type)!
      const facts = TYPE_ARTIFACTS[type]
      for (const id of ARTIFACT_ORDER) {
        const declaredByComposer = info.declaredArtifacts.includes(id)
        const declaredByFacts = facts.declared.includes(id)
        expect(declaredByComposer).toBe(declaredByFacts)

        const requiredByComposer = info.requiredArtifacts.includes(id)
        const requiredByFacts = facts.applyRequires.includes(id)
        expect(requiredByComposer).toBe(requiredByFacts)

        // Not-declared ⇒ forbidden; the composer's forbidden set must mirror it.
        if (!declaredByFacts && (id === 'specs' || id === 'design' || id === 'verification')) {
          expect(info.forbiddenArtifacts).toContain(id)
        }
      }
    }
  })
})
