// The profile x delivery x harness matrix, part 1 of 4: every fourth harness row
// (test/contract/support/profile-matrix.ts).

import { afterAll } from 'bun:test'

import { cleanupAll } from '../fixtures/support.ts'
import { profileMatrix } from './support/profile-matrix.ts'

afterAll(cleanupAll)

profileMatrix(1, 4)
