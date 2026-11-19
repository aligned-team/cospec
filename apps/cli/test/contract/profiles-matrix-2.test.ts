// The profile x delivery x harness matrix, part 2 of 4: every fourth harness row
// (test/contract/support/profile-matrix.ts).

import { afterAll } from 'bun:test'

import { cleanupAll } from '../fixtures/support.ts'
import { profileMatrix } from './support/profile-matrix.ts'

afterAll(cleanupAll)

profileMatrix(2, 4)
