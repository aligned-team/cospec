// Preloaded by the apps/cli `bun test` tasks. In-process `run()` calls inherit
// the test runner's stderr, which is a terminal when a person runs the suite,
// so the completion tip would write the machine-global config of whoever runs
// it. The tip's own unit tests inject their environment and never read this.
process.env.OPENSPEC_NO_COMPLETIONS = '1'
