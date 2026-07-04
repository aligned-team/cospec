import { describe, expect, test } from 'bun:test'

import {
  COSPEC_PERMISSION,
  mergeClaudeSettings,
  SETTINGS_SNIPPET,
} from '../../../src/harness/settings-merge.ts'

describe('mergeClaudeSettings', () => {
  test('absent file → created with a fresh permissions block', () => {
    const r = mergeClaudeSettings(null)
    expect(r.status).toBe('created')
    expect(r.added).toEqual([COSPEC_PERMISSION])
    expect(JSON.parse(r.content!)).toEqual({ permissions: { allow: [COSPEC_PERMISSION] } })
  })

  test('empty/whitespace file → created', () => {
    expect(mergeClaudeSettings('   \n').status).toBe('created')
  })

  test('parseable file without the entry → merged, other keys preserved', () => {
    const input = JSON.stringify({
      $schema: 'https://json.schemastore.org/claude-code-settings.json',
      permissions: { allow: ['Read(**)'], deny: ['Read(.env)'] },
      env: { FOO: '1' },
    })
    const r = mergeClaudeSettings(input)
    expect(r.status).toBe('merged')
    expect(r.added).toEqual([COSPEC_PERMISSION])
    const out = JSON.parse(r.content!)
    expect(out.permissions.allow).toEqual(['Read(**)', COSPEC_PERMISSION])
    expect(out.permissions.deny).toEqual(['Read(.env)'])
    expect(out.env).toEqual({ FOO: '1' })
    expect(out.$schema).toBe('https://json.schemastore.org/claude-code-settings.json')
  })

  test('entry already present → unchanged, nothing added', () => {
    const input = JSON.stringify({ permissions: { allow: [COSPEC_PERMISSION, 'Read(**)'] } })
    const r = mergeClaudeSettings(input)
    expect(r.status).toBe('unchanged')
    expect(r.added).toEqual([])
    expect(JSON.parse(r.content!).permissions.allow).toEqual([COSPEC_PERMISSION, 'Read(**)'])
  })

  test('file with no permissions key → merged, permissions created', () => {
    const r = mergeClaudeSettings(JSON.stringify({ env: { X: '1' } }))
    expect(r.status).toBe('merged')
    const out = JSON.parse(r.content!)
    expect(out.permissions.allow).toEqual([COSPEC_PERMISSION])
    expect(out.env).toEqual({ X: '1' })
  })

  test('unparseable JSON → unparseable, snippet returned, no content', () => {
    const r = mergeClaudeSettings('{ not valid json ')
    expect(r.status).toBe('unparseable')
    expect(r.content).toBeUndefined()
    expect(r.added).toEqual([])
    expect(r.snippet).toBe(SETTINGS_SNIPPET)
  })

  test('JSON that is not an object (array) → unparseable', () => {
    expect(mergeClaudeSettings('[1, 2, 3]').status).toBe('unparseable')
  })

  test('merging is idempotent', () => {
    const first = mergeClaudeSettings(null).content!
    const second = mergeClaudeSettings(first)
    expect(second.status).toBe('unchanged')
    expect(second.content).toBe(first)
  })
})
