// Preloaded by the apps/cli `bun test` tasks. In-process `run()` calls inherit
// the test runner's stderr, which is a terminal when a person runs the suite,
// so the completion tip would write the machine-global config of whoever runs
// it. The tip's own unit tests inject their environment and never read this.
process.env.OPENSPEC_NO_COMPLETIONS = '1'

// `init` and `update` read the machine-global config file (the workflow profile), at the path
// `openspec config path` prints. Pointing XDG_CONFIG_HOME at an empty directory keeps every
// run that does not name its own sandbox from reading, or depending on, the config of whoever
// runs the suite. A test that wants a profile sets XDG_CONFIG_HOME itself.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const emptyConfigHome = mkdtempSync(join(tmpdir(), 'cospec-empty-xdg-config-'))
process.env.XDG_CONFIG_HOME = emptyConfigHome
process.on('exit', () => {
  rmSync(emptyConfigHome, { recursive: true, force: true })
})
