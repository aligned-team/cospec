// Pure unit permutation matrix for mergeMiseToml. Calls the function directly
// (string in, result out) — no fs/subprocess — over the mise.toml shapes the
// gate must survive: the documented install flow's zero-conflict file, real
// collisions, mixed-array values, comment preservation, idempotence, and
// invalid TOML. The template is read once from the canon .tpl.

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { mergeMiseToml } from '../../../src/harness/mise-merge.ts'

const TEMPLATE = readFileSync(
  fileURLToPath(new URL('../../../src/canon/gate/mise.toml.tpl', import.meta.url)),
  'utf8',
)

const merge = (existing: string | null): ReturnType<typeof mergeMiseToml> =>
  mergeMiseToml(existing, TEMPLATE)

describe('mergeMiseToml', () => {
  test('#1 absent file → created, content is the template verbatim', () => {
    const r = merge(null)
    expect(r.status).toBe('created')
    expect(r.content).toBe(TEMPLATE)
    expect(r.added).toContain('[tools]')
    expect(r.added).toContain('[settings]')
  })

  test('#2 empty / whitespace file → created', () => {
    expect(merge('   \n\n').status).toBe('created')
    expect(merge('').status).toBe('created')
  })

  test('#3 oops (monorepo_root + settings.experimental + github cospec pin) → merged, 0 conflicts', () => {
    const oops =
      'monorepo_root = true\n\n[settings]\nexperimental = true\n\n[tools]\n"github:aligned-team/cospec" = "0.5.0"\n'
    const r = merge(oops)
    expect(r.status).toBe('merged')
    expect(r.conflicts).toEqual([])
    // Non-conflicting additions land.
    expect(r.added).toContain('settings.lockfile')
    expect(r.added).toContain('[env]')
    expect(r.added).toContain('tools.bun')
    expect(r.added).toContain('tools.hk')
    expect(r.added).toContain('[hooks]')
    expect(r.added).toContain('[tasks."cospec:new"]')
    // The cospec pin is NOT added (the github entry satisfies it).
    expect(r.added).not.toContain('tools."npm:@aligned-team/cospec"')
    const c = r.content!
    expect(c).not.toContain('"npm:@aligned-team/cospec"')
    // User content preserved.
    expect(c).toContain('monorepo_root = true')
    expect(c).toContain('"github:aligned-team/cospec" = "0.5.0"')
    // experimental appears exactly once (not duplicated).
    expect(c.match(/experimental = true/g)!.length).toBe(1)
    // Result is valid TOML.
    expect(() => Bun.TOML.parse(c)).not.toThrow()
  })

  test('#4 agents (tools.bun differs, settings.npm.bun present) → conflict on bun, others merged', () => {
    const agents = '[tools]\nbun = "1.3.8"\n\n[settings]\nnpm.bun = true\n'
    const r = merge(agents)
    expect(r.status).toBe('conflict')
    const bunConflict = r.conflicts.find((c) => c.path === 'tools.bun')
    expect(bunConflict).toBeDefined()
    expect(bunConflict!.existing).toBe('"1.3.8"')
    expect(bunConflict!.template).toBe('"1"')
    // Non-conflicting tool keys still added.
    expect(r.added).toContain('tools.hk')
    expect(r.added).toContain('tools.pkl')
    expect(r.added).toContain('tools.oxlint')
    // settings.npm.bun preserved.
    const parsed = Bun.TOML.parse(r.content!) as { settings: { npm: { bun: boolean } } }
    expect(parsed.settings.npm.bun).toBe(true)
  })

  test('#5 full collision (inline-table hk, differing bun/pkl, postinstall inline table) → conflict', () => {
    const self =
      '[settings]\nexperimental = true\nlockfile = true\n\n' +
      '[env]\nHK_MISE = "1"\n\n' +
      '[tools]\nbun = "1.3.13"\nhk = { version = "1.43" }\npkl = "0.30"\n\n' +
      '[hooks]\npostinstall = { task = "setup" }\n'
    const r = merge(self)
    expect(r.status).toBe('conflict')
    const paths = r.conflicts.map((c) => c.path)
    expect(paths).toContain('tools.hk')
    expect(paths).toContain('tools.bun')
    expect(paths).toContain('tools.pkl')
    expect(paths).toContain('hooks.postinstall')
    // commitlint keys are absent in `self` → added.
    expect(r.added).toContain('tools."npm:@commitlint/cli"')
    expect(r.added).toContain('tools."npm:@commitlint/config-conventional"')
    // settings.experimental/lockfile + env.HK_MISE already satisfied → not added.
    expect(r.added).not.toContain('settings.experimental')
    expect(r.added).not.toContain('settings.lockfile')
    expect(r.added).not.toContain('env.HK_MISE')
  })

  test('#6 ww (settings.experimental + lefthook postinstall, no hk) → conflict on postinstall', () => {
    const ww = '[settings]\nexperimental = true\n\n[hooks]\npostinstall = "lefthook install"\n'
    const r = merge(ww)
    expect(r.status).toBe('conflict')
    expect(r.conflicts.map((c) => c.path)).toContain('hooks.postinstall')
    // settings.lockfile added; whole [env]/[tools] and task tables appended.
    expect(r.added).toContain('settings.lockfile')
    expect(r.added).toContain('[env]')
    expect(r.added).toContain('[tools]')
    expect(r.added).toContain('[tasks."cospec:validate"]')
  })

  test('#7 comment preservation: an inline # note in [settings] survives the merge', () => {
    const withComment = '[settings]\nexperimental = true # keep this note\n'
    const r = merge(withComment)
    expect(r.status).toBe('merged')
    expect(r.content!).toContain('# keep this note')
  })

  test('#8a idempotence (merge → unchanged): re-merging the merged content is a no-op', () => {
    const oops =
      'monorepo_root = true\n\n[settings]\nexperimental = true\n\n[tools]\n"github:aligned-team/cospec" = "0.5.0"\n'
    const first = merge(oops).content!
    const second = merge(first)
    expect(second.status).toBe('unchanged')
    expect(second.content).toBeUndefined()
    expect(second.added).toEqual([])
  })

  test('#8b idempotence (conflict → stable): re-merging conflict content adds nothing, same conflicts', () => {
    const self = '[tools]\nbun = "1.3.13"\n'
    const first = merge(self)
    expect(first.status).toBe('conflict')
    const second = merge(first.content!)
    expect(second.status).toBe('conflict')
    expect(second.added).toEqual([])
    expect(second.content).toBeUndefined()
    expect(second.conflicts.map((c) => c.path)).toEqual(first.conflicts.map((c) => c.path))
  })

  test('#9 invalid TOML → unparseable, no content, snippet is the full template', () => {
    const r = merge('[a\nb = 1')
    expect(r.status).toBe('unparseable')
    expect(r.content).toBeUndefined()
    expect(r.snippet).toBe(TEMPLATE)
  })

  test('#10 older npm cospec pin present → satisfied (not re-added, not flagged)', () => {
    const r = merge('[tools]\n"npm:@aligned-team/cospec" = "0.4.0"\n')
    expect(r.added).not.toContain('tools."npm:@aligned-team/cospec"')
    expect(r.conflicts.map((c) => c.path)).not.toContain('tools."npm:@aligned-team/cospec"')
    // Other tool keys proceed.
    expect(r.added).toContain('tools.bun')
  })

  test('#11 qed (postinstall as a mixed array) → conflict on postinstall', () => {
    const qed = '[hooks]\npostinstall = ["hk install", { task = "setup" }]\n'
    const r = merge(qed)
    expect(r.status).toBe('conflict')
    expect(r.conflicts.map((c) => c.path)).toContain('hooks.postinstall')
  })

  test('#12 a full prior-init output (template already merged) → unchanged', () => {
    const r = merge(TEMPLATE)
    expect(r.status).toBe('unchanged')
    expect(r.content).toBeUndefined()
    expect(r.added).toEqual([])
  })

  test('duplicate-key file (rejected by Bun.TOML) → unparseable', () => {
    const r = merge('[tools]\nbun = "1"\nbun = "2"\n')
    expect(r.status).toBe('unparseable')
    expect(r.snippet).toBe(TEMPLATE)
  })

  test('conflict snippet is scoped to only the conflicting keys', () => {
    const r = merge('[tools]\nbun = "2"\n')
    expect(r.status).toBe('conflict')
    expect(r.snippet).toContain('[tools]')
    expect(r.snippet).toContain('bun = "1"')
    // Non-conflicting keys are NOT in the snippet.
    expect(r.snippet).not.toContain('hk = "1"')
    expect(r.snippet).not.toContain('[hooks]')
  })
})
