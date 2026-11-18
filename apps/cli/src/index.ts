import { run } from './cli.ts'
import { EXIT } from './core/exit.ts'

try {
  process.exitCode = await run(process.argv.slice(2))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`cospec: ${message}\n`)
  process.exitCode = EXIT.failure
}
