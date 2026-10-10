// Every controlling sentence of a passage ported into the propose, ff and explore bodies is
// found, verbatim, in the pinned openspec template it came from (canon-workflow-parity 8.2).
// The check reads the pinned dist by resolved path, so a pin bump that rewords a passage fails
// here until the canon is re-diffed.

import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { openspecPackageDir } from '../../src/core/openspec.ts'
import {
  ASCII_DIAGRAMS,
  INSPECT_BEFORE_DRAFTING,
  type PortedPassage,
  WORKFLOW_TEMPLATES,
} from '../fixtures/ported-passages.ts'

/** The pinned template text as a reader sees it: the template literal's `\`` is a backtick. */
function pinnedText(file: string): string {
  const path = join(openspecPackageDir(), WORKFLOW_TEMPLATES, file)
  return readFileSync(path, 'utf8').replaceAll('\\`', '`')
}

describe.each([INSPECT_BEFORE_DRAFTING, ASCII_DIAGRAMS])(
  'ported passage $passage',
  (passage: PortedPassage) => {
    test.each([...passage.files])(
      'every controlling sentence is found in the pinned %s',
      (file: string) => {
        const text = pinnedText(file)
        for (const sentence of passage.sentences) expect(text).toContain(sentence)
      },
    )

    test('the pinned template files exist', () => {
      for (const file of passage.files) {
        expect(existsSync(join(openspecPackageDir(), WORKFLOW_TEMPLATES, file))).toBe(true)
      }
    })
  },
)
