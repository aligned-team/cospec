export function greet(name: string): string {
  return `Hello, ${name.toUpperCase()}!!!`
}

export function farewell(name: string): string {
  if (name.length > 1) return `Goodbye, ${name}!`
  return `Goodbye, stranger!`
}
