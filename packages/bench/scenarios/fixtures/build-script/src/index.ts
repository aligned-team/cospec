export function formatGreeting(name: string): string {
  return `Hello, ${name}!`
}

if (import.meta.main) process.stdout.write(`${formatGreeting('world')}\n`)
