export function greet(name: string): string {
  return `Hello, ${name}`
}

if (import.meta.main) process.stdout.write(`${greet('world')}\n`)
